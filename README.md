# Figma to Codex Exporter

**v1.1.0** · Windows Figma Desktop 126.6.8 本地开发插件。在现有 v1.0.1 项目上升级，使用 **Figma Plugin API**，无 Figma MCP、REST API、付费 Dev Mode、Token 或第三方运行依赖。插件不访问网络，不修改设计图层。

## Windows 安装和更新

1. 下载或克隆完整项目，放在固定目录，例如 `D:\FigmaPlugins\figma-to-codex-exporter`。GitHub 私有仓库需先登录有权限的账号。不要直接在 ZIP 内导入。
2. 打开 Windows **Figma Desktop 126.6.8**，进入有编辑权限的 **Design 文件**。
3. 画布空白处右键，或使用左上角 Figma 菜单：**Plugins → Development → Import plugin from manifest…**。
4. 选择项目根目录 `manifest.json`，例如 `D:\FigmaPlugins\figma-to-codex-exporter\manifest.json`。它引用 `dist/code.js` 和 `dist/ui.html`，本项目包含已构建文件。
5. 从 **Plugins → Development → Figma to Codex Exporter** 运行。窗口顶部应显示 **v1.1.0**。

已安装旧版时：先关闭插件，保留自己的 manifest id，用本版源码、构建脚本及 dist 更新原安装目录后重新运行。若目录改变，重新导入新版 manifest。完整操作见 [Windows 教程](WINDOWS-INSTALL-126.6.8.md)。本版不会自动覆盖本地文件或强制更新客户端。

manifest 中 `figma-to-codex-exporter-local` 是本地开发标识。若客户端要求正式分配的 id，通过 Development → New plugin 创建自己的空模板，再把生成的 id 填入本项目 manifest，其余入口保持不变。组织禁用插件或导出时，本插件不能绕过限制。

安装运行不需要 Node.js；修改源码/重建时才需要 Node.js 18+。实际桌面兼容性仍需在目标客户端验收；本次测试情况见 [测试报告](TEST-REPORT.md)，不能把模拟测试当成实机测试。

## 批量导出

有三种范围：

| 模式 | 操作 |
| --- | --- |
| 当前选中 | 在 Figma 图层面板多选 Frame、组件、组件集或实例，打开插件后勾选要导出的对象 |
| 当前页面 | 切换范围，点击“扫描导出对象”，一次勾选多个页面设计/Banner/组件 |
| 全部 Figma 页面 | 切换范围并扫描，按需加载其他页面，从列表勾选对象；不切换当前页面 |

同一批次最多 100 个根对象。扫描会穿过 Section/Group，找到 Frame/组件后停止向其内部寻找其他根对象；内部图层仍由递归导出器完整采集。选中父子两个对象时保留祖先，防止重复资源。需要单独导出嵌套 Frame 时，使用“当前选中”。

选择 PNG 的 1×/2×/3×清晰度。默认保存矢量 SVG、图片原字节和图片填充图层 PNG；需要所有子图层切图时勾选额外 PNG。点击 **导出设计 ZIP**，完成后点击 **保存 ZIP**。启动连接失败可刷新选择；扫描模式下“刷新选择”会重新扫描。

### 导出目录

| 路径 | 内容 |
| --- | --- |
| `design.json` | 单对象沿用旧的 root 结构；多对象为 kind=batch，frames 中包含每个对象的完整 design、来源页面和 basePath |
| `preview.png` | 单对象整体预览 |
| `frames/<安全图层名>--<节点ID>/design.json` | 批量导出的每个对象独立参数 |
| `frames/<安全图层名>--<节点ID>/preview.png` | 批量导出的每个对象独立预览 |
| `[对象目录/]assets/nodes/*.svg` | 矢量图层，以及配置了 SVG 导出的图层 |
| `[对象目录/]assets/nodes/*.png` | 图片填充、设置了导出的图层，或勾选额外 PNG 后的可见子图层 |
| `[对象目录/]assets/images/*` | Figma 可读的原图字节；同一对象内部按 imageHash 去重，跨对象独立保存 |
| `diff.json` / `diff.md` | 结构化差异与中文摘要，首次无基线时明确写 no-baseline |
| `responsive.json` | 布局事实、待验证建议、用户指定断点分组及不可用信息 |
| `CODEX-README.md` | 可交给 Codex 的读取顺序、路径约定和实现注意事项 |

每个子 design 的图片/素材路径相对其 `basePath`；顶层批次 `preview.path` 指向第一个对象的预览，其余对象有各自预览。没有对应素材时不生成假素材。单对象结构保持向后兼容，只添加字段与说明文件。

图层原名保留在 `name` / `originalName`，文件名替换 Windows 非法字符并附节点 ID；超过 72 字符会截短安全文件名，不截短 JSON 原名。PNG 使用等比例 SCALE，SVG 使用 Figma 自身导出的 viewBox；阴影/描边可能扩大渲染边界。**图片最初上传时的源文件名不由 Plugin API 提供**，因此 `sourceFilename` 为 null 并附不可用原因。未知原图编码保存为 bin，仍尝试生成对应图层 PNG；原图也可能是 JPG/GIF/WebP。

## 完整设计参数

