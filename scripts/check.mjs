import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
async function javascriptFiles(directory) {
    const files = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await javascriptFiles(path));
        else if (entry.name.endsWith('.js')) files.push(path);
    }
    return files;
}
const files = [
    ...await javascriptFiles(join(root, 'lib')),
    ...await javascriptFiles(join(root, 'WAProto')),
    join(root, 'engine-requirements.js')
];
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
}
const api = await import('../lib/index.js');
if (typeof api.makeWASocket !== 'function') throw new Error('makeWASocket export missing');
console.log(`Syntax checked ${files.length} JavaScript files; package entry point imports successfully.`);
