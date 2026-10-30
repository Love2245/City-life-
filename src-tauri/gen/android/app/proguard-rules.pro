# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Preserve the bridge entry points called from the local WebView.
-keepclassmembers class com.urbanlife.game.TapTapBridge {
    @android.webkit.JavascriptInterface <methods>;
}