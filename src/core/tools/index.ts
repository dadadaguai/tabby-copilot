import { AgentTool, ApprovalRequirement } from './types'
import { assessCommand, maxRisk, normalizeRisk } from '../util/risk'
import { countLines, formatDuration } from '../util/text'
import { RunResult, translateKeys } from '../terminal-runner'
import { RunExitState } from '../../types/session'

function str (v: unknown): string {
    return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function num (v: unknown, fallback: number): number {
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Header line + guidance that tells the model what the terminal is doing now. */
export function describeRunResult (label: string, r: RunResult, cmdTimeoutS?: number): string {
    const dur = formatDuration(r.durationMs)
    const lines = countLines(r.output)
    let header: string
    let hint = ''
    switch (r.state) {
        case 'prompt':
            header = `finished – prompt returned after ${dur}`
            break
        case 'matched':
            header = `output matched the pattern after ${dur}`
            break
        case 'awaiting_input':
            header = `WAITING FOR INPUT after ${dur} – last line: ${JSON.stringify(r.lastLine.trim())}`
            hint = 'The program is waiting. Answer with send_keys (e.g. keys ["y","enter"]), or use ask_user if the user must decide (passwords must be typed by the user: ask them to type it, then wait_for_output).'
            break
        case 'alt_screen':
            header = 'a full-screen program is active (vim/less/htop/…) – showing the screen'
            hint = 'Interact with send_keys (e.g. "q", ":q", "ctrl-c"), or wait_for_output.'
            break
        case 'idle':
            header = `no new output for a while and no prompt after ${dur} – the command may still be running or waiting silently`
            hint = 'Use wait_for_output to keep waiting, read_terminal to look again, or send_keys "ctrl-c" to abort.'
            break
        case 'timeout':
            header = `still running after ${cmdTimeoutS ?? Math.round(r.durationMs / 1000)}s – no prompt yet`
            hint = 'Use wait_for_output with a longer timeout to keep waiting, or send_keys "ctrl-c" to abort.'
            break
        case 'reset':
            header = 'the terminal was reset or reconnected while waiting – the command may not have run'
            hint = 'Check the current state with read_terminal, then run the command again if needed.'
            break
        case 'cancelled':
            header = 'cancelled by the user'
            break
        default:
            header = r.state
    }
    const parts = [`[${label} · ${header}${lines ? ` · ${lines} lines` : ''}]`]
    if (hint) {
        parts.push(hint)
    }
    parts.push(r.output || '(no output)')
    return parts.join('\n')
}

export const readTerminalTool: AgentTool = {
    spec: {
        name: 'read_terminal',
        description: 'Read the most recent lines of the terminal screen/scrollback without typing anything. Use it to see the current state before acting, or to look at output that scrolled by.',
        parameters: {
            type: 'object',
            properties: {
                lines: { type: 'integer', description: 'How many lines from the bottom (default 60, max 400).' },
            },
            additionalProperties: false,
        },
    },
    approval: () => null,
    async execute (args, ctx) {
        const t = ctx.getTerminal()
        const n = Math.max(1, Math.min(400, Math.floor(num(args.lines, 60))))
        const capture = ctx.readLast(t, n)
        t.readMarker = ctx.mark(t)
        const body = capture.lines.join('\n').trimEnd()
        const screenNote = capture.isAlternate ? ' · full-screen program active' : ''
        return `[${t.label} · last ${capture.lines.length} lines${screenNote}]\n${body || '(empty)'}`
    },
}

export const runCommandTool: AgentTool = {
    spec: {
        name: 'run_command',
        description: 'Type a shell command into the terminal, press Enter, and wait for it to finish. Returns the output and whether the prompt came back, the program is waiting for input, or it is still running. One command per call; chain with && when steps belong together.',
        parameters: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'Exact command line to run.' },
                risk_level: { type: 'string', enum: ['low', 'medium', 'high'], description: 'low: read-only/inspection. medium: changes files, packages, services or network config. high: destructive or hard to undo.' },
                explanation: { type: 'string', description: 'One sentence for the user: what this does and why.' },
                timeout_seconds: { type: 'integer', description: 'How long to wait before reporting back if the command has not finished (default 60).' },
            },
            required: ['command', 'risk_level', 'explanation'],
            additionalProperties: false,
        },
    },
    approval (args): ApprovalRequirement {
        const a = assessCommand(str(args.command), args.risk_level)
        return { level: a.level, hardBlock: a.hardBlock, reason: a.reason }
    },
    async execute (args, ctx) {
        const command = str(args.command)
        if (!command.trim()) {
            throw new Error('command must not be empty')
        }
        const t = ctx.getTerminal()
        if (ctx.focusOnRun) {
            ctx.focus(t)
        }
        if (t.busyWith && t.busyWith !== ctx.toolCallId) {
            throw new Error(`Terminal "${t.label}" is busy with another command. Wait for it or use another terminal.`)
        }
        if (ctx.isAlternateScreen(t)) {
            throw new Error(`Terminal "${t.label}" has a full-screen program open.`)
        }
        const timeoutS = Math.max(2, Math.min(3600, num(args.timeout_seconds, ctx.defaultTimeoutSeconds)))
        t.busyWith = ctx.toolCallId
        try {
            const result = await ctx.runner.run(t, command, {
                timeoutMs: timeoutS * 1000,
                signal: ctx.signal,
                onProgress: text => ctx.progress(text),
            })
            t.readMarker = result.end
            ctx.setExitState(result.state as RunExitState)
            return describeRunResult(t.label, result, timeoutS)
        } finally {
            t.busyWith = null
        }
    },
}

