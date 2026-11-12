export class SessionMessageQueue {
    #queue = [];
    #processing = false;
    #concurrency;

    constructor(concurrency = 5) {
        this.#concurrency = concurrency;
    }

    push(asyncFn) {
        return new Promise((resolve, reject) => {
            this.#queue.push({ fn: asyncFn, resolve, reject });
            this.#tick();
        });
    }

    async #tick() {
        if (this.#processing) return;
        this.#processing = true;
        while (this.#queue.length > 0) {
            const batch = this.#queue.splice(0, this.#concurrency);
            await Promise.allSettled(
                batch.map(({ fn, resolve, reject }) =>
                    fn().then(resolve).catch(reject)
                )
            );
        }
        this.#processing = false;
    }

    get size() { return this.#queue.length; }
    clear() { this.#queue = []; this.#processing = false; }
}
