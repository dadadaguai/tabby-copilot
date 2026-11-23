import { TerminalDescriptor, TerminalKind } from '../types/session'

const KNOWN_KINDS: TerminalKind[] = ['ssh', 'local', 'serial', 'telnet']

/** A structural subset of a terminal tab, enough to build a descriptor. */
export interface TabLike {
    profile?: any
    customTitle?: string
    title?: string
}

export function describeTab (tab: TabLike): TerminalDescriptor {
    const profile: any = tab.profile ?? {}
    const options: any = profile.options ?? {}
    const type = String(profile.type ?? 'other')
    const kind: TerminalKind = (KNOWN_KINDS as string[]).includes(type) ? type as TerminalKind : 'other'
    const d: TerminalDescriptor = {
        kind,
        profileId: profile.id || undefined,
        profileName: profile.name || undefined,
        title: tab.customTitle || tab.title || undefined,
        customTitle: tab.customTitle || undefined,
    }
    if (kind === 'ssh' || kind === 'telnet') {
        d.host = options.host || undefined
        d.port = options.port || undefined
        d.user = options.user || undefined
    }
    if (kind === 'serial') {
        d.host = options.port || undefined
    }
    return d
}

/**
 * How well does an open terminal match a descriptor stored in a session?
 * 0 = no match; higher is better.
 */
export function matchScore (stored: TerminalDescriptor, open: TerminalDescriptor): number {
    let score = 0
    if (stored.kind !== open.kind) {
        return 0
    }
    if (stored.profileId && stored.profileId === open.profileId) {
        score += 6
    }
    if (stored.host && stored.host === open.host) {
        score += 3
        if (stored.user && stored.user === open.user) {
            score += 1
        }
        if ((stored.port ?? 22) === (open.port ?? 22)) {
            score += 1
        }
    }
    if (stored.profileName && stored.profileName === open.profileName) {
        score += 2
    }
    if (stored.customTitle && stored.customTitle === open.customTitle) {
        score += 2
    }
    if (stored.title && stored.title === open.title) {
        score += 1
    }
    return score
}
