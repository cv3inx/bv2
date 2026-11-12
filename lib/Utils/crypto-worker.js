import { parentPort } from 'worker_threads';

parentPort.on('message', async ({ id, task }) => {
    try {
        let result;
        switch (task.type) {
            case 'jsonParse':
                result = JSON.parse(task.payload);
                break;
            case 'jsonStringify':
                result = JSON.stringify(task.payload, task.replacer || null);
                break;
            default:
                throw new Error(`Unknown task type: ${task.type}`);
        }
        parentPort.postMessage({ id, result });
    } catch (e) {
        parentPort.postMessage({ id, error: e.message });
    }
});
