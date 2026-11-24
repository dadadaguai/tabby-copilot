export type ApiType = 'openai-completions' | 'anthropic-messages'

export interface CatalogModel {
    id: string
    name: string
    /** Whether the model supports reasoning / thinking. */
    reasoning: boolean
    /** Allowed reasoning-effort values (low/medium/high/max). Empty = no effort control. */
    efforts?: string[]
}

export interface CatalogProvider {
    id: string
    name: string
    api: ApiType
    baseUrl: string
    /** Placeholder text for the API key field. */
    apiKeyHint: string
    models: CatalogModel[]
}

/** The built-in provider/model catalog (a small subset of Pi's, only the providers the user uses). */
export const CATALOG: CatalogProvider[] = [
    {
        id: 'deepseek',
        name: 'DeepSeek',
        api: 'openai-completions',
        baseUrl: 'https://api.deepseek.com',
        apiKeyHint: 'sk-…',
        models: [
            { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', reasoning: true, efforts: ['low', 'high', 'max'] },
            { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', reasoning: true, efforts: ['high', 'max'] },
            { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)', reasoning: false },
            { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', reasoning: true, efforts: ['high'] },
        ],
    },
    {
        id: 'openai',
        name: 'OpenAI',
        api: 'openai-completions',
        baseUrl: 'https://api.openai.com/v1',
        apiKeyHint: 'sk-…',
        models: [
            { id: 'gpt-5', name: 'GPT-5', reasoning: true, efforts: ['low', 'medium', 'high'] },
            { id: 'gpt-5-mini', name: 'GPT-5 mini', reasoning: true, efforts: ['low', 'medium', 'high'] },
            { id: 'o3', name: 'o3', reasoning: true, efforts: ['low', 'medium', 'high'] },
            { id: 'gpt-4o', name: 'GPT-4o', reasoning: false },
        ],
    },
    {
        id: 'anthropic',
        name: 'Claude',
        api: 'anthropic-messages',
        baseUrl: 'https://api.anthropic.com',
        apiKeyHint: 'sk-ant-…',
        models: [
            { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', reasoning: true, efforts: ['low', 'medium', 'high'] },
            { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', reasoning: true, efforts: ['low', 'medium', 'high'] },
            { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', reasoning: true, efforts: ['low', 'medium', 'high'] },
        ],
    },
    {
        id: 'google',
        name: 'Google Gemini',
        api: 'openai-completions',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKeyHint: 'AIza…',
        models: [
            { id: 'gemini-3-pro', name: 'Gemini 3 Pro', reasoning: true, efforts: ['low', 'high'] },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', reasoning: true, efforts: ['low', 'high'] },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', reasoning: false },
        ],
    },
    {
        id: 'glm',
        name: '智谱 GLM',
        api: 'openai-completions',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        apiKeyHint: '…',
        models: [
            { id: 'glm-4.6', name: 'GLM-4.6', reasoning: true, efforts: ['low', 'medium', 'high'] },
            { id: 'glm-4.5', name: 'GLM-4.5', reasoning: false },
            { id: 'glm-4.5-flash', name: 'GLM-4.5-Flash', reasoning: false },
        ],
    },
    {
        id: 'opencode',
        name: 'opencode',
        api: 'openai-completions',
        baseUrl: 'https://api.opencode.ai/v1',
        apiKeyHint: '…',
        models: [
            { id: 'opencode/gpt-5', name: 'opencode / GPT-5', reasoning: true, efforts: ['low', 'medium', 'high'] },
            { id: 'opencode/claude-opus-4-6', name: 'opencode / Claude Opus 4.6', reasoning: true, efforts: ['low', 'medium', 'high'] },
            { id: 'opencode/gemini-3-pro', name: 'opencode / Gemini 3 Pro', reasoning: true, efforts: ['low', 'high'] },
        ],
    },
    {
        id: 'qwen',
        name: '通义千问',
        api: 'openai-completions',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKeyHint: 'sk-…',
        models: [
            { id: 'qwen3-max', name: 'Qwen3 Max', reasoning: true, efforts: ['low', 'high'] },
            { id: 'qwen3-plus', name: 'Qwen3 Plus', reasoning: false },
            { id: 'qwen3-coder', name: 'Qwen3 Coder', reasoning: false },
        ],
    },
    {
        id: 'tencent',
        name: '腾讯混元',
        api: 'openai-completions',
        baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
        apiKeyHint: '…',
        models: [
            { id: 'hunyuan-t1', name: '混元 T1', reasoning: true, efforts: ['low', 'high'] },
            { id: 'hunyuan-turbos', name: '混元 TurboS', reasoning: false },
            { id: 'hunyuan-large', name: '混元 Large', reasoning: false },
        ],
    },
]

export function findProvider (id: string): CatalogProvider | undefined {
    return CATALOG.find(p => p.id === id)
}

export function findModel (providerId: string, modelId: string): CatalogModel | undefined {
    return findProvider(providerId)?.models.find(m => m.id === modelId)
}
