import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),audit=join(root,'docs/company-balance-ui-1497-20261025'),read=p=>JSON.parse(readFileSync(join(audit,p),'utf8').replace(/^\uFEFF/,''));
const r=read('verification.json');assert(r.passed);assert.equal(r.portable.sha256,read('artifact-before-qa.json').sha256);
const body=`# 1.497 统一开发与公司界面交付

版本 **${r.version}**，存档 **${r.saveVersion}**，修订 **${r.revision}**。

本轮仅在都市生活1.497目录开发，更新根目录 \u00601.49.7.html\u0060 便携版。已有页面先保存，再刷新载入当前修订。原便携版已归档，修改前源码及SHA-256保留在本目录 \u0060before/\u0060 与 \u0060before-sha256.json\u0060。

## 开发效率与工时

个人开发、公司开发、员工共用标准日公式：**5点 × 技能倍率 × 电脑倍率**。0/1级技能1倍，10级1.5倍；老旧／办公／高级电脑1／1.5／2倍。正常8小时满级顶配15点，员工周一至周五9—17点同样为15点。

| 工时 | 产量倍数 | 满级顶配产量 | 体力 | 健康 | 心情 | 压力 |
|---|---:|---:|---:|---:|---:|---:|
| 4小时 | 0.5 | 7.5点 | −15 | −1 | −2 | +4 |
| 8小时 | 1 | 15点 | −28 | −2 | −4 | +8 |
| 12小时 | 1.5 | 22.5点 | −48 | −5 | −10 | +18 |

撤下原3小时开发。核心负责日限、身体消耗、项目推进和时间结算，个人与公司共用每日记录；跨夜完成日也不能重做。网吧工作按所需机时校验，可付差额补时，补时不重复赠送放松奖励。个人作品的原交付奖励另计。

## 公司项目与收益

| 规模 | 工作量 | 编程基础新增周版税 | 设计交付 |
|---|---:|---:|---:|
| 小型 | 100点 | 300元 | 3000元 |
| 中型 | 400点 | 1320元 | 14000元 |
| 大型 | 1200点 | 4320元 | 48000元 |

采用绝对工作量，大项目同样每日增加对应点数。编程保留满额递减、周结、维护与衰减；办公室版税上限4500／7500／15000／30000元。已有版税池保留。设计提供交付回款，员工工资与租金照常计提。

旧公司活动双线和暂停项目按完成比例从60／240／720换算至100／400／1200，添加一次性迁移标记；30/60变50/100。保留已有现金、薪酬、设备、维护量、交付计数与结算日期。存档版本仍为36，个人项目原100点进度保持。

## 操作界面

- **工作台**：主角工作与双线项目同页，选工时后一次开始；连续开发、暂停、放弃和详细计算折叠。
- **团队**：列表直接改分工；点击工位购买／分配电脑，面试录用后进入员工管理，薪资和离职放到详情。
- **资金**：余额、可提现和工资欠款留存集中展示；显示月薪、月租、发薪付租日与当前版税折算收入，账目明细折叠。

手机横屏工作区保持在左侧，主要按钮至少44物理像素，员工分工文字在0.7倍UI缩放下仍至少12物理像素。修复竖屏提示被公司／电脑窗口遮挡的问题，旋转回横屏保留页面状态。

## 验证结果

- 专项 **${r.tests.targetedPassed}通过、0失败**；全量 **${r.tests.passed}通过、${r.tests.failed}个既有失败**，另有 **${r.tests.collectionFailures.length}个既有测试文件收集失败**。无新增失败，无跳过断言。
- 静态检查 **0错误、100个既有警告**。
- 开发浏览器与便携文件各 **${r.browser.scenarios}个场景**：电脑／手机公司经营、电脑／手机个人开发、旧公司迁移。最终便携截图共${r.portable.screenshots}张，0页面错误、0外部请求，2D未创建WebGL。
- 验证实际工位购买、招聘、人员本体点击、分工、项目、4／8／12小时、提现工资留存、竖屏遮罩与横屏恢复。
- 6组180日公司核心模拟，薪资和带薪假申请按次日上午批准，包含维护、衰减、工资、租金及成长。模拟恢复玩家生活属性并提供充足现金，不代表包含生活费用的自然试玩利润；较大公司从零建立版税时需要营运资金。
- **${r.preservation.unchangedAllAssets}个原有素材文件SHA-256保持**，其中${r.preservation.unchangedBinaryAssets}个二进制资产。备份${r.preservation.backedUp}个源码、配置与文档文件。

完整结果见 \u0060verification.json\u0060、\u0060source-sha256.json\u0060、\u0060full-tests-current.json\u0060、\u0060targeted-final.json\u0060、\u0060economy.json\u0060 和 \u0060portable-current/verification.json\u0060。早期检查保留为过程证据，最终结果以这些文件为准。临时预览服务已停止。

## 便携文件

- 路径：\u0060${r.portable.path}\u0060
- 大小：**${r.portable.bytes.toLocaleString('en-US')}字节**（约${(r.portable.bytes/1024**3).toFixed(2)}GiB）
- SHA-256：\u0060${r.portable.sha256}\u0060
- 构建副本与根目录文件哈希一致，文件直开断网流程已验证。

历史便携版：\u0060${r.previousPortable.path}\u0060，SHA-256 \u0060${r.previousPortable.sha256}\u0060。玩法和完整数值见 \u0060docs/创业系统_1.497_玩法与数值.md\u0060。

未进行实体手机帧率、温度和峰值内存测试；本轮未生成新的EXE/APK。
`;
writeFileSync(join(audit,'交付说明.md'),body);console.log('Wrote final verified handoff');
