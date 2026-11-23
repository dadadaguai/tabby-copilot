import { test } from 'node:test'
import assert from 'node:assert'
import { fitContextBudget } from '../src/core/prompt-builder'
import { ChatMessage } from '../src/core/llm/types'

test('fitContextBudget keeps small prompts unchanged', () => {
    const msgs: ChatMessage[] = [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
    ]
    assert.deepStrictEqual(fitContextBudget(msgs, 1000), msgs)
})

test('fitContextBudget elides old tool output first', () => {
    const big = 'x'.repeat(1000)
    const msgs: ChatMessage[] = [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'do it' },
        { role: 'assistant', content: null, toolCalls: [{ id: 'c1', name: 'run_command', arguments: '{}' }] },
        { role: 'tool', toolCallId: 'c1', name: 'run_command', content: big },
        { role: 'user', content: 'final question' },
    ]
    const out = fitContextBudget(msgs, 500)
    const toolMsg = out.find(m => m.role === 'tool')
    assert.ok(toolMsg && toolMsg.content.includes('elided'), 'tool output should be elided')
    assert.strictEqual(out[0].role, 'system')
    assert.ok(out.some(m => m.role === 'user' && m.content === 'final question'), 'last user message preserved')
})
