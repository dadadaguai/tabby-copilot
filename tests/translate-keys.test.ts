import { test } from 'node:test'
import assert from 'node:assert'
import { translateKeys } from '../src/core/terminal-runner'

test('translateKeys maps special key names', () => {
    assert.strictEqual(translateKeys('enter'), '\r')
    assert.strictEqual(translateKeys('tab'), '\t')
    assert.strictEqual(translateKeys('esc'), '\x1b')
    assert.strictEqual(translateKeys('up'), '\x1b[A')
    assert.strictEqual(translateKeys('ctrl-c'), '\x03')
    assert.strictEqual(translateKeys('ctrl-d'), '\x04')
})

test('translateKeys throws for unknown keys (caller falls back to literal text)', () => {
    assert.throws(() => translateKeys('y'))
    assert.throws(() => translateKeys('nonsense'))
})
