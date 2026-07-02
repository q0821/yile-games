package com.yilegames.app;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.util.Log;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 內嵌 HTTP server：以 http://localhost:PORT 服務 APK assets/public/ 內的網頁資產，
 * 並為每個回應蓋上 COOP/COEP/CORP 標頭，使 WebView 頁面進入 cross-origin isolated
 * → SharedArrayBuffer 可用 → 多執行緒 fairy-stockfish（象棋/將棋/西洋棋）在 Android 實機滿血運行。
 *
 * 完全比照 iOS 版（ios/App/App/AppDelegate.swift 的 LocalServer，GCDWebServer 實作）的行為：
 * 同一 port（3333）、SPA fallback 回 index.html、byte-range 支援（音樂串流用）、
 * 目錄穿越防護、每個回應蓋 COOP:same-origin / COEP:require-corp / CORP:same-origin、
 * Cache-Control: max-age=0、.wasm/.js 補正 MIME。
 *
 * 為何不用 Android WebView 預設的 https://appassets.androidplatform.net（WebViewAssetLoader）
 * 或 Capacitor 預設的 file:///android_asset/：兩者都不會自動附加 COOP/COEP 標頭，
 * 而 http://localhost 屬 secure context，WebView 會正確套用這些標頭。見 capacitor.config.json 的 server.url。
 *
 * 未使用第三方 HTTP server 函式庫（如 NanoHTTPD）：需求單純（僅 GET、單一 Range、本機
 * loopback），用 java.net.ServerSocket 手寫足以涵蓋，且不替專案多引入一個依賴。
 */
final class LocalServer {

    private static final String TAG = "LocalServer";
    private static final int PORT = 3333;
    private static final String ASSET_ROOT = "public";
    private static final int MAX_REQUEST_LINE_BYTES = 8192;
    // 安全網緩衝上限：AAPT 對未列入 noCompress 的副檔名（或無副檔名檔案，如 tsumego/LICENSE）
    // 預設會 DEFLATE 壓縮，AssetFileDescriptor 無法對壓縮過的 asset 做隨機存取；
    // 這類檔案改用 assetManager.open() 整檔讀進記憶體再回應。本專案該類檔案皆為文件/圖示，
    // 遠小於此上限；上限存在只是為了避免未來誤用大檔案時整包吃記憶體。
    private static final long MAX_BUFFERED_ASSET_BYTES = 32L * 1024 * 1024;

    private static final Map<String, String> MIME_TYPES = new HashMap<>();
    static {
        MIME_TYPES.put("html", "text/html; charset=utf-8");
        MIME_TYPES.put("htm", "text/html; charset=utf-8");
        MIME_TYPES.put("js", "text/javascript");
        MIME_TYPES.put("mjs", "text/javascript");
        MIME_TYPES.put("css", "text/css");
        MIME_TYPES.put("json", "application/json");
        MIME_TYPES.put("wasm", "application/wasm");
        MIME_TYPES.put("png", "image/png");
        MIME_TYPES.put("jpg", "image/jpeg");
        MIME_TYPES.put("jpeg", "image/jpeg");
        MIME_TYPES.put("webp", "image/webp");
        MIME_TYPES.put("gif", "image/gif");
        MIME_TYPES.put("svg", "image/svg+xml");
        MIME_TYPES.put("ico", "image/x-icon");
        MIME_TYPES.put("mp3", "audio/mpeg");
        MIME_TYPES.put("wav", "audio/wav");
        MIME_TYPES.put("txt", "text/plain; charset=utf-8");
        MIME_TYPES.put("md", "text/plain; charset=utf-8");
        MIME_TYPES.put("gz", "application/gzip");
        MIME_TYPES.put("woff", "font/woff");
        MIME_TYPES.put("woff2", "font/woff2");
        MIME_TYPES.put("ttf", "font/ttf");
        MIME_TYPES.put("otf", "font/otf");
    }

    private static LocalServer instance;

    private final AssetManager assetManager;
    private ServerSocket serverSocket;
    private Thread acceptThread;
    private volatile boolean running = false;

    private LocalServer(AssetManager assetManager) {
        this.assetManager = assetManager;
    }

    /** 同步啟動：回傳前 port 已綁定完成，之後 WebView 才會載入 http://localhost:PORT。 */
    static synchronized void start(Context context) {
        if (instance != null && instance.running) {
            return;
        }
        instance = new LocalServer(context.getApplicationContext().getAssets());
        instance.startInternal();
    }

