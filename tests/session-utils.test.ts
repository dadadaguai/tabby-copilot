import { test } from 'node:test'
import assert from 'node:assert'
import { autoTitle, createSession, isEmptySession, summarizeSession } from '../src/core/session-utils'

test('createSession returns an empty session', () => {
    const s = createSession()
    assert.ok(s.id.startsWith('s_'))
    assert.strictEqual(s.messages.length, 0)
    assert.ok(isEmptySession(s))
})

test('autoTitle derives from the first user message', () => {
    const s = createSession()
    s.messages.push({ id: 'm1', role: 'user', content: 'set up wireguard', createdAt: new Date().toISOString() })
    assert.strictEqual(autoTitle(s), 'set up wireguard')
})

test('summarizeSession picks the last assistant content as preview', () => {
    const s = createSession()
    s.messages.push({ id: 'm1', role: 'user', content: 'hi', createdAt: '' })
    s.messages.push({ id: 'm2', role: 'assistant', content: 'hello there', toolCalls: [], createdAt: '' })
    assert.strictEqual(summarizeSession(s).preview, 'hello there')
})
