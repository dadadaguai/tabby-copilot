import { test } from 'node:test'
import assert from 'node:assert'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { FileService } from '../src/core/file.service'
import { TerminalEntry } from '../src/core/terminal-registry.service'

function entry (): TerminalEntry {
    return {
        id: 't1',
        tab: {} as any,
        label: 'test',
        connection: 'local',
        fileWhitelist: [],
        lastOutputAt: 0,
        outputSeq: 0,
        busyWith: null,
        readMarker: { row: 0 },
        closed: false,
    }
}

test('normalize collapses separators and trailing slash', () => {
    const svc = new FileService()
    assert.strictEqual(svc.normalize('/var/log/'), '/var/log')
    assert.strictEqual(svc.normalize('C:\\Users\\me'), 'C:/Users/me')
    assert.strictEqual(svc.normalize('/var/log/../../etc/passwd'), '/etc/passwd')
    assert.strictEqual(svc.normalize('a/./b/../c'), 'a/c')
})

test('isAllowed matches exact and prefix', () => {
    const svc = new FileService()
    const e = entry()
    e.fileWhitelist = ['/var/log']
    assert.ok(svc.isAllowed(e, '/var/log'))
    assert.ok(svc.isAllowed(e, '/var/log/app.log'))
    assert.ok(!svc.isAllowed(e, '/var/www'))
})

test('isAllowed rejects ../ traversal outside the whitelist', () => {
    const svc = new FileService()
    const e = entry()
    e.fileWhitelist = ['/var/log']
    assert.ok(!svc.isAllowed(e, '/var/log/../../etc/passwd'))
    assert.ok(!svc.isAllowed(e, '/var/log/app.log/../../../etc/passwd'))
})

test('grant expands ~ and matches child paths', () => {
    const svc = new FileService()
    const e = entry()
    svc.grant(e, '~/projects')
    assert.ok(svc.isAllowed(e, '~/projects/x'))
    assert.ok(!svc.isAllowed(e, '~/other'))
})

test('grant adds a normalized prefix once', () => {
    const svc = new FileService()
    const e = entry()
    svc.grant(e, '/var/log/')
    svc.grant(e, '/var/log')
    assert.deepStrictEqual(e.fileWhitelist, ['/var/log'])
})

test('readFile reads a local file and slices lines', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-'))
    const file = path.join(dir, 'test.txt')
    fs.writeFileSync(file, 'a\nb\nc\nd\n', 'utf8')
    try {
        const svc = new FileService()
        const e = entry()
        assert.strictEqual(await svc.readFile(e, file, 2), 'a\nb')
        assert.strictEqual(await svc.readFile(e, file), 'a\nb\nc\nd\n')
        assert.strictEqual(await svc.readFile(e, file, 2, 1), 'b\nc')
        assert.strictEqual(await svc.readFile(e, file, undefined, 2), 'c\nd\n')
    } finally {
        fs.rmSync(dir, { recursive: true, force: true })
    }
})
