# Figma to Codex Exporter

当前版本：**v1.0.1**。安装教程面向 **Windows Figma Desktop 126.6.8**。本版修复“正在读取”可能无限等待的消息接收兼容性问题，增加启动重试、超时提示和“刷新选择”。自动化测试通过，真实 Figma 桌面版修复效果尚待验收。

首次安装：解压项目 → 打开桌面版 Design 文件 → 画布空白处右键 → **Plugins → Development → Import plugin from manifest…** → 选择项目根目录的 `manifest.json`。官方菜单也可从左上角 Figma 菜单进入。无需安装 npm 依赖。

更新已安装版本：关闭插件，用本版完整文件覆盖原安装目录，然后从 **Plugins → Development → Figma to Codex Exporter** 重新运行。若项目目录改变，重新导入新的 manifest。窗口顶部应显示 **v1.0.1**；仍显示旧版本说明客户端加载的还是旧目录或旧窗口。

首次导出：左侧图层面板只选一个 Frame → 运行插件 → 确认显示 Frame 名称 → **导出设计 ZIP → 保存 ZIP**。启动选择信息未更新时先点“刷新选择”；约 5 秒未连接会给出具体提示。`design.json` 包含完整可读取参数，`preview.png` 用于对照，`assets` 包含素材。

详细中文图文路径说明见 [Windows 126.6.8 安装教程](WINDOWS-INSTALL-126.6.8.md)，验证边界见 [测试报告](TEST-REPORT.md)，版本记录见 [CHANGELOG](CHANGELOG.md)。

Windows Figma 桌面版的本地开发插件。选中一个 Frame，将设计交付资料打包下载为 ZIP。直接使用 **Figma Plugin API**，不使用 Figma MCP、REST API、Dev Mode 或付费接口，不需要 Token。插件禁止网络请求，不修改设计图层。

## 1. Windows 安装（无需编译）

1. 解压交付 ZIP，将整个 `figma-to-codex-exporter` 文件夹放到固定目录，例如 `D:\FigmaPlugins\figma-to-codex-exporter`。不要直接在压缩包里导入。
2. 打开 **Figma 桌面应用**，进入一个你可编辑的 **Figma Design** 文件；不要停留在首页或 FigJam。
3. 左上角 Figma 菜单 → **Plugins（插件）→ Development（开发）→ Import plugin from manifest…（从 manifest 导入）**。
4. 选择解压文件夹根目录的 `manifest.json`，不是 `package.json`，也不是 `dist` 文件夹。
5. 在图层面板选中一个 Frame。选中内部文字或 Group 时请先切换到其 Frame；不要同时选多个。
6. **Plugins → Development → Figma to Codex Exporter**。
7. 选择 PNG 清晰度；通常用 1×，需要更清晰时用 2×。复杂合成图可勾选“为每个可见图层额外生成 PNG”。
8. 点击 **导出设计 ZIP**，等待出现“已完成”，再点击 **保存 ZIP**。Figma/Windows 弹出保存窗口时选择目录；若自动下载则查看系统下载目录。

已经包含 `dist/code.js` 和 `dist/ui.html`。**安装使用不需要 Node.js、npm install、付费 Figma 套餐或开发者 Token。** 需要有可运行开发插件的文件权限；组织管理员禁用插件或禁用导出时，插件不能绕过其策略。

manifest 中的 `figma-to-codex-exporter-local` 是本地开发标识，不是 Figma 分配的 Community 发布 id。若客户端拒绝本地标识，可用 Development → New plugin 创建空插件，将 Figma 为你生成的真实 id 替换进本项目 manifest，再重新导入；不要复制别人的发布 id。发布到 Community 不在本次交付范围。

## 2. 导出包

| 路径 | 内容 |
| --- | --- |
| `design.json` | 完整图层树、尺寸坐标、样式、文本分段、组件信息、素材索引、错误警告 |
| `preview.png` | 选中 Frame 的合成预览 |
| `assets/nodes/*.svg` | 可见矢量图层；另包含设置 SVG 导出的图层 |
| `assets/nodes/*.png` | 图片填充图层、设置导出的图层，或勾选额外 PNG 后的全部可见子图层 |
| `assets/images/*` | Figma 可读取的图片原始字节，按 imageHash 去重；可能是 PNG/JPEG/GIF/WebP |

