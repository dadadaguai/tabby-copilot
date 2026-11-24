import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { Subscription } from 'rxjs'
import { ConfigService } from 'tabby-core'
import { AgentService, AgentState } from '../../core/agent.service'
import { CONFIG_KEY } from '../../types/config'
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
        const old = c.provider || 'deepseek'
        if (c.apiKey) {
            c.providerApiKeys ??= {}
            c.providerApiKeys[old] = c.apiKey
        }
        c.provider = value
        c.providerApiKeys ??= {}
        c.apiKey = c.providerApiKeys[value] ?? ''
        c.endpoint = ''
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
}
