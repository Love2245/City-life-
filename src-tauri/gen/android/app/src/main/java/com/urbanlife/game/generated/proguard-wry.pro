# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class com.urbanlife.game.* {
  native <methods>;
}

-keep class com.urbanlife.game.WryActivity {
  public <init>(...);

  void setWebView(com.urbanlife.game.RustWebView);
  java.lang.Class getAppClass(...);
  int getId();
  java.lang.String getVersion();
  int startActivity(...);
}

-keep class com.urbanlife.game.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class com.urbanlife.game.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class com.urbanlife.game.RustWebChromeClient,com.urbanlife.game.RustWebViewClient {
  public <init>(...);
}
