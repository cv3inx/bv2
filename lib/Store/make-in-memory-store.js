/**
 * Lia@Note 03-02-26 [WIP]
 * Manually converted to ESM and modified by me
 * Originally based on @whiskeysockets/baileys v6.7.16
 * Minor adjustments for compatibility with baileys v7 (⁠つ⁠≧⁠▽⁠≦⁠)⁠つ
 */
import keyedDB from '@adiwajshing/keyed-db';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { WAProto } from '../Types/index.js';
import { LabelAssociationType } from '../Types/LabelAssociation.js';
import { DEFAULT_CONNECTION_CONFIG } from '../Defaults/index.js';
import { md5, toNumber, updateMessageWithReceipt, updateMessageWithReaction } from '../Utils/index.js';
import { jidDecode, jidNormalizedUser } from '../WABinary/index.js';
import { makeOrderedDictionary } from './make-ordered-dictionary.js';
import { ObjectRepository } from './object-repository.js';
export const waChatKey = (pin) => ({
    key: (c) => (pin ? (c.pinned ? '1' : '0') : '') + (c.archived ? '0' : '1') + (c.conversationTimestamp ? c.conversationTimestamp.toString(16).padStart(8, '0') : '') + c.id,
    compare: (k1, k2) => k2.localeCompare(k1)
});
export const waMessageID = (m) => m.key.id || '';
export const waLabelAssociationKey = {
    key: (la) => (la.type === LabelAssociationType.Chat ? la.chatId + la.labelId : la.chatId + la.messageId + la.labelId),
    compare: (k1, k2) => k2.localeCompare(k1)
};
const makeMessagesDictionary = () => makeOrderedDictionary(waMessageID);
const enforceLimits = (messages, groupMetadata, chats, maxChats, maxMessagesPerChat) => {
    if (chats.count() > maxChats) {
        const toRemove = chats.all().slice(0, chats.count() - maxChats);
        for (const chat of toRemove) {
            chats.deleteById(chat.id);
            delete messages[chat.id];
            delete groupMetadata[chat.id];
        }
    }
    for (const jid of Object.keys(messages)) {
        const list = messages[jid];
        if (list.length > maxMessagesPerChat) {
            list.filter(m => false, { limit: list.length - maxMessagesPerChat });
        }
    }
};

