import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import TabbyCoreModule, { CommandProvider, ConfigProvider, HotkeyProvider } from 'tabby-core'
import TabbyTerminalModule, { TerminalDecorator } from 'tabby-terminal'
import { SettingsTabProvider } from 'tabby-settings'

import './ui/styles.scss'

import { CopilotConfigProvider } from './config'
import { CopilotHotkeyProvider } from './hotkeys'
import { CopilotCommandProvider } from './commands'
import { CopilotSettingsTabProvider } from './settings-tab'
import { CopilotTerminalDecorator } from './decorator'
import { PanelHostService } from './ui/panel-host.service'
import { TerminalRegistryService } from './core/terminal-registry.service'

import { CopilotPanelComponent } from './ui/panel/panel.component'
import { CopilotSettingsComponent } from './ui/settings/settings.component'

/** @hidden */
@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        TabbyCoreModule,
        TabbyTerminalModule,
    ],
    providers: [
        { provide: ConfigProvider, useClass: CopilotConfigProvider, multi: true },
        { provide: HotkeyProvider, useClass: CopilotHotkeyProvider, multi: true },
        { provide: CommandProvider, useClass: CopilotCommandProvider, multi: true },
        { provide: SettingsTabProvider, useClass: CopilotSettingsTabProvider, multi: true },
        { provide: TerminalDecorator, useClass: CopilotTerminalDecorator, multi: true },
    ],
    declarations: [
        CopilotPanelComponent,
        CopilotSettingsComponent,
    ],
})
export default class CopilotModule {
    // Instantiating the host service here makes it subscribe to hotkeys and
    // restore the panel on startup even before the toolbar button is used.
    constructor (host: PanelHostService, registry: TerminalRegistryService) {
        host.registerPanelComponent(CopilotPanelComponent)
        // handy for debugging from the devtools console
        ;(window as any).tabbyCopilot = { host, registry }
    }
}
