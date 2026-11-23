import { ConfigProvider, Platform } from 'tabby-core'
import { CONFIG_KEY, DEFAULT_CONFIG, HOTKEY_IDS } from './types/config'

/** @hidden */
export class CopilotConfigProvider extends ConfigProvider {
    defaults = {
        [CONFIG_KEY]: { ...DEFAULT_CONFIG },
        hotkeys: {
            [HOTKEY_IDS.toggle]: ['Ctrl-Alt-A'],
            [HOTKEY_IDS.focusInput]: ['Ctrl-Alt-I'],
        },
    }

    platformDefaults = {
        [Platform.macOS]: {
            hotkeys: {
                [HOTKEY_IDS.toggle]: ['⌘-Shift-A'],
                [HOTKEY_IDS.focusInput]: ['⌘-Shift-I'],
            },
        },
    }
}
