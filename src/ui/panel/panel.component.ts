import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { Subscription } from 'rxjs'
import { AppService } from 'tabby-core'
import { SettingsTabComponent } from 'tabby-settings'
import { PanelHostService } from '../panel-host.service'
import { TerminalEntry, TerminalRegistryService } from '../../core/terminal-registry.service'
import { AgentService } from '../../core/agent.service'
import { ComposerComponent } from '../composer/composer.component'

@Component({
    selector: 'tabby-copilot-panel',
    templateUrl: './panel.component.html',
    styleUrls: ['./panel.component.scss'],
})
export class CopilotPanelComponent implements OnInit, OnDestroy {
    active: TerminalEntry | null = null
    error: string | null = null
    @ViewChild(ComposerComponent) composer?: ComposerComponent

    private sub = new Subscription()
    private dragging = false

    constructor (
        public host: PanelHostService,
        public registry: TerminalRegistryService,
        public agent: AgentService,
        private app: AppService,
    ) {}

    ngOnInit (): void {
        this.sub.add(this.registry.changed$.subscribe(() => {
            this.active = this.registry.getActive()
        }))
        this.sub.add(this.agent.state$.subscribe(s => {
            this.error = s.error
        }))
        this.active = this.registry.getActive()
    }

    ngOnDestroy (): void {
        this.sub.unsubscribe()
    }

    get side (): 'left' | 'right' {
        return this.host.currentSide
    }

    close (): void {
        this.host.hide()
    }

    openSettings (): void {
        this.app.openNewTabRaw({ type: SettingsTabComponent, inputs: { activeTab: 'tabby-copilot' } })
    }

    clearError (): void {
        this.agent.clearError()
    }

    focusComposer (): void {
        this.composer?.focus()
    }

    // ---- resize handle

    startResize (event: MouseEvent): void {
        event.preventDefault()
        this.dragging = true
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }

    @HostListener('document:mousemove', ['$event'])
    onMouseMove (event: MouseEvent): void {
        if (!this.dragging) {
            return
        }
        const width = this.side === 'right' ? window.innerWidth - event.clientX : event.clientX
        this.host.setWidth(width)
    }

    @HostListener('document:mouseup')
    onMouseUp (): void {
        if (!this.dragging) {
            return
        }
        this.dragging = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        this.host.commitWidth()
    }
}
