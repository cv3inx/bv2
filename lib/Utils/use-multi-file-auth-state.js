import { Mutex } from 'async-mutex';
import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { proto } from '../../WAProto/index.js';
import { initAuthCreds } from './auth-utils.js';
import { BufferJSON } from './generics.js';

const fileLocks = new Map();

const getFileLock = (path) => {
    let mutex = fileLocks.get(path);
    if (!mutex) {
        mutex = new Mutex();
        fileLocks.set(path, mutex);
    }
    return mutex;
};

const makeDebouncedSaver = (filePath, getData, logger, delayMs = 500) => {
    let timer = null;
    let pendingFlush = false;

    const flush = async () => {
        pendingFlush = false;
        const mutex = getFileLock(filePath);
        await mutex.acquire().then(async (release) => {
            try {
                await writeFile(filePath, JSON.stringify(getData(), BufferJSON.replacer), { encoding: 'utf-8' });
            } finally {
                release();
            }
        });
    };

    const save = () => {
        if (timer) return;
        timer = setTimeout(async () => {
            timer = null;
            try {
                await flush();
            } catch (err) {
                logger?.error?.({ err }, 'Failed to save credentials');
            }
        }, delayMs);
        pendingFlush = true;
    };

    const onExit = () => {
        if (pendingFlush && timer) {
            clearTimeout(timer);
            try {
                writeFileSync(filePath, JSON.stringify(getData(), BufferJSON.replacer));
            } catch { }
        }
    };

    process.once('exit', onExit);
    const sigHandler = () => { onExit(); process.exit(0); };
    process.once('SIGINT', sigHandler);
    process.once('SIGTERM', sigHandler);

    const destroy = () => {
        process.off('exit', onExit);
        process.off('SIGINT', sigHandler);
        process.off('SIGTERM', sigHandler);
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const flushNow = async () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        pendingFlush = true;
        await flush();
    };

    return { save, flush: flushNow, destroy };
};

export const useMultiFileAuthState = async (folder) => {
    const writeData = async (data, file) => {
        const filePath = join(folder, fixFileName(file));
        const mutex = getFileLock(filePath);
        return mutex.acquire().then(async (release) => {
            try {
                await writeFile(filePath, JSON.stringify(data, BufferJSON.replacer));
            } finally {
                release();
            }
        });
    };

    const readData = async (file) => {
        try {
            const filePath = join(folder, fixFileName(file));
            const mutex = getFileLock(filePath);
            return await mutex.acquire().then(async (release) => {
                try {
                    const data = await readFile(filePath, { encoding: 'utf-8' });
                    return JSON.parse(data, BufferJSON.reviver);
                } finally {
                    release();
                }
            });
        } catch {
            return null;
        }
    };

    const removeData = async (file) => {
        try {
            const filePath = join(folder, fixFileName(file));
            const mutex = getFileLock(filePath);
            return mutex.acquire().then(async (release) => {
                try {
                    await unlink(filePath);
                } catch { }
                finally {
                    release();
                }
            });
        } catch { }
    };

    const folderInfo = await stat(folder).catch(() => { });
    if (folderInfo) {
        if (!folderInfo.isDirectory()) {
            throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`);
        }
    } else {
        await mkdir(folder, { recursive: true });
    }

    const fixFileName = (file) => file?.replace(/\//g, '__')?.replace(/:/g, '-');
    const creds = (await readData('creds.json')) || initAuthCreds();
    const credsPath = join(folder, 'creds.json');
    const debouncer = makeDebouncedSaver(credsPath, () => creds, null, 500);

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}.json`);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const file = `${category}-${id}.json`;
                            tasks.push(value ? writeData(value, file) : removeData(file));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: debouncer.save,
        _flushCreds: debouncer.flush
    };
};
