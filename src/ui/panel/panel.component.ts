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
    status = ''
    lastLine = ''
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
        this.sub.add(this.registry.changed$.subscribe(() => this.refreshTerminal()))
        this.sub.add(this.agent.state$.subscribe(s => {
            this.error = s.error
        }))
        this.refreshTerminal()
    }

    ngOnDestroy (): void {
        this.sub.unsubscribe()
    }

    get side (): 'left' | 'right' {
        return this.host.currentSide
    }

    get statusLabel (): string {
        switch (this.status) {
            case 'idle': return '空闲'
            case 'active': return '输出中'
            case 'running': return 'Agent 执行中'
            case 'awaiting_input': return '等待输入'
            case 'alt_screen': return '全屏程序'
            case 'not_started': return '未启动'
            default: return this.status
        }
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

    private refreshTerminal (): void {
        this.active = this.registry.getActive()
        this.status = this.active ? this.registry.status(this.active) : ''
        this.lastLine = this.active ? this.registry.lastLine(this.active) : ''
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
