export function decodeDecryptedMsmsgMessage(decrypted: Uint8Array | Buffer): any;
export function decryptMsmsgBotMessage(messageSecret: Uint8Array | Buffer | string, messageKey: {
    participant: string;
    meId: string;
    meLid?: string;
    botEditTargetId?: string | null;
    metaTargetId?: string | null;
    stanzaId?: string;
}, msMsg: {
    encIv: Uint8Array | Buffer;
    encPayload: Uint8Array | Buffer;
}): Promise<Buffer>;
