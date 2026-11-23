import { SessionMessage } from '../types/session'
import { ChatMessage } from './llm/types'
import { truncateForModel } from './util/text'

export interface PromptOptions {
    systemPrompt: string
    maxToolResultChars: number
}

/**
 * Turn the stored transcript into provider-agnostic chat messages.
 * Tool calls that never finished get a synthetic result so the transcript
 * stays well-formed (every tool call must be answered).
 */
export function buildMessages (messages: SessionMessage[], options: PromptOptions): ChatMessage[] {
    const out: ChatMessage[] = [{ role: 'system', content: options.systemPrompt.trim() }]
    for (const m of messages) {
        if (m.role === 'user') {
            out.push({ role: 'user', content: m.content })
        } else if (m.role === 'assistant') {
            if (!m.content && !m.toolCalls.length) {
                continue
            }
            const toolCalls = m.toolCalls.map(tc => ({ id: tc.id, name: tc.name, arguments: JSON.stringify(tc.args ?? {}) }))
            out.push({ role: 'assistant', content: m.content || null, toolCalls: toolCalls.length ? toolCalls : undefined })
            for (const tc of m.toolCalls) {
                let content: string
                if (tc.status === 'cancelled') {
                    content = 'Cancelled by the user before it completed.'
                } else if (tc.status === 'pending_approval' || tc.status === 'running') {
                    content = 'Interrupted before completion.'
                } else {
                    content = tc.result ?? tc.error ?? '(no result)'
                }
                out.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: truncateForModel(content, options.maxToolResultChars).text })
            }
        }
    }
    return out
}
