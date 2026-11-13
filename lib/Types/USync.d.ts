import type { BinaryNode } from '../WABinary/types.js';
import type { USyncUser } from '../WAUSync/USyncUser.js';
export interface USyncProtocol {
    name: string;
    getQueryElement(): BinaryNode;
    getUserElement(user: USyncUser): BinaryNode | null;
    parser(node: BinaryNode): unknown;
}
export type USyncQueryResult = NonNullable<ReturnType<import('../WAUSync/USyncQuery.js').USyncQuery['parseUSyncQueryResult']>>;
