package com.urbanlife.game

import android.app.Dialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.webkit.WebView
import android.webkit.JavascriptInterface
import android.widget.Button
import android.widget.CheckBox
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.taptap.sdk.compliance.TapTapCompliance
import com.taptap.sdk.compliance.TapTapComplianceCallback
import com.taptap.sdk.compliance.option.TapTapComplianceOptions
import com.taptap.sdk.core.TapTapRegion
import com.taptap.sdk.core.TapTapSdk
import com.taptap.sdk.core.TapTapSdkOptions
import com.taptap.sdk.initializer.api.TapInitCallback
import com.taptap.sdk.login.Scopes
import com.taptap.sdk.login.TapTapAccount
import com.taptap.sdk.login.TapTapLogin
import com.taptap.sdk.kit.internal.callback.TapTapCallback
import com.taptap.sdk.kit.internal.exception.TapTapException

class MainActivity : TauriActivity() {
  private var gameWebView: WebView? = null
  @Volatile private var displayInsetsJson = "{\"top\":0,\"right\":0,\"bottom\":0,\"left\":0}"
  private inner class DisplayBridge {
    @JavascriptInterface fun getInsets(): String = displayInsetsJson
  }
  private var gateOverlay: LinearLayout? = null
  private var gateMessage: TextView? = null
  private var gateButton: Button? = null
  private var gateExitOnly = false
  private var sdkReady = false
  private var initCallbackRegistered = false
  private var initRequested = false
  private var tapLoginRequested = false
  private var privacyDialog: Dialog? = null
  private var privacyDialogTitleOverride: String? = null
  private var complianceCallbackRegistered = false
  @Volatile private var complianceCheckInFlight = false
  @Volatile private var compliancePassed = false

  internal val canUseTapCloud: Boolean
    get() = BuildConfig.TAPTAP_ENHANCED && compliancePassed

  internal fun showPrivacyPolicyFromSettings() {
    if (!BuildConfig.TAPTAP_ENHANCED || isFinishing) return
    // 设置页回看：标题不同，且允许点返回键关闭。
    privacyDialogTitleOverride = "都市生活 TapTap 版个人信息处理规则"
    showPrivacySurface(consentMode = false)
  }

