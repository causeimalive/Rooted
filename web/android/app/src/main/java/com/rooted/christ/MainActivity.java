package com.rooted.christ;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static final String TAG = "RootedAuth";
  private static final String CONSOLE_TAG = "RootedConsole";

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WebView webView = bridge.getWebView();
    CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
    webView.getSettings().setCacheMode(WebSettings.LOAD_NO_CACHE);
    webView.clearCache(true);
    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public boolean onConsoleMessage(ConsoleMessage cm) {
        Log.d(CONSOLE_TAG, cm.message() + " -- line " + cm.lineNumber() + " of " + cm.sourceId());
        return true;
      }
    });
    Log.i(TAG, "onCreate intent=" + getIntent());
    if (getIntent() != null && Intent.ACTION_VIEW.equals(getIntent().getAction())) {
      handleIntent(getIntent());
    } else {
      webView.reload();
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    Log.i(TAG, "onNewIntent intent=" + intent);
    handleIntent(intent);
  }

  private void handleIntent(Intent intent) {
    if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) {
      Log.i(TAG, "handleIntent ignored: action=" + (intent == null ? "null" : intent.getAction()));
      return;
    }

    Uri data = intent.getData();
    if (data == null) {
      Log.i(TAG, "handleIntent ignored: no data");
      return;
    }

    Log.i(TAG, "Received deep link: " + data);

    if (!"com.rooted.christ".equals(data.getScheme())) {
      Log.i(TAG, "Ignoring deep link with scheme: " + data.getScheme());
      return;
    }

    String query = data.getEncodedQuery();
    if (query == null) {
      Log.i(TAG, "Ignoring deep link with no query");
      return;
    }

    String targetUrl = "https://rootedinchrist.faith/" + "?" + query;

    Log.i(TAG, "Loading callback in WebView: " + targetUrl);

    WebView webView = bridge.getWebView();
    if (webView != null) {
      webView.loadUrl(targetUrl);
    }
  }
}
