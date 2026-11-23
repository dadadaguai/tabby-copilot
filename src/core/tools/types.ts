import { BufferCapture, TerminalEntry } from '../terminal-registry.service'
import { TerminalRunner } from '../terminal-runner'
import { RiskLevel, RunExitState } from '../../types/session'

export interface ApprovalRequirement {
    level: RiskLevel
    hardBlock: boolean
    reason?: string
}

/** Everything a tool may touch – the tools never reach into Tabby directly. */
export interface ToolContext {
    signal: AbortSignal
    toolCallId: string
    runner: TerminalRunner
    defaultTimeoutSeconds: number
    getTerminal (): TerminalEntry
    readLast (entry: TerminalEntry, n: number): BufferCapture
    isAlternateScreen (entry: TerminalEntry): boolean
    progress (text: string): void
    setExitState (state: RunExitState): void
}

export interface AgentTool {
    spec: { name: string, description: string, parameters: Record<string, any> }
    approval (args: any): ApprovalRequirement | null
    execute (args: any, ctx: ToolContext): Promise<string>
}
