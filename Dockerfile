FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:alpine
COPY --from=build /app/dist /srv
COPY <<'EOF' /etc/caddy/Caddyfile
:8080 {
    root * /srv
    encode gzip

    # SPA 路由 fallback：只對「不存在且無副檔名」的請求改寫到 index.html。
    # 有副檔名卻不存在的資產（例如尚未部署上去的 /img/*.webp）維持 404，
    # 避免回傳 index.html(200) → 被 Cloudflare 以錯誤 content-type 快取在資產 URL 上
    # （曾導致 /img/title-ink.webp 在 edge 被吐成 text/html，首頁標題圖載入失敗）。
    @spa {
        not file
        not path *.*
    }
    rewrite @spa /index.html

    file_server
}
EOF
EXPOSE 8080
