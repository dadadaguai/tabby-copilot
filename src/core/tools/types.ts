import { BufferCapture, BufferPosition, TerminalEntry } from '../terminal-registry.service'
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
    mark (entry: TerminalEntry): BufferPosition
    isAlternateScreen (entry: TerminalEntry): boolean
    focus (entry: TerminalEntry): void
    /** Switch to the terminal the agent is acting on (config focusTerminalOnRun). */
    focusOnRun: boolean
    progress (text: string): void
    setExitState (state: RunExitState): void
    askUser (question: string, choices?: string[]): Promise<string>
    isPathAllowed (path: string): boolean
    grantPath (path: string): void
    readFile (path: string, lines?: number, offset?: number): Promise<string>
    listDir (path: string): Promise<string>
    requestApproval (message: string): Promise<boolean>
}

export interface AgentTool {
    spec: { name: string, description: string, parameters: Record<string, any> }
    approval (args: any): ApprovalRequirement | null
    execute (args: any, ctx: ToolContext): Promise<string>
}
