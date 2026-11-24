import { Inject, Injectable, NgZone } from '@angular/core'
import { BehaviorSubject, Observable } from 'rxjs'
import { CONFIG_ACCESSOR } from './config-token'
import { CopilotConfig } from '../types/config'
import { ApprovalMode, AssistantMessage, RunExitState, Session, TerminalDescriptor, ToolCallRecord, UserMessage } from '../types/session'
import { ChatMessage, ChatProvider, ToolSpec } from './llm/types'
import { OpenAICompatibleProvider } from './llm/openai-compatible'
import { AnthropicProvider } from './llm/anthropic'
import { findProvider } from './model-catalog'
import { TerminalRunner } from './terminal-runner'
import { matchScore } from './terminal-descriptor'
import { TerminalEntry, TerminalRegistryService } from './terminal-registry.service'
import { FileService } from './file.service'
import { SessionStoreService } from './session-store.service'
import { autoTitle, createSession, isEmptySession } from './session-utils'
import { ALL_TOOLS, findTool } from './tools'
import { ToolContext } from './tools/types'
import { isAutoApproved } from './util/risk'
import { isAbortError } from './util/sse'
import { newId, nowIso } from './util/ids'
import { buildMessages } from './prompt-builder'
import systemPromptTemplate from '../prompts/system.md'

export type AgentPhase = 'idle' | 'thinking' | 'tool' | 'awaiting_approval' | 'awaiting_user'

export interface AgentState {
    session: Session
    phase: AgentPhase
    error: string | null
    rev: number
}

const MAX_TOOL_ROUNDS = 80

@Injectable()
export class AgentService {
    session: Session
    phase: AgentPhase = 'idle'
    error: string | null = null

