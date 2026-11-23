import { test } from 'node:test'
import assert from 'node:assert'
import { matchScore } from '../src/core/terminal-descriptor'
import { TerminalDescriptor } from '../src/types/session'

test('matchScore returns 0 for different kinds', () => {
    assert.strictEqual(matchScore({ kind: 'ssh', host: 'a' }, { kind: 'local' }), 0)
})

test('matchScore scores host + user + port', () => {
    const stored: TerminalDescriptor = { kind: 'ssh', host: '10.0.0.1', user: 'ubuntu', port: 22 }
    const open: TerminalDescriptor = { kind: 'ssh', host: '10.0.0.1', user: 'ubuntu', port: 22 }
    assert.strictEqual(matchScore(stored, open), 5) // host 3 + user 1 + port 1
})

test('matchScore scores profileId highest', () => {
    const stored: TerminalDescriptor = { kind: 'ssh', profileId: 'p1', host: '10.0.0.1' }
    const open: TerminalDescriptor = { kind: 'ssh', profileId: 'p1', host: '10.0.0.1' }
    assert.strictEqual(matchScore(stored, open), 10) // profileId 6 + host 3 + port(22 default) 1
})

test('matchScore ignores mismatched host', () => {
    const stored: TerminalDescriptor = { kind: 'ssh', host: '10.0.0.1' }
    const open: TerminalDescriptor = { kind: 'ssh', host: '10.0.0.2' }
    assert.strictEqual(matchScore(stored, open), 0)
})
