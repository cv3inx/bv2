// Anti force-close guard: detects payloads that crash WhatsApp clients — combining/invisible
// char floods, mention bombs, oversized native-flow/list/carousel payloads, broken
// buttonParamsJson, over-deep or circular message structures — then deletes them and optionally
// blocks the sender.
//
// Ported from @rennzsync/baileys' anchor-guard, itself a port of
// @rexxhayanasi/elaina-anchorguard (MIT).
import { META_AI_JID } from '../WABinary/index.js';
export const ANCHORGUARD_DEFAULTS = {
    maxText: 65536,
    maxCaption: 32768,
    maxMentions: 1500,
    maxGroupMentions: 200,
    maxButtons: 100,
    maxSections: 100,
    maxRows: 300,
    maxCards: 60,
    maxDepth: 12,
    maxNodes: 20000,
    maxBytes: 3 * 1024 * 1024,
    maxParamsJson: 262144,
    maxInvisibleRun: 500,
    maxCombiningRun: 100,
    maxNewlines: 20000
};
// Escaped on purpose: literal invisible/combining characters make the source unreadable
// and easy to corrupt on the next edit.
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u206a-\u206f\ufeff\ufff9-\ufffb]/;
const COMBINING = /[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06dc\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\uaa70\uaaf6\uabed\ufe20-\ufe2f]/;
/** Longest consecutive run of characters matching `matcher`. */
const longestRun = (text, matcher) => {
    let run = 0;
    let best = 0;
    for (const ch of text) {
        if (matcher.test(ch)) {
            run += 1;
            if (run > best) {
                best = run;
            }
        }
        else {
            run = 0;
        }
    }
    return best;
};
const countChar = (text, ch) => {
    let n = 0;
    for (let i = 0; i < text.length; i += 1) {
        if (text[i] === ch) {
            n += 1;
        }
    }
    return n;
};
const WRAPPERS = [
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'viewOnceMessageV2Extension',
    'documentWithCaptionMessage',
    'editedMessage',
    'deviceSentMessage',
    'botInvokeMessage'
];
const unwrapContent = (message) => {
    let current = message;
    let depth = 0;
    while (current && typeof current === 'object' && depth < 64) {
        const wrapper = WRAPPERS.find(w => current[w]?.message);
        if (!wrapper) {
            break;
        }
        current = current[wrapper].message;
        depth += 1;
    }
    return { content: current, wrapDepth: depth };
};
/**
 * Inspects a message content object and reports why it looks like a crash payload.
 * Pure — no I/O, no mutation of the input.
 */
