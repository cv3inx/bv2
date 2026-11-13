import makeWASocket, {
    initAuthCreds, useMultiFileAuthState, fetchLatestWaWebVersion,
    type AuthenticationState, type AuthenticationCreds, type WASocket,
    type WAMessage, type WAMessageKey, type SocketConfig, type Contact,
    type GroupMetadata, type WACallEvent, type SignalRepository,
    type Product, type BusinessProfile, type USyncProtocol, type BinaryNode,
    type SignalDataSet, type BaileysEventMap, type BaileysEventEmitter
} from '../../lib/index.js';

const key: WAMessageKey = { remoteJid: '123@lid', id: 'message-id' };
const message: WAMessage = { key, message: { conversation: 'hello' } };
const contact: Contact = { id: '123@lid', phoneNumber: '123@s.whatsapp.net' };
const group: GroupMetadata = { id: '123@g.us', subject: 'Group', participants: [contact] };
const binaryNode: BinaryNode = { tag: 'iq', attrs: { type: 'get' }, content: [] };
const data: SignalDataSet = { session: { alice: Buffer.from('session') }, 'pre-key': { '1': null } };
const auth: AuthenticationState = {
    creds: initAuthCreds(),
    keys: { get: () => ({}), set: async () => {} }
};
const config: SocketConfig = { auth, version: async () => [2, 3000, 1], getMessage: async () => message.message ?? undefined };
const sock: WASocket = makeWASocket(config);
makeWASocket({ auth, version: async () => (await fetchLatestWaWebVersion()).version });
const pairingCode: Promise<string> = sock.requestPairingCode('123456789');
void pairingCode;
makeWASocket({
    auth, qrTimeout: 60_000, printQRInTerminal: false,
    patchMessageBeforeSending: (message, recipients) => {
        void recipients;
        return message;
    }
});
sock.ev.on('presence.update', ({ id, presences }) => { void [id, presences]; });
sock.ev.on('messages.upsert', ({ messages, type }) => {
    const first: WAMessage | undefined = messages[0];
    const upsertType: 'append' | 'notify' = type;
    void [first, upsertType];
});
sock.ev.on('creds.update', update => {
    const registered: boolean | undefined = update.registered;
    void registered;
});
sock.ev.process(async events => { void events['connection.update']?.connection; });

// Core declarations reject invalid consumers rather than merely hiding errors with `any`.
// @ts-expect-error authentication state must provide keys
const invalidAuth: AuthenticationState = { creds: initAuthCreds() };
// @ts-expect-error message keys are required
const invalidMessage: WAMessage = { message: { conversation: 'missing key' } };
// @ts-expect-error session data is binary
const invalidSession: SignalDataSet = { session: { alice: 'not bytes' } };
// @ts-expect-error a message upsert requires its messages
sock.ev.emit('messages.upsert', { type: 'notify' });
const { saveCreds, _flushCreds } = await useMultiFileAuthState('typecheck-only-never-executed');
const saveResult: void = saveCreds();
const flushResult: Promise<void> = _flushCreds();
void [key, group, binaryNode, data, saveResult, flushResult, invalidAuth, invalidMessage, invalidSession];
export type PublicTypes = AuthenticationCreds | WACallEvent | SignalRepository | Product |
    BusinessProfile | USyncProtocol | BaileysEventMap | BaileysEventEmitter;
