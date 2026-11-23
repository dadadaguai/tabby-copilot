import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { Subscription } from 'rxjs'
import { AgentService, AgentState } from '../../core/agent.service'
import { ApprovalMode } from '../../types/session'

@Component({
    selector: 'copilot-composer',
    templateUrl: './composer.component.html',
    styleUrls: ['./composer.component.scss'],
})
export class ComposerComponent implements OnInit, OnDestroy {
    @ViewChild('textarea') textarea?: ElementRef<HTMLTextAreaElement>
    draft = ''
    state!: AgentState
    private sub = new Subscription()

    constructor (public agent: AgentService) {}

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

    get model (): string {
        return this.agent.settings.model || 'deepseek-chat'
    }

    get approvalMode (): string {
        return this.agent.session.approvalMode ?? ''
    }

    setApprovalMode (value: string): void {
        this.agent.setApprovalMode((value === '' ? '' : value) as ApprovalMode | '')
    }

    get tokens (): number {
        return (this.state?.session.stats.promptTokens ?? 0) + (this.state?.session.stats.completionTokens ?? 0)
    }

    focus (): void {
        this.textarea?.nativeElement.focus()
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
