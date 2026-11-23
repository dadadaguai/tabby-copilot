export type RiskLevel = 'low' | 'medium' | 'high'
export type ApprovalMode = 'ask' | 'auto_low' | 'auto_medium' | 'auto_all'
export type ToolCallStatus = 'pending_approval' | 'awaiting_user' | 'running' | 'done' | 'declined' | 'error' | 'cancelled'
export type RunExitState = 'prompt' | 'awaiting_input' | 'alt_screen' | 'idle' | 'timeout' | 'matched' | 'reset' | 'cancelled'

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
    /** Turn was interrupted by the user or an error. */
    interrupted?: boolean
    error?: string
}

export type SessionMessage = UserMessage | AssistantMessage
