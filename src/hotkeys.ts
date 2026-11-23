import { Injectable } from '@angular/core'
import { HotkeyDescription, HotkeyProvider } from 'tabby-core'
import { HOTKEY_IDS } from './types/config'

/** @hidden */
@Injectable()
export class CopilotHotkeyProvider extends HotkeyProvider {
    async provide (): Promise<HotkeyDescription[]> {
        return [
            { id: HOTKEY_IDS.toggle, name: 'Copilot: toggle the panel' },
            { id: HOTKEY_IDS.focusInput, name: 'Copilot: focus the prompt' },
        ]
    }
}
