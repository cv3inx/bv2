import type { AuthenticationCreds, Awaitable } from './Auth.js';
import type { Contact } from './Contact.js';
import type { GroupMetadata, GroupParticipant, ParticipantAction } from './GroupMetadata.js';
import type { ConnectionState } from './Socket.js';
import type { WAMessage, WAMessageKey, WAMessageUpdate, MessageUpsertType } from './Message.js';
import type { WACallEvent } from './Call.js';
export interface BaileysEventMap {
    'connection.update': Partial<ConnectionState>;
    'creds.update': Partial<AuthenticationCreds>;
    'messages.upsert': { messages: WAMessage[]; type: MessageUpsertType; requestId?: string };
    'messages.update': WAMessageUpdate[];
    'messages.delete': { keys: WAMessageKey[] } | { jid: string; all: true };
    'messages.reaction': { key: WAMessageKey; reaction: import('../../WAProto/index.js').proto.IReaction }[];
    'messaging-history.set': { chats: Chat[]; contacts: Contact[]; messages: WAMessage[]; isLatest?: boolean; progress?: number; syncType?: number };
    'contacts.upsert': Contact[];
    'contacts.update': Partial<Contact>[];
    'chats.upsert': Chat[];
    'chats.update': Partial<Chat>[];
    'chats.delete': string[];
    'groups.upsert': GroupMetadata[];
    'groups.update': Partial<GroupMetadata>[];
    'group-participants.update': { id: string; author?: string; participants: GroupParticipant[]; action: ParticipantAction };
    'blocklist.set': { blocklist: string[] };
    'blocklist.update': { blocklist: string[]; type: 'add' | 'remove' };
    call: WACallEvent[];
    /** Protocol extension events retain the existing permissive payload contract. */
    [event: string]: any;
}
export interface BaileysEventEmitter {
    on<T extends keyof BaileysEventMap>(event: T, listener: (value: BaileysEventMap[T]) => void): void;
    off<T extends keyof BaileysEventMap>(event: T, listener: (value: BaileysEventMap[T]) => void): void;
    emit<T extends keyof BaileysEventMap>(event: T, value: BaileysEventMap[T]): boolean;
    process(handler: (events: Partial<BaileysEventMap>) => Awaitable<void>): () => void;
    removeAllListeners(event?: keyof BaileysEventMap): void;
    isBuffering(): boolean;
    buffer(): void;
    flush(force?: boolean): boolean;
    createBufferedFunction<A extends unknown[], R>(work: (...args: A) => Promise<R>): (...args: A) => Promise<R>;
    destroy(): void;
}
import type { Chat } from './Chat.js';
