# Windows Figma Desktop 126.6.8 中文安装与首次导出

## v1.1.0 新增操作

安装入口仍是项目根目录的 manifest.json，沿用现有 Plugin API 实现。更新原安装目录后关闭并重新运行插件，确认标题上方版本为 v1.1.0。

1. 原单 Frame 流程保持可用；也可在图层面板多选 Frame、组件或实例，一次导出。
2. 跨页面：导出范围切换为“扫描当前页面”或“扫描全部 Figma 页面”，点击“扫描导出对象”，勾选最多 100 个。扫描会加载其他页面但不切换当前页面。
3. 每个对象可填“页面分组/断点标签/最小及最大视口宽度”。桌面与手机同一页面填相同分组；实际 CSS 范围由你指定，留空不会虚构。
4. 对比旧版：从旧 ZIP 解压顶层 design.json，导入“旧版本快照”。同一窗口连续导出也会自动与上次完成结果比较。
5. 完成后保存 ZIP。多对象在 frames/<安全名称>--<节点ID>/ 内分别保存 design.json、preview.png 和素材；顶层 design.json 为索引及完整批次参数。
6. 将完整 ZIP 交给 Codex，先读取 CODEX-README.md，再读取 design.json、diff.json 和 responsive.json。检查 warnings；不可用交互及未指定断点需手动补充。

详见 README.md 与 CHANGELOG.md。下面的“第一次导出”演示仍使用单 Frame；不限制新版批量功能。

本教程面向你指定的 Windows Figma Desktop 126.6.8。按标准 Figma Design 开发插件流程整理，**本次没有在该版本完成实机安装验证**；不同语言和 UI 更新可能使菜单名称略有变化。以包含 Development / 开发的菜单为准。

## 一、文件实际位置

建议将下载解压后的完整项目放在固定目录，例如：

```text
D:\FigmaPlugins\figma-to-codex-exporter
```

采用上述目录时，要导入的 manifest：

```text
D:\FigmaPlugins\figma-to-codex-exporter\manifest.json
```

manifest 引用的两个构建文件已经生成：

```text
D:\FigmaPlugins\figma-to-codex-exporter\dist\code.js
D:\FigmaPlugins\figma-to-codex-exporter\dist\ui.html
```

请按自己实际解压位置替换示例目录。manifest 和 dist 必须保持相对目录结构。`BUILD-VERIFICATION.json` 由 `node scripts/verify.cjs` 本地生成，用于记录实际路径、文件大小和 SHA-256；不提交该机器相关报告到 GitHub。

当前版本 **v1.1.0**。若之前已导入旧版，先关闭插件，用新版完整项目更新原目录并保留自己的 manifest id，再重新运行；若换了目录，重新导入新版 manifest。确认窗口顶部出现 v1.1.0。保留“刷新选择”和约 5 秒的启动超时提示。

## 二、安装

1. 启动 **Figma 桌面版**，打开一个有编辑权限的 Design 设计文件。不要在浏览器、首页、FigJam、Slides 或演示模式中操作。
2. 点击左上角 Figma 菜单，进入 **Plugins → Development → Import plugin from manifest…**。中文界面通常对应 **插件 → 开发 → 从 manifest 导入插件**。也可在画布空白处右键，找到 Plugins → Development；若有 **Import new plugin from manifest…**，即同一个入口。
3. 在 Windows 文件选择窗口中粘贴上面的 manifest 完整路径，选择 `manifest.json`，点击“打开”。不要选择 ZIP、package.json 或 src/main.js。
4. 重新打开 **Plugins → Development**，找到 **Figma to Codex Exporter**。**只有在该菜单实际出现插件并能打开窗口，才说明当前客户端导入成功。**
5. 运行后应看到插件标题、当前选中对象、PNG 清晰度和“导出设计 ZIP”按钮。

这个插件不依赖付费 Dev Mode。Figma 自身登录和文件加载仍由 Figma 负责；插件不需要 API Token，不连接本地服务器，也没有额外的浏览器扩展需要安装。

### 如果提示 manifest/id 错误

manifest 中 id 是本地开发标识 `figma-to-codex-exporter-local`，不是伪造的 Figma 发布编号。如果客户端要求 Figma 分配的 id：

1. Development → **New plugin… / 新建插件**，创建名称为 Figma to Codex Exporter 的 Design 插件，选择带 UI 的普通模板，保存到一个新的临时目录。
2. 用记事本打开这个新模板的 manifest，复制 Figma 自动生成的 `id` 字符串。
3. 用记事本打开上文实际路径的本项目 `manifest.json`，仅替换其 `id` 值，保留 `main: dist/code.js` 和 `ui: dist/ui.html` 等其余内容。
4. 重新执行 Import plugin from manifest，选择本项目 manifest。无需编译，也不需要付费发布。