    private state = new BehaviorSubject<AgentState>({ session: createSession(), phase: 'idle', error: null, rev: 0 })
    private rev = 0
    private abortController: AbortController | null = null
    private turnPromise: Promise<void> | null = null
    private pendingApprovals = new Map<string, (approved: boolean) => void>()
    private pendingQuestion: { toolCallId: string, resolve: (answer: string) => void } | null = null
    private runner: TerminalRunner
    private boundTerminalId: string | null = null
    private sessions = new Map<string, Session>()
    private pendingBindId: string | null = null
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
        private fileService: FileService,
        public store: SessionStoreService,
    ) {
        this.session = this.state.value.session
        this.runner = new TerminalRunner(registry)
        this.registry.activeId$.subscribe(id => this.zone.run(() => this.onActiveTerminal(id)))
    }

    get settings (): CopilotConfig {
        return this.getConfig()
    }

    get configured (): boolean {
        const prov = findProvider(this.settings.provider)
        const baseUrl = this.settings.endpoint.trim() || prov?.baseUrl || ''
        if (!baseUrl) {
            return false
        }
        if (this.settings.apiKey.trim()) {
            return true
        }
        // Keyless local endpoints (e.g. Ollama) are allowed without an API key.
        return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(baseUrl)
    }

    get approvalMode (): ApprovalMode {
        return this.session.approvalMode ?? this.settings.approvalMode
    }

    setApprovalMode (mode: ApprovalMode | ''): void {
        if (mode === '') {
            delete this.session.approvalMode
        } else {
            this.session.approvalMode = mode
        }
        this.touch()
    }

    // -------------------------------------------------------------- sessions

    async newSession (): Promise<Session> {
        await this.stopAndWait()
        this.saveCurrentSessionIfNeeded()
        const s = createSession()
        const id = this.boundTerminalId ?? this.registry.getActive()?.id ?? null
        if (id) {
            const t = this.registry.byId(id)
            if (t) {
                s.terminal = this.registry.describe(t)
            }
            this.sessions.set(id, s)
        }
        this.session = s
        this.error = null
        this.emit()
        return this.session
    }

    async openSession (id: string): Promise<boolean> {
        if (id === this.session.id) {
            return true
        }
        const loaded = this.store.load(id)
        if (!loaded) {
            return false
        }
        await this.stopAndWait()
        this.saveCurrentSessionIfNeeded()
        const boundId = this.boundTerminalId ?? this.registry.getActive()?.id ?? null
        if (boundId) {
            this.sessions.set(boundId, loaded)
        }
        this.session = loaded
        this.error = null
        this.boundTerminalId = this.matchTerminal(loaded.terminal) ?? boundId
        const active = this.registry.getActive()
        if (active) {
            loaded.terminal = this.registry.describe(active)
        }
        this.emit()
        return true
    }

    renameSession (title: string): void {
        const t = title.trim()
        if (!t) {
            return
        }
        this.session.title = t
        this.session.titleIsCustom = true
        this.touch()
    }

    async deleteSession (id: string): Promise<void> {
        if (id === this.session.id) {
            await this.newSession()
        }
        for (const [tid, s] of this.sessions) {
            if (s.id === id) {
                this.sessions.delete(tid)
            }
        }
        this.store.delete(id)
    }

    listSessions () {
        return this.store.list()
    }

    // -------------------------------------------------- per-terminal binding

    private onActiveTerminal (id: string | null): void {
        if (this.busy) {
            this.pendingBindId = id
            return
        }
        this.bindTerminalById(id)
    }

    private bindTerminalById (id: string | null): void {
        if (id === this.boundTerminalId) {
            return
        }
        this.saveCurrentSessionIfNeeded()
        this.boundTerminalId = id
        if (!id) {
            this.session = createSession()
            this.error = null
            this.emit()
            return
        }
        let sess = this.sessions.get(id)
        if (!sess) {
            sess = this.findSessionForTerminal(id)
            this.sessions.set(id, sess)
        }
        this.session = sess
        this.error = null
        this.emit()
    }

    private findSessionForTerminal (id: string): Session {
        const entry = this.registry.byId(id)
        if (entry) {
            const desc = this.registry.describe(entry)
            const inUse = new Set(this.sessions.values())
            let best: Session | null = null
            let bestScore = 0
            for (const s of this.store.scanSessions()) {
                if (inUse.has(s)) {
                    continue
                }
                const score = matchScore(s.terminal ?? { kind: 'other' }, desc)
                if (score >= 3 && score > bestScore) {
                    best = s
                    bestScore = score
                }
            }
            if (best) {
                return best
            }
            const fresh = createSession()
            fresh.terminal = desc
            return fresh
        }
        return createSession()
    }

    private saveCurrentSessionIfNeeded (): void {
        if (this.session && !isEmptySession(this.session)) {
            this.store.save(this.session)
        }
    }

    // --------------------------------------------------- send / stop / gates

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
        const active = this.registry.getActive()
        this.bindTerminalById(active?.id ?? null)
        const user: UserMessage = { id: newId('m'), role: 'user', content, createdAt: nowIso() }
        this.session.messages.push(user)
        this.session.stats.turns++
        if (this.settings.autoTitle && !this.session.titleIsCustom && this.session.title === '新会话') {
            this.session.title = autoTitle(this.session)
        }
        this.error = null
        if (active) {
            this.session.terminal = this.registry.describe(active)
        }
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

    async stopAndWait (): Promise<void> {
        if (!this.busy) {
            return
        }
        this.stop()
        try {
            await this.turnPromise
        } catch {
            // the turn handles its own errors
        }
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

    approveFirstPending (): void {
        const first = this.pendingApprovals.keys().next()
        if (!first.done) {
            this.approve(first.value)
        }
    }

    denyFirstPending (): void {
        const first = this.pendingApprovals.keys().next()
        if (!first.done) {
            this.deny(first.value)
        }
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
        const prov = findProvider(s.provider)
        const baseUrl = s.endpoint.trim() || prov?.baseUrl || 'https://api.deepseek.com'
        const api = prov?.api ?? 'openai-completions'
        let extra: Record<string, any> = {}
        if (s.extraParamsText.trim()) {
            try {
                extra = JSON.parse(s.extraParamsText)
            } catch {
                // invalid JSON is ignored
            }
        }
        if (s.reasoningEffort) {
            extra.reasoning_effort = s.reasoningEffort
        }
        if (api === 'anthropic-messages') {
            return new AnthropicProvider({ endpoint: baseUrl, apiKey: s.apiKey, model: s.model, extraParams: extra })
        }
        return new OpenAICompatibleProvider({ endpoint: baseUrl, apiKey: s.apiKey, model: s.model, extraParams: extra })
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
                this.session.messages.push(assistant)
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
            if (assistant && !assistant.content && !assistant.toolCalls.length && !assistant.error && !assistant.interrupted) {
                const i = this.session.messages.indexOf(assistant)
                if (i >= 0) {
                    this.session.messages.splice(i, 1)
                }
            }
            this.abortController = null
            this.pendingQuestion = null
            this.setPhase('idle')
            this.touch()
            if (this.pendingBindId !== null) {
                const next = this.pendingBindId
                this.pendingBindId = null
                this.bindTerminalById(next)
            }
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
                    assistant.usage = { prompt: evt.prompt, completion: evt.completion }
                    this.session.stats.promptTokens += evt.prompt
                    this.session.stats.completionTokens += evt.completion
                    break
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
        this.session.stats.toolCalls += records.length
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

    private currentTerminal (): TerminalEntry | null {
        if (this.boundTerminalId) {
            const bound = this.registry.byId(this.boundTerminalId)
            if (bound) {
                return bound
            }
        }
        return this.registry.getActive()
    }

    /** Re-attach a session's stored terminal descriptor to an open tab. */
    private matchTerminal (desc?: TerminalDescriptor): string | null {
        if (!desc) {
            return null
        }
        let best: { id: string, score: number } | null = null
        for (const entry of this.registry.list()) {
            const score = matchScore(desc, this.registry.describe(entry))
            if (score >= 3 && (!best || score > best.score)) {
                best = { id: entry.id, score }
            }
        }
        return best?.id ?? null
    }

    private makeToolContext (record: ToolCallRecord, signal: AbortSignal): ToolContext {
        return {
            signal,
            toolCallId: record.id,
            runner: this.runner,
            defaultTimeoutSeconds: this.settings.defaultCommandTimeout,
            getTerminal: () => {
                const t = this.currentTerminal()
                if (!t) {
                    throw new Error('No active terminal. Open a terminal tab first.')
                }
                return t
            },
            readLast: (entry, n) => this.registry.captureLast(entry, n),
            mark: entry => this.registry.mark(entry),
            isAlternateScreen: entry => this.registry.isAlternateScreen(entry),
            focus: entry => this.registry.focus(entry),
            focusOnRun: this.settings.focusTerminalOnRun,
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
            isPathAllowed: path => {
                return this.fileService.isAllowedList(this.session.fileWhitelist ?? [], path)
            },
            grantPath: path => {
                const canonical = this.fileService.canonical(path)
                this.session.fileWhitelist ??= []
                if (!this.session.fileWhitelist.includes(canonical)) {
                    this.session.fileWhitelist.push(canonical)
                }
                const t = this.currentTerminal()
                if (t) {
                    this.fileService.grant(t, path)
                }
            },
            readFile: (path, lines, offset) => {
                const t = this.currentTerminal()
                if (!t) {
                    throw new Error('No active terminal. Open a terminal tab first.')
                }
                return this.fileService.readFile(t, path, lines, offset)
            },
            listDir: path => {
                const t = this.currentTerminal()
                if (!t) {
                    throw new Error('No active terminal. Open a terminal tab first.')
                }
                return this.fileService.listDir(t, path)
            },
            requestApproval: message => {
                record.status = 'pending_approval'
                record.progress = message
                this.setPhase('awaiting_approval')
                this.touch()
                return new Promise<boolean>(resolve => {
                    this.pendingApprovals.set(record.id, approved => {
                        this.pendingApprovals.delete(record.id)
                        record.progress = undefined
                        record.status = 'running'
                        this.setPhase('tool')
                        resolve(approved)
                    })
                    signal.addEventListener('abort', () => {
                        this.pendingApprovals.delete(record.id)
                        resolve(false)
                    }, { once: true })
                })
            },
        }
    }

    // ------------------------------------------------------- prompt building

    private buildMessages (): ChatMessage[] {
        return buildMessages(this.session.messages, {
            systemPrompt: systemPromptTemplate,
            additionalSystemPrompt: this.settings.additionalSystemPrompt,
            maxToolResultChars: this.settings.maxToolResultChars,
            maxContextChars: this.settings.maxContextChars,
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
        this.session.updatedAt = nowIso()
        this.store.save(this.session)
        this.emit()
    }

    private emit (): void {
        if (this.emitTimer) {
            clearTimeout(this.emitTimer)
            this.emitTimer = null
        }
        this.rev++
        this.zone.run(() => this.state.next({ session: this.session, phase: this.phase, error: this.error, rev: this.rev }))
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
