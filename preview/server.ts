import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import * as path from 'node:path'
import { OpenAICompatibleProvider } from '../src/core/llm/openai-compatible'
import { ChatMessage } from '../src/core/llm/types'

const PORT = Number(process.env.PORT || 8787)

function readEnv (): Record<string, string> {
    const out: Record<string, string> = {}
    try {
        const text = readFileSync(path.resolve(process.cwd(), '.env'), 'utf8')
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

function json (res: ServerResponse, code: number, body: unknown): void {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
}

async function readBody (req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = []
    for await (const c of req) {
        chunks.push(c as Buffer)
    }
    return Buffer.concat(chunks).toString('utf8')
}

const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
    }

    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

    if (url.pathname === '/api/chat' && req.method === 'POST') {
        try {
            const body = JSON.parse((await readBody(req)) || '{}')
            const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : []
            if (!messages.length) {
                json(res, 400, { error: 'messages is required' })
                return
            }
            const provider = new OpenAICompatibleProvider({
                endpoint: body.endpoint || env.DEEPSEEK_ENDPOINT || 'https://api.deepseek.com',
                apiKey: body.apiKey || env.DEEPSEEK_API_KEY || '',
                model: body.model || env.DEEPSEEK_MODEL || 'deepseek-chat',
            })
            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            })
            try {
                for await (const evt of provider.stream(messages, [])) {
                    res.write(`data: ${JSON.stringify(evt)}\n\n`)
                }
                res.write('data: [DONE]\n\n')
            } catch (e) {
                res.write(`data: ${JSON.stringify({ type: 'error', message: (e as Error).message })}\n\n`)
            }
            res.end()
        } catch (e) {
            json(res, 400, { error: (e as Error).message })
        }
        return
    }

    const file = path.resolve(process.cwd(), 'preview', 'index.html')
    if (existsSync(file)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(readFileSync(file, 'utf8'))
    } else {
        json(res, 404, { error: 'preview/index.html not found' })
    }
})

server.listen(PORT, () => {
    console.log(`tabby-copilot 预览已启动: http://localhost:${PORT}`)
    console.log('API Key 优先用浏览器表单填写的，留空则回退到 .env。')
})
