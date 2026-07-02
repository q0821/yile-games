package com.yilegames.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 先啟動本地 HTTP server，之後 WebView 才會載入 http://localhost:3333。
        // LocalServer.start 為同步（回傳前已綁好 port），故 WebView 載入時必定就緒。
        LocalServer.start(this);
        super.onCreate(savedInstanceState);
    }
}
