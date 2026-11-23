import { Inject, Injectable, NgZone } from '@angular/core'
import { BehaviorSubject, Observable } from 'rxjs'
import { CONFIG_ACCESSOR } from './config-token'
import { CopilotConfig } from '../types/config'
import { AssistantMessage, SessionMessage, UserMessage } from '../types/session'
import { ChatMessage, ChatProvider } from './llm/types'
import { OpenAICompatibleProvider } from './llm/openai-compatible'
import { isAbortError } from './util/sse'
import { newId, nowIso } from './util/ids'

export type AgentPhase = 'idle' | 'thinking'

export interface AgentState {
    messages: SessionMessage[]
    phase: AgentPhase
    error: string | null
    rev: number
}

// v0.0.3 is chat-only (no tools yet); the Pi-style tool prompt arrives with
// the agent tools in v0.0.5.
const SYSTEM_PROMPT = [
    'You are a concise AI copilot embedded in the Tabby terminal.',
    'Answer in the user\'s language. Use Markdown, and put commands or code in fenced code blocks.',
].join('\n')

@Injectable({ providedIn: 'root' })
export class AgentService {
    messages: SessionMessage[] = []
    phase: AgentPhase = 'idle'
    error: string | null = null

    private state = new BehaviorSubject<AgentState>({ messages: [], phase: 'idle', error: null, rev: 0 })
    private rev = 0
    private abortController: AbortController | null = null
    private emitTimer: any = null

    get state$ (): Observable<AgentState> {
        return this.state.asObservable()
    }

    get busy (): boolean {
        return this.phase !== 'idle'
    }

    constructor (
        @Inject(CONFIG_ACCESSOR) private getConfig: () => CopilotConfig,
        private zone: NgZone,
    ) {}

    get settings (): CopilotConfig {
        return this.getConfig()
    }

    get configured (): boolean {
        return !!this.settings.endpoint.trim()
    }

    async send (text: string): Promise<void> {
        const content = text.trim()
        if (!content || this.busy) {
            return
        }
        if (!this.configured) {
            this.error = '先在 Settings → Copilot 配置模型端点与 API Key。'
            this.emit()
            return
        }
        const user: UserMessage = { id: newId('m'), role: 'user', content, createdAt: nowIso() }
        this.messages.push(user)
        this.error = null
        this.setPhase('thinking')
        const assistant: AssistantMessage = {
            id: newId('m'),
            role: 'assistant',
            content: '',
            reasoning: '',
            createdAt: nowIso(),
            model: this.settings.model || undefined,
        }
        this.messages.push(assistant)
        this.emit()

        this.abortController = new AbortController()
        const signal = this.abortController.signal
        try {
            const provider = this.makeProvider()
            const messages = this.buildMessages()
            for await (const evt of provider.stream(messages, [], signal)) {
                if (evt.type === 'text') {
                    assistant.content += evt.delta
                } else if (evt.type === 'reasoning') {
                    assistant.reasoning = (assistant.reasoning ?? '') + evt.delta
                }
                this.emitSoon()
            }
            assistant.content = assistant.content.trim()
            if (!assistant.reasoning) {
                delete assistant.reasoning
            }
        } catch (e) {
            if (isAbortError(e) || signal.aborted) {
                assistant.interrupted = true
            } else {
                const message = (e as Error).message ?? String(e)
                this.error = message
                assistant.error = message
            }
        } finally {
            this.abortController = null
            this.setPhase('idle')
            this.emit()
        }
    }

    stop (): void {
        this.abortController?.abort()
    }

    clearError (): void {
        this.error = null
        this.emit()
    }

    private makeProvider (): ChatProvider {
        const s = this.settings
        let extra: Record<string, any> = {}
        if (s.extraParamsText.trim()) {
            try {
                extra = JSON.parse(s.extraParamsText)
            } catch {
                // invalid JSON is ignored; the settings page flags it
            }
        }
        return new OpenAICompatibleProvider({ endpoint: s.endpoint, apiKey: s.apiKey, model: s.model, extraParams: extra })
    }

    private buildMessages (): ChatMessage[] {
        const out: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]
        for (const m of this.messages) {
            if (m.role === 'user') {
                out.push({ role: 'user', content: m.content })
            } else if (m.role === 'assistant') {
                out.push({ role: 'assistant', content: m.content || null })
            }
        }
        return out
    }

    private setPhase (phase: AgentPhase): void {
        if (this.phase !== phase) {
            this.phase = phase
            this.emit()
        }
    }

    private emit (): void {
        if (this.emitTimer) {
            clearTimeout(this.emitTimer)
            this.emitTimer = null
        }
        this.rev++
        this.zone.run(() => this.state.next({ messages: this.messages, phase: this.phase, error: this.error, rev: this.rev }))
    }

    /** Coalesce bursts (streaming tokens) into ~25 updates per second. */
    private emitSoon (): void {
        if (this.emitTimer) {
            return
        }
        this.emitTimer = setTimeout(() => {
            this.emitTimer = null
            this.emit()
        }, 40)
    }
}
