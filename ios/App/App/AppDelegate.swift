import UIKit
import Capacitor
import GCDWebServer
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // 音訊類別設為 ambient：遊戲音效跟隨實體靜音鍵（Apple 慣例），且不中斷使用者
        // 自己在聽的音樂/podcast（mixWithOthers）。不設的話 WKWebView 播 Web Audio 時
        // session 會落在 playback 類，靜音鍵切了照響。
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        // 先啟動本地 HTTP server，之後 WKWebView 才會載入 http://localhost:PORT。
        // GCDWebServer.start 為同步（回傳前已綁好 port），故 webview 載入時必定就緒。
        LocalServer.shared.start()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}

/// 內嵌 HTTP server：以 http://localhost:PORT 服務 app bundle 內的網頁資產（public/），
/// 並為每個回應蓋上 COOP/COEP/CORP 標頭，使 WKWebView 頁面進入 cross-origin isolated
/// → SharedArrayBuffer 可用 → 多執行緒 fairy-stockfish（象棋/將棋/西洋棋）在 iOS 實機滿血運行。
///
/// 為何不用 Capacitor 預設的 capacitor:// custom scheme：WebKit 對非 http(s) 來源會忽略
/// COOP 標頭，頁面永遠進不了 cross-origin isolated；而 http://localhost 屬 secure context，
/// WebKit 會正確套用 COOP/COEP。見 capacitor.config.json 的 server.url。
final class LocalServer {
    static let shared = LocalServer()
    static let port: UInt = 3333

    private var server: GCDWebServer?

    func start() {
        guard server == nil else { return }
        guard let root = Bundle.main.path(forResource: "public", ofType: nil) else {
            NSLog("[LocalServer] 找不到 bundle 內 public 資產目錄")
            return
        }
        let webServer = GCDWebServer()
        webServer.addHandler(forMethod: "GET", pathRegex: ".*", request: GCDWebServerRequest.self) { request -> GCDWebServerResponse? in
            LocalServer.serve(root: root, request: request)
        }
        do {
            try webServer.start(options: [
                GCDWebServerOption_Port: LocalServer.port,
                GCDWebServerOption_BindToLocalhost: true,
                GCDWebServerOption_AutomaticallySuspendInBackground: false
            ])
            server = webServer
            NSLog("[LocalServer] 啟動於 http://localhost:\(LocalServer.port)")
        } catch {
            NSLog("[LocalServer] 啟動失敗：\(error)")
        }
    }

    private static func serve(root: String, request: GCDWebServerRequest) -> GCDWebServerResponse {
        let rootURL = URL(fileURLWithPath: root).standardizedFileURL
        var rel = request.path
        if rel == "/" || rel.isEmpty { rel = "/index.html" }
        let target = rootURL.appendingPathComponent(rel).standardizedFileURL

        // 防目錄穿越：解析後路徑必須仍在 root 底下
        guard target.path == rootURL.path || target.path.hasPrefix(rootURL.path + "/") else {
            return GCDWebServerResponse(statusCode: 403)
        }

        var filePath = target.path
        var isDir: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: filePath, isDirectory: &isDir)
        if !exists || isDir.boolValue {
            // SPA fallback：路由路徑（非實體檔）回 index.html，交給前端 client-side routing
            filePath = rootURL.appendingPathComponent("index.html").path
            guard FileManager.default.fileExists(atPath: filePath) else {
                return GCDWebServerResponse(statusCode: 404)
            }
        }

        let response: GCDWebServerResponse
        if request.hasByteRange() {
            response = GCDWebServerFileResponse(file: filePath, byteRange: request.byteRange) ?? GCDWebServerResponse(statusCode: 404)
        } else {
            response = GCDWebServerFileResponse(file: filePath) ?? GCDWebServerResponse(statusCode: 404)
        }

        // 讓頁面 cross-origin isolated（同源子資源在 require-corp 下自動放行）
        response.setValue("same-origin", forAdditionalHeader: "Cross-Origin-Opener-Policy")
        response.setValue("require-corp", forAdditionalHeader: "Cross-Origin-Embedder-Policy")
        response.setValue("same-origin", forAdditionalHeader: "Cross-Origin-Resource-Policy")
        response.cacheControlMaxAge = 0
        // GCDWebServer 未必認得的副檔名，補正 MIME
        if filePath.hasSuffix(".wasm") { response.contentType = "application/wasm" }
        else if filePath.hasSuffix(".js") { response.contentType = "text/javascript" }
        return response
    }
}
