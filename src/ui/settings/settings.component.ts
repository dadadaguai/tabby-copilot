import { Component, OnInit } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { CONFIG_KEY, CopilotConfig, DEFAULT_CONFIG } from '../../types/config'

@Component({
    selector: 'tabby-copilot-settings',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.scss'],
})
export class CopilotSettingsComponent implements OnInit {
    constructor (public config: ConfigService) {}

    ngOnInit (): void {
        this.config.store[CONFIG_KEY] ??= {}
        for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
            this.config.store[CONFIG_KEY][k] ??= v
        }
    }

    get c (): CopilotConfig {
        return this.config.store[CONFIG_KEY]
    }

    save (): void {
        this.config.save()
    }
}
