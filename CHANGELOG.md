# Changelog

所有显著变更都记录于此。版本规则：小功能 `0.0.x` 递增，功能累积升级 `0.x.0`。

## v0.2.5 — 2026-11-24

- UI 打磨：代码块换行（不再横向延伸）、固定深色主题（解决白底白字看不清）、代码块 4 个图标按钮（发送至终端/执行/发送至输入框/复制）、会话内容可选中复制、Composer 底部简化为「模型名 + 推理强度」。

## v0.2.4 — 2026-11-24

- 修复「Cannot load package info」：`package.json` 补上 `author` 字段。Tabby 插件加载器会读 `info.author.name`，字段缺失会抛异常导致插件无法加载。

## v0.2.3 — 2026-11-23

- 修复面板挂载后不可见：panel 组件补上 `:host { display: flex; flex: 1 }`，宿主元素不再塌成 0 高。

## v0.2.2 — 2026-11-23

- 修复插件加载失败：核心服务改为只在模块 `providers` 注册（移除 `providedIn: 'root'`），消除根/模块双重注册导致的 NullInjectorError。
- `package.json` 版本同步到 0.2.2；`.tgz` 加入 `.gitignore`。

## v0.2.1 — 2026-11-23

- 代码块微操作：▶ 运行（投递到当前终端，不回车）/ ✎ 填入输入框 / 复制。

## v0.2.0 — 2026-11-23

- 单 Tab 会话隔离：每个终端 Tab 独立持有会话，切换 Tab 自动切换会话；会话按终端描述符重连并随会话持久化。

## v0.1.6 — 2026-11-23

- prompt 判定收紧（移除过宽的 `:` / `?` 通用模式）。
- `read_file` 支持 `offset` 参数；`send_keys` 良性键收紧（移除 `enter` / `q`）。
- `configured` 校验 API Key（本地免密端点豁免）；多行命令拼接修正。

## v0.1.5 — 2026-11-23

- 模型目录服务（`/v1/models` 解析 + 5 分钟缓存）+ Composer 模型切换。

## v0.1.4 — 2026-11-23

- 会话级审批模式选择器；文件白名单随会话持久化；Composer token 计数。

## v0.1.3 — 2026-11-23

- 接通死配置（`additionalSystemPrompt` / `autoTitle` / `showReasoning` / `focusTerminalOnRun`）并补齐设置页。

## v0.1.2 — 2026-11-23

- 白名单路径规范化（防 `..` 绕过）+ `~` 展开 + SSH exec 输出长度上限。

## v0.1.1 — 2026-11-23

- 热键：approve（`Ctrl+Alt+Y`）/ deny（`Ctrl+Alt+X`）/ stop（`Ctrl+Alt+S`）/ newSession（`Ctrl+Alt+N`）。
- 终端描述符级重连：会话记住绑定的终端，恢复时按 host/profile 匹配回原 Tab。
- 纯函数拆分：`terminal-descriptor.ts`（describeTab / matchScore）脱离 Angular 依赖。
- 单测：matchScore（4 例）。

## v0.1.0 — 2026-11-23

- 打磨 + 全量测试：typecheck / build 通过，25 个测试（24 单测 + 1 流式冒烟）通过。
- README 收尾，记录完整功能、架构与使用方式。

## v0.0.8 — 2026-11-23

- 会话持久化：JSON 落盘（原子写 + 400ms 合并 + index.json 可重建）+ 会话抽屉（列表/新建/切换/删除）。
- 上下文预算：工具结果 head+tail 截断 → 省略旧输出 → 丢最旧交换（永不丢 system 和最后一条用户消息）。
- 会话自动命名（首条消息）+ token 统计。
- 单测：prompt-builder（2 例）、session-utils（3 例）。

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
