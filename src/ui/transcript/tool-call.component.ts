import { Component, Input, OnDestroy, OnInit } from '@angular/core'
import { Subscription } from 'rxjs'
import { ToolCallRecord } from '../../types/session'
import { AgentPhase, AgentService } from '../../core/agent.service'

@Component({
    selector: 'copilot-tool-call',
    templateUrl: './tool-call.component.html',
    styleUrls: ['./tool-call.component.scss'],
})
export class ToolCallComponent implements OnInit, OnDestroy {
    @Input() call!: ToolCallRecord
    expanded = false
    answerText = ''
    phase: AgentPhase = 'idle'
    private sub = new Subscription()

    constructor (public agent: AgentService) {}

    ngOnInit (): void {
        this.sub.add(this.agent.state$.subscribe(s => { this.phase = s.phase }))
    }

    ngOnDestroy (): void {
        this.sub.unsubscribe()
    }

    get title (): string {
        switch (this.call.name) {
            case 'run_command': return '运行命令'
            case 'read_terminal': return '读取终端'
            case 'send_keys': return '发送按键'
            case 'wait_for_output': return '等待输出'
            case 'ask_user': return '向你提问'
            case 'focus_terminal': return '聚焦终端'
            case 'read_file': return '读取文件'
            case 'list_dir': return '列出目录'
            default: return this.call.name
        }
    }

    get command (): string {
        return this.call.args?.command ?? ''
    }

    get explanation (): string {
        return this.call.args?.explanation ?? ''
    }

    get riskLabel (): string {
        switch (this.call.riskLevel) {
            case 'high': return '高风险'
            case 'medium': return '中风险'
            case 'low': return '低风险'
            default: return ''
        }
    }

    get statusLabel (): string {
        switch (this.call.status) {
            case 'pending_approval': return '待批准'
            case 'awaiting_user': return '等你回答'
            case 'running': return '执行中'
            case 'done': return '完成'
            case 'declined': return '已拒绝'
            case 'error': return '出错'
            case 'cancelled': return '已取消'
            default: return this.call.status
        }
    }

    get outputText (): string {
        if (this.call.status === 'running') {
            return this.call.progress ?? ''
        }
        return this.call.result ?? ''
    }

    get bodyVisible (): boolean {
        return this.expanded || this.call.status === 'pending_approval' || this.call.status === 'running' || this.call.status === 'awaiting_user'
    }

    get question (): string {
        return this.call.question ?? ''
    }

    get choices (): string[] {
        return this.call.choices ?? []
    }

    approve (): void {
        this.agent.approve(this.call.id)
    }

    deny (): void {
        this.agent.deny(this.call.id)
    }

    pickChoice (choice: string): void {
        this.agent.answer(this.call.id, choice)
    }

    submitAnswer (): void {
        const text = this.answerText.trim()
        if (!text) {
            return
        }
        this.answerText = ''
        this.agent.answer(this.call.id, text)
    }
}
