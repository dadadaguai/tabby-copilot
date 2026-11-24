import { ChatMessage, ChatProvider, ChatStreamEvent, ToolSpec } from './types'
import { HttpError, parseSSE, readAll, streamRequest } from '../util/sse'

/**
 * Anthropic Messages API client.
 *
 * Anthropic's wire format differs from OpenAI:
 *  - endpoint  POST /v1/messages, headers `x-api-key` + `anthropic-version`
 *  - messages use content blocks (text / tool_use / tool_result)
 *  - streaming emits `message_start` / `content_block_*` / `message_delta` / `message_stop`
 *  - reasoning arrives as `thinking_delta`
 */
export class AnthropicProvider implements ChatProvider {
    constructor (private config: { endpoint: string, apiKey: string, model: string, extraParams?: Record<string, any> }) {}

    async* stream (messages: ChatMessage[], tools: ToolSpec[], signal?: AbortSignal): AsyncGenerator<ChatStreamEvent> {
        const base = this.config.endpoint.replace(/\/+$/, '')
        const url = `${base}/v1/messages`
        const { system, messages: anthropicMessages } = toAnthropicMessages(messages)
        const extra = { ...(this.config.extraParams ?? {}) }
        const effort = extra.reasoning_effort
        if (effort) {
            const budget = { low: 2048, medium: 8192, high: 16384, max: 32768 }[effort] ?? 8192
            extra.thinking = { type: 'enabled', budget_tokens: budget }
        }
        delete extra.reasoning_effort
        const maxTokens = extra.max_tokens ?? 8192
        const body: any = {
            model: this.config.model,
            max_tokens: maxTokens,
            messages: anthropicMessages,
            stream: true,
            ...extra,
        }
        if (system) {
            body.system = system
        }
        if (tools.length) {
            body.tools = toAnthropicTools(tools)
        }
        delete body.max_tokens_override

        const res = await streamRequest(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': this.config.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
            signal,
        })
        if (res.status < 200 || res.status >= 300) {
            const text = await readAll(res.chunks)
            throw new HttpError(res.status, extractAnthropicError(text), url)
        }

        // content block index -> tool call index
        const blockToTool = new Map<number, number>()
        let toolCount = 0
        let sawDone = false

        for await (const evt of parseSSE(res.chunks)) {
            if (evt.data === '[DONE]') {
                break
            }
            let parsed: any
            try {
                parsed = JSON.parse(evt.data)
            } catch {
                continue
            }
            if (parsed?.error) {
                throw new Error(typeof parsed.error === 'string' ? parsed.error : (parsed.error.message ?? JSON.stringify(parsed.error)))
            }
            switch (evt.event ?? parsed.type) {
                case 'message_start': {
                    const usage = parsed.message?.usage
                    if (usage?.input_tokens != null) {
                        yield { type: 'usage', prompt: usage.input_tokens, completion: 0 }
                    }
                    break
                }
                case 'content_block_start': {
                    const block = parsed.content_block
                    const idx = parsed.index
                    if (block?.type === 'tool_use') {
                        const toolIndex = toolCount++
                        blockToTool.set(idx, toolIndex)
                        yield { type: 'tool_call', index: toolIndex, id: block.id, name: block.name }
                    }
                    break
                }
                case 'content_block_delta': {
                    const delta = parsed.delta
                    const idx = parsed.index
                    if (delta?.type === 'text_delta' && delta.text) {
                        yield { type: 'text', delta: delta.text }
                    } else if (delta?.type === 'thinking_delta' && delta.thinking) {
                        yield { type: 'reasoning', delta: delta.thinking }
                    } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
                        const toolIndex = blockToTool.get(idx) ?? 0
                        yield { type: 'tool_call', index: toolIndex, argumentsDelta: delta.partial_json }
                    }
                    break
                }
                case 'message_delta': {
                    const usage = parsed.usage
                    if (usage?.output_tokens != null) {
                        yield { type: 'usage', prompt: 0, completion: usage.output_tokens }
                    }
                    if (parsed.delta?.stop_reason) {
                        sawDone = true
                        yield { type: 'done', finishReason: parsed.delta.stop_reason }
                    }
                    break
                }
                case 'message_stop':
                    if (!sawDone) {
                        sawDone = true
                        yield { type: 'done', finishReason: 'end_turn' }
                    }
                    break
            }
        }
        if (!sawDone) {
            yield { type: 'done', finishReason: null }
        }
    }
}

function toAnthropicMessages (messages: ChatMessage[]): { system: string, messages: any[] } {
    let system = ''
    const out: any[] = []
    for (const m of messages) {
        if (m.role === 'system') {
            system += (system ? '\n\n' : '') + m.content
        } else if (m.role === 'user') {
            // merge with the previous user message if it was a tool-result message
            const last = out[out.length - 1]
            if (last?.role === 'user' && last.__toolResults) {
                last.content.push({ type: 'text', text: m.content })
            } else {
                out.push({ role: 'user', content: [{ type: 'text', text: m.content }] })
            }
        } else if (m.role === 'assistant') {
            const content: any[] = []
            if (m.content) {
                content.push({ type: 'text', text: m.content })
            }
            for (const tc of m.toolCalls ?? []) {
                let input: any = {}
                try {
                    input = JSON.parse(tc.arguments || '{}')
                } catch {
                    input = {}
                }
                content.push({ type: 'tool_use', id: tc.id, name: tc.name, input })
            }
            out.push({ role: 'assistant', content })
        } else if (m.role === 'tool') {
            const last = out[out.length - 1]
            if (last?.role === 'user' && last.__toolResults) {
                last.content.push({ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content })
            } else {
                const msg = { role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }], __toolResults: true }
                out.push(msg)
            }
        }
    }
    // drop the internal marker
    for (const m of out) {
        delete m.__toolResults
    }
    return { system, messages: out }
}

function toAnthropicTools (tools: ToolSpec[]): any[] {
    return tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
    }))
}

function extractAnthropicError (text: string): string {
    try {
        const parsed = JSON.parse(text)
        const msg = parsed?.error?.message ?? parsed?.message ?? parsed?.error
        if (msg) {
            return typeof msg === 'string' ? msg : JSON.stringify(msg)
        }
    } catch {
        // not JSON
    }
    return text
}
