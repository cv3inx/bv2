import type { BinaryNode } from '../WABinary/index.js';
export declare const IGNORE_KEY_KINDS: readonly ['message', 'receipt', 'notification', 'presence', 'chatstate', 'call'];
export type WaIgnoreKeyKind = (typeof IGNORE_KEY_KINDS)[number];
export type WaIgnoreKeyContext = {
    /** Stanza tag. */
    kind: WaIgnoreKeyKind;
    /** Deviceless chat JID; userless `from` values are kept verbatim. */
    remoteJid: string | null;
    /** Resolved against the account's own PN and LID. */
    fromMe: boolean;
    /** Stanza id. */
    id: string | undefined;
    /** Author in groups / broadcasts; `null` otherwise. */
    participant: string | null;
};
export type WaIgnoreKey = {
    /** Chat JID; array entries OR. Alt `sender_pn` / `sender_lid` attrs are matched too. */
    remoteJid?: string | readonly string[];
    /** Whether the stanza was sent by this account. */
    fromMe?: boolean;
    /** Stanza id. */
    id?: string;
    /** Author in groups / broadcasts. Alt forms are matched too. */
    participant?: string;
    /** Restrict to specific tags. Default: all six. */
    only?: readonly WaIgnoreKeyKind[];
};
export type WaIgnoreKeyPredicate = (ctx: WaIgnoreKeyContext) => boolean;
export type WaIgnoreKeyInput = WaIgnoreKey | WaIgnoreKeyPredicate;
export type WaIgnoreKeyEntry = {
    remoteJid?: string[];
    participant?: string;
    fromMe?: boolean;
    id?: string;
    only?: readonly WaIgnoreKeyKind[];
    predicate?: WaIgnoreKeyPredicate;
};
export declare const isIgnorableKind: (tag: string) => boolean;
export declare const normalizeIgnoreKey: (input: WaIgnoreKeyInput) => WaIgnoreKeyEntry;
export declare const buildIgnoreContext: (node: BinaryNode, meId?: string, meLid?: string) => WaIgnoreKeyContext;
export declare const matchesIgnoreKey: (entry: WaIgnoreKeyEntry, ctx: WaIgnoreKeyContext, node: BinaryNode) => boolean;
export declare const ignoredStanzaNeedsAck: (tag: string) => boolean;
export declare const makeIgnoreKeyRegistry: (deps: {
    getMeId: () => string | undefined;
    getMeLid: () => string | undefined;
    logger?: any;
}) => {
    register: (input: WaIgnoreKeyInput) => () => void;
    shouldDrop: (node: BinaryNode) => boolean;
    readonly size: number;
};
