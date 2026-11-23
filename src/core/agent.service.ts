import { Inject, Injectable, NgZone } from '@angular/core'
import { BehaviorSubject, Observable } from 'rxjs'
import { CONFIG_ACCESSOR } from './config-token'
import { CopilotConfig } from '../types/config'
import { ApprovalMode, AssistantMessage, RunExitState, SessionMessage, ToolCallRecord, UserMessage } from '../types/session'
import { ChatMessage, ChatProvider, ToolSpec } from './llm/types'
import { OpenAICompatibleProvider } from './llm/openai-compatible'
import { TerminalRunner } from './terminal-runner'
import { TerminalEntry, TerminalRegistryService } from './terminal-registry.service'
import { ALL_TOOLS, findTool } from './tools'
import { ToolContext } from './tools/types'
import { isAutoApproved } from './util/risk'
import { isAbortError } from './util/sse'
import { newId, nowIso } from './util/ids'
import { buildMessages } from './prompt-builder'
import systemPromptTemplate from '../prompts/system.md'

export type AgentPhase = 'idle' | 'thinking' | 'tool' | 'awaiting_approval' | 'awaiting_user'

export interface AgentState {
    messages: SessionMessage[]
    phase: AgentPhase
    error: string | null
    rev: number
}

const MAX_TOOL_ROUNDS = 80

@Injectable({ providedIn: 'root' })
export class AgentService {
    messages: SessionMessage[] = []
    phase: AgentPhase = 'idle'
    error: string | null = null

