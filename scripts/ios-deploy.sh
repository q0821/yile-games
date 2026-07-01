#!/usr/bin/env bash
#
# ios-deploy.sh — 把網頁 App build 成 iOS app 並自簽裝到實機 iPhone。
#
# 免費 Apple ID（Personal Team）簽的 app 約 7 天到期，過期後閃退；
# 改網頁或要續命時跑這支即可，不用開 Xcode。
#
# 用法：
#   scripts/ios-deploy.sh                 # 互動選單（不用記參數）
#   scripts/ios-deploy.sh --skip-web      # 跳過 npm run build（native 沒改、只想重簽/重裝）
#   scripts/ios-deploy.sh --no-launch     # 裝完不自動開啟
#   DEVICE_ID=<udid> scripts/ios-deploy.sh   # 手動指定裝置（多台裝置時）
#
set -euo pipefail

# --- 專案路徑（以本腳本位置推得，不依賴當前工作目錄）---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

WORKSPACE="ios/App/App.xcworkspace"
SCHEME="App"
CONFIG="Debug"
DERIVED="ios/App/build"
APP_PATH="$DERIVED/Build/Products/$CONFIG-iphoneos/App.app"
SIGNING_XCCONFIG="ios/App/Signing.xcconfig"

SKIP_WEB=0
LAUNCH=1

# --- 簽署設定檢查（Team ID 抽到 git-ignored 的 Signing.xcconfig）---
if [ ! -f "$SIGNING_XCCONFIG" ]; then
  echo "✖ 缺少簽署設定：$SIGNING_XCCONFIG"
  echo "  這是你個人的 Apple Team ID，不進版控。請建立："
  echo "    cp ios/App/Signing.xcconfig.example $SIGNING_XCCONFIG"
  echo "    再編輯填入 DEVELOPMENT_TEAM（Xcode > Settings > Accounts 可查）"
  exit 1
fi

# --- 解析參數；沒帶任何參數 → 進互動選單 ---
if [ "$#" -eq 0 ]; then
  echo "======================================"
  echo "  iOS 部署到 iPhone"
  echo "======================================"
  echo "請選擇要做什麼："
  echo "  1) 更新網頁並重裝（改過程式碼用；完整流程）"
  echo "  2) 續命重裝（沒改網頁、只是 7 天過期閃退）"
  echo "  3) 完整流程，但裝完不自動開啟"
  echo "  q) 離開"
  echo ""
  printf "輸入選項 [1]: "
  read -r choice
  choice="${choice:-1}"
  case "$choice" in
    1) SKIP_WEB=0; LAUNCH=1 ;;
    2) SKIP_WEB=1; LAUNCH=1 ;;
    3) SKIP_WEB=0; LAUNCH=0 ;;
    q|Q) echo "已取消。"; exit 0 ;;
    *) echo "無效選項：$choice"; exit 2 ;;
  esac
  echo ""
else
  for arg in "$@"; do
    case "$arg" in
      --skip-web)  SKIP_WEB=1 ;;
      --no-launch) LAUNCH=0 ;;
      *) echo "未知參數：$arg"; exit 2 ;;
    esac
  done
fi

# --- 找出要裝的 iPhone ---
if [ -z "${DEVICE_ID:-}" ]; then
  # 列出所有 available 的 iPhone 的 UDID
  DEVICE_LIST="$(xcrun devicectl list devices 2>/dev/null \
    | grep -i iPhone | grep -i available \
    | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' || true)"
  DEVICE_COUNT="$(printf '%s\n' "$DEVICE_LIST" | grep -c . || true)"

  if [ "$DEVICE_COUNT" -eq 0 ]; then
    echo "✖ 找不到已連線且 available 的 iPhone。"
    echo "  請確認 iPhone 已插上、已解鎖、已信任此電腦，然後重跑。"
    echo ""
    xcrun devicectl list devices 2>/dev/null | grep -iE "Name|iPhone" || true
    exit 1
  elif [ "$DEVICE_COUNT" -eq 1 ]; then
    DEVICE_ID="$DEVICE_LIST"
  else
    # 多台 → 讓使用者挑
    echo "偵測到多台 iPhone，請選擇："
    xcrun devicectl list devices 2>/dev/null | grep -i iPhone | grep -i available | cat -n
    printf "輸入行號 [1]: "
    read -r n
    n="${n:-1}"
    DEVICE_ID="$(printf '%s\n' "$DEVICE_LIST" | sed -n "${n}p")"
    if [ -z "$DEVICE_ID" ]; then echo "無效行號。"; exit 2; fi
  fi
fi
echo "▶ 目標裝置：$DEVICE_ID"

# --- 1. build 網頁並同步進 iOS 專案 ---
if [ "$SKIP_WEB" -eq 0 ]; then
  echo "▶ [1/4] build 網頁 (npm run build)…"
  npm run build
  echo "▶ 同步進 iOS 專案 (npx cap copy ios)…"
  npx cap copy ios
else
  echo "▶ [1/4] 跳過網頁 build"
fi

# --- 2. xcodebuild 編譯 + 自簽 ---
echo "▶ [2/4] xcodebuild 編譯並簽署…"
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -destination "id=$DEVICE_ID" \
  -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates \
  build

if [ ! -d "$APP_PATH" ]; then
  echo "✖ 編譯完成但找不到 App.app：$APP_PATH"
  exit 1
fi

# --- 3. 安裝到裝置 ---
echo "▶ [3/4] 安裝到 iPhone…"
xcrun devicectl device install app --device "$DEVICE_ID" "$APP_PATH"

# --- 4. 啟動 ---
if [ "$LAUNCH" -eq 1 ]; then
  echo "▶ [4/4] 啟動 app…"
  BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_PATH/Info.plist" 2>/dev/null || echo "com.yilegames.app")"
  xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID" || \
    echo "  （自動啟動失敗，可能需先在 iPhone 設定→一般→VPN 與裝置管理 信任開發者，再手動點圖示）"
else
  echo "▶ [4/4] 跳過啟動"
fi

echo ""
echo "✔ 完成。app 已裝到裝置 $DEVICE_ID"
