import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import TabbyCoreModule, { CommandProvider, ConfigProvider, ConfigService, HotkeyProvider } from 'tabby-core'
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
import { AgentService } from './core/agent.service'
import { FileService } from './core/file.service'
import { SessionStoreService } from './core/session-store.service'
import { ModelCatalogService } from './core/model-catalog.service'
import { CONFIG_ACCESSOR } from './core/config-token'
import { CONFIG_KEY, DEFAULT_CONFIG } from './types/config'

import { CopilotPanelComponent } from './ui/panel/panel.component'
import { CopilotSettingsComponent } from './ui/settings/settings.component'
import { TranscriptComponent } from './ui/transcript/transcript.component'
import { ToolCallComponent } from './ui/transcript/tool-call.component'
import { ComposerComponent } from './ui/composer/composer.component'
import { SessionListComponent } from './ui/sessions/session-list.component'
import { CopilotMarkdownPipe } from './ui/pipes/markdown.pipe'

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
        // Register these explicitly in the module injector: Tabby loads each
        // plugin in its own module scope, so `providedIn: 'root'` services
        // cannot see the module-provided CONFIG_ACCESSOR token.
        AgentService,
        FileService,
        SessionStoreService,
        TerminalRegistryService,
        PanelHostService,
        ModelCatalogService,
        {
            provide: CONFIG_ACCESSOR,
            useFactory: (config: ConfigService) => () => ({ ...DEFAULT_CONFIG, ...(config.store?.[CONFIG_KEY] ?? {}) }),
            deps: [ConfigService],
        },
    ],
    declarations: [
        CopilotPanelComponent,
        CopilotSettingsComponent,
        TranscriptComponent,
        ToolCallComponent,
        ComposerComponent,
        SessionListComponent,
        CopilotMarkdownPipe,
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
