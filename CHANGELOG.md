# Changelog

所有显著变更都记录于此。版本规则：小功能 `0.0.x` 递增，功能累积升级 `0.x.0`。

## v0.0.7 — 2026-11-23

- 文件读取（差异化）：`read_file` / `list_dir` 工具 + 会话级文件授权白名单。
- `FileService`：本地 `fs` / SSH SFTP（兜底 exec `cat`/`sed`）三通道读取。
- 白名单门控：未授权路径触发批准，批准后自动加入白名单，同前缀后续免确认。
- 单测：FileService（4 例，白名单匹配 + 本地读取）。

## v0.0.6 — 2026-11-23

- 补齐工具集：`send_keys`（回答 `[Y/n]`/`ctrl-c`）、`wait_for_output`（等长任务）、`ask_user`（向你提问）、`focus_terminal`（聚焦终端）。
- 提问 UI：工具卡片展示问题 + 选项按钮 + 自由文本回答。
- Agent 支持 `awaiting_user` 状态与 `answer()`。
- 单测：translateKeys（2 例）。

## v0.0.5 — 2026-11-23

- `run_command` 状态机：8 种退出态（prompt / awaiting_input / alt_screen / idle / timeout / reset / cancelled / matched）。
- 风险分级：毁灭性清单（永远确认）+ 变更清单（至少 medium），模型自评只升不降。
- 审批门控：ask / auto_low / auto_medium / auto_all，工具调用卡片可批准/拒绝。
- Agent 循环：Pi 式 tool calling 循环（`read_terminal` + `run_command`），单轮最多 80 次工具调用。
- 单测：risk（6 例）、terminal-runner 状态机（1 例）。

## v0.0.4 — 2026-11-23

- 终端缓冲读取：xterm marker 锚定、逻辑行合并、`captureLast`/`captureScreen`/`cursorLine`、alternate screen 检测。
- prompt 检测：学习结束符 + 通用 prompt 模式 + 输入提示（`Password:`/`[Y/n]`）模式。
- 面板终端状态条：实时展示当前 Tab 的状态（空闲/输出中/等待输入/全屏）与最后一行。
- 单测 `tests/prompt-detect.test.ts`（6 例）。

## v0.0.3 — 2026-11-23

- LLM 客户端：OpenAI 兼容 + Node `http/https` 绕 CORS + SSE 流式 + `reasoning_content` 解析。
- `AgentService`：流式对话、思考链收集、中止。
- 线性流对话 UI：transcript（思考链折叠、Markdown 渲染、打字指示、复制代码）、composer（Enter 发送）。
- HTML 预览：`npm run preview`（本地服务器 + 静态聊天页，真实流式对话）。
- 流式冒烟测试 `tests/stream.test.ts`（读取 `.env` 的 DeepSeek key）。

## v0.0.2 — 2026-11-23

- 工程脚手架：Tabby 插件骨架（Angular 15 + Webpack 5）、per-Tab 面板挂载、工具栏按钮/热键、设置页。
- `TerminalRegistryService` + `TerminalDecorator`，建立单 Tab 隔离的地基。

## v0.0.1 — 2026-11-23

- 重构 PRD 文档至 v3.0（开发向）：确定单 Tab 隔离模型、文件读取差异化、DeepSeek 默认接入、版本路线图与测试策略。
- 初始化 git 仓库与密钥管理规范（`.env` 本地注入，永不提交）。
