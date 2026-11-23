import { Injectable } from '@angular/core'
import * as fs from 'fs'
import * as os from 'os'
import { TerminalEntry } from './terminal-registry.service'

/** Hard ceiling for the SSH `exec` fallback channel (chars). */
const MAX_EXEC_OUTPUT = 200_000

/**
 * Reads files on the terminal's host, honoring a per-terminal whitelist.
 *
 * - Local tabs read via Node `fs`.
 * - SSH tabs try `session.openSFTP()`, then fall back to an `exec` channel
 *   running `cat`/`sed`.
 */
@Injectable({ providedIn: 'root' })
export class FileService {
    /**
     * Normalize a path for whitelist matching and local file access: forward
     * slashes, no trailing slash, and `.`/`..` segments resolved lexically so
     * `/var/log/../../etc/passwd` can never pass a `/var/log` whitelist prefix.
     */
    normalize (p: string): string {
        let s = (p ?? '').trim().replace(/\\/g, '/')
        s = s.replace(/\/{2,}/g, '/')

        // Keep a Windows drive prefix ("C:") out of the segment walk.
        let prefix = ''
        const drive = /^([a-zA-Z]):\//.exec(s)
        if (drive) {
            prefix = drive[0]
            s = s.slice(prefix.length)
        }

        const absolute = s.startsWith('/')
        const segments: string[] = []
        for (const seg of s.split('/')) {
            if (!seg || seg === '.') {
                continue
            }
            if (seg === '..') {
                if (segments.length && segments[segments.length - 1] !== '..') {
                    segments.pop()
                } else if (!absolute) {
                    segments.push('..')
                }
                continue
            }
            segments.push(seg)
        }

        const joined = segments.join('/')
        const base = prefix || (absolute ? '/' : '')
        let out = joined ? base + (base && !base.endsWith('/') ? '/' : '') + joined : (prefix || (absolute ? '/' : ''))
        if (out.length > 1 && out.endsWith('/')) {
            out = out.slice(0, -1)
        }
        return out || (prefix || (absolute ? '/' : '.'))
    }

    /** Expand a leading `~` to the local home directory (local tabs only). */
    expandHome (p: string): string {
        const s = (p ?? '').trim()
        if (s === '~') {
            return os.homedir()
        }
        if (s.startsWith('~/')) {
            return os.homedir().replace(/[\\/]+$/, '') + '/' + s.slice(2)
        }
        return s
    }

    isAllowed (entry: TerminalEntry, p: string): boolean {
        const target = this.normalize(this.expandHome(p))
        const wl = entry.fileWhitelist ?? []
        return wl.some(prefix => target === prefix || target.startsWith(prefix + '/'))
    }

    /** Grant access to a directory prefix. */
    grant (entry: TerminalEntry, dir: string): void {
        entry.fileWhitelist ??= []
        const target = this.normalize(this.expandHome(dir))
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
            const resolved = this.normalize(this.expandHome(p))
            const entries = await fs.promises.readdir(resolved, { withFileTypes: true })
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
        const resolved = this.normalize(this.expandHome(p))
        const stat = await fs.promises.stat(resolved)
        if (stat.size > 5_000_000) {
            throw new Error(`File is too large (${stat.size} bytes). Use a command like \`head\`/\`sed\` instead.`)
        }
        return fs.promises.readFile(resolved, 'utf8')
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
                        let overflow = false
                        channel.on('data', (d: any) => {
                            const chunk = d.toString()
                            const remaining = MAX_EXEC_OUTPUT - out.length
                            if (remaining <= 0) {
                                overflow = true
                                return
                            }
                            out += chunk.length > remaining ? chunk.slice(0, remaining) : chunk
                            if (chunk.length > remaining) {
                                overflow = true
                            }
                        })
                        channel.on('close', () => resolve(overflow ? out + `\n[… output truncated at ${MAX_EXEC_OUTPUT} chars …]` : out))
                        channel.on('error', (e: any) => reject(e))
                    } else {
                        const raw = String(channel?.output ?? channel ?? '')
                        resolve(raw.length > MAX_EXEC_OUTPUT ? raw.slice(0, MAX_EXEC_OUTPUT) + `\n[… output truncated at ${MAX_EXEC_OUTPUT} chars …]` : raw)
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
