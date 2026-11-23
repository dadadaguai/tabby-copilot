import { InjectionToken } from '@angular/core'
import { CopilotConfig } from '../types/config'

/**
 * Accessor for the current Copilot config, decoupled from tabby-core's
 * ConfigService so the agent/UI work in both Tabby and the standalone preview.
 */
export const CONFIG_ACCESSOR = new InjectionToken<() => CopilotConfig>('CONFIG_ACCESSOR')
