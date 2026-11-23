export type RiskLevel = 'low' | 'medium' | 'high'
export type ApprovalMode = 'ask' | 'auto_low' | 'auto_medium' | 'auto_all'
export type ToolCallStatus = 'pending_approval' | 'awaiting_user' | 'running' | 'done' | 'declined' | 'error' | 'cancelled'
export type RunExitState = 'prompt' | 'awaiting_input' | 'alt_screen' | 'idle' | 'timeout' | 'matched' | 'reset' | 'cancelled'

export interface TokenUsage {
    prompt: number
    completion: number
}

export interface ToolCallRecord {
    id: string
    name: string
    args: Record<string, any>
    status: ToolCallStatus
    /** Full result as shown in the UI. */
    result?: string
    /** Human readable progress/status line while running. */
    progress?: string
    error?: string
    riskLevel?: RiskLevel
    exitState?: RunExitState
    startedAt?: string
    finishedAt?: string
    /** Free-text question / choices for ask_user. */
    question?: string
    choices?: string[]
    answer?: string
}

export interface UserMessage {
    id: string
    role: 'user'
    content: string
    createdAt: string
}

export interface AssistantMessage {
    id: string
    role: 'assistant'
    content: string
    reasoning?: string
    toolCalls: ToolCallRecord[]
    createdAt: string
    model?: string
    usage?: TokenUsage
    /** Turn was interrupted by the user or an error. */
    interrupted?: boolean
    error?: string
}

export type SessionMessage = UserMessage | AssistantMessage

export const SESSION_SCHEMA_VERSION = 1

export interface SessionStats {
    turns: number
    toolCalls: number
    promptTokens: number
    completionTokens: number
}

export interface Session {
    version: number
    id: string
    title: string
    titleIsCustom?: boolean
    createdAt: string
    updatedAt: string
    messages: SessionMessage[]
    approvalMode?: ApprovalMode
    stats: SessionStats
}

export interface SessionSummary {
    id: string
    title: string
    createdAt: string
    updatedAt: string
    messageCount: number
    preview: string
}