若错误为找不到 code.js/ui.html，请检查 dist 是否随项目完整解压。若没有 Development 菜单，先检查是否为桌面 Design 编辑文件和是否有编辑权限；组织限制需由管理员处理。

## 三、第一次导出 Frame

1. 打开你要交给 Codex 的设计页面。
2. 在**左侧图层面板**单击目标 Frame 的名称。应只选中一个 `FRAME`；不要选内部的文字、Group、Component 或同时选多个对象。画布中选中整体 Frame 也可以。
3. 运行 **Plugins → Development → Figma to Codex Exporter**。
4. 检查“当前选中”是否显示目标 Frame 名称及 `FRAME`。无效选择时导出按钮禁用；更换选择后会自动刷新。
5. 默认选择 **1×**。如果需要更清晰的图片可选 **2×**；尺寸较大的 Frame 会自动降低比例，JSON 里的设计尺寸不会随 PNG 缩放改变。
6. 第一次可保持“为每个可见图层额外生成 PNG”**不勾选**，仍会导出全部图层设计参数、图片原文件、图片图层 PNG 和矢量 SVG。复杂图标组或需要更多合成切图时再勾选，包会更大。
7. 点击 **导出设计 ZIP**，等待“已完成”。过程中可以取消，但当前渲染调用完成后才会停止。
8. 点击 **保存 ZIP**。在 Figma/Windows 保存窗口中选择位置；若没有弹窗，请检查系统下载目录或下载状态。文件名为 `<Frame名称>-codex.zip`。
9. 用 Windows 资源管理器“全部解压”，检查其中的 **design.json** 和 **preview.png**。根据画布内容，还应有 **assets/nodes** 和 **assets/images** 中的 SVG/PNG/原图；无对应素材时不会生成空文件。

## 四、如何获得“完整设计参数”

完整参数就在 `design.json`，不是 preview.png 里。可以用 VS Code 或记事本打开，重点查看：

| 查看内容 | 字段位置 |
| --- | --- |
| 全部图层树 | `root.children` 递归展开，包含隐藏图层 |
| 宽高与坐标 | 每个节点的 `width/height/x/y`、三个变换矩阵、bounding/render bounds |
| 文案与混合字体 | `text.characters`、`text.segments`（字体、字号、字重、行高、字间距、颜色） |
| 填充与渐变 | `fills`、`strokes` 中保留的 Figma 原始 Paint 字段 |
| 描边、阴影、圆角 | `stroke*`、`effects`、`cornerRadius` 及独立角字段 |
| Auto Layout | `layoutMode`、对齐和尺寸模式、`padding*`、`itemSpacing`（Gap）、换行/网格字段 |
| 层级和可见性 | `parentId/siblingIndex/depth/children/visible/effectiveVisible` |
| 组件实例 | `mainComponent/componentProperties/variantProperties/overrides` |
| 素材对应关系 | 节点 `assets`、Paint `assetPath`、顶层 `assets` |
| 导出异常 | 顶层 `warnings`，应优先检查 |

这里的“完整”指按 Plugin API 当前可读取的字段递归采集，不意味着强行获取无访问权限的库、丢失的字体、视频或原型动画。API 读取失败会留下 warnings，不会编造参数。混合值以 `{"mixed":true}` 表示，其具体文字样式应查看 segments。

把导出的 ZIP 上传给 Codex，并说明：“请根据 design.json 还原页面，用 preview.png 校对视觉，使用 assets 素材，先报告 warnings。”这样 Codex 同时得到结构参数、预览和真实素材。

## 五、这次交付的测试边界

- **构建和路径验证**：实际执行过本地构建；检查 manifest 引用文件和自包含 UI。
- **自动化测试**：Node 单元测试和模拟 Figma 沙箱/UI 的传输、打包流程；具体数量以 TEST-REPORT.md 为准。
- **Windows ZIP 兼容性**：使用 Windows .NET ZIP 读取器验证交付包和字节内容。
- **真实 Figma Desktop 126.6.8**：本次尚未完成导入、运行、实际 Frame 渲染和保存验证；不能据自动化通过认定安装成功。

官方参考：

- https://github.com/figma/plugin-samples （官方示例中的桌面 Import plugin from manifest 流程）
- https://developers.figma.com/docs/plugins/manifest/
- https://developers.figma.com/docs/plugins/api/properties/nodes-exportasync/