无图片或无矢量的设计不会凭空生成对应素材。未知图片格式使用 `.bin`，图片图层仍尝试生成 `.png`。原图保留裁切前数据，图层 PNG 保留裁切、效果和叠加后的观感。SVG 遇到混合栅格内容时可能内嵌图片。隐藏图层始终保留 JSON 和图片原始字节，不单独生成其 SVG/PNG。字体只导出名称和样式信息，不打包字体文件。

## 3. 字段约定

| 要求 | `design.json` 对应字段 |
| --- | --- |
| 尺寸和坐标 | `root` 及每个子节点的 `x/y/width/height/rotation/relativeTransform/absoluteTransform/absoluteBoundingBox/absoluteRenderBounds/transformRelativeToRoot` |
| 文本及字体 | `text.characters/fontName/fontSize/fontWeight/lineHeight/letterSpacing`，混合样式见 `text.segments` |
| 颜色、渐变、透明度 | `fills/strokes/opacity/blendMode`；Paint 保留 `color/opacity/gradientStops/gradientTransform` 等原生字段 |
| 描边、阴影、圆角 | `strokeWeight/strokeAlign` 等、`effects`、`cornerRadius` 及四个独立角半径 |
| Auto Layout | `layoutMode/layoutWrap/layoutSizingHorizontal/layoutSizingVertical/primaryAxis* /counterAxis*` |
| Padding 和 Gap | `paddingTop/Right/Bottom/Left/itemSpacing/counterAxisSpacing`，Grid 使用 `gridRowGap/gridColumnGap` 等 |
| 层级 | `children/parentId/siblingIndex/depth/effectiveVisible` |
| 组件 | `mainComponent/componentProperties/variantProperties/overrides/componentPropertyDefinitions/componentPropertyReferences/key/remote` |
| 图片与素材 | Paint 中的 `assetPath`、节点的 `assets`、顶层 `assets` |
| 样式与变量 | `styles` 为引用样式快照；`variables` 保留别名关联和可读的 `valuesByMode` |
| 异常 | `warnings`，包含节点 id、操作及错误原因 |

- 未被此类型图层支持的字段省略；API 的 `figma.mixed` 编码为 `{"mixed":true}`，不使用虚假的统一字号或颜色。渐变/颜色数值沿用 Figma 原值（通常 0–1），无需猜测 hex。
- `x/y` 是相对父级坐标；根节点的 x/y 相对页面。`absoluteTransform` 是页面矩阵。`transformRelativeToRoot` 使用根 Frame 逆矩阵计算，适用于旋转和嵌套；不要直接拿绝对 x/y 相减还原旋转设计。
- `children`/`siblingIndex` 使用 Figma 原顺序（底部到顶部）。Auto Layout 的 `itemReverseZIndex`、mask、blendMode 也影响最终合成，需同时参考预览。
- 文本分段 `start/end` 沿用 JS/Figma 的 UTF-16 索引。行高保留 AUTO/PIXELS/PERCENT，字间距保留原单位。字体文件缺失可能使目标网页换行不同。
- 样式和变量只解析图层已引用、当前 API 有权访问的内容。变量保留模式值和 id，不擅自推断完整主题或导出整个团队库；远程主组件不可用时记录 null/警告，实例自身子图层仍递归读取。
- 视频、交互原型、动效、字体二进制、外部库全量内容、响应式断点推断和自动生成网页不属于本插件范围。

## 4. 交给 Codex

将插件生成的 ZIP 上传到 Codex，可附上以下任务描述：

> 请读取 design.json，以 preview.png 为视觉基准，用 assets 中的素材实现页面。优先还原 Auto Layout、Padding、Gap、字体和组件关系；正确处理混合文本和旋转矩阵。先检查 warnings 并说明缺失资源，不要自行替换品牌素材。需要响应式适配时请在现有布局基础上补充。

## 5. 源代码与构建

