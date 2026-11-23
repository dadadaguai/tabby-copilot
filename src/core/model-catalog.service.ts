import { Inject, Injectable } from '@angular/core'
import { CONFIG_ACCESSOR } from './config-token'
import { CopilotConfig } from '../types/config'
import { normalizeBaseUrl } from './llm/openai-compatible'
import { readAll, streamRequest } from './util/sse'

const CACHE_MS = 5 * 60_000

/**
 * Fetches the model list from a configured OpenAI-compatible endpoint
 * (`GET /v1/models`) and caches it per endpoint+key for 5 minutes.
 */
@Injectable({ providedIn: 'root' })
export class ModelCatalogService {
    private cache: { endpoint: string, models: string[], at: number } | null = null

    constructor (@Inject(CONFIG_ACCESSOR) private getConfig: () => CopilotConfig) {}

    async list (): Promise<string[]> {
        const cfg = this.getConfig()
        const endpoint = cfg.endpoint?.trim()
        if (!endpoint) {
            return []
        }
        if (this.cache && this.cache.endpoint === endpoint && Date.now() - this.cache.at < CACHE_MS) {
            return this.cache.models
        }
        const headers: Record<string, string> = {}
        const key = cfg.apiKey?.trim()
        if (key) {
            headers.Authorization = `Bearer ${key}`
        }
        const res = await streamRequest(`${normalizeBaseUrl(endpoint)}/v1/models`, { method: 'GET', headers })
        if (res.status < 200 || res.status >= 300) {
            const text = await readAll(res.chunks).catch(() => '')
            throw new Error(`Failed to list models (HTTP ${res.status})${text ? ': ' + text.slice(0, 200) : ''}`)
        }
        const text = await readAll(res.chunks)
        const models = parseModels(text)
        this.cache = { endpoint, models, at: Date.now() }
        return models
    }
}

function parseModels (text: string): string[] {
    let parsed: any
    try {
        parsed = JSON.parse(text)
    } catch {
        return []
    }
    if (Array.isArray(parsed)) {
        return parsed.map(m => typeof m === 'string' ? m : (m?.id ?? m?.name)).filter(Boolean)
    }
    if (Array.isArray(parsed?.data)) {
        return parsed.data.map((m: any) => m?.id ?? m?.name).filter(Boolean)
    }
    if (Array.isArray(parsed?.models)) {
        return parsed.models.map((m: any) => m?.name ?? m?.id ?? m?.model).filter(Boolean)
    }
    return []
}
