package com.rooted.christ;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static final String TAG = "RootedAuth";

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    CookieManager.getInstance().setAcceptThirdPartyCookies(bridge.getWebView(), true);
    handleIntent(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    handleIntent(intent);
  }

  private void handleIntent(Intent intent) {
    if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) {
      return;
    }

    Uri data = intent.getData();
    if (data == null) {
      return;
    }

    Log.d(TAG, "Received deep link: " + data);

    if (!"com.rooted.christ".equals(data.getScheme())) {
      return;
    }

    String query = data.getEncodedQuery();
    if (query == null) {
      Log.d(TAG, "Ignoring deep link with no query");
      return;
    }

    String targetUrl = "https://rootedinchrist.faith/" + "?" + query;

    Log.d(TAG, "Loading callback in WebView: " + targetUrl);

    WebView webView = bridge.getWebView();
    if (webView != null) {
      webView.loadUrl(targetUrl);
    }
  }
}
