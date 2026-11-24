import { Component, OnInit } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { CONFIG_KEY, CopilotConfig, DEFAULT_CONFIG } from '../../types/config'
import { CATALOG, findProvider } from '../../core/model-catalog'

@Component({
    selector: 'tabby-copilot-settings',
    templateUrl: './settings.component.html',
    styleUrls: ['./settings.component.scss'],
})
export class CopilotSettingsComponent implements OnInit {
    providers = CATALOG
    selectedProvider = ''

    constructor (public config: ConfigService) {}

    ngOnInit (): void {
        this.config.store[CONFIG_KEY] ??= {}
        for (const [k, v] of Object.entries(DEFAULT_CONFIG)) {
            this.config.store[CONFIG_KEY][k] ??= v
        }
        this.config.store[CONFIG_KEY].providerApiKeys ??= {}
        this.config.store[CONFIG_KEY].providerEndpoints ??= {}
        this.selectedProvider = this.c.provider || 'deepseek'
    }

    get c (): CopilotConfig {
        return this.config.store[CONFIG_KEY]
    }

    get selectedBaseUrl (): string {
        return findProvider(this.selectedProvider)?.baseUrl ?? ''
    }

    get selectedProviderName (): string {
        return findProvider(this.selectedProvider)?.name ?? ''
    }

    get selectedHint (): string {
        return findProvider(this.selectedProvider)?.apiKeyHint ?? ''
    }

    setInt (key: keyof CopilotConfig, value: string): void {
        const n = Number.parseInt(value, 10)
        const fallback = (DEFAULT_CONFIG as any)[key]
        ;(this.c as any)[key] = Number.isFinite(n) ? n : fallback
        this.save()
    }

    save (): void {
        this.config.save()
    }
}