| 文件 | 作用 |
| --- | --- |
| `manifest.json` | 本地插件入口与最小网络权限 |
| `src/exporter.js` | 递归读取、组件/样式/变量解析、图片和图层导出 |
| `src/main.js` | Figma 沙箱入口、选择校验、取消和 ACK 分片传输 |
| `src/ui.html` / `src/ui.js` | 设置、进度、错误及 ZIP 保存界面 |
| `src/zip.js` | ZIP32 STORE 写入、UTF-8 路径和 CRC32，无第三方依赖 |
| `scripts/build.cjs` | 将源代码打包到 dist；UI 脚本内联，无 CDN |
| `scripts/package.cjs` | 构建、运行测试后打包完整项目 |
| `tests/*.test.cjs` | Node 自动化测试，含模拟沙箱/UI 端到端流程 |

修改源码需安装 Node.js 18+。PowerShell 中进入项目目录执行：

```powershell
node scripts/build.cjs
node --test tests/*.test.cjs
node scripts/package.cjs
```

也可双击 `build.cmd` 构建、`test.cmd` 测试；npm 用户可执行 `npm run build`、`npm test`、`npm run package`。没有 npm 依赖，不需要 npm install。构建后关闭并重新运行 Figma 插件即可加载新代码。打包输出在项目同级 `outputs` 目录。

## 6. 性能和错误处理

- 二进制文件用 256 KiB 分片，JSON 用 64 Ki 字符分片，每片收到 ACK 后再发下一片，30 秒未确认则中止。
- 单次二进制素材上限 200 MiB，JSON 上限 32 Mi 字符，素材文件上限 10,000、图层上限 20,000、嵌套深度上限 200。超过限制应拆分 Frame。
- PNG 请求清晰度 1×/2×/3×；基于节点尺寸自动限制长边 8192 px 和约 1600 万像素。阴影溢出等实际输出边界仍由 Figma 决定。`preview.effectiveScale` 记录缩放。
- ZIP 用 STORE 标准格式，不额外压缩，兼容 Windows 解压；PNG/JPEG 本身已有压缩。大包在 UI 打包时仍占用内存，“全部图层 PNG”按需开启。
- 预览失败和传输错误中止整个导出。个别不可读属性、不可用远程组件或素材失败会记录 warnings；界面也会显示警告数量。
- 取消会等待正在执行的 Figma `exportAsync` 返回，Plugin API 不提供强行中断该调用的能力。
- 如果“保存 ZIP”没有反应，先确认界面已显示“已完成”，再点一次；查看 Figma/系统下载或保存窗口。更换本地目录不会自动更新开发插件的 manifest 路径，移动后需重新导入。

## 7. 测试状态与桌面验收

见 `TEST-REPORT.md`。**自动化通过不等于已完成 Figma 桌面实机测试。** 本次桌面控制环境未能启动，因此实际导入、Figma 渲染结果和系统保存对话框仍待实机验收。

在独立测试 Design 文件中建议按以下顺序验收：

1. 无选择、多选、选中 Text/Group：应提示只选一个 Frame。
2. Frame 内放入嵌套 Frame、Auto Layout、四边不同 Padding、Gap、混合中英文字号和颜色、渐变、圆角、描边、阴影、旋转图层。
3. 添加两个复用同一图片的矩形、矢量图标、组件实例及隐藏组；保存并导出。
4. 用 Windows 解压 ZIP，打开 preview.png 对比画布。核对 JSON 文本分段、矩阵、组件信息和有效可见性；同一 imageHash 应只保存一份原图。
5. 打开 SVG 和 PNG 检查图像；留意 warnings。切换 2× 和“全部图层 PNG”再导出，检查素材数量和清晰度。
6. 导出中取消，然后再次导出；输出应能重新成功。长页面检查 effectiveScale 是否按上限缩小。

官方参考（2026-10-21 核对）：

- [Plugin manifest](https://developers.figma.com/docs/plugins/manifest/)
- [Plugin API](https://developers.figma.com/docs/plugins/)
- [getStyledTextSegments](https://developers.figma.com/docs/plugins/api/properties/TextNode-getstyledtextsegments/)
- [exportAsync](https://developers.figma.com/docs/plugins/api/properties/nodes-exportasync/)

许可证：MIT，见 LICENSE。