    private state = new BehaviorSubject<AgentState>({ messages: [], phase: 'idle', error: null, rev: 0 })
    private rev = 0
    private abortController: AbortController | null = null
    private turnPromise: Promise<void> | null = null
    private pendingApprovals = new Map<string, (approved: boolean) => void>()
    private pendingQuestion: { toolCallId: string, resolve: (answer: string) => void } | null = null
    private runner: TerminalRunner
    private turnTerminal: TerminalEntry | null = null
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
        private registry: TerminalRegistryService,
    ) {
        this.runner = new TerminalRunner(registry)
    }

    get settings (): CopilotConfig {
        return this.getConfig()
    }

    get configured (): boolean {
        return !!this.settings.endpoint.trim()
    }

    get approvalMode (): ApprovalMode {
        return this.settings.approvalMode
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
        // bind the turn to the terminal that is active when the user sends
        this.turnTerminal = this.registry.getActive()
        this.touch()
        this.turnPromise = this.runTurn()
        try {
            await this.turnPromise
        } finally {
            this.turnPromise = null
        }
    }

    stop (): void {
        if (!this.busy) {
            return
        }
        for (const [id, resolve] of this.pendingApprovals) {
            resolve(false)
            this.pendingApprovals.delete(id)
        }
        this.abortController?.abort()
    }

    clearError (): void {
        this.error = null
        this.emit()
    }

    approve (toolCallId: string): void {
        const resolve = this.pendingApprovals.get(toolCallId)
        if (!resolve) {
            return
        }
        this.pendingApprovals.delete(toolCallId)
        resolve(true)
    }

    deny (toolCallId: string): void {
        const resolve = this.pendingApprovals.get(toolCallId)
        if (!resolve) {
            return
        }
        this.pendingApprovals.delete(toolCallId)
        resolve(false)
    }

    answer (toolCallId: string, text: string): void {
        if (!this.pendingQuestion || this.pendingQuestion.toolCallId !== toolCallId) {
            return
        }
        const q = this.pendingQuestion
        this.pendingQuestion = null
        q.resolve(text)
    }

    private makeProvider (): ChatProvider {
        const s = this.settings
        let extra: Record<string, any> = {}
        if (s.extraParamsText.trim()) {
            try {
                extra = JSON.parse(s.extraParamsText)
            } catch {
                // invalid JSON is ignored
            }
        }
        return new OpenAICompatibleProvider({ endpoint: s.endpoint, apiKey: s.apiKey, model: s.model, extraParams: extra })
    }

    // --------------------------------------------------------------- the loop

    private async runTurn (): Promise<void> {
        this.abortController = new AbortController()
        const signal = this.abortController.signal
        const provider = this.makeProvider()
        const toolSpecs: ToolSpec[] = ALL_TOOLS.map(t => t.spec)
        let assistant: AssistantMessage | null = null
        this.setPhase('thinking')
        try {
            let round = 0
            for (; round < MAX_TOOL_ROUNDS; round++) {
                assistant = {
                    id: newId('m'),
                    role: 'assistant',
                    content: '',
                    reasoning: '',
                    toolCalls: [],
                    createdAt: nowIso(),
                    model: this.settings.model || undefined,
                }
                this.messages.push(assistant)
                this.setPhase('thinking')
                const calls = await this.streamAssistant(provider, assistant, toolSpecs, signal)
                if (!assistant.reasoning) {
                    delete assistant.reasoning
                }
                this.touch()
                if (!calls.length) {
                    break
                }
                this.setPhase('tool')
                for (const record of calls) {
                    signal.throwIfAborted()
                    await this.executeToolCall(record, signal)
                    this.touch()
                }
            }
        } catch (e) {
            if (isAbortError(e) || signal.aborted) {
                if (assistant) {
                    assistant.interrupted = true
                    for (const tc of assistant.toolCalls) {
                        if (tc.status === 'pending_approval' || tc.status === 'running') {
                            tc.status = 'cancelled'
                            tc.finishedAt = nowIso()
                        }
                    }
                }
            } else {
                const message = (e as Error).message ?? String(e)
                this.error = message
                if (assistant) {
                    assistant.error = message
                }
                console.error('[tabby-copilot] turn failed', e)
            }
        } finally {
            // drop an assistant message that never produced anything
            if (assistant && !assistant.content && !assistant.toolCalls.length && !assistant.error && !assistant.interrupted) {
                const i = this.messages.indexOf(assistant)
                if (i >= 0) {
                    this.messages.splice(i, 1)
                }
            }
            this.abortController = null
            this.pendingQuestion = null
            this.turnTerminal = null
            this.setPhase('idle')
            this.touch()
        }
    }

    private async streamAssistant (provider: ChatProvider, assistant: AssistantMessage, tools: ToolSpec[], signal: AbortSignal): Promise<ToolCallRecord[]> {
        const messages = this.buildMessages()
        const acc = new Map<number, { id: string, name: string, args: string }>()
        for await (const evt of provider.stream(messages, tools, signal)) {
            switch (evt.type) {
                case 'text':
                    assistant.content += evt.delta
                    this.emitSoon()
                    break
                case 'reasoning':
                    assistant.reasoning = (assistant.reasoning ?? '') + evt.delta
                    this.emitSoon()
                    break
                case 'tool_call': {
                    let slot = acc.get(evt.index)
                    if (!slot) {
                        slot = { id: evt.id ?? '', name: evt.name ?? '', args: '' }
                        acc.set(evt.index, slot)
                    }
                    if (evt.id) {
                        slot.id = evt.id
                    }
                    if (evt.name) {
                        slot.name = slot.name ? slot.name : evt.name
                    }
                    if (evt.argumentsDelta) {
                        slot.args += evt.argumentsDelta
                    }
                    break
                }
                case 'usage':
                case 'done':
                    break
            }
        }
        assistant.content = assistant.content.trim()
        const records: ToolCallRecord[] = [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([, slot]) => {
            let args: Record<string, any> = {}
            let parseError: string | undefined
            try {
                args = slot.args.trim() ? JSON.parse(slot.args) : {}
            } catch (e) {
                parseError = `Could not parse tool arguments as JSON: ${(e as Error).message}. Raw: ${slot.args.slice(0, 400)}`
            }
            const record: ToolCallRecord = {
                id: slot.id || newId('call'),
                name: slot.name || 'unknown',
                args,
                status: 'pending_approval',
            }
            if (parseError) {
                record.status = 'error'
                record.error = parseError
            }
            return record
        })
        assistant.toolCalls = records
        return records
    }

    private async executeToolCall (record: ToolCallRecord, signal: AbortSignal): Promise<void> {
        if (record.status === 'error') {
            record.result = record.error
            return
        }
        const tool = findTool(record.name)
        if (!tool) {
            record.status = 'error'
            record.error = `Unknown tool "${record.name}". Available: ${ALL_TOOLS.map(t => t.spec.name).join(', ')}.`
            record.result = record.error
            return
        }
        const requirement = tool.approval(record.args)
        if (requirement) {
            record.riskLevel = requirement.level
            const auto = isAutoApproved(requirement.level, this.approvalMode, requirement.hardBlock)
            if (!auto) {
                record.status = 'pending_approval'
                if (requirement.hardBlock) {
                    record.progress = `Flagged as destructive (${requirement.reason}) – always requires confirmation.`
                }
                this.setPhase('awaiting_approval')
                this.touch()
                const approved = await new Promise<boolean>(resolve => {
                    this.pendingApprovals.set(record.id, resolve)
                    signal.addEventListener('abort', () => resolve(false), { once: true })
                })
                if (signal.aborted) {
                    record.status = 'cancelled'
                    record.finishedAt = nowIso()
                    return
                }
                if (!approved) {
                    record.status = 'declined'
                    record.finishedAt = nowIso()
                    record.result = 'The user declined this action. Do not retry it as-is; explain what you would need or ask how they want to proceed.'
                    this.setPhase('tool')
                    return
                }
                this.setPhase('tool')
            }
        }
        record.status = 'running'
        record.startedAt = nowIso()
        record.progress = undefined
        this.touch()
        const ctx = this.makeToolContext(record, signal)
        try {
            const result = await tool.execute(record.args, ctx)
            record.result = result
            record.status = signal.aborted || record.exitState === 'cancelled' ? 'cancelled' : 'done'
        } catch (e) {
            if (isAbortError(e) || signal.aborted) {
                record.status = 'cancelled'
                record.finishedAt = nowIso()
                throw e
            }
            record.status = 'error'
            record.error = (e as Error).message ?? String(e)
            record.result = `Error: ${record.error}`
        } finally {
            record.finishedAt = nowIso()
            record.progress = undefined
            if (this.phase !== 'idle') {
                this.setPhase('tool')
            }
        }
    }

    private makeToolContext (record: ToolCallRecord, signal: AbortSignal): ToolContext {
        return {
            signal,
            toolCallId: record.id,
            runner: this.runner,
            defaultTimeoutSeconds: this.settings.defaultCommandTimeout,
            getTerminal: () => {
                const t = this.turnTerminal && !this.turnTerminal.closed ? this.turnTerminal : this.registry.getActive()
                if (!t) {
                    throw new Error('No active terminal. Open a terminal tab first.')
                }
                return t
            },
            readLast: (entry, n) => this.registry.captureLast(entry, n),
            mark: entry => this.registry.mark(entry),
            isAlternateScreen: entry => this.registry.isAlternateScreen(entry),
            focus: entry => this.registry.focus(entry),
            progress: text => {
                record.progress = text
                this.emitSoon()
            },
            setExitState: state => {
                record.exitState = state as RunExitState
            },
            askUser: (question, choices) => {
                record.question = question
                record.choices = choices
                record.status = 'awaiting_user'
                this.setPhase('awaiting_user')
                this.touch()
                return new Promise<string>((resolve, reject) => {
                    this.pendingQuestion = {
                        toolCallId: record.id,
                        resolve: answer => {
                            record.answer = answer
                            this.setPhase('tool')
                            resolve(answer)
                        },
                    }
                    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true })
                })
            },
        }
    }

    // ------------------------------------------------------- prompt building

    private buildMessages (): ChatMessage[] {
        return buildMessages(this.messages, {
            systemPrompt: systemPromptTemplate,
            maxToolResultChars: this.settings.maxToolResultChars,
        })
    }

    // ------------------------------------------------------------- plumbing

    private setPhase (phase: AgentPhase): void {
        if (this.phase !== phase) {
            this.phase = phase
            this.emit()
        }
    }

    private touch (): void {
        this.emit()
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
