import { test } from 'node:test'
import assert from 'node:assert'
import { RunnerHost, TerminalRunner } from '../src/core/terminal-runner'
import { BufferCapture, BufferPosition, ResolvedPosition, TerminalEntry } from '../src/core/terminal-registry.service'

/** A fake xterm buffer that appends echo + output + prompt shortly after a command is sent. */
class FakeTerminal implements RunnerHost {
    lines: string[] = ['user@host:~$']
    entry: TerminalEntry

    constructor () {
        this.entry = {
            id: 't1',
            tab: {} as any,
            label: 'test',
            connection: 'local',
            lastOutputAt: 0,
            outputSeq: 0,
            busyWith: null,
            readMarker: { row: 0 },
            closed: false,
        }
    }

    mark (): BufferPosition { return { row: this.lines.length - 1, marker: null } }
    resolve (_e: TerminalEntry, pos: BufferPosition): ResolvedPosition {
        return { row: Math.min(pos.row, this.lines.length - 1), trimmed: false, reset: false }
    }
    captureSince (_e: TerminalEntry, from: BufferPosition): BufferCapture {
        return { lines: this.lines.slice(from.row), endRow: this.lines.length, isAlternate: false }
    }
    captureLast (_e: TerminalEntry, n: number): BufferCapture {
        return { lines: this.lines.slice(-n), endRow: this.lines.length, isAlternate: false }
    }
    captureScreen (_e: TerminalEntry): BufferCapture {
        return { lines: this.lines.slice(-1), endRow: this.lines.length, isAlternate: false }
    }
    cursorRow (): number { return this.lines.length - 1 }
    cursorLine (): string { return this.lines[this.lines.length - 1] }
    sendInput (_e: TerminalEntry, data: string): void {
        const cmd = data.replace(/\r/g, '')
        setTimeout(() => {
            this.lines.push(...cmd.split('\n'))
            this.lines.push('hello world')
            this.lines.push('user@host:~$')
        }, 20)
    }
}

test('run_command returns prompt state with output, prompt stripped', async () => {
    const host = new FakeTerminal()
    const runner = new TerminalRunner(host)
    const result = await runner.run(host.entry, 'echo hello', { timeoutMs: 3000 })
    assert.strictEqual(result.state, 'prompt')
    assert.ok(result.output.includes('hello world'))
    assert.ok(!result.output.includes('user@host'), 'prompt should be stripped')
    assert.ok(!result.output.includes('echo hello'), 'command echo should be stripped')
})