    private void startInternal() {
        try {
            ServerSocket socket = new ServerSocket();
            socket.setReuseAddress(true);
            socket.bind(new InetSocketAddress(InetAddress.getLoopbackAddress(), PORT), 50);
            serverSocket = socket;
            running = true;
            acceptThread = new Thread(this::acceptLoop, "LocalServer-Accept");
            acceptThread.setDaemon(true);
            acceptThread.start();
            Log.i(TAG, "啟動於 http://localhost:" + PORT);
        } catch (IOException e) {
            Log.e(TAG, "啟動失敗", e);
        }
    }

    private void acceptLoop() {
        while (running) {
            try {
                Socket client = serverSocket.accept();
                Thread worker = new Thread(() -> handleConnection(client), "LocalServer-Conn");
                worker.setDaemon(true);
                worker.start();
            } catch (IOException e) {
                if (running) {
                    Log.w(TAG, "accept 失敗", e);
                }
            }
        }
    }

    private void handleConnection(Socket client) {
        try (Socket socket = client) {
            socket.setSoTimeout(10000);
            InputStream in = socket.getInputStream();
            OutputStream out = socket.getOutputStream();

            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) {
                return;
            }
            // 消耗剩餘 header 直到空行（不需要用到內容，但需讀完避免影響 socket 狀態）
            String rangeHeader = null;
            while (true) {
                String header = readLine(in);
                if (header == null || header.isEmpty()) {
                    break;
                }
                int colon = header.indexOf(':');
                if (colon > 0) {
                    String name = header.substring(0, colon).trim();
                    String value = header.substring(colon + 1).trim();
                    if (name.equalsIgnoreCase("Range")) {
                        rangeHeader = value;
                    }
                }
            }

            String[] parts = requestLine.split(" ");
            if (parts.length < 2) {
                writeSimpleStatus(out, 400, "Bad Request");
                return;
            }
            String method = parts[0];
            String rawPath = parts[1];
            if (!method.equals("GET") && !method.equals("HEAD")) {
                writeSimpleStatus(out, 405, "Method Not Allowed");
                return;
            }

            serve(out, rawPath, rangeHeader, method.equals("HEAD"));
        } catch (SocketTimeoutException e) {
            // 本機閒置逾時屬正常，靜默即可
        } catch (IOException e) {
            Log.w(TAG, "連線處理錯誤", e);
        }
    }

    private void serve(OutputStream out, String rawPath, String rangeHeader, boolean headOnly) throws IOException {
        String path = rawPath;
        int query = path.indexOf('?');
        if (query >= 0) {
            path = path.substring(0, query);
        }
        path = decodeUrl(path);

        String normalized = normalizePath(path);
        if (normalized == null) {
            // 目錄穿越防護：解析後路徑逃出 assets/public 之外
            writeSimpleStatus(out, 403, "Forbidden");
            return;
        }

        String assetPath = normalized.isEmpty() ? ASSET_ROOT + "/index.html" : ASSET_ROOT + "/" + normalized;

        Content content = openContent(assetPath);
        if (content == null) {
            // SPA fallback：路由路徑（非實體檔，含目錄）一律回「根」index.html，交給前端 client-side
            // routing 處理；完全比照 iOS 版的 `!exists || isDir.boolValue` 判斷，不特別找子目錄的 index.html
            assetPath = ASSET_ROOT + "/index.html";
            content = openContent(assetPath);
            if (content == null) {
                writeSimpleStatus(out, 404, "Not Found");
                return;
            }
        }

        try {
            long totalLength = content.length();
            long start = 0;
            long end = totalLength - 1;
            boolean partial = false;

            if (rangeHeader != null) {
                long[] range = parseRange(rangeHeader, totalLength);
                if (range == null) {
                    writeStatusOnly(out, 416, "Range Not Satisfiable");
                    writeHeader(out, "Content-Range", "bytes */" + totalLength);
                    writeCommonHeaders(out, assetPath, 0);
                    endHeaders(out);
                    return;
                }
                start = range[0];
                end = range[1];
                partial = true;
            }

            long contentLength = end - start + 1;
            writeStatusOnly(out, partial ? 206 : 200, partial ? "Partial Content" : "OK");
            if (partial) {
                writeHeader(out, "Content-Range", "bytes " + start + "-" + end + "/" + totalLength);
            }
            writeCommonHeaders(out, assetPath, contentLength);
            endHeaders(out);

            if (!headOnly) {
                try (InputStream body = content.openFrom(start)) {
                    copyExactly(body, out, contentLength);
                }
            }
        } finally {
            content.close();
        }
    }

    // ---- assets 存取 ----

    /** 資產的長度已知、可從任意 offset 開始讀取——包裝「未壓縮 fd」與「已緩衝 byte[]」兩種來源。 */
    private interface Content extends Closeable {
        long length();
        InputStream openFrom(long start) throws IOException;
    }

    private static final class FdContent implements Content {
        private final AssetFileDescriptor afd;

        FdContent(AssetFileDescriptor afd) {
            this.afd = afd;
        }

        @Override
        public long length() {
            return afd.getLength();
        }

        @Override
        public InputStream openFrom(long start) throws IOException {
            InputStream in = afd.createInputStream();
            skipFully(in, start);
            return in;
        }

        @Override
        public void close() throws IOException {
            afd.close();
        }
    }

    private static final class BufferedContent implements Content {
        private final byte[] data;

        BufferedContent(byte[] data) {
            this.data = data;
        }

        @Override
        public long length() {
            return data.length;
        }

        @Override
        public InputStream openFrom(long start) {
            int offset = (int) start;
            return new ByteArrayInputStream(data, offset, data.length - offset);
        }

        @Override
        public void close() {
            // no-op：純記憶體內容，無需釋放
        }
    }

    /**
     * 開啟 assets 內的資產。優先用 AssetFileDescriptor（未壓縮才支援，能精確取得長度與
     * byte-range random access，效能佳，用於 .wasm/.js/.mp3 等已加入 build.gradle noCompress
     * 的大檔案）；若該 API 失敗（可能是仍被壓縮的資產、或無副檔名檔案），改整檔讀進記憶體
     * 當作安全網，確保任何實際存在的檔案都能被正確服務（對齊 iOS 版「檔案一定能讀到」的假設）。
     *
     * 特例：AAPT 打包時會自動解壓縮副檔名為 .gz 的 asset 並把 .gz 去掉（例如原始檔
     * public/models/katago-small.bin.gz 進 APK 後變成 assets/public/models/katago-small.bin，
     * 內容已是解壓後的原始 bytes）。這是 Android 打包特有行為，iOS bundle 不會這樣（原始 .gz
     * 檔會原封不動被複製）。前端（katago-engine/engine/katago/worker.ts）已用 gzip magic
     * bytes（0x1f 0x8b）偵測是否需要 pako.ungzip，能正確處理兩種情況；但若請求路徑仍是
     * "....bin.gz" 而 APK 內實際檔名已無 .gz，直接開檔會找不到，導致誤觸 SPA fallback（回
     * index.html）。這裡在找不到原始路徑、且路徑以 .gz 結尾時，多嘗試一次去掉 .gz 的路徑，
     * 讓請求方仍可透過原路徑正確取得（已解壓的）內容。
     */
    private Content openContent(String assetPath) {
        Content content = openContentExact(assetPath);
        if (content == null && assetPath.endsWith(".gz")) {
            content = openContentExact(assetPath.substring(0, assetPath.length() - 3));
        }
        return content;
    }

    private Content openContentExact(String assetPath) {
        try {
            return new FdContent(assetManager.openFd(assetPath));
        } catch (IOException ignored) {
            // 繼續嘗試安全網路徑
        }
        try (InputStream raw = assetManager.open(assetPath)) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            long total = 0;
            while ((n = raw.read(chunk)) != -1) {
                total += n;
                if (total > MAX_BUFFERED_ASSET_BYTES) {
                    Log.w(TAG, "資產過大且被壓縮，無法安全緩衝，視為不存在：" + assetPath);
                    return null;
                }
                buf.write(chunk, 0, n);
            }
            return new BufferedContent(buf.toByteArray());
        } catch (IOException e) {
            return null; // 目錄或檔案不存在
        }
    }

    // ---- 路徑處理 ----

    /**
     * 正規化請求路徑並防目錄穿越：逐段處理 "."/".."，若 ".." 導致跳出 root 之外則回傳 null（403）。
     * 回傳值不含開頭斜線，例如 "index.html" 或 "assets/main.js"；根路徑回傳空字串。
     */
    static String normalizePath(String path) {
        if (path == null) {
            return "";
        }
        String p = path;
        if (p.startsWith("/")) {
            p = p.substring(1);
        }
        if (p.isEmpty()) {
            return "";
        }
        ArrayDeque<String> stack = new ArrayDeque<>();
        for (String segment : p.split("/", -1)) {
            if (segment.isEmpty() || segment.equals(".")) {
                continue;
            }
            if (segment.equals("..")) {
                if (stack.isEmpty()) {
                    return null; // 逃出 root
                }
                stack.removeLast();
            } else {
                stack.addLast(segment);
            }
        }
        return String.join("/", stack);
    }

    private static String decodeUrl(String s) {
        try {
            return java.net.URLDecoder.decode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }

    /** 解析單一 Range: bytes=start-end；不支援/不合法時回傳 null。 */
    private static long[] parseRange(String rangeHeader, long totalLength) {
        Pattern pattern = Pattern.compile("bytes=(\\d*)-(\\d*)");
        Matcher m = pattern.matcher(rangeHeader.trim());
        if (!m.matches()) {
            return null;
        }
        String startStr = m.group(1);
        String endStr = m.group(2);
        long start;
        long end;
        if (startStr.isEmpty() && endStr.isEmpty()) {
            return null;
        }
        if (startStr.isEmpty()) {
            // 尾端 N bytes：bytes=-500
            long suffixLength = Long.parseLong(endStr);
            start = Math.max(0, totalLength - suffixLength);
            end = totalLength - 1;
        } else {
            start = Long.parseLong(startStr);
            end = endStr.isEmpty() ? totalLength - 1 : Long.parseLong(endStr);
        }
        if (start < 0 || end >= totalLength || start > end) {
            return null;
        }
        return new long[] { start, end };
    }

    // ---- HTTP 讀寫 ----

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream(128);
        int b;
        boolean any = false;
        while ((b = in.read()) != -1) {
            any = true;
            if (b == '\n') {
                break;
            }
            if (b != '\r') {
                buf.write(b);
            }
            if (buf.size() > MAX_REQUEST_LINE_BYTES) {
                throw new IOException("request line too long");
            }
        }
        if (!any) {
            return null;
        }
        return buf.toString(StandardCharsets.ISO_8859_1.name());
    }

    private static void writeSimpleStatus(OutputStream out, int code, String reason) throws IOException {
        writeStatusOnly(out, code, reason);
        writeCommonHeaders(out, null, 0);
        endHeaders(out);
    }

    private static void writeStatusOnly(OutputStream out, int code, String reason) throws IOException {
        writeAscii(out, "HTTP/1.1 " + code + " " + reason + "\r\n");
    }

    private static void writeCommonHeaders(OutputStream out, String assetPathForMime, long contentLength) throws IOException {
        writeHeader(out, "Content-Length", String.valueOf(contentLength));
        writeHeader(out, "Content-Type", mimeTypeFor(assetPathForMime));
        writeHeader(out, "Accept-Ranges", "bytes");
        // 讓頁面 cross-origin isolated（同源子資源在 require-corp 下自動放行）
        writeHeader(out, "Cross-Origin-Opener-Policy", "same-origin");
        writeHeader(out, "Cross-Origin-Embedder-Policy", "require-corp");
        writeHeader(out, "Cross-Origin-Resource-Policy", "same-origin");
        writeHeader(out, "Cache-Control", "max-age=0");
        writeHeader(out, "Connection", "close");
    }

    private static void writeHeader(OutputStream out, String name, String value) throws IOException {
        writeAscii(out, name + ": " + value + "\r\n");
    }

    private static void endHeaders(OutputStream out) throws IOException {
        writeAscii(out, "\r\n");
        out.flush();
    }

    private static void writeAscii(OutputStream out, String s) throws IOException {
        out.write(s.getBytes(StandardCharsets.ISO_8859_1));
    }

    private static String mimeTypeFor(String assetPath) {
        if (assetPath == null) {
            return "text/plain; charset=utf-8";
        }
        int dot = assetPath.lastIndexOf('.');
        if (dot < 0) {
            return "application/octet-stream";
        }
        String ext = assetPath.substring(dot + 1).toLowerCase(java.util.Locale.ROOT);
        String mime = MIME_TYPES.get(ext);
        return mime != null ? mime : "application/octet-stream";
    }

    private static void skipFully(InputStream in, long n) throws IOException {
        long remaining = n;
        while (remaining > 0) {
            long skipped = in.skip(remaining);
            if (skipped <= 0) {
                if (in.read() == -1) {
                    break;
                }
                remaining -= 1;
            } else {
                remaining -= skipped;
            }
        }
    }

    private static void copyExactly(InputStream in, OutputStream out, long length) throws IOException {
        byte[] buffer = new byte[8192];
        long remaining = length;
        while (remaining > 0) {
            int toRead = (int) Math.min(buffer.length, remaining);
            int read = in.read(buffer, 0, toRead);
            if (read == -1) {
                break;
            }
            out.write(buffer, 0, read);
            remaining -= read;
        }
    }
}