export const sendKeysTool: AgentTool = {
    spec: {
        name: 'send_keys',
        description: 'Send keystrokes to the terminal without a trailing Enter (unless you include "enter"). Use it to answer prompts (y/n), drive full-screen programs, or interrupt with ctrl-c. Never use it to type passwords – ask the user to type those.',
        parameters: {
            type: 'object',
            properties: {
                keys: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Sequence of keys. Plain text is typed literally; special names: enter, tab, esc, space, backspace, up, down, left, right, ctrl-c, ctrl-d, ctrl-z, ctrl-l. Example: ["y", "enter"].',
                },
                explanation: { type: 'string', description: 'Why these keys are being sent.' },
                risk_level: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Risk of what these keys will cause (confirming a destructive prompt is high).' },
                timeout_seconds: { type: 'integer', description: 'How long to wait for the terminal to settle afterwards (default 15).' },
            },
            required: ['keys', 'explanation'],
            additionalProperties: false,
        },
    },
    approval (args): ApprovalRequirement {
        const keys: string[] = Array.isArray(args.keys) ? args.keys.map(str) : []
        const benign = keys.every(k => /^(ctrl-c|ctrl-l|esc|escape|space|up|down|left|right|pageup|pagedown|home|end)$/i.test(k.trim()))
        const claimed = normalizeRisk(args.risk_level ?? (benign ? 'low' : 'medium'))
        return { level: benign ? claimed : maxRisk(claimed, 'medium'), hardBlock: false }
    },
    async execute (args, ctx) {
        const keys: string[] = Array.isArray(args.keys) ? args.keys.map(str) : [str(args.keys)]
        if (!keys.length) {
            throw new Error('keys must not be empty')
        }
        const data = keys.map(k => {
            try {
                return translateKeys(k)
            } catch {
                return k   // literal text
            }
        }).join('')
        const t = ctx.getTerminal()
        if (ctx.focusOnRun) {
            ctx.focus(t)
        }
        const timeoutS = Math.max(1, Math.min(600, num(args.timeout_seconds, 15)))
        const prevBusy = t.busyWith
        t.busyWith = ctx.toolCallId
        try {
            const result = await ctx.runner.sendKeys(t, data, {
                timeoutMs: timeoutS * 1000,
                signal: ctx.signal,
                onProgress: text => ctx.progress(text),
            })
            t.readMarker = result.end
            ctx.setExitState(result.state as RunExitState)
            return describeRunResult(t.label, result, timeoutS)
        } finally {
            t.busyWith = prevBusy && prevBusy !== ctx.toolCallId ? prevBusy : null
        }
    },
}

export const waitForOutputTool: AgentTool = {
    spec: {
        name: 'wait_for_output',
        description: 'Keep waiting on a terminal where a command is still running (after a timeout/idle result), or wait for the user to finish typing something. Returns the output produced since the last read.',
        parameters: {
            type: 'object',
            properties: {
                timeout_seconds: { type: 'integer', description: 'Maximum time to wait (default 60).' },
                until_regex: { type: 'string', description: 'Optional regular expression; return as soon as the new output matches it.' },
            },
            additionalProperties: false,
        },
    },
    approval: () => null,
    async execute (args, ctx) {
        const t = ctx.getTerminal()
        const timeoutS = Math.max(1, Math.min(3600, num(args.timeout_seconds, 60)))
        let regex: RegExp | null = null
        if (args.until_regex) {
            try {
                regex = new RegExp(str(args.until_regex), 'm')
            } catch (e) {
                throw new Error(`until_regex is not a valid regular expression: ${(e as Error).message}`)
            }
        }
        const wasBusy = t.busyWith
        t.busyWith = ctx.toolCallId
        try {
            const result = await ctx.runner.waitForOutput(t, t.readMarker, {
                timeoutMs: timeoutS * 1000,
                signal: ctx.signal,
                untilRegex: regex,
                onProgress: text => ctx.progress(text),
                idleMs: Math.min(timeoutS * 1000, 20_000),
            })
            t.readMarker = result.end
            ctx.setExitState(result.state as RunExitState)
            return describeRunResult(t.label, result, timeoutS)
        } finally {
            t.busyWith = wasBusy && wasBusy !== ctx.toolCallId ? wasBusy : null
        }
    },
}

