import type { proto } from '../../WAProto/index.js';
import type { Contact } from './Contact.js';

export type KeyPair = { public: Uint8Array; private: Uint8Array };
export type SignedKeyPair = { keyPair: KeyPair; signature: Uint8Array; keyId: number };
export type SignalIdentity = { identifier: { name: string; deviceId: number }; identifierKey: Uint8Array };
export interface AuthenticationCreds {
    noiseKey: KeyPair;
    pairingEphemeralKeyPair: KeyPair;
    signedIdentityKey: KeyPair;
    signedPreKey: SignedKeyPair;
    registrationId: number;
    advSecretKey: string;
    processedHistoryMessages: { key: proto.IMessageKey; messageTimestamp: number | Long }[];
    nextPreKeyId: number;
    firstUnuploadedPreKeyId: number;
    accountSyncCounter: number;
    accountSettings: { unarchiveChats: boolean; defaultDisappearingMode?: proto.IDisappearingMode };
    registered: boolean;
    me?: Contact;
    account?: proto.IADVSignedDeviceIdentity;
    signalIdentities?: SignalIdentity[];
    pairingCode?: string;
    lastPropHash?: string;
    routingInfo?: Uint8Array;
    platform?: string;
    lastAccountSyncTimestamp?: number;
    myAppStateKeyId?: string;
    additionalData?: unknown;
}
export interface SignalDataTypeMap {
    'pre-key': KeyPair;
    session: Uint8Array;
    'sender-key': Uint8Array;
    'sender-key-memory': Record<string, boolean>;
    'app-state-sync-key': proto.Message.IAppStateSyncKeyData;
    'app-state-sync-version': { version: number; hash: Uint8Array; indexValueMap: Record<string, { valueMac: Uint8Array }> };
    'identity-key': Uint8Array;
    'lid-mapping': string;
    'device-list': string[];
    tctoken: { token?: Uint8Array; timestamp?: number | string; senderTimestamp?: number };
}
export type SignalDataSet = {
    [T in keyof SignalDataTypeMap]?: Record<string, SignalDataTypeMap[T] | null>;
};
export type Awaitable<T> = T | Promise<T>;
export interface SignalKeyStore {
    get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]): Awaitable<Record<string, SignalDataTypeMap[T] | null | undefined>>;
    set(data: SignalDataSet): Awaitable<void>;
    clear?(): Awaitable<void>;
    flush?(): Awaitable<void>;
}
export type SignalKeyStoreWithTransaction = SignalKeyStore & {
    isInTransaction(): boolean;
    transaction<T>(work: () => Promise<T>, key: string): Promise<T>;
    flush(): Promise<void>;
};
export type AuthenticationState = { creds: AuthenticationCreds; keys: SignalKeyStore };
export type TransactionCapabilityOptions = { maxCommitRetries: number; delayBetweenTriesMs: number };
import type Long from 'long';
