package com.cscla.biblestudy;

import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    CookieManager.getInstance().setAcceptThirdPartyCookies(bridge.getWebView(), true);
  }
}
