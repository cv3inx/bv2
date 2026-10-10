import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// lib/Socket/index.d.ts is the type every consumer gets from makeWASocket, and it is maintained
// by hand against 25 socket layers. A method added to a layer but not to that file is invisible
// to TypeScript users — `sock.groupStatus()` shipped that way. This compares the two directly so
// the next one fails here instead of in a consumer's build.
const libDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib');
const read = file => readFileSync(join(libDir, file), 'utf8');

/** Keys of the object literal each `make*Socket` layer returns. */
const returnedKeys = source => {
    const start = source.lastIndexOf('return {');
    assert.notEqual(start, -1, 'layer has no return literal');
    const keys = new Set();
    for (const match of source.slice(start).matchAll(/^\s{4,8}([A-Za-z_$][\w$]*)\s*[,:]/gm)) {
        keys.add(match[1]);
    }
    return keys;
};

const LAYERS = [
    'socket.js',
    'messages-send.js',
    'messages-recv.js',
    'chats.js',
    'groups.js',
    'communities.js',
    'newsletter.js',
    'business.js',
    'interop.js',
    'privacy.js',
    'registration.js',
    'managed-account.js',
    'graphql.js',
    'usync.js'
];

test('every socket method a layer returns is declared in Socket/index.d.ts', () => {
    const declared = read('Socket/index.d.ts');
    const missing = [];
    for (const layer of LAYERS) {
        let source;
        try {
            source = read(join('Socket', layer));
        }
        catch {
            continue; // layer renamed or folded into another; the remaining ones still guard
        }
        for (const key of returnedKeys(source)) {
            if (!new RegExp(`^\\s*${key}[?:]`, 'm').test(declared)) {
                missing.push(`${layer} -> ${key}`);
            }
        }
    }
    assert.deepEqual(missing, [], `undeclared socket methods:\n${missing.join('\n')}`);
});

test('every Utils module re-exported at runtime is also re-exported in the types', () => {
    const reexports = source => new Set([...source.matchAll(/^export \* from ['"](.+?)['"];/gm)].map(m => m[1]));
    for (const dir of ['Utils', 'Types', 'Store', 'WABinary', 'WAUSync']) {
        const runtime = reexports(read(join(dir, 'index.js')));
        const types = reexports(read(join(dir, 'index.d.ts')));
        // Only this direction is a defect: a runtime export missing from the types is invisible
        // to consumers. The reverse is normal — type-only modules (Types/USync, Types/Bussines)
        // have nothing to re-export at runtime.
        assert.deepEqual([...runtime].filter(m => !types.has(m)), [], `${dir}/index.d.ts is missing re-exports`);
    }
});