  /**
   * 统一的隐私政策展示容器。
   *
   * 审核反馈的"隐私政策点击无反应"根因：旧实现用固定 380dp 的 ScrollView 承载规则正文，
   * 再叠加标题、复选框与双按钮，总高度约 570dp。应用锁定横屏，vivo X200 / 荣耀 400
   * 横屏可用高度仅约 400~448dp，Dialog 内容被裁剪，复选框与按钮落在可视区之外，
   * 审核员看得见字样却点不到。同时 enableEdgeToEdge + targetSdk 36 下 AlertDialog
   * 不自动消费窗口 insets，内容进一步被系统栏与手势条遮挡。
   *
   * 修复要点：
   * 1. 改用占满窗口的 Dialog + 内部纵向 LinearLayout，正文使用 weight=1 的 ScrollView，
   *    由系统分配剩余高度，任何屏幕尺寸与横竖屏都不会溢出。
   * 2. 显式消费 systemBars / displayCutout insets 并转为内边距，保证内容不被系统栏遮挡。
   * 3. 操作按钮固定在底部且最小高度 48dp，满足触控目标要求。
   */
  private fun showPrivacySurface(consentMode: Boolean) {
    if (isFinishing || isDestroyed) return
    if (privacyDialog?.isShowing == true) return

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.WHITE)
      // 铺满整个窗口，滚动区域自动收缩以适配横屏矮屏。
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
      )
    }

    root.addView(buildPrivacyTitle())
    // weight = 1：正文占据标题与操作区之外的全部剩余高度。
    root.addView(
      createPrivacyPolicyView(),
      LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f),
    )
    if (consentMode) root.addView(createEmailConsentCheckBox())

    val dialog = Dialog(this)
    dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
    dialog.setCancelable(!consentMode)
    dialog.setCanceledOnTouchOutside(false)
    dialog.setContentView(root)
    dialog.window?.let { window ->
      window.setBackgroundDrawable(ColorDrawable(Color.WHITE))
      // 背景主题允许内容延伸到系统栏之下，再由 insets 手动补内边距。
      WindowCompat.setDecorFitsSystemWindows(window, false)
    }
    applyInsetPadding(root)
    dialog.show()
    // setLayout 只在 show() 之后生效，必须放在这里才能真正铺满窗口。
    dialog.window?.setLayout(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
    )

    if (consentMode) bindConsentActions(dialog, root)
    else bindDismissAction(dialog, root)
    privacyDialog = dialog
    dialog.setOnDismissListener {
      if (privacyDialog === dialog) privacyDialog = null
      privacyDialogTitleOverride = null
    }
  }

  /** 设置页回看只需一个关闭按钮，且不参与同意记录。 */
  private fun bindDismissAction(dialog: Dialog, root: LinearLayout) {
    val close = Button(this).apply {
      text = "关闭"
      textSize = 15f
      minHeight = dp(48)
      setOnClickListener {
        dialog.dismiss()
        privacyDialog = null
      }
    }
    root.addView(
      close,
      LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
      ).apply { leftMargin = dp(16); rightMargin = dp(16); bottomMargin = dp(16) },
    )
  }

  /** 把系统栏与刘海区域转换为内容内边距，避免正文与按钮被遮挡。 */
  private fun applyInsetPadding(root: View) {
    ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(root)
  }

  private fun buildPrivacyTitle(): TextView = TextView(this).apply {
    text = if (privacyDialogTitleOverride != null) privacyDialogTitleOverride else "个人信息处理规则与邮箱告知"
    textSize = 17f
    setTextColor(Color.rgb(15, 23, 42))
    typeface = Typeface.DEFAULT_BOLD
    setPadding(dp(20), dp(16), dp(20), dp(8))
  }

  /**
   * 规则正文：可滚动。
   *
   * 旧实现对整段文本启用 Linkify.WEB_URLS + LinkMovementMethod，这是 Android 上典型的
   * "触摸被ScrollView 吞掉"组合——正文里的 URL 在部分 ROM 上完全点不动。
   * 现在正文保持纯文本，把 TapTap 政策链接提为下方独立按钮，点击必然触发。
   */
  private fun createPrivacyPolicyView(): ScrollView {
    val disclosure = TextView(this).apply {
      text = PRIVACY_DISCLOSURE
      textSize = 15f
      setTextColor(Color.rgb(51, 65, 85))
      setLineSpacing(dp(5).toFloat(), 1f)
      setPadding(dp(20), dp(4), dp(20), dp(12))
    }
    val link = Button(this).apply {
      text = "打开 TapTap 开发者隐私政策"
      textSize = 14f
      isAllCaps = false
      minHeight = dp(48)
      gravity = Gravity.START or Gravity.CENTER_VERTICAL
      setPadding(dp(20), dp(4), dp(20), dp(4))
      setOnClickListener { openTapPrivacyPolicy() }
    }
    // ScrollView 只能有一个直接子视图；正文与政策链接先放进纵向容器，避免 showPrivacySurface
    // 在创建弹窗时抛出 IllegalStateException，导致“查看/阅读隐私政策”看起来没有响应。
    val policyContent = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      addView(
        disclosure,
        LinearLayout.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.WRAP_CONTENT,
        ),
      )
      addView(
        link,
        LinearLayout.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.WRAP_CONTENT,
        ),
      )
    }
    return ScrollView(this).apply {
      isFillViewport = false
      // 滚动条常驻提示，让审核员明确知道正文可滑动。
      isVerticalScrollBarEnabled = true
      addView(
        policyContent,
        ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.WRAP_CONTENT,
        ),
      )
    }
  }

  /**
   * 用系统 Intent 打开 TapTap 政策页。
   * 设备上确实没有可处理 http/https 的浏览器时给出明确提示，而不是静默无反应。
   */
  private fun openTapPrivacyPolicy() {
    val url = android.net.Uri.parse(TAPTAP_POLICY_URL)
    val intent = android.content.Intent(android.content.Intent.ACTION_VIEW, url)
    try {
      startActivity(intent)
    } catch (_: Exception) {
      android.widget.Toast.makeText(
        this,
        "当前设备没有可打开网页的应用，政策全文已在上方完整展示。",
        android.widget.Toast.LENGTH_LONG,
      ).show()
    }
  }

  /** 邮箱处理确认复选框，独立构造以便同意流程中控制按钮启用状态。 */
  private fun createEmailConsentCheckBox(): CheckBox = CheckBox(this).apply {
    text = "我已阅读并同意：点击“TapTap 登录”后，TapTap 账号服务可能处理我在其登录页面填写的邮箱，用于账号验证与登录；本游戏客户端不读取或保存该邮箱。"
    textSize = 13f
    setTextColor(Color.rgb(51, 65, 85))
    setPadding(dp(20), dp(4), dp(20), dp(8))
    minimumHeight = dp(48)
    isFocusable = true
    isClickable = true
    tag = EMAIL_CONSENT_TAG
  }

  /** 同意流程的底部操作区：同意按钮在勾选前保持禁用。 */
  private fun bindConsentActions(dialog: Dialog, root: LinearLayout) {
    val checkBox = root.findViewWithTag<CheckBox>(EMAIL_CONSENT_TAG)
    val agree = Button(this).apply {
      text = "同意并继续"
      setTextColor(Color.WHITE)
      setBackgroundColor(Color.rgb(30, 64, 175))
      textSize = 15f
      minHeight = dp(48)
      isEnabled = false
      setOnClickListener {
        getSharedPreferences(PRIVACY_PREFERENCES, MODE_PRIVATE).edit()
          .putString(PRIVACY_CONSENT_KEY, PRIVACY_CONSENT_VERSION)
          .putLong(PRIVACY_CONSENT_TIME_KEY, System.currentTimeMillis())
          .apply()
        dialog.dismiss()
        privacyDialog = null
        showGate("已记录你的选择。请点击 TapTap 登录继续。", "TapTap 登录")
      }
    }
    val decline = Button(this).apply {
      text = "不同意并退出"
      setTextColor(Color.rgb(71, 85, 105))
      textSize = 15f
      minHeight = dp(48)
      setOnClickListener {
        dialog.dismiss()
        privacyDialog = null
        finishAndRemoveTask()
      }
    }
    val actions = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.END
      setPadding(dp(16), dp(8), dp(16), dp(16))
      addView(
        decline,
        LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
          rightMargin = dp(8)
        },
      )
      addView(
        agree,
        LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
          leftMargin = dp(8)
        },
      )
    }
    root.addView(
      actions,
      LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT),
    )
    checkBox?.setOnCheckedChangeListener { _, checked -> agree.isEnabled = checked }
  }

  private val complianceCallback = object : TapTapComplianceCallback {
    override fun onComplianceResult(code: Int, extra: Map<String, Any>?) {
      runOnUiThread {
        complianceCheckInFlight = false
        when (code) {
          500 -> {
            compliancePassed = true
            gateOverlay?.let { (it.parent as? ViewGroup)?.removeView(it) }
            gateOverlay = null
            gameWebView?.visibility = View.VISIBLE
          }
          1000, 1001 -> {
            compliancePassed = false
            TapTapLogin.logout()
            showGate("TapTap 账号状态已退出，请重新登录并完成合规校验。", "重新登录")
          }
          1030 -> {
            compliancePassed = false
            showGate("当前时段暂不允许继续游戏。请遵守官方防沉迷安排，稍后再来。", "退出游戏", exitOnly = true)
          }
          1050 -> {
            compliancePassed = false
            showGate("今日可玩时长已用完。请明天再来。", "退出游戏", exitOnly = true)
          }
          1100 -> {
            compliancePassed = false
            showGate("当前账号不符合本游戏设置的可玩年龄要求。", "退出游戏", exitOnly = true)
          }
          1200 -> {
            compliancePassed = false
            showGate("合规服务暂时无法确认，请检查网络或稍后重试。", "重试")
          }
          9002 -> {
            compliancePassed = false
            showGate("实名流程已关闭，完成实名后才能进入游戏。", "重新登录")
          }
          else -> {
            compliancePassed = false
            showGate("合规校验未完成（$code），请重试或退出游戏。", "重试")
          }
        }
      }
    }
  }

  private val initCallback = object : TapInitCallback {
    override fun onInitSuccess() {
      runOnUiThread {
        initRequested = false
        sdkReady = true
        resumeAfterSdkReady()
      }
    }

    override fun onInitFail(errorCode: Int, errorMsg: String) {
      runOnUiThread {
        initRequested = false
        sdkReady = false
        showGate("TapTap 服务初始化失败（$errorCode）：$errorMsg。请检查应用配置和网络后重试。", "重试")
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    if (BuildConfig.TAPTAP_ENHANCED && !hasCurrentPrivacyConsent()) showPrivacyConsent()
    // Paint the WebView through the cutout. Only web controls consume safe insets;
    // padding the native content view exposes the activity's background as a strip.
    WindowCompat.setDecorFitsSystemWindows(window, false)
    window.setBackgroundDrawable(ColorDrawable(Color.rgb(16, 19, 31)))
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.attributes = window.attributes.apply {
        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      }
    }
    val content = findViewById<View>(android.R.id.content)
    content.setPadding(0, 0, 0, 0)
    content.setBackgroundColor(Color.rgb(16, 19, 31))
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val types = WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      val safe = insets.getInsets(types)
      val density = resources.displayMetrics.density
      displayInsetsJson = """{"top":${safe.top / density},"right":${safe.right / density},"bottom":${safe.bottom / density},"left":${safe.left / density}}"""
      gameWebView?.evaluateJavascript(
        "window.dispatchEvent(new CustomEvent('urban-life-display-insets',{detail:$displayInsetsJson}));", null
      )
      // Forward the original insets for modern WebView CSS env() and IME resizing.
      // The read-only bridge also supplies safe areas to older WebView versions.
      insets
    }
    ViewCompat.requestApplyInsets(content)
    hideSystemBars()
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    gameWebView = webView
    webView.setBackgroundColor(Color.rgb(16, 19, 31))
    webView.addJavascriptInterface(DisplayBridge(), "UrbanLifeDisplay")
    webView.post { ViewCompat.requestApplyInsets(window.decorView) }
    if (!BuildConfig.TAPTAP_ENHANCED) return
    webView.addJavascriptInterface(TapTapBridge(this, webView), "UrbanLifeTap")
    webView.visibility = View.INVISIBLE
    window.decorView.post {
      if (!hasCurrentPrivacyConsent()) showPrivacyConsent()
      else if (sdkReady) resumeAfterSdkReady()
      else showGate("请先阅读个人信息处理说明，再点击 TapTap 登录。", "TapTap 登录")
    }
  }

  private fun initializeTapTap() {
    if (sdkReady) {
      resumeAfterSdkReady()
      return
    }
    if (initRequested) {
      showGate("正在连接 TapTap 合规服务…", "请稍候")
      return
    }
    initRequested = true
    if (!initCallbackRegistered) {
      initCallbackRegistered = true
      TapTapSdk.addInitCallback(initCallback)
    }

    val options = TapTapSdkOptions(
      BuildConfig.TAPTAP_CLIENT_ID,
      BuildConfig.TAPTAP_CLIENT_TOKEN,
      TapTapRegion.CN,
    )
    try {
      TapTapSdk.init(this, options, TapTapComplianceOptions(true, true))
    } catch (error: Exception) {
      initRequested = false
      showGate("无法启动 TapTap 服务：${error.message ?: "请检查应用配置后重试"}", "重试")
    }
  }

  private fun ensureComplianceCallback(): Boolean {
    if (!sdkReady) return false
    if (complianceCallbackRegistered) return true
    return try {
      // All TapTap business APIs, including compliance callback registration,
      // must wait until the asynchronous core initialization succeeds.
      TapTapCompliance.registerComplianceCallback(complianceCallback)
      complianceCallbackRegistered = true
      true
    } catch (error: Exception) {
      showGate("TapTap 合规模块尚未就绪：${error.message ?: "请重试"}", "重试")
      false
    }
  }

  private fun resumeAfterSdkReady() {
    if (!BuildConfig.TAPTAP_ENHANCED || !sdkReady || isFinishing) return
    if (!hasCurrentPrivacyConsent()) {
      gameWebView?.visibility = View.INVISIBLE
      showPrivacyConsent()
      return
    }
    if (!ensureComplianceCallback()) return
    if (tapLoginRequested) {
      tapLoginRequested = false
      val account = try { TapTapLogin.getCurrentTapAccount() } catch (_: Exception) { null }
      if (account != null) startCompliance(account) else launchTapTapLogin()
      return
    }
    if (compliancePassed) {
      gateOverlay?.let { (it.parent as? ViewGroup)?.removeView(it) }
      gateOverlay = null
      gameWebView?.visibility = View.VISIBLE
      return
    }
    showGate("请使用 TapTap 账号登录。登录邮箱由 TapTap 账号服务处理；登录后将进行实名与防沉迷校验。", "TapTap 登录")
  }

  private fun beginTapTapLogin() {
    if (!hasCurrentPrivacyConsent()) {
      showPrivacyConsent()
      return
    }
    tapLoginRequested = true
    if (!sdkReady) {
      showGate("正在连接 TapTap 服务…", "请稍候")
      initializeTapTap()
      return
    }
    if (!ensureComplianceCallback()) return
    tapLoginRequested = false
    val current = try { TapTapLogin.getCurrentTapAccount() } catch (_: Exception) { null }
    if (current != null) startCompliance(current) else launchTapTapLogin()
  }

  private fun launchTapTapLogin() {
    gateButton?.isEnabled = false
    val scopes = arrayOf(Scopes.SCOPE_BASIC_INFO)
    TapTapLogin.loginWithScopes(this, scopes, object : TapTapCallback<TapTapAccount> {
      override fun onSuccess(result: TapTapAccount) {
        runOnUiThread { startCompliance(result) }
      }

      override fun onCancel() {
        runOnUiThread { showGate("登录已取消。TapTap 版需要完成登录与实名校验后才能进入游戏。", "TapTap 登录") }
      }

      override fun onFail(exception: TapTapException) {
        runOnUiThread { showGate("TapTap 登录失败：${exception.message ?: "请稍后重试"}", "重试") }
      }
    })
  }

  private fun hasCurrentPrivacyConsent(): Boolean =
    getSharedPreferences(PRIVACY_PREFERENCES, MODE_PRIVATE)
      .getString(PRIVACY_CONSENT_KEY, null) == PRIVACY_CONSENT_VERSION

  private fun showPrivacyConsent() {
    if (!BuildConfig.TAPTAP_ENHANCED || isFinishing) return
    gameWebView?.visibility = View.INVISIBLE
    showPrivacySurface(consentMode = true)
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private fun startCompliance(account: TapTapAccount) {
    if (!sdkReady || !ensureComplianceCallback()) {
      showGate("TapTap 服务尚未准备好，请稍后重试。", "重试")
      return
    }
    if (complianceCheckInFlight) {
      showGate("正在进行实名与防沉迷校验…", "请稍候")
      return
    }
    compliancePassed = false
    complianceCheckInFlight = true
    showGate("正在进行实名与防沉迷校验…", "请稍候")
    try {
      TapTapCompliance.startup(this, account.openId)
    } catch (_: Exception) {
      complianceCheckInFlight = false
      showGate("无法启动合规校验，请检查 TapTap 后台服务配置。", "重试")
    }
  }

  private fun showGate(message: String, buttonText: String, exitOnly: Boolean = false) {
    gateExitOnly = exitOnly
    val content = findViewById<ViewGroup>(android.R.id.content) ?: return
    var overlay = gateOverlay
    if (overlay == null) {
      overlay = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(28, 24, 28, 24)
        background = GradientDrawable().apply {
          setColor(Color.rgb(15, 23, 42))
          cornerRadius = 0f
        }
        val title = TextView(this@MainActivity).apply {
          text = "都市生活 · TapTap 合规登录"
          setTextColor(Color.WHITE)
          textSize = 22f
          typeface = Typeface.DEFAULT_BOLD
          gravity = Gravity.CENTER
        }
        val description = TextView(this@MainActivity).apply {
          setTextColor(Color.rgb(203, 213, 225))
          textSize = 15f
          gravity = Gravity.CENTER
          setPadding(0, 18, 0, 24)
        }
        gateMessage = description
        val button = Button(this@MainActivity).apply {
          setTextColor(Color.rgb(15, 23, 42))
          textSize = 16f
          setOnClickListener {
            if (gateExitOnly) finishAndRemoveTask()
            else beginTapTapLogin()
          }
        }
        gateButton = button
        addView(title, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        addView(description, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        addView(button, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
          leftMargin = 24
          rightMargin = 24
        })
      }
      gateOverlay = overlay
      if (overlay.parent == null) {
        content.addView(overlay, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
      }
    }
    gateMessage?.text = message
    gateButton?.text = buttonText
    gateButton?.isEnabled = !buttonText.contains("稍候")
    gameWebView?.visibility = View.INVISIBLE
    overlay.bringToFront()
  }

  override fun onDestroy() {
    if (BuildConfig.TAPTAP_ENHANCED && initCallbackRegistered) TapTapSdk.removeInitCallback(initCallback)
    privacyDialog?.dismiss()
    privacyDialog = null
    super.onDestroy()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideSystemBars()
  }

  override fun onResume() {
    super.onResume()
    hideSystemBars()
  }

  private fun hideSystemBars() {
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    controller.hide(WindowInsetsCompat.Type.systemBars())
  }

  companion object {
    private const val PRIVACY_PREFERENCES = "urban_life_privacy"
    private const val PRIVACY_CONSENT_KEY = "tap_sdk_disclosure_version"
    private const val PRIVACY_CONSENT_TIME_KEY = "tap_sdk_disclosure_accepted_at"
    private const val PRIVACY_CONSENT_VERSION = "2026-10-11-email-explicit-consent-v2"
    private const val EMAIL_CONSENT_TAG = "email_consent"
    private const val TAPTAP_POLICY_URL = "https://developer.taptap.cn/docs/sdk/start/agreement/"
    private const val PRIVACY_DISCLOSURE = """
都市生活 TapTap 版个人信息处理规则（更新于 2026-10-11）

一、TapTap 登录邮箱
你先阅读并勾选本规则，再点击“TapTap 登录”时，本游戏才会启动 TapTap 登录 SDK。若你选择邮箱方式登录，需要在 TapTap 账号登录页面输入 TapTap 账号邮箱及登录凭据。邮箱及登录凭据由易玩（上海）网络科技有限公司的 TapTap 账号服务接收并用于 TapTap 账号验证和登录；本游戏客户端不读取、不记录、不保存或上传这些输入内容。你可以取消 TapTap 登录；未登录时 TapTap 版无法进入游戏。

二、登录授权标识
本游戏向 TapTap 登录 SDK 请求 basic_info 授权范围（TapTap 文档说明该范围返回 OpenID 和 UnionID）。游戏业务代码只读取 OpenID，并在后续合规认证时将 OpenID 提交给 TapTap 合规服务，用于本游戏账号识别、实名认证和防沉迷校验；游戏业务代码不读取 UnionID、邮箱或密码。

三、设备信息与网络权限
TapTap 登录、合规认证和云存档 SDK 会为服务运行、设备兼容和故障排查处理系统版本、设备型号、CPU 信息、网络类型、Android ID、设备内存信息。相关信息由 TapTap SDK 服务按其隐私政策处理。本 APK 声明的 Android 权限为 INTERNET（联网）和 ACCESS_NETWORK_STATE（读取网络连接状态）；没有申请通讯录、定位、相机、麦克风、电话状态或外部存储权限。

四、实名认证与防沉迷
登录后，本游戏会将 TapTap OpenID 提交给易玩（上海）网络科技有限公司的 TapTap 合规服务，用于实名认证、游戏时长与防沉迷校验。实名信息由 TapTap 合规服务处理；本游戏业务代码不读取或保存身份证号码、实名姓名等实名资料。

五、云存档
进入游戏内 TapTap 云存档页面时，本游戏会请求云端存档列表。只有你点击“上传”时，当前本地自动存档文件及存档名称、摘要才会上传至 TapTap 云存档；只有你点击“恢复”时，所选云端存档才会下载并覆盖本地自动存档。游戏不会在后台自动上传进度。云存档由 TapTap 账号服务保存和提供。

六、本地存储、权限与规则查阅
未上传的游戏进度保存在本机。TapTap 登录、账号邮箱及云端数据由 TapTap 账号服务按照其规则处理；账号资料可在 TapTap 账号管理中处理。你可以随时在游戏“设置”中重新查看本规则。TapSDK 隐私政策原文请点击本页面下方的“打开 TapTap开发者隐私政策”按钮查看。
"""
  }
}