export const makeInMemoryStore = (config = {}) => {
    const socket = config.socket;
    const chatKey = config.chatKey || waChatKey(true);
    const labelAssociationKey = config.labelAssociationKey || waLabelAssociationKey;
    const logger = config.logger || DEFAULT_CONNECTION_CONFIG.logger.child({ stream: 'in-mem-store' });
    const maxChats = config.maxChats || 500;
    const maxMessagesPerChat = config.maxMessagesPerChat || 100;
    const KeyedDB = keyedDB?.default ?? keyedDB;
    const chats = new KeyedDB(chatKey, c => c.id);
    const messages = {};
    const messageAccessOrder = new Map();
    const contacts = {};
    const groupMetadata = {};
    const presences = {};
    const state = { connection: 'close' };
    const labels = new ObjectRepository();
    const labelAssociations = new KeyedDB(labelAssociationKey, labelAssociationKey.key);
    const touchJid = (jid) => {
        messageAccessOrder.delete(jid);
        messageAccessOrder.set(jid, Date.now());
        if (messageAccessOrder.size > maxChats * 2) {
            const oldest = messageAccessOrder.keys().next().value;
            if (oldest) {
                messageAccessOrder.delete(oldest);
                delete messages[oldest];
            }
        }
    };
    const assertMessageList = (jid) => {
        if (!messages[jid]) {
            messages[jid] = makeMessagesDictionary();
        }
        touchJid(jid);
        return messages[jid];
    };
    const contactsUpsert = (newContacts) => {
        const oldContacts = new Set(Object.keys(contacts));
        for (const contact of newContacts) {
            oldContacts.delete(contact.id);
            contacts[contact.id] = Object.assign(contacts[contact.id] || {}, contact);
        }
        return oldContacts;
    };
    const labelsUpsert = (newLabels) => {
        for (const label of newLabels) {
            labels.upsertById(label.id, label);
        }
    };
    const bind = (ev) => {
        const handlers = [];
        const on = (event, handler) => { ev.on(event, handler); handlers.push([event, handler]); };
        on('connection.update', update => {
            Object.assign(state, update);
        });
        on('messaging-history.set', ({ chats: newChats, contacts: newContacts, messages: newMessages, isLatest, syncType }) => {
            if (syncType === WAProto.HistorySync.HistorySyncType.ON_DEMAND) {
                return;
            }
            if (isLatest) {
                chats.clear();
                for (const id in messages) {
                    delete messages[id];
                }
                messageAccessOrder.clear();
            }
            const chatsAdded = chats.insertIfAbsent(...newChats).length;
            logger.debug({ chatsAdded }, 'synced chats');
            const oldContacts = contactsUpsert(newContacts);
            if (isLatest) {
                for (const jid of oldContacts) {
                    delete contacts[jid];
                }
            }
            logger.debug({ deletedContacts: isLatest ? oldContacts.size : 0, newContacts }, 'synced contacts');
            for (const msg of newMessages) {
                const jid = msg.key.remoteJidAlt || msg.key.remoteJid;
                const list = assertMessageList(jid);
                list.upsert(msg, 'prepend');
            }
            enforceLimits(messages, groupMetadata, chats, maxChats, maxMessagesPerChat);
            logger.debug({ messages: newMessages.length }, 'synced messages');
        });
        on('contacts.upsert', contacts => {
            contactsUpsert(contacts);
        });
        on('contacts.update', async (updates) => {
            var _a;
            for (const update of updates) {
                let contact;
                if (contacts[update.id]) {
                    contact = contacts[update.id];
                }
                else {
                    const contactHashes = await Promise.all(Object.keys(contacts).map(async (contactId) => {
                        const { user } = jidDecode(contactId);
                        return [contactId, (await md5(Buffer.from(user + 'WA_ADD_NOTIF', 'utf8'))).toString('base64').slice(0, 3)];
                    }));
                    contact = contacts[((_a = contactHashes.find(([, b]) => b === update.id)) === null || _a === void 0 ? void 0 : _a[0]) || ''];
                }
                if (contact) {
                    if (update.imgUrl === 'changed') {
                        contact.imgUrl = socket ? await (socket === null || socket === void 0 ? void 0 : socket.profilePictureUrl(contact.id)) : undefined;
                    }
                    else if (update.imgUrl === 'removed') {
                        delete contact.imgUrl;
                    }
                }
                else {
                    return logger.debug({ update }, 'got update for non-existant contact');
                }
                Object.assign(contacts[contact.id], contact);
            }
        });
        on('chats.upsert', newChats => {
            chats.upsert(...newChats);
            enforceLimits(messages, groupMetadata, chats, maxChats, maxMessagesPerChat);
        });
        on('chats.update', updates => {
            for (let update of updates) {
                const result = chats.update(update.id, chat => {
                    if (update.unreadCount > 0) {
                        update = { ...update };
                        update.unreadCount = (chat.unreadCount || 0) + update.unreadCount;
                    }
                    Object.assign(chat, update);
                });
                if (!result) {
                    logger.debug({ update }, 'got update for non-existant chat');
                }
            }
        });
        on('labels.edit', (label) => {
            if (label.deleted) {
                return labels.deleteById(label.id);
            }
            if (labels.count() < 20) {
                return labels.upsertById(label.id, label);
            }
            logger.error('Labels count exceed');
        });
        on('labels.association', ({ type, association }) => {
            switch (type) {
                case 'add':
                    labelAssociations.upsert(association);
                    break;
                case 'remove':
                    labelAssociations.delete(association);
                    break;
                default:
                    console.error(`unknown operation type [${type}]`);
            }
        });
        on('presence.update', ({ id, presences: update }) => {
            presences[id] = presences[id] || {};
            Object.assign(presences[id], update);
        });
        on('chats.delete', deletions => {
            for (const item of deletions) {
                if (chats.get(item)) {
                    chats.deleteById(item);
                    delete messages[item];
                    delete groupMetadata[item];
                }
            }
        });
        on('messages.upsert', ({ messages: newMessages, type }) => {
            switch (type) {
                case 'append':
                case 'notify':
                    for (const msg of newMessages) {
                        const jid = jidNormalizedUser(msg.key.remoteJidAlt || msg.key.remoteJid);
                        const list = assertMessageList(jid);
                        list.upsert(msg, 'append');
                        enforceLimits(messages, groupMetadata, chats, maxChats, maxMessagesPerChat);
                        if (type === 'notify' && !chats.get(jid)) {
                            ev.emit('chats.upsert', [
                                {
                                    id: jid,
                                    conversationTimestamp: toNumber(msg.messageTimestamp),
                                    unreadCount: 1
                                }
                            ]);
                        }
                    }
                    break;
            }
        });
        on('messages.update', updates => {
            var _a;
            for (const { update, key } of updates) {
                const list = assertMessageList(jidNormalizedUser(key.remoteJid));
                if (update === null || update === void 0 ? void 0 : update.status) {
                    const listStatus = (_a = list.get(key.id)) === null || _a === void 0 ? void 0 : _a.status;
                    if (listStatus && (update === null || update === void 0 ? void 0 : update.status) <= listStatus) {
                        logger.debug({ update, storedStatus: listStatus }, 'status stored newer then update');
                        delete update.status;
                        logger.debug({ update }, 'new update object');
                    }
                }
                const result = list.updateAssign(key.id, update);
                if (!result) {
                    logger.debug({ update }, 'got update for non-existent message');
                }
            }
        });
        on('messages.delete', item => {
            if ('all' in item) {
                const list = messages[item.jid];
                list === null || list === void 0 ? void 0 : list.clear();
            }
            else {
                const jid = item.keys[0].remoteJidAlt || item.keys[0].remoteJid;
                const list = messages[jid];
                if (list) {
                    const idSet = new Set(item.keys.map(k => k.id));
                    list.filter(m => !idSet.has(m.key.id));
                }
            }
        });
        on('groups.update', updates => {
            for (const update of updates) {
                const id = update.id;
                if (groupMetadata[id]) {
                    Object.assign(groupMetadata[id], update);
                }
                else {
                    logger.debug({ update }, 'got update for non-existant group metadata');
                }
            }
        });
        on('group-participants.update', ({ id, participants, action }) => {
            const metadata = groupMetadata[id];
            if (metadata) {
                switch (action) {
                    case 'add':
                        metadata.participants.push(...participants.map(participant => ({ id: participant.id, phoneNumber: participant.phoneNumber, admin: participant.admin })));
                        break;
                    case 'demote':
                    case 'promote':
                        for (const participant of metadata.participants) {
                            for (const participantData of participants) {
                                if (participantData.id === participant.id || participantData.phoneNumber === participant.phoneNumber) {
                                    participant.admin = action === 'promote' && 'admin';
                                }
                            }
                        }
                        break;
                    case 'remove':
                        const removeSet = new Set();
                        for (const p of participants) {
                            if (p.id)
                                removeSet.add(p.id);
                            if (p.phoneNumber)
                                removeSet.add(p.phoneNumber);
                        }
                        metadata.participants = metadata.participants.reduce((acc, p) => {
                            if (!removeSet.has(p.id) && !removeSet.has(p.phoneNumber))
                                acc.push(p);
                            return acc;
                        }, []);
                        break;
                }
            }
        });
        on('message-receipt.update', updates => {
            for (const { key, receipt } of updates) {
                const obj = messages[key.remoteJidAlt || key.remoteJid];
                const msg = obj === null || obj === void 0 ? void 0 : obj.get(key.id);
                if (msg) {
                    updateMessageWithReceipt(msg, receipt);
                }
            }
        });
        on('messages.reaction', (reactions) => {
            for (const { key, reaction } of reactions) {
                const obj = messages[key.remoteJidAlt || key.remoteJid];
                const msg = obj === null || obj === void 0 ? void 0 : obj.get(key.id);
                if (msg) {
                    updateMessageWithReaction(msg, reaction);
                }
            }
        });
        return () => {
            for (const [event, handler] of handlers) {
                ev.off(event, handler);
            }
            handlers.length = 0;
        };
    };
    const toJSON = () => ({
        chats,
        contacts,
        messages,
        labels,
        labelAssociations
    });
    const fromJSON = (json) => {
        chats.upsert(...json.chats);
        labelAssociations.upsert(...json.labelAssociations || []);
        contactsUpsert(Object.values(json.contacts));
        labelsUpsert(Object.values(json.labels || {}));
        for (const jid in json.messages) {
            const list = assertMessageList(jid);
            for (const msg of json.messages[jid]) {
                list.upsert(WAProto.WebMessageInfo.fromObject(msg), 'append');
            }
        }
    };
    return {
        chats,
        contacts,
        messages,
        groupMetadata,
        state,
        presences,
        labels,
        labelAssociations,
        bind,
        /** loads messages from the store, if not found -- uses the legacy connection */
        loadMessages: async (jid, count, cursor) => {
            const list = assertMessageList(jid);
            const mode = !cursor || 'before' in cursor ? 'before' : 'after';
            const cursorKey = !!cursor ? ('before' in cursor ? cursor.before : cursor.after) : undefined;
            const cursorValue = cursorKey ? list.get(cursorKey.id) : undefined;
            let messages;
            if (list && mode === 'before' && (!cursorKey || cursorValue)) {
                if (cursorValue) {
                    const msgIdx = list.array.findIndex(m => m.key.id === (cursorKey === null || cursorKey === void 0 ? void 0 : cursorKey.id));
                    messages = list.array.slice(0, msgIdx);
                }
                else {
                    messages = list.array;
                }
                const diff = count - messages.length;
                if (diff < 0) {
                    messages = messages.slice(-count); // get the last X messages
                }
            }
            else {
                messages = [];
            }
            return messages;
        },
        /**
         * Get all available labels for profile
         *
         * Keep in mind that the list is formed from predefined tags and tags
         * that were "caught" during their editing.
         */
        getLabels: () => {
            return labels;
        },
        /**
         * Get labels for chat
         *
         * @returns Label IDs
         **/
        getChatLabels: (chatId) => {
            return labelAssociations.filter((la) => la.chatId === chatId).all();
        },
        /**
         * Get labels for message
         *
         * @returns Label IDs
         **/
        getMessageLabels: (messageId) => {
            const associations = labelAssociations
                .filter((la) => la.messageId === messageId)
                .all();
            return associations.map(({ labelId }) => labelId);
        },
        loadMessage: async (jid, id) => { var _a; return (_a = messages[jid]) === null || _a === void 0 ? void 0 : _a.get(id); },
        mostRecentMessage: async (jid) => {
            var _a;
            const message = (_a = messages[jid]) === null || _a === void 0 ? void 0 : _a.array.slice(-1)[0];
            return message;
        },
        fetchImageUrl: async (jid, sock) => {
            const contact = contacts[jid];
            if (!contact) {
                return sock === null || sock === void 0 ? void 0 : sock.profilePictureUrl(jid);
            }
            if (typeof contact.imgUrl === 'undefined') {
                contact.imgUrl = await (sock === null || sock === void 0 ? void 0 : sock.profilePictureUrl(jid));
            }
            return contact.imgUrl;
        },
        fetchGroupMetadata: async (jid, sock) => {
            if (!groupMetadata[jid]) {
                const metadata = await (sock === null || sock === void 0 ? void 0 : sock.groupMetadata(jid));
                if (metadata) {
                    groupMetadata[jid] = metadata;
                }
            }
            return groupMetadata[jid];
        },
        fetchMessageReceipts: async ({ remoteJid, id }) => {
            const list = messages[remoteJid];
            const msg = list === null || list === void 0 ? void 0 : list.get(id);
            return msg === null || msg === void 0 ? void 0 : msg.userReceipt;
        },
        toJSON,
        fromJSON,
        writeToFile: (path) => {
            writeFileSync(path, JSON.stringify(toJSON()));
        },
        readFromFile: (path) => {
            if (existsSync(path)) {
                logger.debug({ path }, 'reading from file');
                const jsonStr = readFileSync(path, { encoding: 'utf-8' });
                const json = JSON.parse(jsonStr);
                fromJSON(json);
            }
        }
    };
};
//# sourceMappingURL=make-in-memory-store.js.map