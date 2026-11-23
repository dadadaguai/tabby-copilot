import { test } from 'node:test'
import assert from 'node:assert'
import { assessCommand, isAutoApproved } from '../src/core/util/risk'

test('assessCommand flags destructive commands as high + hardBlock', () => {
    const a = assessCommand('rm -rf /', 'low')
    assert.strictEqual(a.level, 'high')
    assert.strictEqual(a.hardBlock, true)
})

test('assessCommand flags mkfs/reboot regardless of claimed level', () => {
    assert.strictEqual(assessCommand('mkfs.ext4 /dev/sdb1', 'low').hardBlock, true)
    assert.strictEqual(assessCommand('sudo reboot', 'low').hardBlock, true)
})

test('assessCommand raises sudo to at least medium', () => {
    assert.strictEqual(assessCommand('sudo apt-get update', 'low').level, 'medium')
})

test('assessCommand keeps read-only commands low', () => {
    assert.strictEqual(assessCommand('ls -la', 'low').level, 'low')
    assert.strictEqual(assessCommand('cat /etc/hosts', 'low').level, 'low')
})

test('assessCommand respects a higher claimed level', () => {
    assert.strictEqual(assessCommand('ls -la', 'high').level, 'high')
})

test('isAutoApproved gates by mode', () => {
    assert.strictEqual(isAutoApproved('low', 'ask', false), false)
    assert.strictEqual(isAutoApproved('low', 'auto_low', false), true)
    assert.strictEqual(isAutoApproved('medium', 'auto_low', false), false)
    assert.strictEqual(isAutoApproved('medium', 'auto_medium', false), true)
    assert.strictEqual(isAutoApproved('high', 'auto_medium', false), false)
    assert.strictEqual(isAutoApproved('high', 'auto_all', false), true)
    assert.strictEqual(isAutoApproved('high', 'auto_all', true), false) // hardBlock always asks
})
