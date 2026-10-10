import { areJidsSameUser, jidDecode, jidEncode } from '../WABinary/index.js';
/**
 * Stanza tags a filter may drop. Stream control, `iq` replies and the auth-critical
 * `success` / `failure` tags are deliberately absent so the connection flow stays intact.
 */
export const IGNORE_KEY_KINDS = ['message', 'receipt', 'notification', 'presence', 'chatstate', 'call'];
const IGNORE_KEY_KIND_SET = new Set(IGNORE_KEY_KINDS);
/**
 * Kinds the server re-delivers until acked. Dropping one without an ack makes the server
 * retry it forever, so the filter acks on the handler's behalf. Presence and chat-state are
 * fire-and-forget and must not be acked.
 */
const ACKED_KINDS = new Set(['message', 'receipt', 'notification', 'call']);
/**
 * A JID arrives in whichever namespace the sender used, and the alt attributes carry the other
 * form. Matching every one of these lets a filter written with a phone number also catch the
 * LID-addressed copy of the same stanza (and vice versa).
 */
const REMOTE_JID_ATTRS = ['from', 'sender_pn', 'sender_lid'];
const PARTICIPANT_ATTRS = ['participant', 'participant_pn', 'participant_lid'];
const DESCRIPTOR_FIELDS = ['remoteJid', 'fromMe', 'id', 'participant'];
/** Deviceless user-form JID. Userless values (e.g. `s.whatsapp.net`) are kept verbatim. */
const stripDevice = (jid) => {
    if (!jid) {
        return null;
    }
    const decoded = jidDecode(jid);
    if (!decoded?.user) {
        return jid;
    }
    return jidEncode(decoded.user, decoded.server);
};
/**
 * Compares deviceless JIDs as whole strings rather than by user part. `areJidsSameUser` ignores
 * the server, so it reports `5551234@s.whatsapp.net` and `5551234@lid` as the same user — two
 * unrelated accounts that would then share a filter. Server equality is required here; the
 * PN/LID crossover is handled by the alt attributes instead.
 */
const sameJid = (a, b) => {
    if (!a || !b) {
        return false;
    }
    return stripDevice(a) === stripDevice(b);
};
export const isIgnorableKind = (tag) => IGNORE_KEY_KIND_SET.has(tag);
/** Validates a descriptor or predicate and freezes it into an internal entry. */
export const normalizeIgnoreKey = (input) => {
    if (typeof input === 'function') {
        return { predicate: input };
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('ignoreKey expects a descriptor object or a predicate function');
    }
    if (!DESCRIPTOR_FIELDS.some(field => input[field] !== undefined)) {
        throw new Error('ignoreKey descriptor needs at least one of remoteJid, fromMe, id, participant');
    }
    const entry = {};
    if (input.remoteJid !== undefined) {
        const jids = (Array.isArray(input.remoteJid) ? input.remoteJid : [input.remoteJid]).filter(Boolean);
        if (!jids.length) {
            throw new Error('ignoreKey remoteJid cannot be empty');
        }
        entry.remoteJid = jids;
    }
    if (input.participant !== undefined) {
        if (typeof input.participant !== 'string' || !input.participant) {
            throw new Error('ignoreKey participant must be a non-empty jid');
        }
        entry.participant = input.participant;
    }
    if (input.fromMe !== undefined) {
        entry.fromMe = !!input.fromMe;
    }
    if (input.id !== undefined) {
        if (typeof input.id !== 'string' || !input.id) {
            throw new Error('ignoreKey id must be a non-empty string');
        }
        entry.id = input.id;
    }
    if (input.only !== undefined) {
        const only = Array.isArray(input.only) ? input.only : [input.only];
        if (!only.length) {
            throw new Error('ignoreKey only cannot be empty');
        }
        const unknown = only.filter(kind => !IGNORE_KEY_KIND_SET.has(kind));
        if (unknown.length) {
            throw new Error(`ignoreKey only has unknown kinds: ${unknown.join(', ')}`);
        }
        entry.only = only;
    }
    return entry;
};
/**
 * Parses the wire node into the shape filters match on, so a predicate never has to walk a
 * BinaryNode. `remoteJid` and `participant` are device-stripped to line up with the
 * `event.key.remoteJid` a handler would see.
 */
export const buildIgnoreContext = (node, meId, meLid) => {
    const attrs = node.attrs || {};
    const author = attrs.participant || attrs.participant_pn || attrs.participant_lid || attrs.from;
    const fromMe = !!author && ((!!meId && areJidsSameUser(author, meId)) || (!!meLid && areJidsSameUser(author, meLid)));
    return {
        kind: node.tag,
        remoteJid: stripDevice(attrs.from),
        fromMe,
        id: attrs.id,
        participant: stripDevice(attrs.participant || attrs.participant_pn || attrs.participant_lid)
    };
};
export const matchesIgnoreKey = (entry, ctx, node) => {
    if (entry.predicate) {
        return !!entry.predicate(ctx);
    }
    if (entry.only && !entry.only.includes(ctx.kind)) {
        return false;
    }
    if (entry.id !== undefined && entry.id !== ctx.id) {
        return false;
    }
    if (entry.fromMe !== undefined && entry.fromMe !== ctx.fromMe) {
        return false;
    }
    const attrs = node.attrs || {};
    if (entry.remoteJid && !entry.remoteJid.some(wanted => REMOTE_JID_ATTRS.some(attr => sameJid(attrs[attr], wanted)))) {
        return false;
    }
    if (entry.participant && !PARTICIPANT_ATTRS.some(attr => sameJid(attrs[attr], entry.participant))) {
        return false;
    }
    return true;
};
export const ignoredStanzaNeedsAck = (tag) => ACKED_KINDS.has(tag);
/**
 * Holds the registered filters and answers the one question the socket asks per stanza.
 *
 * `category='peer'` traffic from this account's own devices is never dropped: those stanzas
 * carry app-state key shares, history sync and PDO responses between the account's devices, so
 * the common `{ fromMe: true }` filter would otherwise swallow the app-state key share and leave
 * the collections blocked on a key they re-request on every sync. The exemption only applies
 * when the sender really is this account — resolved against both `meJid` and `meLid` — so a
 * foreign stanza cannot dodge a filter by stamping the attribute.
 */
export const makeIgnoreKeyRegistry = ({ getMeId, getMeLid, logger }) => {
    const entries = new Set();
    const register = (input) => {
        const entry = normalizeIgnoreKey(input);
        entries.add(entry);
        return () => {
            entries.delete(entry);
        };
    };
    const shouldDrop = (node) => {
        if (!entries.size || !isIgnorableKind(node.tag)) {
            return false;
        }
        const ctx = buildIgnoreContext(node, getMeId(), getMeLid());
        if (ctx.fromMe && node.attrs?.category === 'peer') {
            return false;
        }
        for (const entry of entries) {
            try {
                if (matchesIgnoreKey(entry, ctx, node)) {
                    return true;
                }
            }
            catch (err) {
                // A throwing predicate must not take the stanza with it; the stanza stays.
                logger?.error({ err, kind: ctx.kind, id: ctx.id }, 'ignoreKey filter threw, keeping stanza');
            }
        }
        return false;
    };
    return { register, shouldDrop, get size() { return entries.size; } };
};
