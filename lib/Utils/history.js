import { pipeline } from 'stream/promises';
import { promisify } from 'util';
import { createInflate, inflate } from 'zlib';
import $protobuf from 'protobufjs/minimal.js';
import { proto } from '../../WAProto/index.js';
import { WAMessageStubType } from '../Types/index.js';
import { isHostedLidUser, isHostedPnUser, isLidUser, isPnUser } from '../WABinary/index.js';
import { toNumber } from './generics.js';
import { normalizeMessageContent } from './messages.js';
import { downloadContentFromMessage } from './messages-media.js';
const inflatePromise = promisify(inflate);
const extractPnFromMessages = (messages) => {
    for (const msgItem of messages) {
        const message = msgItem.message;
        // Only extract from outgoing messages (fromMe: true) in 1:1 chats
        // because userReceipt.userJid is the recipient's JID
        if (!message?.key?.fromMe || !message.userReceipt?.length) {
            continue;
        }
        const userJid = message.userReceipt[0]?.userJid;
        if (userJid && (isPnUser(userJid) || isHostedPnUser(userJid))) {
            return userJid;
        }
    }
    return undefined;
};
const HISTORY_SYNC_CONVERSATIONS_FIELD = 2;
const WIRE_TYPE_LENGTH_DELIMITED = 2;
/**
 * Decodes a HistorySync one conversation at a time. `proto.HistorySync.decode` materializes
 * the whole tree, so for a large chunk every message of every chat is alive at once; walking
 * the top-level fields instead lets each conversation be reduced and dropped before the next
 * one is decoded. Non-conversation fields are copied raw and decoded together at the end.
 */
