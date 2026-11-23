import { ApprovalMode } from './session'

export type PanelSide = 'left' | 'right'

export interface CopilotConfig {
    endpoint: string
    apiKey: string
    model: string
    /** JSON-encoded extra request body parameters (temperature, reasoning options…). */
    extraParamsText: string
    additionalSystemPrompt: string
    approvalMode: ApprovalMode
    panelSide: PanelSide
    panelWidth: number
    /** Base text size of the panel in px; everything else scales with it. */
    fontSize: number
    panelVisible: boolean
    /** Switch to the terminal the agent is acting on. */
    focusTerminalOnRun: boolean
    /** Characters of a tool result that are sent to the model (head+tail). */
    maxToolResultChars: number
    /** Approximate context budget in characters; older tool output is elided first. */
    maxContextChars: number
    /** Default command time budget in seconds when the model does not specify one. */
    defaultCommandTimeout: number
    showReasoning: boolean
    autoTitle: boolean
}

export const CONFIG_KEY = 'tabbyCopilot'

export const DEFAULT_CONFIG: CopilotConfig = {
    endpoint: 'https://api.deepseek.com',
    apiKey: '',
    model: 'deepseek-chat',
    extraParamsText: '',
    additionalSystemPrompt: '',
    approvalMode: 'ask',
    panelSide: 'right',
    panelWidth: 420,
    fontSize: 13,
    panelVisible: false,
    focusTerminalOnRun: false,
    maxToolResultChars: 12000,
    maxContextChars: 160000,
    defaultCommandTimeout: 60,
    showReasoning: true,
    autoTitle: true,
}

export const HOTKEY_IDS = {
    toggle: 'tabby-copilot-toggle',
    approve: 'tabby-copilot-approve',
    deny: 'tabby-copilot-deny',
    stop: 'tabby-copilot-stop',
    focusInput: 'tabby-copilot-focus-input',
    newSession: 'tabby-copilot-new-session',
} as const
