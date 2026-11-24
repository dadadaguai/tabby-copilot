import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { Subscription } from 'rxjs'
import { ConfigService } from 'tabby-core'
import { AgentService, AgentState } from '../../core/agent.service'
import { ModelCatalogService } from '../../core/model-catalog.service'
import { CONFIG_KEY } from '../../types/config'

@Component({
    selector: 'copilot-composer',
    templateUrl: './composer.component.html',
    styleUrls: ['./composer.component.scss'],
})
export class ComposerComponent implements OnInit, OnDestroy {
    @ViewChild('textarea') textarea?: ElementRef<HTMLTextAreaElement>
    draft = ''
    state!: AgentState
    availableModels: string[] = ['deepseek-chat', 'deepseek-reasoner']
    private sub = new Subscription()

    constructor (
        public agent: AgentService,
        private config: ConfigService,
        private catalog: ModelCatalogService,
    ) {}

    ngOnInit (): void {
        this.sub.add(this.agent.state$.subscribe(s => { this.state = s }))
        void this.loadModels()
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

    get model (): string {
        return this.agent.settings.model || 'deepseek-chat'
    }

    get reasoningEffort (): string {
        return this.agent.settings.reasoningEffort || ''
    }

    /** Whether the current model looks like a reasoning/thinking model. */
    isReasoningModel (model: string): boolean {
        return /reason|think|o[0-9]|r1|flash/i.test(model || '')
    }

    setReasoningEffort (value: string): void {
        this.config.store[CONFIG_KEY] ??= {}
        this.config.store[CONFIG_KEY].reasoningEffort = value
        this.config.save()
    }

    async loadModels (): Promise<void> {
        let extra: string[] = []
        try {
            extra = await this.catalog.list()
        } catch {
            // catalog fetch is best-effort; keep the defaults
        }
        const merged = [...this.availableModels]
        for (const m of extra) {
            if (!merged.includes(m)) {
                merged.push(m)
            }
        }
        const current = this.agent.settings.model
        if (current && !merged.includes(current)) {
            merged.unshift(current)
        }
        this.availableModels = merged
    }

    setModel (value: string): void {
        if (!value) {
            return
        }
        this.config.store[CONFIG_KEY] ??= {}
        this.config.store[CONFIG_KEY].model = value
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
