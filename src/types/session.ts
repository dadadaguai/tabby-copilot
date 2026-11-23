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
    createdAt: string
    model?: string
    /** Turn was interrupted by the user or an error. */
    interrupted?: boolean
    error?: string
}

export type SessionMessage = UserMessage | AssistantMessage
