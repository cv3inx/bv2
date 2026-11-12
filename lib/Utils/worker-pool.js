import { Worker, isMainThread } from 'worker_threads';
import { cpus } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const POOL_SIZE = Math.max(2, Math.floor((cpus().length || 4) / 2));
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class WorkerPool {
    #workers = [];
    #queue = [];
    #busy = new WeakSet();
    #nextId = 1;
    #destroyed = false;

    constructor(workerPath, size = POOL_SIZE) {
        for (let i = 0; i < size; i++) {
            const w = new Worker(workerPath);
            w.on('message', ({ id, result, error }) => {
                const entry = this.#queue.find(q => q.id === id);
                if (!entry) return;
                this.#queue = this.#queue.filter(q => q.id !== id);
                this.#busy.delete(w);
                if (error) entry.reject(new Error(error));
                else entry.resolve(result);
                this.#drain();
            });
            w.on('error', (err) => {
                this.#queue.forEach(q => q.reject(err));
                this.#queue = [];
            });
            this.#workers.push(w);
        }
    }

    run(task) {
        if (this.#destroyed) throw new Error('WorkerPool destroyed');
        return new Promise((resolve, reject) => {
            const id = this.#nextId++;
            this.#queue.push({ id, task, resolve, reject });
            this.#drain();
        });
    }

    #drain() {
        const available = this.#workers.find(w => !this.#busy.has(w));
        const next = this.#queue.find(q => !q.started);
        if (!available || !next) return;
        next.started = true;
        this.#busy.add(available);
        available.postMessage({ id: next.id, task: next.task });
    }

    destroy() {
        this.#destroyed = true;
        this.#queue = [];
        for (const w of this.#workers) {
            try { w.terminate(); } catch { }
        }
        this.#workers = [];
    }
}

let defaultPool = null;
export const getCryptoPool = () => {
    if (!defaultPool) {
        defaultPool = new WorkerPool(join(__dirname, 'crypto-worker.js'));
    }
    return defaultPool;
};

export { WorkerPool, POOL_SIZE };