| 类型 | 主要字段 |
| --- | --- |
| 尺寸、坐标、旋转 | x/y/width/height/rotation、relativeTransform、absoluteTransform、transformRelativeToRoot、bounding/render bounds |
| 文本、字体、混合样式 | text.characters/fontName/fontSize/fontWeight/lineHeight/letterSpacing/textAlign*、text.segments |
| 颜色、渐变、透明度 | fills/strokes/opacity/blendMode、Paint 中的 color/gradientStops/gradientTransform/opacity |
| 描边、阴影、圆角 | stroke*、effects、cornerRadius、四个独立角、cornerSmoothing |
| Auto Layout、间距、约束 | layoutMode/layoutWrap/layoutSizing*、primaryAxis*/counterAxis*、padding*、itemSpacing、constraints、min/maxWidth/Height、Grid 字段 |
| 层级、可见性 | children/parentId/siblingIndex/depth/visible/effectiveVisible、mask 和 clipping |
| 组件 | mainComponent、componentProperties、componentPropertyDefinitions、variantProperties、overrides、组件集和 key |
| 样式、变量 | styles、variables 的可读取引用快照及 valuesByMode；不推断生产主题切换 |
| 原型与不可用内容 | reactions 若可读则保留；interaction 中单独注明原型读取状态和真实网页行为需手动补充 |

不支持或不可读取的属性省略/记录 warnings；`figma.mixed` 编码为 `{"mixed":true}`，具体样式见文本分段。颜色一般沿用 0–1 浮点值，行高和字间距保留 AUTO/PIXELS/PERCENT 单位。文本索引沿用 UTF-16。`x/y` 相对父级，绝对矩阵相对页面，根相对矩阵处理旋转；不要用绝对 x/y 直接相减代替矩阵计算。层级顺序还应结合 itemReverseZIndex、mask 与混合模式验证。

不打包字体文件，也不自动生成网站、手机页面、视频、动效或后端。远程组件/样式只读取当前 API 能访问的内容，不导出整个团队库。缺字体或不可用素材可能改变预览或最终网页，需检查 warnings。

## 版本差异检测

- 同一插件窗口中，下次成功导出自动与上次完成的快照比较。
- 跨会话比较：解压旧 ZIP，导入其中的**顶层 design.json**。支持本插件 v1.0.0 / v1.0.1 单对象快照和 v1.1.0 快照；不直接导入 ZIP。可清除或更换基线。
- 同一 Figma 文件中的节点按 ID 对应；比较 geometry、text、appearance、layout、layers、components，并标出引用 styles/variables 的变化。
- 新增/移除是相对于两次**导出范围**而言，不能直接断言图层已从 Figma 文件删除。复制到其他文件可能改变 ID，或产生碰巧相同的 ID；文件名相同也不能证明文件身份。报告注明 identityConfidence 和 requiresSameFigmaFile；名称不同则拒绝可靠对比，显示 incompatible-source。
- 不把时间戳、预览清晰度或生成素材路径变化当成视觉变化。最多输出 2000 条差异；较大的字段只保留片段，计数/截断信息写入报告，完整值仍在新旧 JSON。
- 基线导入上限 32 MiB，并校验格式、节点 ID 唯一性、图层数量和深度。无基线或基线不兼容时不会虚构差异。

## 响应式布局辅助

每个候选对象可选填四项：**页面分组、断点标签、最小视口宽度、最大视口宽度**。例如桌面 Home Frame 填 `Home / Desktop / 1024 / 留空`，手机 Home Frame 填 `Home / Mobile / 留空 / 767`。两个对象会在 responsive.json 中成为用户指定的一组，并标注未覆盖的范围需要开发决定；重叠范围会有警告。

`observed` 保留原始约束、Auto Layout、Padding、Gap、尺寸模式等；`hints` 给出可考虑的 flex/grid/wrap 建议，并标记 requiresValidation。Frame 的 1440/390 等宽度只是设计样本，**不是自动得到的 CSS 媒体查询阈值**。留空时 breakpoint.source=unavailable，不按名字猜测同一页面或默认断点。插件辅助 Codex 实现手机端，不替代浏览器中的字体、换行和断点验证。

## 构建和测试

无 npm 依赖，无需 npm install。PowerShell 进入项目目录后执行：

```powershell
node scripts/build.cjs
node --test tests/*.test.cjs
node scripts/verify.cjs
node scripts/package.cjs
.\scripts\verify-zip.ps1
```

或使用 `npm run build` / `npm test` / `npm run package`，也可双击 build.cmd / test.cmd。打包脚本先构建并测试；输出在项目同级 outputs，名称来自 package.json。验证脚本生成不提交到 Git 的 BUILD-VERIFICATION.json。

核心源码：exporter.js（原递归导出器）、batch.js（扫描/批次/取消）、handoff.js（差异和响应式分析）、main.js（Figma 沙箱及 ACK 传输）、ui.js/ui.html（界面）、zip.js（ZIP32/CRC32）。构建将模块和脚本内联到 dist，不加载外部资源。

限制：批次最多 100 个根对象、20000 图层、200 层嵌套、10000 文件；扫描最多 50000 图层及 500 个候选；二进制/对象 JSON 传输合计最多 200 MiB，最终完整包最多 256 MiB，顶层 JSON 最多 32 Mi 字符。PNG 根据节点尺寸限制长边 8192 px / 约 1600 万像素；实际效果边界由 Figma 决定。取消等待当前 exportAsync 返回。ZIP 用 STORE，不额外压缩；大批次仍有内存开销。

## Git 同步

按 Codex 项目根目录 AGENTS.md，在任务完成且构建/测试通过后才提交/推送，不按行或每次保存上传。不提交密钥、Token、node_modules、临时文件；不强制推送。认证失败、远端历史未安全衔接或冲突时停止，并报告未同步。浏览器登录不代表本地 Git 已有推送凭据。

参考：[Plugin manifest](https://developers.figma.com/docs/plugins/manifest/) · [动态页面读取](https://developers.figma.com/docs/plugins/accessing-document/) · [文本分段](https://developers.figma.com/docs/plugins/api/properties/TextNode-getstyledtextsegments/) · [exportAsync](https://developers.figma.com/docs/plugins/api/properties/nodes-exportasync/)。许可证 MIT。
