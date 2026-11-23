import { Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { CopilotSettingsComponent } from './ui/settings/settings.component'

/** @hidden */
@Injectable()
export class CopilotSettingsTabProvider extends SettingsTabProvider {
    id = 'tabby-copilot'
    icon = 'robot'
    title = 'Copilot'

    getComponentType (): any {
        return CopilotSettingsComponent
    }
}