export const decodeHistorySyncStreaming = (buffer, onConversation) => {
    const reader = $protobuf.Reader.create(buffer);
    const rest = [];
    while (reader.pos < reader.len) {
        const start = reader.pos;
        const tag = reader.uint32();
        if (tag >>> 3 === HISTORY_SYNC_CONVERSATIONS_FIELD && (tag & 7) === WIRE_TYPE_LENGTH_DELIMITED) {
            onConversation(proto.Conversation.decode(reader, reader.uint32()));
        }
        else {
            reader.skipType(tag & 7);
            rest.push(buffer.subarray(start, reader.pos));
        }
    }
    return proto.HistorySync.decode(rest.length === 1 ? rest[0] : Buffer.concat(rest));
};
const inflateHistoryStream = async (msg, options) => {
    const stream = await downloadContentFromMessage(msg, 'md-msg-hist', { options });
    // Pipe decrypted stream directly through zlib inflate
    // This avoids allocating an intermediate buffer for the compressed data
    const inflater = createInflate();
    const chunks = [];
    inflater.on('data', (chunk) => chunks.push(chunk));
    await pipeline(stream, inflater);
    return Buffer.concat(chunks);
};
export const downloadHistory = async (msg, options) => {
    return proto.HistorySync.decode(await inflateHistoryStream(msg, options));
};
const createHistoryAccumulator = (logger) => {
    const messages = [];
    const contacts = [];
    const chats = [];
    const convLidPnMappings = [];
    const addConversation = (chat) => {
        contacts.push({
            id: chat.id,
            name: chat.displayName || chat.name || chat.username || undefined,
            username: chat.username || undefined,
            lid: chat.lidJid || chat.accountLid || undefined,
            phoneNumber: chat.pnJid || undefined
        });
        const chatId = chat.id;
        const isLid = isLidUser(chatId) || isHostedLidUser(chatId);
        const isPn = isPnUser(chatId) || isHostedPnUser(chatId);
        if (isLid && chat.pnJid) {
            convLidPnMappings.push({ lid: chatId, pn: chat.pnJid });
        }
        else if (isPn && chat.lidJid) {
            convLidPnMappings.push({ lid: chat.lidJid, pn: chatId });
        }
        else if (isLid && !chat.pnJid) {
            // Fallback: extract PN from userReceipt in messages when pnJid is missing
            const pnFromReceipt = extractPnFromMessages(chat.messages || []);
            if (pnFromReceipt) {
                convLidPnMappings.push({ lid: chatId, pn: pnFromReceipt });
            }
        }
        const msgs = chat.messages || [];
        delete chat.messages;
        for (const item of msgs) {
            const message = item.message;
            messages.push(message);
            if (!chat.messages?.length) {
                // keep only the most recent message in the chat array
                chat.messages = [{ message }];
            }
            if (!message.key.fromMe && !chat.lastMessageRecvTimestamp) {
                chat.lastMessageRecvTimestamp = toNumber(message.messageTimestamp);
            }
            if ((message.messageStubType === WAMessageStubType.BIZ_PRIVACY_MODE_TO_BSP ||
                message.messageStubType === WAMessageStubType.BIZ_PRIVACY_MODE_TO_FB) &&
                message.messageStubParameters?.[0]) {
                contacts.push({
                    id: message.participant || message.key.participant || message.key.remoteJid,
                    verifiedName: message.messageStubParameters?.[0]
                });
            }
        }
        chats.push(chat);
    };
    const finish = (item) => {
        logger?.trace({ progress: item.progress }, 'processing history of type ' + item.syncType?.toString());
        // Extract LID-PN mappings for all sync types
        const lidPnMappings = [];
        for (const m of item.phoneNumberToLidMappings || []) {
            if (m.lidJid && m.pnJid) {
                lidPnMappings.push({ lid: m.lidJid, pn: m.pnJid });
            }
        }
        switch (item.syncType) {
            case proto.HistorySync.HistorySyncType.INITIAL_BOOTSTRAP:
            case proto.HistorySync.HistorySyncType.RECENT:
            case proto.HistorySync.HistorySyncType.FULL:
            case proto.HistorySync.HistorySyncType.ON_DEMAND:
                for (const chat of item.conversations || []) {
                    addConversation(chat);
                }
                break;
            case proto.HistorySync.HistorySyncType.PUSH_NAME:
                for (const c of item.pushnames || []) {
                    contacts.push({ id: c.id, notify: c.pushname });
                }
                break;
        }
        return {
            chats,
            contacts,
            messages,
            lidPnMappings: [...lidPnMappings, ...convLidPnMappings],
            pastParticipants: item.pastParticipants,
            syncType: item.syncType,
            progress: item.progress
        };
    };
    return { addConversation, finish };
};
export const processHistoryMessage = (item, logger) => createHistoryAccumulator(logger).finish(item);
const HISTORY_SYNC_TYPE_FIELD = 1;
const CONVERSATION_SYNC_TYPES = new Set([
    proto.HistorySync.HistorySyncType.INITIAL_BOOTSTRAP,
    proto.HistorySync.HistorySyncType.RECENT,
    proto.HistorySync.HistorySyncType.FULL,
    proto.HistorySync.HistorySyncType.ON_DEMAND
]);
/** Reads only the `syncType` varint, skipping every other field without decoding it. */
const peekHistorySyncType = (buffer) => {
    const reader = $protobuf.Reader.create(buffer);
    while (reader.pos < reader.len) {
        const tag = reader.uint32();
        if (tag >>> 3 === HISTORY_SYNC_TYPE_FIELD && (tag & 7) === 0) {
            return reader.int32();
        }
        reader.skipType(tag & 7);
    }
    return undefined;
};
export const downloadAndProcessHistorySyncNotification = async (msg, options, logger) => {
    const buffer = msg.initialHistBootstrapInlinePayload
        ? await inflatePromise(msg.initialHistBootstrapInlinePayload)
        : await inflateHistoryStream(msg, options);
    const acc = createHistoryAccumulator(logger);
    // conversations are reduced as they are decoded, only for the sync types that carry chats
    // (same gate as processHistoryMessage); `rest` holds every other field
    const wantsConversations = CONVERSATION_SYNC_TYPES.has(peekHistorySyncType(buffer));
    const rest = decodeHistorySyncStreaming(buffer, wantsConversations ? acc.addConversation : () => { });
    return acc.finish(rest);
};
export const getHistoryMsg = (message) => {
    const normalizedContent = !!message ? normalizeMessageContent(message) : undefined;
    const anyHistoryMsg = normalizedContent?.protocolMessage?.historySyncNotification;
    return anyHistoryMsg;
};
//# sourceMappingURL=history.js.map