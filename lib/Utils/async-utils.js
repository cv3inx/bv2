let yieldCounter = 0;
export const yieldEvery = async (n = 50) => {
    if (++yieldCounter % n === 0) {
        await new Promise(r => setImmediate(r));
    }
};
export const resetYieldCounter = () => { yieldCounter = 0; };
