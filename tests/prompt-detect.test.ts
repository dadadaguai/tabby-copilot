import { test } from 'node:test'
import assert from 'node:assert'
import {
    learnPromptTerminator,
    looksLikeInputPrompt,
    looksLikePrompt,
    stripEchoAndPrompt,
} from '../src/core/util/prompt-detect'

test('learnPromptTerminator returns the trailing symbol', () => {
    assert.strictEqual(learnPromptTerminator('user@host:~$'), '$')
    assert.strictEqual(learnPromptTerminator('root@host:/#'), '#')
    assert.strictEqual(learnPromptTerminator('~ ❯'), '❯')
})

test('learnPromptTerminator returns null for letter/digit endings', () => {
    assert.strictEqual(learnPromptTerminator('user@host'), null)
    assert.strictEqual(learnPromptTerminator(''), null)
})

test('looksLikePrompt matches generic prompts', () => {
    assert.ok(looksLikePrompt('user@host:~$', null))
    assert.ok(looksLikePrompt('PS C:\\Users\\me>', null))
    assert.ok(looksLikePrompt('(venv) ~ $', null))
    assert.ok(looksLikePrompt('~ ❯', null))
    assert.ok(!looksLikePrompt('total 42', null))
})

test('looksLikePrompt honors a learned terminator', () => {
    // a learned '>' terminator also matches an odd shell like "myprompt>"
    assert.ok(looksLikePrompt('myprompt>', '>'))
})

test('looksLikeInputPrompt detects password and confirm prompts', () => {
    assert.ok(looksLikeInputPrompt('[sudo] password for ubuntu:'))
    assert.ok(looksLikeInputPrompt('Do you want to continue? [Y/n]'))
    assert.ok(looksLikeInputPrompt('Are you sure you want to delete it?'))
    assert.ok(looksLikeInputPrompt('--More--'))
    assert.ok(!looksLikeInputPrompt('user@host:~$'))
})

test('stripEchoAndPrompt removes the command echo and trailing prompt', () => {
    const lines = ['user@host:~$ echo hello', 'hello', 'user@host:~$']
    const out = stripEchoAndPrompt(lines, 'echo hello', '$')
    assert.deepStrictEqual(out, ['hello'])
})
