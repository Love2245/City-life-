import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TapTap 审核回归：隐私政策弹窗必须在任何设备上都可点击。
 *
 * 背景：实机审核在 vivo X200 / 荣耀 400 上反馈"隐私政策点击无反应"。
 * 覆盖横屏矮屏布局约束，以及 ScrollView 只能容纳一个直接子视图的 Android 规则。
 * 后者若被违反，会在打开政策页时抛出 IllegalStateException，导致入口看起来无响应。
 *
 * 这里对源码做结构性约束，避免后续改动重新引入固定高度或吞点击的自动链接。
 */
const mainActivityPath = join(
  process.cwd(),
  "src-tauri/gen/android/app/src/main/java/com/urbanlife/game/MainActivity.kt",
);
const settingsViewPath = join(process.cwd(), "src/views/SettingsView.svelte");

const mainActivity = readFileSync(mainActivityPath, "utf8");
const settingsView = readFileSync(settingsViewPath, "utf8");
/** 去掉块注释与行注释，只对真实代码做断言。 */
const mainActivityCode = mainActivity.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("隐私政策弹窗设备适配", () => {
  it("不再使用会裁剪内容的 AlertDialog 承载规则正文", () => {
    expect(mainActivityCode).not.toContain("AlertDialog.Builder");
  });

  it("正文区域必须用 weight=1 的 ScrollView 按剩余高度自适应，而非固定 dp 高度", () => {
    // 正文 ScrollView 以 0 高度 + weight 1 加入父容器，由系统分配剩余空间。
    expect(mainActivityCode).toMatch(/createPrivacyPolicyView\(\)\s*,\s*\n?\s*LinearLayout\.LayoutParams\([^)]*,\s*0,\s*1f\)/);
    // 旧的固定 380dp 写法是回归源头，必须已被移除。
    expect(mainActivityCode).not.toMatch(/addView\(createPrivacyPolicyView\(\),\s*LinearLayout\.LayoutParams\([^)]*dp\(\d+\)\)/);
  });

  it("ScrollView 只包含一个直接子视图，正文和政策按钮放入同一容器", () => {
    const policyView = mainActivityCode.match(
      /private fun createPrivacyPolicyView\(\): ScrollView \{[\s\S]*?\n  \}/,
    )?.[0] ?? "";
    const scrollView = policyView.match(
      /return ScrollView\(this\)\.apply \{[\s\S]*?\n    \}/,
    )?.[0] ?? "";
    expect(policyView).toContain("val policyContent = LinearLayout(this)");
    expect(scrollView).toContain("addView(");
    expect(scrollView.match(/\baddView\s*\(/g) ?? []).toHaveLength(1);
    expect(scrollView).toContain("policyContent");
  });

  it("显式消费系统栏与刘海 insets，避免内容被遮挡", () => {
    expect(mainActivity).toContain("applyInsetPadding");
    expect(mainActivity).toContain("WindowInsetsCompat.Type.systemBars()");
    expect(mainActivity).toContain("WindowInsetsCompat.Type.displayCutout()");
    expect(mainActivity).toContain("setDecorFitsSystemWindows");
  });

  it("Dialog 铺满窗口，且 setLayout 在 show() 之后调用才生效", () => {
    const showIndex = mainActivity.indexOf("dialog.show()");
    const layoutIndex = mainActivity.indexOf("WindowManager.LayoutParams.MATCH_PARENT,\n      WindowManager.LayoutParams.MATCH_PARENT,\n    )");
    expect(showIndex).toBeGreaterThan(-1);
    expect(layoutIndex).toBeGreaterThan(showIndex);
  });

  it("移除吞点击的自动链接，政策链接改为独立按钮并给出无浏览器提示", () => {
    // 只检查真实代码调用（注释里可以保留对旧实现的说明）。
    expect(mainActivityCode).not.toContain("Linkify.WEB_URLS");
    expect(mainActivityCode).not.toContain("LinkMovementMethod.getInstance()");
    expect(mainActivity).toContain("openTapPrivacyPolicy");
    // 没有可处理 http 的应用时必须提示，而不是静默失败。
    expect(mainActivity).toContain("当前设备没有可打开网页的应用");
  });

  it("同意控件满足触控目标尺寸并置于底部固定操作区", () => {
    expect(mainActivity).toContain("minHeight = dp(48)");
    expect(mainActivity).toContain("同意并继续");
    expect(mainActivity).toContain("不同意并退出");
    // 同意按钮必须在勾选邮箱确认前保持禁用。
    expect(mainActivity).toMatch(/isEnabled = false[\s\S]{0,400}同意并继续|同意并继续[\s\S]{0,400}isEnabled = false/);
  });
});

describe("设置页隐私政策入口兜底", () => {
  it("原生弹窗异常时回退到页内弹层，不存在无响应路径", () => {
    expect(settingsView).toContain("openPrivacyPolicy");
    expect(settingsView).toContain("privacyFallbackOpen = true");
    // 桥接调用必须包裹异常处理。
    expect(settingsView).toMatch(/try\s*\{[\s\S]{0,400}showPrivacyPolicy\(\)/);
  });

  it("页内兜底层可滚动且关闭按钮固定，横屏矮屏同样可用", () => {
    expect(settingsView).toMatch(/\.privacy-body\s*\{[\s\S]{0,200}overflow-y:\s*auto/);
    expect(settingsView).toMatch(/\.privacy-panel\s*\{[\s\S]{0,200}max-height:\s*100%/);
  });
});