export const detectBug = (message, options = {}) => {
    const limits = { ...ANCHORGUARD_DEFAULTS, ...options };
    const reasons = [];
    if (!message || typeof message !== 'object') {
        return { flagged: false, reasons };
    }
    const { content, wrapDepth } = unwrapContent(message);
    if (wrapDepth >= 6) {
        reasons.push(`wrapper nesting ${wrapDepth}`);
    }
    let nodes = 0;
    const seen = new WeakSet();
    // One traversal. The mention checks used to be a second full walk of the same tree, which
    // doubled the cost of the guard on the path it is meant to protect: every inbound message.
    const walk = (value, depth) => {
        if (reasons.length > 40) {
            return;
        }
        nodes += 1;
        if (nodes > limits.maxNodes) {
            reasons.push(`node count > ${limits.maxNodes}`);
            return;
        }
        if (depth > limits.maxDepth) {
            reasons.push(`structure depth > ${limits.maxDepth}`);
            return;
        }
        if (typeof value === 'string') {
            if (value.length > limits.maxText) {
                reasons.push(`string length ${value.length} > ${limits.maxText}`);
            }
            if (countChar(value, '\n') > limits.maxNewlines) {
                reasons.push('excessive newlines');
            }
            const invisibleRun = longestRun(value, INVISIBLE);
            if (invisibleRun > limits.maxInvisibleRun) {
                reasons.push(`invisible-char run ${invisibleRun}`);
            }
            const combiningRun = longestRun(value, COMBINING);
            if (combiningRun > limits.maxCombiningRun) {
                reasons.push(`combining-char run ${combiningRun}`);
            }
            return;
        }
        if (Array.isArray(value)) {
            for (const item of value) {
                walk(item, depth + 1);
            }
            return;
        }
        if (value && typeof value === 'object') {
            if (seen.has(value)) {
                reasons.push('circular structure');
                return;
            }
            seen.add(value);
            for (const key of Object.keys(value)) {
                const child = value[key];
                if (key === 'contextInfo' && child && typeof child === 'object') {
                    if (Array.isArray(child.mentionedJid) && child.mentionedJid.length > limits.maxMentions) {
                        reasons.push(`mentionedJid ${child.mentionedJid.length} > ${limits.maxMentions}`);
                    }
                    if (Array.isArray(child.groupMentions) && child.groupMentions.length > limits.maxGroupMentions) {
                        reasons.push(`groupMentions ${child.groupMentions.length} > ${limits.maxGroupMentions}`);
                    }
                }
                walk(child, depth + 1);
            }
        }
    };
    walk(content, 0);
    const inspectInteractive = (node) => {
        if (!node || typeof node !== 'object') {
            return;
        }
        const nativeFlow = node.nativeFlowMessage || node.interactiveMessage?.nativeFlowMessage;
        if (nativeFlow?.buttons) {
            if (nativeFlow.buttons.length > limits.maxButtons) {
                reasons.push(`nativeFlow buttons ${nativeFlow.buttons.length} > ${limits.maxButtons}`);
            }
            for (const button of nativeFlow.buttons) {
                const params = button?.buttonParamsJson;
                if (typeof params !== 'string') {
                    continue;
                }
                if (params.length > limits.maxParamsJson) {
                    reasons.push(`buttonParamsJson length ${params.length}`);
                }
                else if (params.length) {
                    try {
                        JSON.parse(params);
                    }
                    catch {
                        reasons.push('buttonParamsJson invalid');
                    }
                }
            }
        }
        const list = node.listMessage || node.interactiveMessage?.carouselMessage;
        if (list?.sections && list.sections.length > limits.maxSections) {
            reasons.push(`list sections ${list.sections.length} > ${limits.maxSections}`);
        }
        if (Array.isArray(list?.sections)) {
            let rows = 0;
            for (const section of list.sections) {
                rows += Array.isArray(section?.rows) ? section.rows.length : 0;
            }
            if (rows > limits.maxRows) {
                reasons.push(`list rows ${rows} > ${limits.maxRows}`);
            }
        }
        const cards = node.interactiveMessage?.carouselMessage?.cards;
        if (Array.isArray(cards) && cards.length > limits.maxCards) {
            reasons.push(`carousel cards ${cards.length} > ${limits.maxCards}`);
        }
    };
    inspectInteractive(content);
    if (typeof options.byteLength === 'number' && options.byteLength > limits.maxBytes) {
        reasons.push(`encoded size ${options.byteLength} > ${limits.maxBytes}`);
    }
    if (options.proto?.Message) {
        try {
            const encoded = options.proto.Message.encode(options.proto.Message.fromObject(message)).finish();
            if (encoded.length > limits.maxBytes) {
                reasons.push(`encoded size ${encoded.length} > ${limits.maxBytes}`);
            }
        }
        catch (error) {
            reasons.push(`proto encode failed: ${error.message}`);
        }
    }
    return { flagged: reasons.length > 0, reasons };
};
const META_AI_USER = META_AI_JID.split('@')[0];
const isMetaAiJid = (jid) => typeof jid === 'string' && jid.startsWith(META_AI_USER);
/** Bounded so a bot in busy groups cannot grow the burst log without limit. */
const MAX_BURST_SENDERS = 5000;
/**
 * Attaches the guard to a socket: flags inbound crash payloads, optionally blocks the sender,
 * and rejects outgoing messages that would crash the recipient.
 */
