import { Injectable, NgZone } from '@angular/core'
import { BehaviorSubject, Observable } from 'rxjs'
import { AppService, SplitTabComponent } from 'tabby-core'
import { BaseTerminalTabComponent } from 'tabby-terminal'

export interface TerminalEntry {
    id: string
    tab: BaseTerminalTabComponent<any>
    label: string
    connection: string
    closed: boolean
}

/**
 * Knows about every terminal tab in the app, in visual order.
 *
 * v0.0.1 keeps this deliberately small: it tracks tabs and their labels so the
 * panel can show which terminal it is bound to. v0.0.2+ adds buffer access and
 * per-tab state on top of it.
 */
@Injectable({ providedIn: 'root' })
export class TerminalRegistryService {
    private entries = new Map<string, TerminalEntry>()
    private byTab = new WeakMap<BaseTerminalTabComponent<any>, TerminalEntry>()
    private seq = 0
    private changed = new BehaviorSubject<TerminalEntry[]>([])

    /** Emits the ordered terminal list whenever tabs change. */
    get changed$ (): Observable<TerminalEntry[]> {
        return this.changed.asObservable()
    }

    constructor (
        private app: AppService,
        private zone: NgZone,
    ) {
        this.app.tabsChanged$.subscribe(() => this.emit())
        this.app.activeTabChange$.subscribe(() => this.emit())
        this.app.ready$.subscribe(() => this.scan())
        this.app.tabOpened$.subscribe(() => setTimeout(() => this.scan(), 50))
    }

    register (tab: BaseTerminalTabComponent<any>): TerminalEntry {
        const existing = this.byTab.get(tab)
        if (existing) {
            return existing
        }
        const entry: TerminalEntry = {
            id: `t${++this.seq}`,
            tab,
            label: baseLabel(tab),
            connection: describeConnection(tab),
            closed: false,
        }
        this.entries.set(entry.id, entry)
        this.byTab.set(tab, entry)
        tab.destroyed$.subscribe(() => this.unregister(tab))
        this.emit()
        return entry
    }

    unregister (tab: BaseTerminalTabComponent<any>): void {
        const entry = this.byTab.get(tab)
        if (!entry || entry.closed) {
            return
        }
        entry.closed = true
        this.entries.delete(entry.id)
        this.emit()
    }

    /** Pick up any terminal tabs the decorator did not report (defensive). */
    scan (): void {
        for (const tab of this.iterateTerminalTabs()) {
            this.register(tab)
        }
        this.emit()
    }

    /** All open terminals in visual tab order. */
    list (): TerminalEntry[] {
        const out: TerminalEntry[] = []
        const seen = new Set<string>()
        for (const tab of this.iterateTerminalTabs()) {
            const entry = this.byTab.get(tab) ?? this.register(tab)
            if (entry.closed) {
                continue
            }
            entry.label = baseLabel(tab)
            entry.connection = describeConnection(tab)
            seen.add(entry.id)
            out.push(entry)
        }
        for (const entry of [...this.entries.values()]) {
            if (!seen.has(entry.id)) {
                entry.closed = true
                this.entries.delete(entry.id)
            }
        }
        return out
    }

    /** The terminal that currently has (or last had) focus. */
    getActive (): TerminalEntry | null {
        const active = this.app.activeTab
        if (!active) {
            return null
        }
        if (active instanceof SplitTabComponent) {
            const focused = active.getFocusedTab()
            if (focused && isTerminalTab(focused)) {
                return this.byTab.get(focused) ?? this.register(focused)
            }
            for (const child of active.getAllTabs()) {
                if (isTerminalTab(child)) {
                    return this.byTab.get(child) ?? this.register(child)
                }
            }
            return null
        }
        if (isTerminalTab(active)) {
            return this.byTab.get(active) ?? this.register(active)
        }
        return null
    }

    private * iterateTerminalTabs (): Generator<BaseTerminalTabComponent<any>> {
        for (const tab of this.app.tabs ?? []) {
            if (tab instanceof SplitTabComponent) {
                for (const child of tab.getAllTabs()) {
                    if (isTerminalTab(child)) {
                        yield child
                    }
                }
            } else if (isTerminalTab(tab)) {
                yield tab
            }
        }
    }

    private emit (): void {
        this.zone.run(() => this.changed.next(this.list()))
    }
}

function isTerminalTab (tab: any): tab is BaseTerminalTabComponent<any> {
    if (!tab) {
        return false
    }
    if (tab instanceof BaseTerminalTabComponent) {
        return true
    }
    // duck typing in case the plugin was bundled with its own copy of tabby-terminal
    return typeof tab.sendInput === 'function' && 'frontend' in tab && 'profile' in tab
}

function baseLabel (tab: BaseTerminalTabComponent<any>): string {
    if (tab.customTitle) {
        return tab.customTitle
    }
    const profile: any = tab.profile ?? {}
    if (String(profile.type) !== 'local' && profile.name) {
        return profile.name
    }
    return tab.title || profile.name || 'Terminal'
}

/** "ssh ubuntu@10.0.0.11:22" / "local shell" – shown in the panel header. */
function describeConnection (tab: BaseTerminalTabComponent<any>): string {
    const profile: any = tab.profile ?? {}
    const options: any = profile.options ?? {}
    const kind = String(profile.type ?? 'other')
    if (kind === 'ssh' || kind === 'telnet') {
        const user = options.user ? `${options.user}@` : ''
        const host = options.host ?? '?'
        const port = options.port && options.port !== 22 ? `:${options.port}` : ''
        return `${kind} ${user}${host}${port}`
    }
    if (kind === 'serial') {
        return `serial ${options.port ?? ''}`.trim()
    }
    if (kind === 'local') {
        return 'local shell'
    }
    return kind || 'terminal'
}
