import { Injectable } from '@angular/core'
import * as fs from 'fs'
import { TerminalEntry } from './terminal-registry.service'

/**
 * Reads files on the terminal's host, honoring a per-terminal whitelist.
 *
 * - Local tabs read via Node `fs`.
 * - SSH tabs try `session.openSFTP()`, then fall back to an `exec` channel
 *   running `cat`/`sed`.
 */
@Injectable({ providedIn: 'root' })
export class FileService {
    /** Normalize a path for whitelist matching (forward slashes, no trailing slash). */
    normalize (p: string): string {
        let s = (p ?? '').trim().replace(/\\/g, '/')
        s = s.replace(/\/{2,}/g, '/')
        if (s.length > 1 && s.endsWith('/')) {
            s = s.slice(0, -1)
        }
        return s
    }

    isAllowed (entry: TerminalEntry, p: string): boolean {
        const target = this.normalize(p)
        const wl = entry.fileWhitelist ?? []
        return wl.some(prefix => target === prefix || target.startsWith(prefix + '/'))
    }

    /** Grant access to a directory prefix. */
    grant (entry: TerminalEntry, dir: string): void {
        entry.fileWhitelist ??= []
        const target = this.normalize(dir)
        if (!entry.fileWhitelist.includes(target)) {
            entry.fileWhitelist.push(target)
        }
    }

    async readFile (entry: TerminalEntry, p: string, lines?: number): Promise<string> {
        const kind = this.kind(entry)
        if (kind === 'local') {
            return sliceLines(await this.readLocal(p), lines)
        }
        if (kind === 'ssh') {
            return this.readSsh(entry, p, lines)
        }
        throw new Error(`Terminal "${entry.label}" does not support file reading.`)
    }

    async listDir (entry: TerminalEntry, p: string): Promise<string> {
        const kind = this.kind(entry)
        if (kind === 'local') {
            const entries = await fs.promises.readdir(p, { withFileTypes: true })
            const lines = entries.map(e => `${e.isDirectory() ? 'd' : '-'}  ${e.name}`)
            return lines.join('\n') || '(empty)'
        }
        if (kind === 'ssh') {
            return this.execRead(entry, `ls -la ${shellQuote(p)}`)
        }
        throw new Error(`Terminal "${entry.label}" does not support directory listing.`)
    }

    private kind (entry: TerminalEntry): 'local' | 'ssh' | 'other' {
        const profile: any = entry.tab.profile ?? {}
        const type = String(profile.type ?? '')
        if (type === 'ssh' || type === 'telnet') {
            return 'ssh'
        }
        if (type === 'local' || type === '') {
            return 'local'
        }
        return 'other'
    }

    private async readLocal (p: string): Promise<string> {
        const stat = await fs.promises.stat(p)
        if (stat.size > 5_000_000) {
            throw new Error(`File is too large (${stat.size} bytes). Use a command like \`head\`/\`sed\` instead.`)
        }
        return fs.promises.readFile(p, 'utf8')
    }

    private async readSsh (entry: TerminalEntry, p: string, lines?: number): Promise<string> {
        const session: any = entry.tab.session
        const sftp = await this.tryOpenSftp(session)
        if (sftp) {
            try {
                return sliceLines(await this.sftpReadFile(sftp, p), lines)
            } catch {
                // fall through to exec
            }
        }
        const cmd = lines ? `sed -n '1,${lines}p' ${shellQuote(p)}` : `cat ${shellQuote(p)}`
        return this.execRead(entry, cmd)
    }

    private async tryOpenSftp (session: any): Promise<any | null> {
        try {
            if (typeof session?.openSFTP === 'function') {
                return await session.openSFTP()
            }
            if (session?.sftp) {
                return session.sftp
            }
        } catch {
            // no SFTP
        }
        return null
    }

    private sftpReadFile (sftp: any, p: string): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                sftp.readFile(p, 'utf8', (err: any, data: any) => err ? reject(err) : resolve(String(data)))
            } catch (e) {
                reject(e)
            }
        })
    }

    private execRead (entry: TerminalEntry, cmd: string): Promise<string> {
        const session: any = entry.tab.session
        if (typeof session?.exec !== 'function') {
            throw new Error(`Terminal "${entry.label}" does not support file access.`)
        }
        return new Promise((resolve, reject) => {
            try {
                Promise.resolve(session.exec(cmd)).then((channel: any) => {
                    if (typeof channel?.on === 'function') {
                        let out = ''
                        channel.on('data', (d: any) => { out += d.toString() })
                        channel.on('close', () => resolve(out))
                        channel.on('error', (e: any) => reject(e))
                    } else {
                        resolve(String(channel?.output ?? channel ?? ''))
                    }
                }).catch(reject)
            } catch (e) {
                reject(e)
            }
        })
    }
}

function sliceLines (content: string, lines?: number): string {
    if (!lines || lines <= 0) {
        return content
    }
    return content.split('\n').slice(0, lines).join('\n')
}

function shellQuote (s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`
}
