import { Session, SessionSummary, SESSION_SCHEMA_VERSION } from '../types/session'
import { newId, nowIso } from './util/ids'

export function createSession (): Session {
    const now = nowIso()
    return {
        version: SESSION_SCHEMA_VERSION,
        id: newId('s'),
        title: '新会话',
        createdAt: now,
        updatedAt: now,
        messages: [],
        fileWhitelist: [],
        stats: { turns: 0, toolCalls: 0, promptTokens: 0, completionTokens: 0 },
    }
}

export function isEmptySession (s: Session): boolean {
    return s.messages.length === 0
}

export function autoTitle (s: Session, max = 60): string {
    const first = s.messages.find(m => m.role === 'user')
    const line = first && first.content ? first.content.split('\n').map(l => l.trim()).find(l => l.length > 0) ?? '' : ''
    const cleaned = line.replace(/\s+/g, ' ')
    if (!cleaned) {
        return '新会话'
    }
    return cleaned.length <= max ? cleaned : cleaned.slice(0, max - 1).trimEnd() + '…'
}

export function summarizeSession (s: Session): SessionSummary {
    const last = [...s.messages].reverse().find(m => m.role === 'assistant')
    const preview = (last && last.content ? last.content : '').replace(/\s+/g, ' ').slice(0, 120)
    return {
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        messageCount: s.messages.length,
        preview,
    }
}
