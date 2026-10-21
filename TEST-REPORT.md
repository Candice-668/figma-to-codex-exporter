# Figma to Codex Exporter 测试报告

日期：2026-10-21。交付版本：1.0.1。执行环境：Windows PowerShell，Node.js v24.19.0。

## 构建与文件检查

实际执行 `node scripts/build.cjs`，成功生成：

- `dist/code.js`：包含沙箱入口与递归导出器，没有未解析的 require。
- `dist/ui.html`：内联 UI 逻辑及 ZIP 实现，不引用 CDN 或外部运行资源。

`node scripts/verify.cjs` 逐项检查 manifest 引用的两个构建文件及源代码、脚本、说明文件；输出 `BUILD-VERIFICATION.json`，包含实际绝对路径、文件大小及 SHA-256。manifest 网络权限为 `["none"]`。

## 自动化结果：16 / 16 通过

命令：`node --test tests/*.test.cjs`。失败 0，跳过 0。

| 项目 | 结果 |
| --- | --- |
| 递归树、混合文本、渐变、描边、阴影、圆角、Auto Layout、样式和变量 | 通过 |
| 图片 hash 去重、原图关联、SVG/PNG 导出规则和隐藏层 | 通过 |
| 异步读取主组件、组件集、实例属性与变体信息 | 通过 |
| 素材失败告警、预览失败中止、非法根节点和取消 | 通过 |
| 旋转根 Frame 的矩阵换算、超大尺寸缩放和安全文件名 | 通过 |
| 素材传输钩子及二进制统计一致性 | 通过 |
| 传输失败必须中止，不伪装为单个素材警告 | 通过 |
| 不可读属性告警、旧文本分段 API 回退 | 通过 |
| 构建沙箱与 UI 模拟端到端：600,000 字节二进制多分片、长 Unicode JSON、ACK、ZIP、下载动作 | 通过 |
| manifest、本地权限、无网络运行依赖、构建占位符检查 | 通过 |
| CRC32 标准向量、中文 UTF-8 ZIP 路径、本地头/中央目录/结束记录 | 通过 |
| 路径穿越、盘符和重复 ZIP 路径拒绝 | 通过 |
| 消息来源为 null 的启动连接、后续选择变化 | 通过 |
| 首次消息丢失重试、超时停止、手动刷新恢复 | 通过 |
| 非法消息封装与未知消息不启用导出 | 通过 |
| package、构建 UI、导出 JSON 版本一致 | 通过 |

v1.0.1 取消对 `event.source === parent` 的强制过滤，改为校验消息封装、已知类型及选择字段。旧模拟端到端测试只使用 parent 消息来源；当前端到端测试使用 null 来源，并验证二进制和 JSON 多分片导出。该修复覆盖已识别的兼容性问题，但在取得真实客户端测试结果前不宣称已解决所有“正在读取”原因。

模拟测试使用自行构造的 Plugin API 对象和轻量 DOM，验证逻辑及传输协议。它们**没有调用真实 Figma 渲染器，也没有证明该插件已在 Figma 中安装成功**。测试中的二进制数据是协议测试夹具，不是实际设计截图。

## Windows ZIP 互操作检查

交付 ZIP 使用 Windows 自带的 `.NET System.IO.Compression.ZipFile` 读取。`scripts/verify-zip.ps1` 检查所有文件逐字节与本机项目一致，并检查包内 manifest 的 main/ui 引用可解析。此检查验证项目压缩包格式和字节完整性，不等于真实 Figma 导出测试。

## 真实 Figma Desktop 126.6.8：尚未验证

检测到 Figma 进程，但 Windows 桌面控制环境未能启动（`failed to launch codex app-server: program not found`）。本次没有完成以下操作：

- 在 Figma Desktop 126.6.8 导入 manifest。
- 在真实 Figma Plugin API 中运行插件。
- 用实际 Frame 核对 preview.png、素材、字体和坐标。
- 操作真实 Figma/Windows 的 ZIP 保存窗口。

因此交付状态为：**已实现、已构建、自动化测试通过；桌面实机安装与导出待验收**。针对 126.6.8 的操作说明见 `WINDOWS-INSTALL-126.6.8.md`，完整功能、字段及限制见 `README.md`。

实际桌面验收时，请对照 README 第 7 节执行，并特别留意 manifest 本地 id 是否被该客户端接受、不可访问组件、缺失字体和下载行为。
