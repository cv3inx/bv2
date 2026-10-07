import type { makeLibSignalRepository } from '../Signal/libsignal.js';
export type SignalRepository = ReturnType<typeof makeLibSignalRepository>;
export type SignalAuthState = import('./Auth.js').AuthenticationState;
export type E2ESession = {
    jid: string;
    registrationId: number;
    identityKey: Uint8Array;
    signedPreKey: { keyId: number; publicKey: Uint8Array; signature: Uint8Array };
    preKey?: { keyId: number; publicKey: Uint8Array };
};
