# tabby-copilot

Tabby 终端原生 AI 副驾驶插件 —— **单 Tab 隔离**的 Pi 式 Agent 内核：内嵌在终端右侧的分屏面板，能自主读终端、跑命令（带审批）、读文件（受白名单约束），真正干活而非一问一答。

- **UI**：Claude / Codex / DeepSeek 风格的极简线性对话流。
- **模型**：默认 DeepSeek（`deepseek-chat` / `deepseek-reasoner`），OpenAI 兼容，key 用户自填。
- **隔离**：每个终端 Tab 独立持有会话、屏幕缓冲与文件白名单。

> 参考 [`giejqf/tabby-ai-panel`](https://github.com/giejqf/tabby-ai-panel) 的终端状态机、风险分级、审批模式、上下文预算与会话持久化思路（自研，不 fork）。

## 状态

当前为 **v0.0.2 工程脚手架**：插件骨架、面板挂载、设置页。Agent 内核、线性流对话、终端执行、文件读取在后续版本接入，见 [PRD](prd.md) 第 8 节路线图。

## 开发

```bash
npm install
npm run build        # 产物 dist/index.js
npm run typecheck    # 类型检查
npm run watch        # 开发监听
```

## 在 Tabby 中安装

1. 构建：`npm run build`。
2. Tabby 内 **Settings → Plugins**，点击 **Install plugin** 选择本项目目录（或产物 zip）。
3. 重启 Tabby；工具栏出现 **Copilot** 按钮，或按 `Ctrl+Alt+A` 打开面板。
4. **Settings → Copilot** 填写 DeepSeek 的 Endpoint / API Key / Model。

> 本地预览 harness（无需 Tabby 即可在浏览器测试面板 UI 与 Agent）在后续版本提供。

## 密钥与安全

API key 只保存在 Tabby 的 `config.yaml` 中（或本地预览用的 `.env`，已被 `.gitignore` 忽略），**永不提交进仓库**。参见 `.env.example`。
