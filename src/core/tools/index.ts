import { AgentTool, ApprovalRequirement } from './types'
import { assessCommand } from '../util/risk'
import { countLines, formatDuration } from '../util/text'
import { RunResult } from '../terminal-runner'
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
            hint = 'The program is waiting for input. Tell the user to answer it, or use a more specific command.'
            break
        case 'alt_screen':
            header = 'a full-screen program is active (vim/less/htop/…) – showing the screen'
            break
        case 'idle':
            header = `no new output for a while and no prompt after ${dur} – the command may still be running or waiting silently`
            break
        case 'timeout':
            header = `still running after ${cmdTimeoutS ?? Math.round(r.durationMs / 1000)}s – no prompt yet`
            break
        case 'reset':
            header = 'the terminal was reset or reconnected while waiting – the command may not have run'
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

export const ALL_TOOLS: AgentTool[] = [readTerminalTool, runCommandTool]

export function findTool (name: string): AgentTool | undefined {
    return ALL_TOOLS.find(t => t.spec.name === name)
}
