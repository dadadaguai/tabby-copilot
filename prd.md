# 产品需求文档（PRD）：`tabby-copilot` — Tabby 终端原生 AI 副驾驶插件

| 文档属性 | 内容 |
| :--- | :--- |
| **产品名称** | `tabby-copilot` |
| **产品形态** | Tabby 桌面终端原生插件（Angular 15 + TypeScript + Webpack 5） |
| **设计风格** | Claude / Codex / DeepSeek 网页端**极简线性对话流**（明确**不采用**参考仓库 `tabby-ai-panel` 的 ng-bootstrap 卡片风） |
| **目标用户** | 需要在本地 Shell、远程 SSH、Docker 容器内高频执行编译、测试、排错与运维的研发/测试工程师 |
| **开发模式** | **自研 + 重度借鉴** [`giejqf/tabby-ai-panel`](https://github.com/giejqf/tabby-ai-panel) 的实现思路（**不 fork**） |
| **隔离模型** | **单 Tab 隔离**：每个终端 Tab 拥有独立的会话、屏幕缓冲与文件授权白名单 |
| **默认模型** | DeepSeek（`deepseek-chat` / `deepseek-reasoner`），OpenAI 兼容，**API Key 由用户自填，永不硬编码** |
| **文档版本** | v3.0（开发向重写） |
| **产品版本** | 从 **v0.0.1** 起；小功能 `0.0.x` 递增，功能累积升级 `0.x.0` |

---

## 1. 项目背景与核心价值

### 1.1 痛点分析

传统终端 AI 工具（交互式 CLI Agent / 全自动 Agent）存在三类核心痛点：

1. **视野侵占与交互割裂**：CLI TUI 占满终端窗口，无法同时对照原始构建日志、代码或持续监控输出；长文本多轮对话在终端里的排版、滚动、复制体验远不如 Web 端（DeepSeek / Claude / Codex）。
2. **远程环境部署成本高**：高频切换多台 SSH 测试节点或临时 Docker 容器时，要求每台远端机器安装 Node.js / CLI / 外部代理极不现实。
3. **黑盒全自动执行风险高**：全自动 Agent 在权限未收敛时直接执行删除、覆写、重启命令，在生产与共享测试节点上存在安全风险。

### 1.2 产品定位与核心价值

`tabby-copilot` 把 AI 副驾驶内嵌为 **每个终端 Tab 最右侧的原生分屏面板**，默认关闭、按需唤起：

- **零远端侵入**：插件运行在本地 Tabby 进程内，复用 Tabby 已建立的本地 PTY 与 SSH 通道，远端机器无需安装任何依赖。
- **网页级流式对话**：Claude / Codex / DeepSeek 风格的线性对话流、思考链折叠、Markdown 渲染、内联工具调用条与可交互代码块。
- **单 Tab 彻底隔离**：每个 Tab 独立持有会话状态、屏幕输出缓冲与文件授权白名单，互不串扰，天然降低越权风险。
- **半自动可控执行（Human-in-the-Loop）**：读操作在白名单内静默完成；所有终端指令与写操作以可交互代码块呈现，用户点击确认后才投递执行。

### 1.3 与参考项目的差异定位

| 维度 | 参考项目 `tabby-ai-panel` | 本项目 `tabby-copilot` |
| :--- | :--- | :--- |
| 面板模型 | 全局单面板，跨 Tab 用 key（`t1`/`t2`）寻址 | **单 Tab 隔离**：面板挂在每个 Tab 右侧，仅作用于所属 Tab |
| UI 风格 | ng-bootstrap 卡片 | Claude / Codex / DeepSeek 线性流 |
| 文件读取 | 无（纯终端） | **有**：`read_file` / `list_dir` + 文件授权白名单（差异化） |
| 模型接入 | OpenAI 兼容（多端） | 默认 DeepSeek，仍保持 OpenAI 兼容 |

---

## 2. 参考项目与借鉴矩阵

| 参考项目 | 仓库地址 | **借鉴什么** | **不借鉴什么** |
| :--- | :--- | :--- | :--- |
| **tabby-ai-panel**（主参考） | [`giejqf/tabby-ai-panel`](https://github.com/giejqf/tabby-ai-panel) | 终端执行状态机、prompt 检测、风险分级、审批模式、上下文预算、会话持久化、OpenAI 兼容 LLM 客户端、xterm 缓冲访问、Tabby 插件注册方式 | 全局单面板架构、ng-bootstrap 卡片 UI |
| **Pi Coding Agent** | [`earendil-works/pi`](https://github.com/earendil-works/pi)<br>[`badlogic/pi-mono`](https://github.com/badlogic/pi-mono) | `read_file` / `list_dir` 工具语义、**API Key 自填的配置方式**、极简透明的 Agent Loop | 复杂多 Agent 框架 |
| **Claude Code / Codex** | [`anthropics/claude-code`](https://github.com/anthropics/claude-code)<br>[`openai/codex`](https://github.com/openai/codex) | 低噪点、高信息密度线性流：内联工具调用条、代码块顶部微操作栏（▶ 运行 / ✎ 填入 / 复制）、执行后回传反馈 | 厚重圆角卡片表单 |
| **DeepSeek 生态** | [`deepseek-ai`](https://github.com/deepseek-ai) | `deepseek-reasoner` 的 `reasoning_content` 独立流式渲染与默认折叠、OpenAI 兼容端点 | — |

---

## 3. 总体架构（单 Tab 隔离）

### 3.1 总体架构图

每个终端 Tab 通过 `TerminalDecorator` 动态挂载一个独立的 Copilot 侧边栏，Agent 只读写**所属 Tab** 的缓冲与连接。

```text
+-----------------------------------------------------------------------------------+
|                          Tabby Desktop (Electron) — 单个终端 Tab                   |
|                                                                                   |
|  +-------------------------------------+  +------------------------------------+  |
|  |  左：终端视图 (xterm.js)             |  |  右：Copilot 侧边栏 (per-Tab)       |  |
|  |  - Local PTY / SSH Session          |  |  [Header] 连接标识 / 模型 / 关闭    |  |
|  |  - 编译 / 测试 / 运维日志            |  |  [Stream] 线性对话 / 折叠思考链      |  |
|  |                                     |  |           内联工具条 / 可执行命令块  |  |
|  +-------+-------------------+---------+  |  [Dock]  @file 补全 / 输入框 / 模式  |  |
|          |                   ^            +--------+-------------------+-------+  |
|          | output$           | sendInput()         |                   |          |
|          v                   |                     |                   |          |
|  +-------------------------------------+           |                   |          |
|  |      TerminalBridgeService          |<----------+                   |          |
|  |  - xterm 缓冲读取 + marker 锚定      |  (屏幕快照 / 光标行)           |          |
|  |  - ANSI 清洗 & 逻辑行合并            |                               |          |
|  |  - prompt 检测 (学习结束符)          |                               |          |
|  +-------------------------------------+                               |          |
|                                                                        v          |
|  +-------------------------------------+  +------------------------------------+  |
|  |       FileService（差异化）           |  |      AgentLoop & LlmClient         |  |
|  |  - Local:  Node fs.promises         |  |  - SSE 流式解析 (OpenAI 兼容)       |  |
|  |  - SSH 优先: openSFTP()             |  |  - Tool Calling 调度 + 白名单拦截    |  |
|  |  - SSH 兜底: exec sed/cat           |  |  - 上下文 Token 预算与裁剪           |  |
|  |  - 白名单: 会话级授权前缀集合         |  |  - 风险分级 + 审批门控               |  |
|  +-------------------------------------+  +------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### 3.2 模块划分（目录结构）

```text
tabby-copilot/
├── package.json               # tabby-plugin 关键字；Angular 15 + Webpack 5
├── webpack.config.mjs
├── tsconfig.json
├── CHANGELOG.md               # 版本节奏记录
├── src/
│   ├── index.ts               # NgModule：注册 providers/components
│   ├── config.ts              # ConfigProvider（默认值 + 热键）
│   ├── hotkeys.ts             # HotkeyProvider
│   ├── commands.ts            # CommandProvider（工具栏按钮）
│   ├── settings-tab.ts        # SettingsTabProvider
│   ├── decorator.ts           # TerminalDecorator → 挂载 per-Tab 面板
│   ├── prompts/system.md      # Agent 内置指令
│   ├── types/                 # config.ts / session.ts（含 FileWhitelist 类型）
│   ├── core/                  # 无 UI 的纯逻辑（可单测）
│   │   ├── agent.service.ts        # 单 Tab Agent 循环：审批、工具执行、会话
│   │   ├── terminal-bridge.service.ts # 本 Tab 缓冲读取 / sendInput / prompt 检测
│   │   ├── terminal-runner.ts      # 命令执行状态机（借鉴参考）
│   │   ├── file.service.ts         # 文件读取（local/SFTP/exec）+ 白名单判定
│   │   ├── prompt-builder.ts       # 会话 → 消息 + 上下文预算
│   │   ├── session-store.service.ts# JSON 持久化（原子写 / 合并写）
│   │   ├── model-catalog.service.ts# /v1/models 缓存
│   │   ├── llm/                    # openai-compatible.ts / models.ts / types.ts
│   │   ├── tools/                  # 工具定义 + 执行上下文
│   │   └── util/                   # prompt-detect.ts / risk.ts / sse.ts / text.ts
│   └── ui/                    # Angular 组件（线性流风格）
│       ├── panel/ transcript/ composer/ tool-call/ file-whitelist/ settings/
│       ├── pipes/             # 消毒 Markdown、相对时间
│       └── util/              # stick-to-bottom 滚动
├── preview/                   # 独立 HTML 预览 harness（无 Tabby 测试用）
└── tests/                     # 单元测试（node --import tsx --test）
```

### 3.3 数据流（一次 Agent 轮次）

1. 用户在 Composer 输入并发送 → `AgentService` 把消息写入会话，附带本 Tab 的终端快照。
2. `PromptBuilder` 将会话转成 provider 无关的 chat 消息（含上下文预算裁剪）。
3. `LlmClient` 通过 Node `http/https` 走 SSE 流式请求 DeepSeek，逐 token 渲染 + `reasoning_content` 折叠。
4. 模型返回 tool_call → 每个调用经过**风险分级 + 审批门控**后执行。
5. 终端类工具经 `TerminalRunner` 状态机投递到本 Tab；文件类工具经 `FileService` + 白名单读取。
6. 结果回写会话 → 回到第 2 步，直至模型不再调用工具（单轮最多 80 次工具调用）。
7. 每步后会话落盘（原子写）。

---

## 4. 核心功能规格

### 4.1 面板与交互（线性流 UI）

- 面板挂在每个 Tab 右侧，默认隐藏，通过工具栏按钮或热键 `Ctrl+Alt+A`（macOS `⌘⇧A`）切换**当前 Tab** 的面板。
- 从顶到底：Header（标题/连接标识/模型/关闭）→ 思考链折叠区 → 线性对话流 → Composer（`@file` 补全 / 审批模式 / token 计数 / 模型切换）。
- 模型输出 Markdown 渲染；代码块带 `▶ 运行`（投递到本 Tab 不回车）/ `✎ 填入` / `复制` 微操作。
- 工具调用显示为内联条（`✓ 已读取 /etc/hosts`），可展开查看输入/输出/风险徽章。
- 推理模型（`deepseek-reasoner`）的 `reasoning_content` 默认折叠展示。
- 回车发送、`Shift+Enter` 换行；流式期间可预编辑下一条，轮次结束才可发送。

### 4.2 Agent 工具集（8 个，单 Tab 单终端）

> 单 Tab 隔离下不存在跨 Tab 寻址，因此**去掉**参考仓库的 `list_terminals` / `open_terminal`；新增文件工具。

| 工具 | 作用 | 审批 |
| :--- | :--- | :--- |
| `read_terminal` | 读取本 Tab 屏幕/回滚区最后 N 行，不打字 | 永不 |
| `run_command` | 输入命令回车并等待结果 | 按风险 |
| `send_keys` | 发送按键（回答 `[Y/n]`、驱动全屏程序、`ctrl-c`） | 按风险 |
| `wait_for_output` | 继续等待运行中的命令，可 `until_regex` 匹配 | 永不 |
| `read_file` | 读取文件（local/SFTP/exec），受白名单约束 | 按白名单 |
| `list_dir` | 列出目录，受白名单约束 | 按白名单 |
| `ask_user` | 向用户提问并等待回答 | 永不 |
| `focus_terminal` | 把焦点切回终端（让用户输密码/观察） | 永不 |

**工具参数与语义**（对齐参考仓库的规格，`read_file`/`list_dir` 为本项目新增）：

- `read_terminal(lines=60, max=400)`：返回本 Tab 逻辑行（换行行合并），标注全屏程序状态。
- `run_command(command, risk_level, explanation, timeout_seconds=60)`：`risk_level` 为模型自评 `low|medium|high`，本地模式只能调高；`explanation` 一句话说明用途。
- `send_keys(keys[], explanation, risk_level, timeout_seconds=15)`：特殊键名 `enter/tab/esc/ctrl-c/ctrl-d/up/down/…`；全良性键默认 `low`，其余至少 `medium`。
- `wait_for_output(timeout_seconds=60, until_regex?)`：返回自上次读取以来的新输出。
- `read_file(path, lines?, offset?)`：路径必须命中本 Tab 的白名单前缀；SSH 优先 SFTP，兜底 `exec "sed -n '…p' path"`。
- `list_dir(path)`：同上白名单约束；返回文件/目录列表。
- `ask_user(question, choices?)`：暂停等待用户回答，回答以 `User answered: …` 回传模型。
- `focus_terminal()`：切焦点到本 Tab 终端。

### 4.3 终端执行状态机（借鉴 `tabby-ai-panel`）

`run_command` / `send_keys` / `wait_for_output` 在 `TerminalRunner` 上执行：

- 发送前记录光标行，**学习 prompt 结束符**（`$`/`#`/`❯`/`➜`/`PS >` 等，末字符为字母数字则不学习）。
- 每 150ms 轮询本 Tab 缓冲，识别以下 8 种退出态：

| 状态 | 条件 | 后续动作 |
| :--- | :--- | :--- |
| `prompt` | 输出静默 350ms 且末行像 prompt | 命令完成 |
| `matched` | `until_regex` 命中新输出 | 继续 |
| `awaiting_input` | 静默 ≥1.2s 且末行像 `[Y/n]`/`Password:` | `send_keys` 或 `focus_terminal` |
| `alt_screen` | 全屏程序激活且静默 1s | 返回屏幕，`send_keys` 驱动 |
| `idle` | 长时间无输出且无 prompt | `wait_for_output` / `read_terminal` |
| `timeout` | 时间预算耗尽 | `wait_for_output` 延长 |
| `reset` | 缓冲被清空/重连 | `read_terminal` 复核 |
| `cancelled` | 用户中止 | — |

- 结果输出**剔除命令回显与尾部 prompt**，仅返回新增内容。
- 缓冲位置用 xterm `registerMarker` 锚定，防止滚动条回绕导致绝对行号漂移。

### 4.4 风险分级与审批模式（借鉴 `tabby-ai-panel`）

模型对每条命令自报风险，本地再用两类正则清单**只调高不调低**：

- **毁灭性清单（永远强制确认，任何模式下都询问）**：`rm -rf` 作用于 `/`/`*`/`~`/`$HOME`/`.`、`mkfs`/`wipefs`/`shred`、`dd of=/dev/<disk>`、fork 炸弹、`chmod 777`/`chown -R /`、`shutdown`/`reboot`/`halt`、停用 ssh/网络服务、刷 `iptables`/`ufw reset`、`ip link set down`、`userdel`、`kill -9 -1`、`crontab -r`、`git push --force`、SQL `DROP`。
- **变更清单（至少抬到 medium）**：`sudo`、`rm -r`、`mv`/`chmod`/`chown`、包安装/卸载（`apt`/`yum`/`dnf`/`pacman`/`brew`…）、`systemctl`、网络工具（`ip`/`ifconfig`/`iptables`/`ufw`/`wg`…）、`kill`/`pkill`、`curl|sh`、写 `/etc`、`git push`/`reset --hard`、`docker rm`/`prune`。

审批模式四档（会话级可覆盖全局默认）：

| 模式 | 免确认范围 |
| :--- | :--- |
| `ask`（默认） | 无，一切命令都问 |
| `auto_low` | 只放行 `low` |
| `auto_medium` | 放行 `low`+`medium` |
| `auto_all` | 除毁灭性清单外全放行 |

### 4.5 文件读取与授权白名单（差异化）

- 每个 Tab 持有**会话级文件授权白名单**：一组允许访问的路径前缀（如 `/var/log/`、`/home/deploy/app/`、`~/projects/x/`）。
- 默认白名单为空，文件读取默认拒绝；用户在面板 UI 中授权（同意单次或"始终允许该前缀"），或预先在设置页配置。
- `read_file`/`list_dir` 先做前缀匹配，命中才放行；未命中返回给模型的错误会引导 Agent 向用户申请授权。
- 读取通道按连接类型选择：
  - 本地 Tab：Node `fs.promises`。
  - SSH Tab：优先 `session.openSFTP()`；SFTP 不可用时兜底 `exec` 通道跑 `sed -n 'a,b p'` / `cat`（并对输出做长度限制）。
- 白名单随会话持久化，恢复会话时沿用。

### 4.6 会话持久化与恢复（借鉴 `tabby-ai-panel`）

- 每个 Tab 的会话独立存为一个 JSON 文件：`<Tabby config dir>/tabby-copilot/sessions/<id>.json` + `index.json`。
- 写盘：原子写（临时文件 + rename）、400ms 合并写、`beforeunload` flush；`index.json` 损坏时扫描重建；预留 `migrate()` 钩子。
- 会话字段：`version/id/title/terminals[本 Tab 描述符]/messages[]/fileWhitelist[]/approvalMode/stats`。
- 恢复：会话绑定本 Tab 的**描述符**（profileId / host / user / port / 自定义标题），Tab 关闭后重开时按 `matchScore ≥ 3` 重新关联；工具调用记录保存 `status/exitState/riskLevel/result` 供回放。
- 消息结构：`user`（含终端快照，UI 隐藏）、`assistant`（含 `reasoning`/`toolCalls`/`usage`）、`note`（系统备注，`forModel` 时发给模型）。

### 4.7 模型接入（DeepSeek 默认，OpenAI 兼容，Key 自填）

- 端点默认 `https://api.deepseek.com`（自动归一化 `/v1` / `/v1/chat/completions`）；模型默认 `deepseek-chat`，可选 `deepseek-reasoner`。
- **API Key 由用户在设置页填写**（Pi 的"填入 key"方式），存 Tabby `config.yaml` 的 `tabbyCopilot` 键，**永不硬编码进源码**；本地预览 harness 用 gitignore 的 `.env` 注入。
- 客户端用 Node `http/https`（绕开 CORS），手写 SSE 解析：文本增量、`reasoning_content`、tool-call 增量、`usage`、in-stream `error`；兼容"忽略 `stream` 直接回 JSON"的服务端。
- `/v1/models` 列表解析（OpenAI `{data:[]}` / Ollama `{models:[]}` / 裸数组），`ModelCatalogService` 按端点+key 缓存 5 分钟。

### 4.8 上下文预算管理（借鉴 `tabby-ai-panel`）

每次请求前对会话做三层裁剪，**永不丢弃 system prompt 与最后一条用户消息**：

1. 单条工具结果按 `maxToolResultChars`（默认 12000 字符）截断为 head+tail。
2. 仍超 `maxContextChars`（默认 160000 字符，约 4 字符/token）→ 最旧的工具输出替换为 `[earlier output elided…]`。
3. 仍超 → 丢最旧整段交换，并在顶部插入"更早对话已截断"提示。

---

## 5. 配置项（Settings → tabby-copilot）

| 分组 | 键 | 默认 | 说明 |
| :--- | :--- | :--- | :--- |
| 模型 | `endpoint` | `https://api.deepseek.com` | OpenAI 兼容端点 |
| 模型 | `apiKey` | `''` | Bearer key，用户自填 |
| 模型 | `model` | `deepseek-chat` | 模型 id，Composer 可切换 |
| 模型 | `extraParamsText` | `''` | 额外请求参数（JSON，如 `{"temperature":0.2}`） |
| 模型 | `additionalSystemPrompt` | `''` | 追加的系统指令 |
| 安全 | `approvalMode` | `ask` | 新会话默认审批模式 |
| 安全 | `defaultCommandTimeout` | `60` | 命令默认时间预算（秒） |
| 面板 | `panelSide` | `right` | 面板靠左/右 |
| 面板 | `fontSize` | `13` | 基准字号（9–24） |
| 面板 | `focusTerminalOnRun` | `false` | 执行时是否切到终端视图 |
| 面板 | `showReasoning` | `true` | 是否显示思考链折叠 |
| 面板 | `autoTitle` | `true` | 用首条消息自动命名会话 |
| 上下文 | `maxToolResultChars` | `12000` | 单条工具结果送入模型的字符上限 |
| 上下文 | `maxContextChars` | `160000` | 整个 prompt 的字符预算 |

热键（可在 Settings → Hotkeys 重绑）：切换面板 `Ctrl+Alt+A`、批准 `Ctrl+Alt+Y`、拒绝 `Ctrl+Alt+X`、停止 `Ctrl+Alt+S`、聚焦输入 `Ctrl+Alt+I`、新会话 `Ctrl+Alt+N`（macOS 用 `⌘⇧`）。

---

## 6. 安全设计

- **审批门控**：所有能改变状态的工具先过风险分级 + 审批；毁灭性命令任何模式都强制确认。
- **永不输密码**：Agent 被指令禁止输入密码/口令；遇到 `Password:` 时 `focus_terminal` 让用户自己输，再用 `wait_for_output` 等待。这是对模型的指令约束，不是可强制边界，审批卡片是最后防线。
- **输出消毒**：模型输出用 `marked` 渲染 + `DOMPurify` 消毒，移除脚本/样式/iframe/form/image/SVG/media，仅保留 `http(s):`/`mailto:` 链接；命令输出永远当纯文本。
- **数据边界**：请求只发往用户配置的端点，无遥测；每请求含系统指令 + 终端快照 + 工具结果（= Agent 读到的终端输出，受上下文预算裁剪）。
- **落盘警示**：会话 JSON 含完整命令输出，按 shell 历史对待；API key 存 Tabby `config.yaml`。

---

## 7. 技术实现要点（可直接落地）

1. **Tabby 插件注册**：npm 包加 `tabby-plugin` 关键字，默认导出 Angular `NgModule`；注册 `ConfigProvider` / `HotkeyProvider` / `CommandProvider` / `SettingsTabProvider` / `TerminalDecorator`。
2. **面板挂载**：Tabby 无 sidebar API → `PanelHostService` 手动创建组件并挂到 `.content`（`.content-tab` 的父元素），用 CSS 变量 `--copilot-width` 收窄终端区；找不到挂载点则退回 fixed overlay。
3. **缓冲读取**：直接读 xterm.js `buffer.active`；`getLine(i).isWrapped` 合并逻辑行；`registerMarker` 锚定位置；`alternate` 类型判全屏。
4. **prompt 检测**：通用模式（`[$#%>]`、`❯`、`➜`、`PS …>`、venv 前缀）+ 输入提示模式（`[Y/n]`、`Password:`、`Are you sure?`、`--More--`）+ 学习到的结束符三者结合。
5. **轮询参数**：150ms 轮询、quiet 350ms、`awaiting_input` 1200ms、`idle` 15s（`run_command`）/ 2.5s（`send_keys`）/ 20s（`wait_for_output`）。
6. **LLM 客户端**：Node `http/https`（绕 CORS）、跟随一次重定向、SSE 按 `\r?\n\r?\n` 分块、`[DONE]` 结束、`reasoning_content` 与 `reasoning` 双键兼容。

---

## 8. 版本路线图（v0.0.1 起，小功能 0.0.x，累积 0.x.0）

| 版本 | 里程碑内容 | 验收标准 |
| :--- | :--- | :--- |
| **v0.0.1** | 工程脚手架：Tabby 插件骨架、per-Tab 面板挂载、设置页 | 面板可挂到 Tab 右侧并打开/关闭 |
| **v0.0.2** | LLM 客户端 + 线性流对话 UI + 思考链折叠 | 填 DeepSeek key 后能流式对话、折叠推理 |
| **v0.0.3** | 终端桥接 + prompt 检测 + 缓冲读取 | 能读本 Tab 屏幕、正确识别 prompt |
| **v0.0.4** | `run_command` 状态机 + 风险分级 + 审批 | 命令按状态机返回、风险徽章正确、可批准/拒绝 |
| **v0.0.5** | `send_keys` / `wait_for_output` / `ask_user` / `focus_terminal` | 能回答 `[Y/n]`、等待长任务、向用户提问 |
| **v0.0.6** | 文件读取 + 白名单（local/SFTP/exec） | `read_file`/`list_dir` 受白名单约束，本地+SSH 可读 |
| **v0.0.7** | 会话持久化 + 恢复 + 上下文预算 | 会话落盘可恢复、长对话自动裁剪 |
| **v0.1.0** | 打磨 + 全量测试（单测 + HTML 预览）+ 发布 | 单测通过、HTML 预览验收通过 |

> 每完成一个里程碑即 `git commit`（`feat:` 前缀）并 `git tag v0.0.x`，推送到远端；版本号严格按「小功能 +0.0.1、功能累积 +0.1.0」推进。

---

## 9. 测试与验收

- **HTML 预览 harness**（`preview/`）：独立 Angular 应用 + 假终端模拟器（可喂入固定 prompt/输出）+ 可选假 LLM 或真实 DeepSeek（key 从 gitignore 的 `.env` 读入），在浏览器中迭代 UI 与 Agent 逻辑，**无需启动 Tabby**。
- **单元测试**（`tests/`，`node --import tsx --test`）：覆盖 `prompt-detect`（prompt/输入提示判定）、`risk`（清单命中）、`sse`（分块/事件解析）、`terminal-runner`（状态机，用假缓冲驱动）、`prompt-builder`（上下文裁剪）、`text`（截断/清洗）。
- **端到端（可选，后置）**：参考仓库的 CDP + 假 LLM 方案，在真实 Tabby 内回归主流程。

---

## 10. 工程规范

- **仓库**：本目录 `tabby-copilot` 为开发主仓库，`git init` 管理。
- **提交节奏**：每完成一个小功能 → `commit`（`feat:` / `fix:` / `docs:` 前缀）+ 打 `v0.0.x` tag + 推送；积累多个功能 → 升级 `v0.x.0`。
- **密钥管理**：API key 只存 `config.yaml`（Tabby）或 gitignore 的 `.env`（预览 harness），**永不提交**；`.env.example` 提供模板。
- **依赖**：Angular 15 + TypeScript ~4.9 + Webpack 5，peer 依赖 `tabby-core` / `tabby-terminal` / `tabby-settings`；`marked` + `dompurify` 做渲染消毒。
