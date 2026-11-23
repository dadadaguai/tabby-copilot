import { test } from 'node:test'
import assert from 'node:assert'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { OpenAICompatibleProvider } from '../src/core/llm/openai-compatible'
import { ChatMessage } from '../src/core/llm/types'

function readEnv (): Record<string, string> {
    const out: Record<string, string> = {}
    try {
        const text = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf8')
        for (const line of text.split('\n')) {
            const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
            if (m) {
                out[m[1]] = m[2].trim()
            }
        }
    } catch {
        // no .env present
    }
    return out
}

const env = readEnv()
const apiKey = env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || ''
const skip = apiKey ? false : 'no DEEPSEEK_API_KEY in .env or environment'

test('DeepSeek streams text + reasoning', { skip: skip as boolean | string }, async () => {
    const provider = new OpenAICompatibleProvider({
        endpoint: env.DEEPSEEK_ENDPOINT || 'https://api.deepseek.com',
        apiKey,
        model: env.DEEPSEEK_REASONER_MODEL || 'deepseek-reasoner',
    })
    const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful assistant. Answer in Chinese.' },
        { role: 'user', content: '用一句话解释什么是 SSH 隧道。' },
    ]
    let text = ''
    let reasoning = ''
    for await (const evt of provider.stream(messages, [])) {
        if (evt.type === 'text') {
            text += evt.delta
        } else if (evt.type === 'reasoning') {
            reasoning += evt.delta
        }
    }
    assert.ok(text.trim().length > 0, 'expected non-empty answer text')
    console.log('\n=== reasoning (deepseek-reasoner) ===')
    console.log(reasoning.slice(0, 300) + (reasoning.length > 300 ? '…' : ''))
    console.log('\n=== answer ===')
    console.log(text)
})
