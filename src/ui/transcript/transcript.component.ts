import { Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild } from '@angular/core'
import { Subscription } from 'rxjs'
import { AgentService, AgentState } from '../../core/agent.service'
import { TerminalRegistryService } from '../../core/terminal-registry.service'
import { AssistantMessage, SessionMessage } from '../../types/session'

@Component({
    selector: 'copilot-transcript',
    templateUrl: './transcript.component.html',
    styleUrls: ['./transcript.component.scss'],
})
export class TranscriptComponent implements OnInit, OnDestroy {
    @ViewChild('scroller') scroller?: ElementRef<HTMLElement>
    state!: AgentState
    messages: SessionMessage[] = []
    expandedReasoning = new Set<string>()
    @Output() fill = new EventEmitter<string>()
    /** Scrolled up, away from the newest content. */
    detached = false
    private sub = new Subscription()

    constructor (public agent: AgentService, private registry: TerminalRegistryService) {}

    ngOnInit (): void {
        this.sub.add(this.agent.state$.subscribe(s => {
            this.state = s
            this.messages = s.session.messages
            this.scrollToBottomIfAttached()
        }))
    }

    get showReasoning (): boolean {
        return this.agent.settings.showReasoning !== false
    }

    ngOnDestroy (): void {
        this.sub.unsubscribe()
    }

    onScroll (): void {
        const el = this.scroller?.nativeElement
        if (!el) {
            return
        }
        this.detached = el.scrollTop + el.clientHeight < el.scrollHeight - 40
    }

    trackMessage (_i: number, m: SessionMessage): string {
        return m.id
    }

    isStreaming (m: SessionMessage): boolean {
        return m.role === 'assistant' && this.state?.phase === 'thinking' && m === this.messages[this.messages.length - 1]
    }

    reasoningExpanded (m: AssistantMessage): boolean {
        if (this.expandedReasoning.has(m.id)) {
            return true
        }
        // while the model is still thinking (no answer text yet) show what it is doing
        return this.isStreaming(m) && !m.content
    }

    toggleReasoning (m: AssistantMessage): void {
        if (this.expandedReasoning.has(m.id)) {
            this.expandedReasoning.delete(m.id)
        } else {
            this.expandedReasoning.add(m.id)
        }
    }

    /** Copy buttons inside rendered markdown code blocks. */
    onClick (event: MouseEvent): void {
        const target = event.target as HTMLElement | null
        const button = target?.closest('[data-action]') as HTMLElement | null
        if (!button) {
            return
        }
        const block = button.closest('.code-block')
        const code = block?.querySelector('pre code')?.textContent ?? ''
        event.preventDefault()
        event.stopPropagation()
        if (button.dataset.action === 'copy') {
            void this.copyCode(code)
            const original = button.textContent
            button.textContent = 'Copied'
            setTimeout(() => { button.textContent = original }, 1200)
        } else if (button.dataset.action === 'fill') {
            this.fill.emit(code)
        } else if (button.dataset.action === 'run') {
            const target = this.registry.getActive()
            if (target) {
                this.registry.sendInput(target, code)
                const original = button.textContent
                button.textContent = 'Sent'
                setTimeout(() => { button.textContent = original }, 1200)
            }
        }
    }

    private async copyCode (code: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(code)
        } catch {
            // clipboard unavailable (non-secure context) – ignore
        }
    }

    private scrollToBottomIfAttached (): void {
        if (this.detached) {
            return
        }
        requestAnimationFrame(() => {
            const el = this.scroller?.nativeElement
            if (el) {
                el.scrollTop = el.scrollHeight
            }
        })
    }
}
