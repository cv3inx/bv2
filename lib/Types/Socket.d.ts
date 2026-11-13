import type makeWASocket from '../Socket/index.js';
import type { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index.js';
import type { AuthenticationState, Awaitable } from './Auth.js';
import type { GroupMetadata } from './GroupMetadata.js';
import type { WAMessageContent, WAMessageKey } from './Message.js';
export type WAVersion = [number, number, number];
export type WABrowserDescription = [string, string, string];
export type SocketConfig = Omit<Partial<typeof DEFAULT_CONNECTION_CONFIG>,
    'auth' | 'version' | 'getMessage' | 'cachedGroupMetadata' | 'shouldIgnoreJid' | 'customUploadHosts' | 'patchMessageBeforeSending'> & {
    auth: AuthenticationState;
    version?: WAVersion | (() => Awaitable<WAVersion>);
    getMessage?: (key: WAMessageKey) => Promise<WAMessageContent | undefined>;
    cachedGroupMetadata?: (jid: string) => Promise<GroupMetadata | undefined>;
    shouldIgnoreJid?: (jid: string) => boolean;
    customUploadHosts?: { hostname: string; maxContentLengthBytes?: number }[];
    patchMessageBeforeSending?: (message: WAMessageContent, recipientJids?: string[]) => Awaitable<
        WAMessageContent | { recipientJid: string; message: WAMessageContent }[]
    >;
    /** Preserve socket extensions that are not part of the default config. */
    [option: string]: unknown;
};
export type UserFacingSocketConfig = SocketConfig;
export type WASocket = ReturnType<typeof makeWASocket>;
export interface ConnectionState {
    connection: 'open' | 'connecting' | 'close';
    lastDisconnect?: { error?: Error; date: Date };
    qr?: string;
    receivedPendingNotifications?: boolean;
    isNewLogin?: boolean;
    isOnline?: boolean;
    passkeyRequired?: boolean;
    pairingCodeExpired?: boolean;
}
