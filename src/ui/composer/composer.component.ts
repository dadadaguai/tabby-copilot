import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { Subscription } from 'rxjs'
import { ConfigService } from 'tabby-core'
import { AgentService, AgentState } from '../../core/agent.service'
import { CONFIG_KEY } from '../../types/config'
import { ApprovalMode } from '../../types/session'
import { CATALOG, findModel, findProvider } from '../../core/model-catalog'

@Component({
    selector: 'copilot-composer',
    templateUrl: './composer.component.html',
    styleUrls: ['./composer.component.scss'],
})
export class ComposerComponent implements OnInit, OnDestroy {
    @ViewChild('textarea') textarea?: ElementRef<HTMLTextAreaElement>
    draft = ''
    state!: AgentState
    providers = CATALOG
    private sub = new Subscription()

    constructor (
        public agent: AgentService,
        private config: ConfigService,
    ) {}

    ngOnInit (): void {
        this.sub.add(this.agent.state$.subscribe(s => { this.state = s }))
    }

    ngOnDestroy (): void {
        this.sub.unsubscribe()
    }

    get busy (): boolean {
        return this.state?.phase !== 'idle'
    }

    get canSend (): boolean {
        return !this.busy && this.draft.trim().length > 0 && this.agent.configured
    }

    get provider (): string {
        return this.agent.settings.provider || 'deepseek'
    }

    get providerModels () {
        return findProvider(this.provider)?.models ?? []
    }

    get providerName (): string {
        return findProvider(this.provider)?.name ?? this.provider
    }

    /** Whether the active provider has a key (or is a keyless localhost endpoint). */
    get providerConfigured (): boolean {
        const s = this.agent.settings
        const prov = findProvider(this.provider)
        const apiKey = s.providerApiKeys?.[this.provider]?.trim() || s.apiKey.trim()
        if (apiKey) {
            return true
        }
        const baseUrl = s.providerEndpoints?.[this.provider]?.trim() || s.endpoint.trim() || prov?.baseUrl || ''
        return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/i.test(baseUrl)
    }

    get model (): string {
        return this.agent.settings.model || ''
    }

    get currentModel () {
        return findModel(this.provider, this.model)
    }

    get reasoning (): boolean {
        return this.currentModel?.reasoning ?? false
    }

    get efforts (): string[] {
        return this.currentModel?.efforts ?? []
    }

    get reasoningEffort (): string {
        return this.agent.settings.reasoningEffort || ''
    }

    effortLabel (e: string): string {
        return ({ low: '低', medium: '中', high: '高', xhigh: '更高', max: '最高' } as Record<string, string>)[e] ?? e
    }

    setProvider (value: string): void {
        const c = this.config.store[CONFIG_KEY] ??= {}
        c.provider = value
        c.model = findProvider(value)?.models[0]?.id ?? ''
        c.reasoningEffort = ''
        this.config.save()
    }

    setModel (value: string): void {
        if (!value) {
            return
        }
        this.config.store[CONFIG_KEY].model = value
        this.config.store[CONFIG_KEY].reasoningEffort = ''
        this.config.save()
    }

    setReasoningEffort (value: string): void {
        this.config.store[CONFIG_KEY] ??= {}
        this.config.store[CONFIG_KEY].reasoningEffort = value
        this.config.save()
    }

    get approvalMode (): string {
        return this.agent.session.approvalMode ?? ''
    }

    setApprovalMode (value: string): void {
        this.agent.setApprovalMode((value === '' ? '' : value) as ApprovalMode | '')
    }

    focus (): void {
        this.textarea?.nativeElement.focus()
    }

    fill (text: string): void {
        this.draft = text ?? ''
        this.onInput()
        this.focus()
    }

    send (): void {
        if (!this.canSend) {
            return
        }
        const text = this.draft
        this.draft = ''
        void this.agent.send(text)
    }

    stop (): void {
        this.agent.stop()
    }

    onKeydown (event: KeyboardEvent): void {
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && !event.isComposing) {
            event.preventDefault()
            if (this.busy) {
                return
            }
            this.send()
        }
    }

    onInput (): void {
        const ta = this.textarea?.nativeElement
        if (!ta) {
            return
        }
        ta.style.height = 'auto'
        ta.style.height = ta.scrollHeight ? `${Math.min(ta.scrollHeight, 180)}px` : ''
    }

    /** 终端式选择即复制：在输入框里拖动选中文本后松开即复制。 */
    onSelectCopy (): void {
        const ta = this.textarea?.nativeElement
        if (!ta) {
            return
        }
        const start = ta.selectionStart ?? 0
        const end = ta.selectionEnd ?? start
        if (end <= start) {
            return
        }
        const text = ta.value.substring(start, end)
        if (text && navigator.clipboard) {
            navigator.clipboard.writeText(text).catch(() => {})
        }
    }

    /** 终端式右键粘贴。 */
    onContextMenu (event: MouseEvent): void {
        event.preventDefault()
        void this.pasteAtCursor()
    }

    private async pasteAtCursor (): Promise<void> {
        let text: string
        try {
            text = await navigator.clipboard.readText()
        } catch {
            return
        }
        if (!text) {
            return
        }
        const ta = this.textarea?.nativeElement
        if (!ta) {
            return
        }
        const start = ta.selectionStart ?? this.draft.length
        const end = ta.selectionEnd ?? start
        const next = ta.value.slice(0, start) + text + ta.value.slice(end)
        this.draft = next
        ta.value = next
        const caret = start + text.length
        ta.setSelectionRange(caret, caret)
        this.onInput()
        ta.focus()
    }
}