export const askUserTool: AgentTool = {
    spec: {
        name: 'ask_user',
        description: 'Ask the user a question in the panel and wait for the answer. Use it for missing information or decisions with real consequences.',
        parameters: {
            type: 'object',
            properties: {
                question: { type: 'string', description: 'The question, phrased so it can be answered briefly.' },
                choices: { type: 'array', items: { type: 'string' }, description: 'Optional fixed options shown as buttons.' },
            },
            required: ['question'],
            additionalProperties: false,
        },
    },
    approval: () => null,
    async execute (args, ctx) {
        const question = str(args.question).trim()
        if (!question) {
            throw new Error('question must not be empty')
        }
        const choices = Array.isArray(args.choices) ? args.choices.map(str).filter(Boolean) : undefined
        const answer = await ctx.askUser(question, choices?.length ? choices : undefined)
        return `User answered: ${answer}`
    },
}

export const focusTerminalTool: AgentTool = {
    spec: {
        name: 'focus_terminal',
        description: 'Switch the user\'s view to the terminal (for example to let them type a password or watch something).',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    approval: () => null,
    async execute (_args, ctx) {
        const t = ctx.getTerminal()
        ctx.focus(t)
        return `Focused "${t.label}".`
    },
}

function dirname (p: string): string {
    const s = (p ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
    const i = s.lastIndexOf('/')
    if (i < 0) {
        return '.'
    }
    return i === 0 ? '/' : s.slice(0, i)
}

export const readFileTool: AgentTool = {
    spec: {
        name: 'read_file',
        description: 'Read a file from the terminal\'s host (local or SSH). The path must be within the whitelist; if not, the agent asks you to grant access.',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Absolute path of the file to read.' },
                lines: { type: 'integer', description: 'Read only the first N lines (default: the whole file, up to a size limit).' },
                offset: { type: 'integer', description: 'Skip the first N lines before reading.' },
            },
            required: ['path'],
            additionalProperties: false,
        },
    },
    approval: () => null,
    async execute (args, ctx) {
        const path = str(args.path)
        if (!path) {
            throw new Error('path is required')
        }
        if (!ctx.isPathAllowed(path)) {
            const granted = await ctx.requestApproval(`申请访问目录：${dirname(path)}（读取 ${path}）`)
            if (!granted) {
                return 'The user denied access to this path. Do not retry the same path; ask the user for the right path or use a command instead.'
            }
            ctx.grantPath(dirname(path))
        }
        const lines = num(args.lines, 0)
        const offset = Math.max(0, Math.floor(num(args.offset, 0)))
        const content = await ctx.readFile(path, lines || undefined, offset || undefined)
        return content || '(empty file)'
    },
}

export const listDirTool: AgentTool = {
    spec: {
        name: 'list_dir',
        description: 'List a directory on the terminal\'s host (local or SSH). The path must be within the whitelist; if not, the agent asks you to grant access.',
        parameters: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Absolute path of the directory to list.' },
            },
            required: ['path'],
            additionalProperties: false,
        },
    },
    approval: () => null,
    async execute (args, ctx) {
        const path = str(args.path)
        if (!path) {
            throw new Error('path is required')
        }
        if (!ctx.isPathAllowed(path)) {
            const granted = await ctx.requestApproval(`申请访问目录：${path}`)
            if (!granted) {
                return 'The user denied access to this directory. Do not retry the same path; ask the user for the right path or use a command instead.'
            }
            ctx.grantPath(path)
        }
        const content = await ctx.listDir(path)
        return content || '(empty)'
    },
}

export const ALL_TOOLS: AgentTool[] = [
    readTerminalTool,
    runCommandTool,
    sendKeysTool,
    waitForOutputTool,
    askUserTool,
    focusTerminalTool,
    readFileTool,
    listDirTool,
]

export function findTool (name: string): AgentTool | undefined {
    return ALL_TOOLS.find(t => t.spec.name === name)
}
