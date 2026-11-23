import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core'
import { Subscription } from 'rxjs'
import { AgentService } from '../../core/agent.service'
import { SessionSummary } from '../../types/session'

@Component({
    selector: 'copilot-session-list',
    templateUrl: './session-list.component.html',
    styleUrls: ['./session-list.component.scss'],
})
export class SessionListComponent implements OnInit, OnDestroy {
    @Input() currentId = ''
    @Output() open = new EventEmitter<string>()
    @Output() create = new EventEmitter<void>()
    @Output() close = new EventEmitter<void>()

    sessions: SessionSummary[] = []
    private sub = new Subscription()

    constructor (public agent: AgentService) {}

    ngOnInit (): void {
        this.sub.add(this.agent.store.summaries$.subscribe(list => { this.sessions = list }))
    }

    ngOnDestroy (): void {
        this.sub.unsubscribe()
    }

    async remove (id: string): Promise<void> {
        if (!confirm('删除这个会话？不可撤销。')) {
            return
        }
        await this.agent.deleteSession(id)
    }
}