export const createAnchorGuard = (sock, options = {}) => {
    const config = {
        autoDelete: true,
        deleteMode: 'auto',
        guardIncoming: true,
        // Off by default: this one replaces `sock.sendMessage` with a wrapper, which a host that
        // also wraps `sendMessage` needs to know about. Opt in explicitly.
        guardOutgoing: false,
        blockOnBug: false,
        selfOnly: false,
        thresholds: {},
        onDetect: null,
        proto: null,
        /** messages from one sender within burstWindowMs before it counts as a burst; 0 = off */
        burstThreshold: 0,
        burstWindowMs: 4000,
        /** remove the sender from the group on burst (needs admin) */
        kickOnBurst: false,
        /** flag/kick when a burst-flagged inviter adds this account to a group */
        guardGroupAdds: false,
        /** guard Meta AI's own numbers instead of exempting them */
        metaAiNumbers: false,
        logger: sock?.logger,
        ...options
    };
    const ownJid = config.ownJid || sock?.user?.id;
    const detectOptions = { ...config.thresholds, proto: config.proto };
    const burstLog = new Map();
    const removeMessage = async (jid, key) => {
        if (!config.autoDelete) {
            return;
        }
        const revoke = config.deleteMode === 'everyone' || (config.deleteMode === 'auto' && key?.fromMe);
        try {
            if (revoke) {
                await sock.sendMessage(jid, { delete: key });
            }
            else if (typeof sock.chatModify === 'function') {
                await sock.chatModify({ deleteForMe: { key, timestamp: Date.now(), deleteMedia: false } }, jid);
            }
        }
        catch (error) {
            config.logger?.warn?.({ error: error.message }, 'anchorguard delete failed');
        }
    };
    const maybeBlock = async (jid, key) => {
        if (!config.blockOnBug || key?.fromMe || typeof sock.updateBlockStatus !== 'function') {
            return;
        }
        try {
            await sock.updateBlockStatus(jid, 'block');
        }
        catch (error) {
            config.logger?.warn?.({ error: error.message }, 'anchorguard block failed');
        }
    };
    const maybeKickBurst = async (groupJid, sender) => {
        if (!config.kickOnBurst || !groupJid?.endsWith('@g.us') || typeof sock.groupParticipantsUpdate !== 'function') {
            return;
        }
        try {
            await sock.groupParticipantsUpdate(groupJid, [sender], 'remove');
        }
        catch (error) {
            config.logger?.warn?.({ error: error.message }, 'anchorguard kick-on-burst failed');
        }
    };
    const checkBurst = (sender) => {
        if (!config.burstThreshold || !sender) {
            return false;
        }
        const now = Date.now();
        const stamps = (burstLog.get(sender) || []).filter(t => now - t < config.burstWindowMs);
        stamps.push(now);
        burstLog.set(sender, stamps);
        // Senders whose window has fully expired are dropped, so the map tracks active senders
        // only. Without this it keeps one entry per sender seen for the lifetime of the socket.
        if (burstLog.size > MAX_BURST_SENDERS) {
            for (const [key, times] of burstLog) {
                if (!times.some(t => now - t < config.burstWindowMs)) {
                    burstLog.delete(key);
                }
            }
        }
        return stamps.length > config.burstThreshold;
    };
    const handleUpsert = async ({ messages }) => {
        if (!config.guardIncoming || !Array.isArray(messages)) {
            return;
        }
        for (const msg of messages) {
            const content = msg?.message;
            if (!content) {
                continue;
            }
            const jid = msg.key?.remoteJid;
            const sender = msg.key?.participant || jid;
            if (config.selfOnly && jid !== ownJid && !msg.key?.fromMe) {
                continue;
            }
            if (!config.metaAiNumbers && isMetaAiJid(sender)) {
                continue;
            }
            const result = detectBug(content, detectOptions);
            const burst = checkBurst(sender);
            if (!result.flagged && !burst) {
                continue;
            }
            const reasons = burst
                ? [...result.reasons, `burst > ${config.burstThreshold}/${config.burstWindowMs}ms`]
                : result.reasons;
            config.logger?.warn?.({ jid, sender, reasons }, 'anchorguard flagged incoming message');
            await config.onDetect?.({ direction: 'incoming', message: msg, jid, sender, reasons, burst });
            if (result.flagged) {
                await removeMessage(jid, msg.key);
            }
            await maybeBlock(sender, msg.key);
            if (burst) {
                await maybeKickBurst(jid, sender);
            }
        }
    };
    const handleGroupParticipantsUpdate = async (update) => {
        if (!config.guardGroupAdds || update?.action !== 'add') {
            return;
        }
        const inviter = update?.author;
        if (!inviter || (!config.metaAiNumbers && isMetaAiJid(inviter))) {
            return;
        }
        if (checkBurst(inviter)) {
            config.logger?.warn?.({ group: update.id, inviter }, 'anchorguard flagged burst group-add');
            await config.onDetect?.({ direction: 'group-add', jid: update.id, sender: inviter, reasons: ['burst group-add'], burst: true });
            await maybeKickBurst(update.id, inviter);
        }
    };
    if (config.guardIncoming && sock?.ev?.on) {
        sock.ev.on('messages.upsert', handleUpsert);
    }
    if (config.guardGroupAdds && sock?.ev?.on) {
        sock.ev.on('group-participants.update', handleGroupParticipantsUpdate);
    }
    let originalSend = null;
    let patchedSend = null;
    if (config.guardOutgoing && typeof sock?.sendMessage === 'function') {
        // Keep the unbound reference so `stop()` restores the exact function that was there.
        // Restoring a bound copy instead stacks a `bind` layer per guard/stop cycle and makes
        // the socket's own method unrecognisable to a host comparing identities.
        originalSend = sock.sendMessage;
        const callOriginal = originalSend.bind(sock);
        patchedSend = async (jid, content, sendOptions) => {
            const probe = detectBug(content, detectOptions);
            if (probe.flagged) {
                config.logger?.warn?.({ jid, reasons: probe.reasons }, 'anchorguard blocked outgoing message');
                await config.onDetect?.({ direction: 'outgoing', jid, content, reasons: probe.reasons });
                throw new Error(`anchorguard blocked outgoing message: ${probe.reasons.join('; ')}`);
            }
            return callOriginal(jid, content, sendOptions);
        };
        sock.sendMessage = patchedSend;
    }
    return {
        detect: message => detectBug(message, detectOptions),
        stop: () => {
            if (config.guardIncoming && sock?.ev?.off) {
                sock.ev.off('messages.upsert', handleUpsert);
            }
            if (config.guardGroupAdds && sock?.ev?.off) {
                sock.ev.off('group-participants.update', handleGroupParticipantsUpdate);
            }
            // Only unwind our own wrapper. Restoring unconditionally would throw away a wrapper
            // the host installed after this guard did.
            if (patchedSend && sock.sendMessage === patchedSend) {
                sock.sendMessage = originalSend;
            }
            burstLog.clear();
        }
    };
};
// kept for drop-in parity with @rexxhayanasi/elaina-anchorguard's export name
export const createAntiBugGuard = createAnchorGuard;
