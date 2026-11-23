import { Injectable } from '@angular/core'
import { HotkeyDescription, HotkeyProvider } from 'tabby-core'
import { HOTKEY_IDS } from './types/config'

/** @hidden */
@Injectable()
export class CopilotHotkeyProvider extends HotkeyProvider {
    async provide (): Promise<HotkeyDescription[]> {
        return [
            { id: HOTKEY_IDS.toggle, name: 'Copilot: toggle the panel' },
            { id: HOTKEY_IDS.approve, name: 'Copilot: approve pending action' },
            { id: HOTKEY_IDS.deny, name: 'Copilot: deny pending action' },
            { id: HOTKEY_IDS.stop, name: 'Copilot: stop the agent' },
            { id: HOTKEY_IDS.focusInput, name: 'Copilot: focus the prompt' },
            { id: HOTKEY_IDS.newSession, name: 'Copilot: new session' },
        ]
    }
}
