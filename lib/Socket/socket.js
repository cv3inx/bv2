import { Boom } from '@hapi/boom';
import { randomBytes, randomUUID } from 'crypto';
import { URL } from 'url';
import { promisify } from 'util';
import { proto } from '../../WAProto/index.js';
import { DEF_CALLBACK_PREFIX, DEF_TAG_PREFIX, INITIAL_PREKEY_COUNT, MIN_PREKEY_COUNT, NOISE_WA_HEADER, PROCESSABLE_HISTORY_TYPES, TimeMs, UPLOAD_TIMEOUT } from '../Defaults/index.js';
import { QueryIds, ReachoutTimelockEnforcementType } from '../Types/index.js';
import { DisconnectReason, XWAPaths } from '../Types/index.js';
import { addTransactionCapability, aesEncryptCTR, bindWaitForConnectionUpdate, buildPairingQRData, bytesToCrockford, configureSuccessfulPairing, Curve, derivePairingCodeKey, fetchLatestWaWebVersion, generateLoginNode, generateMdTagPrefix, generateRegistrationNode, getCodeFromWSError, getErrorCodeFromStreamError, getNextPreKeysNode, getPairingCodePlatform, invalidPairingCodeChars, makeEventBuffer, makeNoiseHandler, normalizePairingCode, PAIRING_CODE_ALPHABET, promiseTimeout, signedKeyPair, xmppSignedPreKey } from '../Utils/index.js';
import { ignoredStanzaNeedsAck, makeIgnoreKeyRegistry } from '../Utils/ignore-key.js';
import { buildAckStanza } from '../Utils/stanza-ack.js';
import { assertNodeErrorFree, binaryNodeToString, encodeBinaryNode, getAllBinaryNodeChildren, getBinaryNodeChild, getBinaryNodeChildren, isLidUser, jidDecode, jidEncode, S_WHATSAPP_NET } from '../WABinary/index.js';
import { BinaryInfo } from '../WAM/BinaryInfo.js';
import { USyncQuery, USyncUser } from '../WAUSync/index.js';
import { WebSocketClient } from './Client/index.js';
import { executeWMexQuery } from './mex.js';

/**
 * Connects to WA servers and performs:
 * - simple queries (no retry mechanism, wait for connection establishment)
 * - listen to messages and emit events
 * - query phone connection
 */
/**
 * Version the server accepted after it rejected the configured one with 405 (client_too_old).
 * Process-wide on purpose: every socket built afterwards with a static `version` reuses it,
 * so a stale hardcoded version heals on the next reconnect instead of looping on 405.
 */
let latestVersionOverride;
/**
 * Reasons that end a session for good. Reconnecting any of these is how an unattended host turns
 * one logout into an auth loop and gets the number banned.
 */
const DEAD_DISCONNECT_REASONS = new Set([
    DisconnectReason.loggedOut,
    DisconnectReason.forbidden,
    DisconnectReason.multideviceMismatch,
    DisconnectReason.badSession,
    DisconnectReason.connectionReplaced
]);
export const makeSocket = (config) => {
    const { waWebSocketUrl, connectTimeoutMs, logger, keepAliveIntervalMs, keepAliveGracePeriodMs, browser, auth: authState, printQRInTerminal, defaultQueryTimeoutMs, transactionOpts, qrTimeout, makeSignalRepository } = config;
    const publicWAMBuffer = new BinaryInfo();
    let serverTimeOffsetMs = 0;
    const uqTagId = generateMdTagPrefix();
    const generateMessageTag = () => `${uqTagId}${epoch++}`;
    if (printQRInTerminal) {
        logger.warn({}, '⚠️ The printQRInTerminal option has been deprecated. You will no longer receive QR codes in the terminal automatically. Please listen to the connection.update event yourself and handle the QR your way. You can remove this message by removing this opttion. This message will be removed in a future version.');
    }
    if (browser[1].toLocaleLowerCase().includes('android')) {
        logger.warn('⚠️ Using the Android browser is experimental and may lead to unexpected behavior. Use at your own risk.');
    }
    const syncDisabled = PROCESSABLE_HISTORY_TYPES.map(syncType => config.shouldSyncHistoryMessage({ syncType })).filter(x => x === false)
        .length === PROCESSABLE_HISTORY_TYPES.length;
    if (syncDisabled) {
        logger.warn('⚠️ DANGER: DISABLING ALL SYNC BY shouldSyncHistoryMsg PREVENTS BAILEYS FROM ACCESSING INITIAL LID MAPPINGS, LEADING TO INSTABILIY AND SESSION ERRORS');
    }
    const url = typeof waWebSocketUrl === 'string' ? new URL(waWebSocketUrl) : waWebSocketUrl;
    if (config.mobile || url.protocol === 'tcp:') {
        throw new Boom('Mobile API is not supported anymore', { statusCode: DisconnectReason.loggedOut });
    }
    if (url.protocol === 'wss' && authState?.creds?.routingInfo) {
        url.searchParams.append('ED', authState.creds.routingInfo.toString('base64url'));
    }
    /** ephemeral key pair used to encrypt/decrypt communication. Unique for each connection */
    let ephemeralKeyPair = Curve.generateKeyPair();
    /** WA noise protocol wrapper */
    let noise = makeNoiseHandler({
        keyPair: ephemeralKeyPair,
        NOISE_HEADER: NOISE_WA_HEADER,
        logger,
        routingInfo: authState?.creds?.routingInfo
    });
    const ws = new WebSocketClient(url, config);
    ws.connect();
    const sendPromise = promisify(ws.send);
    /** send a raw buffer */
    const sendRawMessage = async (data) => {
        if (!ws.isOpen) {
            throw new Boom('Connection Closed', { statusCode: DisconnectReason.connectionClosed });
        }
        const bytes = noise.encodeFrame(data);
        await promiseTimeout(connectTimeoutMs, async (resolve, reject) => {
            try {
                await sendPromise.call(ws, bytes);
                resolve();
            }
            catch (error) {
                reject(error);
            }
        });
    };
    /** send a binary node */
    const sendNode = (frame) => {
        if (logger.level === 'trace') {
            logger.trace({ xml: binaryNodeToString(frame), msg: 'xml send' });
        }
        const buff = encodeBinaryNode(frame);
        return sendRawMessage(buff);
    };
    /**
     * Wait for a message with a certain tag to be received
     * @param msgId the message tag to await
     * @param timeoutMs timeout after which the promise will reject
     */
    const waitForMessage = async (msgId, timeoutMs = defaultQueryTimeoutMs) => {
        let onRecv;
        let onErr;
        try {
            const result = await promiseTimeout(timeoutMs, (resolve, reject) => {
                onRecv = data => {
                    resolve(data);
                };
                onErr = err => {
                    reject(err ||
                        new Boom('Connection Closed', {
                            statusCode: DisconnectReason.connectionClosed
                        }));
                };
                ws.on(`TAG:${msgId}`, onRecv);
                ws.on('close', onErr);
                ws.on('error', onErr);
                return () => reject(new Boom('Query Cancelled'));
            });
            return result;
        }
        catch (error) {
            // Catch timeout and return undefined instead of throwing
            if (error instanceof Boom && error.output?.statusCode === DisconnectReason.timedOut) {
                logger?.warn?.({ msgId }, 'timed out waiting for message');
                return undefined;
            }
            throw error;
        }
        finally {
            if (onRecv)
                ws.off(`TAG:${msgId}`, onRecv);
            if (onErr) {
                ws.off('close', onErr);
                ws.off('error', onErr);
            }
        }
    };
    /** send a query, and wait for its response. auto-generates message ID if not provided */
    const query = async (node, timeoutMs) => {
        if (!node.attrs.id) {
            node.attrs.id = generateMessageTag();
        }
        const msgId = node.attrs.id;
        pendingQueries++;
        const result = await promiseTimeout(timeoutMs, async (resolve, reject) => {
            const result = waitForMessage(msgId, timeoutMs).catch(reject);
            sendNode(node)
                .then(async () => resolve(await result))
                .catch(reject);
        }).finally(() => { pendingQueries--; });
        if (result && 'tag' in result) {
            assertNodeErrorFree(result);
        }
        return result;
    };
    // Validate current key-bundle on server; on failure, trigger pre-key upload and rethrow
    const digestKeyBundle = async () => {
        const res = await query({
            tag: 'iq',
            attrs: { to: S_WHATSAPP_NET, type: 'get', xmlns: 'encrypt' },
            content: [{ tag: 'digest', attrs: {} }]
        });
        const digestNode = getBinaryNodeChild(res, 'digest');
        if (!digestNode) {
            await uploadPreKeys();
            throw new Error('encrypt/get digest returned no digest node');
        }
    };
    // Rotate our signed pre-key on server; on failure, run digest as fallback and rethrow
    const rotateSignedPreKey = async () => {
        const newId = (creds.signedPreKey.keyId || 0) + 1;
        const skey = await signedKeyPair(creds.signedIdentityKey, newId);
        await query({
            tag: 'iq',
            attrs: { to: S_WHATSAPP_NET, type: 'set', xmlns: 'encrypt' },
            content: [
                {
                    tag: 'rotate',
                    attrs: {},
                    content: [xmppSignedPreKey(skey)]
                }
            ]
        });
        // Persist new signed pre-key in creds
        ev.emit('creds.update', { signedPreKey: skey });
    };
    const executeUSyncQuery = async (usyncQuery) => {
        if (usyncQuery.protocols.length === 0) {
            throw new Boom('USyncQuery must have at least one protocol');
        }
        // todo: validate users, throw WARNING on no valid users
        // variable below has only validated users
        const validUsers = usyncQuery.users;
        const userNodes = validUsers.map(user => {
            return {
                tag: 'user',
                attrs: {
                    jid: !user.phone ? user.id : undefined
                },
                content: usyncQuery.protocols.map(a => a.getUserElement(user)).filter(a => a !== null)
            };
        });
        const listNode = {
            tag: 'list',
            attrs: {},
            content: userNodes
        };
        const queryNode = {
            tag: 'query',
            attrs: {},
            content: usyncQuery.protocols.map(a => a.getQueryElement())
        };
        const iq = {
            tag: 'iq',
            attrs: {
                to: S_WHATSAPP_NET,
                type: 'get',
                xmlns: 'usync'
            },
            content: [
                {
                    tag: 'usync',
                    attrs: {
                        context: usyncQuery.context,
                        mode: usyncQuery.mode,
                        sid: generateMessageTag(),
                        last: 'true',
                        index: '0'
                    },
                    content: [queryNode, listNode]
                }
            ]
        };
        const result = await query(iq);
        return usyncQuery.parseUSyncQueryResult(result);
    };
    const onWhatsApp = async (...phoneNumber) => {
        let usyncQuery = new USyncQuery();
        let contactEnabled = false;
        for (const jid of phoneNumber) {
            if (isLidUser(jid)) {
                logger?.warn('LIDs are not supported with onWhatsApp');
                continue;
            }
            else {
                if (!contactEnabled) {
                    contactEnabled = true;
                    usyncQuery = usyncQuery.withContactProtocol();
                }
                const phone = `+${jid.replace('+', '').split('@')[0]?.split(':')[0]}`;
                usyncQuery.withUser(new USyncUser().withPhone(phone));
            }
        }
        if (usyncQuery.users.length === 0) {
            return []; // return early without forcing an empty query
        }
        const results = await executeUSyncQuery(usyncQuery);
        if (results) {
            return results.list.filter(a => !!a.contact).map(({ contact, id }) => ({ jid: id, exists: contact }));
        }
    };
    /**
     * Look up accounts by their WhatsApp @username instead of a phone number.
     * Each query is either a plain username string, or `{ username, usernameKey, lid }`
     * where usernameKey is the PIN protecting the username.
     */
    const onWhatsAppUsername = async (...queries) => {
        // username users are LID-only; ask for LID addressing like WA Web does
        const usyncQuery = new USyncQuery().withContactProtocol('lid').withUsernameProtocol().withBusinessProtocol(null);
        const normalized = [];
        for (const query of queries) {
            const raw = typeof query === 'string' ? query : query?.username;
            const username = raw?.trim().replace(/^@/, '');
            if (!username) {
                throw new Boom('Username cannot be empty', { statusCode: 400 });
            }
            const user = new USyncUser().withUsername(username);
            if (typeof query !== 'string') {
                if (query.usernameKey) {
                    user.withUsernameKey(query.usernameKey);
                }
                if (query.lid) {
                    user.withLid(query.lid);
                }
            }
            usyncQuery.withUser(user);
            normalized.push(username);
        }
        if (usyncQuery.users.length === 0) {
            return [];
        }
        const results = await executeUSyncQuery(usyncQuery);
        if (!results) {
            return [];
        }
        return results.list.map((result, index) => ({
            username: typeof result.username === 'string' ? result.username : normalized[index] || '',
            jid: result.id,
            exists: result.contact === true || result.keyRequired === true,
            keyRequired: result.keyRequired === true,
            isBusiness: !!result.business,
            pnJid: result.business?.pnJid || undefined
        }));
    };
    /** fetch the @username of one or more jids, if they have one set */
    const fetchUsername = async (...jids) => {
        const usyncQuery = new USyncQuery().withUsernameProtocol();
        for (const jid of jids) {
            usyncQuery.withUser(new USyncUser().withId(jid));
        }
        if (usyncQuery.users.length === 0) {
            return [];
        }
        const results = await executeUSyncQuery(usyncQuery);
        if (!results) {
            return [];
        }
        return results.list.map(({ id, username }) => ({
            jid: id,
            username: typeof username === 'string' ? username : undefined
        }));
    };
    /**
     * Check whether a username is free before claiming it. Returns the session_id
     * that must be passed to `setUsername` so the server ties both steps together.
     */
    const checkUsername = async (username, includeSuggestions = true, sessionId) => {
        const session_id = sessionId || randomUUID();
        const data = await executeWMexQuery({ username, include_suggestions: includeSuggestions, session_id, source: 'USER_INPUT' }, QueryIds.USERNAME_CHECK, XWAPaths.xwa2_username_check, query, generateMessageTag);
        if (data?.result === 'SUCCESS') {
            return { available: true, username, session_id };
        }
        return {
            available: false,
            username,
            session_id,
            suggestions: data?.suggestions ?? [],
            rejectionReasons: data?.rejection_reasons ?? [],
            suggestionsEligible: data?.suggestions_eligible ?? true
        };
    };
    /** claim a username for ourselves. `source` is one of USER_INPUT | SUGGESTION | FB | IG */
    const setUsername = async (username, options = {}) => {
        const { source = 'USER_INPUT', sessionId, pin } = options;
        return executeWMexQuery({ username, reserved: true, source, session_id: sessionId || randomUUID(), ...(pin ? { pin } : {}) }, QueryIds.USERNAME_SET, XWAPaths.xwa2_username_set, query, generateMessageTag);
    };
    /** remove our own username — a null username is what triggers the server's delete path */
    const deleteUsername = async () => {
        return executeWMexQuery({ username: null }, QueryIds.USERNAME_SET, XWAPaths.xwa2_username_delete, query, generateMessageTag);
    };
    const getMyUsername = async () => {
        const data = await executeWMexQuery({}, QueryIds.USERNAME_GET, XWAPaths.xwa2_username_get, query, generateMessageTag);
        return data?.username ?? null;
    };
    /** set the PIN protecting our username, or pass null to remove it */
    const setUsernamePin = async (pin) => {
        return executeWMexQuery(pin != null ? { pin } : {}, QueryIds.USERNAME_PIN_SET, XWAPaths.xwa2_username_pin_set, query, generateMessageTag);
    };
    const pnFromLIDUSync = async (jids) => {
        const usyncQuery = new USyncQuery().withLIDProtocol().withContext('background');
        for (const jid of jids) {
            if (isLidUser(jid)) {
                logger?.warn('LID user found in LID fetch call');
                continue;
            }
            else {
                usyncQuery.withUser(new USyncUser().withId(jid));
            }
        }
        if (usyncQuery.users.length === 0) {
            return []; // return early without forcing an empty query
        }
        const results = await executeUSyncQuery(usyncQuery);
        if (results) {
            return results.list.filter(a => !!a.lid).map(({ lid, id }) => ({ pn: id, lid: lid }));
        }
        return [];
    };
    const ev = makeEventBuffer(logger);
    const { creds } = authState;
    /**
     * Last identity this socket has been logged in as. `sock.user` is a getter over
     * `authState.creds.me`, and hosts read it as `sock.user.id` with no optional chaining (the
     * @neoxr/wb engine does exactly that in serialize() and in its JID() helper). One stanza that
     * arrives while `creds.me` is momentarily absent therefore throws inside the host's event
     * listener instead of being processed. Keeping the identity we already know turns that into a
     * correct answer: a socket that is receiving stanzas is logged in as this user.
     */
    let lastMe = creds.me;
    let userMissingLogged = false;
    // add transaction capability
    const keys = addTransactionCapability(authState.keys, logger, transactionOpts);
    const signalRepository = makeSignalRepository({ creds, keys }, logger, pnFromLIDUSync);
    let lastDateRecv;
    /** queries awaiting a reply; keep-alive skips its ping while these are flowing */
    let pendingQueries = 0;
    let epoch = 1;
    let keepAliveReq;
    let qrTimer;
    let closed = false;
    /** transparent transport reconnect state; see scheduleReconnect */
    let reconnecting = false;
    let reconnectAttempts = 0;
    let reconnectTimer;
    let reconnectWaitResolve;
    /** set once WhatsApp sends pair-device; requestPairingCode queues until then */
    let pairingReady = false;
    let pairingInProgress = false;
    /** true once a pairing code has been asked for: this session is being linked by code, not QR */
    let pairingCodeMode = false;
    let pendingPairingResolve;
    let pendingPairingReject;
    const socketEndHandlers = [];
    /** per-connection caches (media host auth, ...) that must be dropped when the transport reopens */
    const socketReconnectHandlers = [];
    const timers = new Set();
    const safeSetTimeout = (fn, ms) => { const id = setTimeout(fn, ms); timers.add(id); return id; };
    const safeSetInterval = (fn, ms) => { const id = setInterval(fn, ms); timers.add(id); return id; };
    const clearSafeTimer = (id) => { if (id !== undefined && id !== null) { clearTimeout(id); clearInterval(id); timers.delete(id); } };
    const clearAllTimers = () => { for (const id of timers) { clearTimeout(id); clearInterval(id); } timers.clear(); };
    /** log & process any unexpected errors */
    const onUnexpectedError = (err, msg) => {
        logger.error({ err }, `unexpected error in '${msg}'`);
    };
    /** await the next incoming message */
    const awaitNextMessage = async (sendMsg) => {
        if (!ws.isOpen) {
            throw new Boom('Connection Closed', {
                statusCode: DisconnectReason.connectionClosed
            });
        }
        let onOpen;
        let onClose;
        const result = promiseTimeout(connectTimeoutMs, (resolve, reject) => {
            onOpen = resolve;
            onClose = mapWebSocketError(reject);
            ws.on('frame', onOpen);
            ws.on('close', onClose);
            ws.on('error', onClose);
        }).finally(() => {
            ws.off('frame', onOpen);
            ws.off('close', onClose);
            ws.off('error', onClose);
        });
        if (sendMsg) {
            sendRawMessage(sendMsg).catch(onClose);
        }
        return result;
    };
    /** connection handshake */
    const validateConnection = async () => {
        let helloMsg = {
            clientHello: { ephemeral: ephemeralKeyPair.public }
        };
        helloMsg = proto.HandshakeMessage.fromObject(helloMsg);
        logger.info({ browser, helloMsg }, 'connected to WA');
        const init = proto.HandshakeMessage.encode(helloMsg).finish();
        const result = await awaitNextMessage(init);
        const handshake = proto.HandshakeMessage.decode(result);
        logger.trace({ handshake }, 'handshake recv from WA');
        const keyEnc = noise.processHandshake(handshake, creds.noiseKey);
        // `version` may be a resolver (e.g. () => fetchLatestWaWebVersion().then(r => r.version));
        // a version the server already rejected as too old is replaced by the fetched one
        const resolvedVersion = typeof config.version === 'function'
            ? await config.version()
            : latestVersionOverride ?? config.version;
        const connectConfig = resolvedVersion === config.version ? config : { ...config, version: resolvedVersion };
        let node;
        if (!creds.me) {
            node = generateRegistrationNode(creds, connectConfig);
            logger.info({ node }, 'not logged in, attempting registration...');
        }
        else {
            node = generateLoginNode(creds.me.id, connectConfig);
            logger.info({ node }, 'logging in...');
        }
        const payloadEnc = noise.encrypt(proto.ClientPayload.encode(node).finish());
        await sendRawMessage(proto.HandshakeMessage.encode({
            clientFinish: {
                static: keyEnc,
                payload: payloadEnc
            }
        }).finish());
        await noise.finishInit();
        startKeepAliveRequest();
    };
    const getAvailablePreKeysOnServer = async () => {
        const result = await query({
            tag: 'iq',
            attrs: {
                id: generateMessageTag(),
                xmlns: 'encrypt',
                type: 'get',
                to: S_WHATSAPP_NET
            },
            content: [{ tag: 'count', attrs: {} }]
        });
        const countChild = getBinaryNodeChild(result, 'count');
        return +countChild.attrs.value;
    };
    // WAWeb has no time throttle here; the server drives uploads via PreKeyLow notifications.
    let uploadPreKeysPromise = null;
    /** generates and uploads a set of pre-keys to the server */
    const uploadPreKeys = async (count = MIN_PREKEY_COUNT) => {
        if (uploadPreKeysPromise) {
            logger.debug('Pre-key upload already in progress, waiting for completion');
            await uploadPreKeysPromise;
            return;
        }
        const uploadLogic = async (retryCount) => {
            logger.info({ count, retryCount }, 'uploading pre-keys');
            // Generate and save pre-keys atomically (prevents ID collisions on retry)
            const node = await keys.transaction(async () => {
                logger.debug({ requestedCount: count }, 'generating pre-keys with requested count');
                const { update, node } = await getNextPreKeysNode({ creds, keys }, count);
                // Update credentials immediately to prevent duplicate IDs on retry
                ev.emit('creds.update', update);
                return node;
            }, creds?.me?.id || 'upload-pre-keys');
            // Upload to server (outside transaction, can fail without affecting local keys)
            try {
                await query(node);
                logger.info({ count }, 'uploaded pre-keys successfully');
            }
            catch (uploadError) {
                logger.error({ uploadError: uploadError.toString(), count }, 'Failed to upload pre-keys to server');
                // Recurse into uploadLogic; calling uploadPreKeys would await its own in-flight promise.
                if (retryCount < 3) {
                    const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                    logger.info(`Retrying pre-key upload in ${backoffDelay}ms`);
                    await new Promise(resolve => safeSetTimeout(resolve, backoffDelay));
                    return uploadLogic(retryCount + 1);
                }
                throw uploadError;
            }
        };
        // Add timeout protection
        uploadPreKeysPromise = Promise.race([
            uploadLogic(0),
            new Promise((_, reject) => safeSetTimeout(() => reject(new Boom('Pre-key upload timeout', { statusCode: 408 })), UPLOAD_TIMEOUT))
        ]);
        try {
            await uploadPreKeysPromise;
        }
        finally {
            uploadPreKeysPromise = null;
        }
    };
    const verifyCurrentPreKeyExists = async () => {
        const currentPreKeyId = creds.nextPreKeyId - 1;
        if (currentPreKeyId <= 0) {
            return { exists: false, currentPreKeyId: 0 };
        }
        const preKeys = await keys.get('pre-key', [currentPreKeyId.toString()]);
        const exists = !!preKeys[currentPreKeyId.toString()];
        return { exists, currentPreKeyId };
    };
    const uploadPreKeysToServerIfRequired = async () => {
        try {
            let count = 0;
            const preKeyCount = await getAvailablePreKeysOnServer();
            if (preKeyCount === 0)
                count = INITIAL_PREKEY_COUNT;
            else
                count = MIN_PREKEY_COUNT;
            const { exists: currentPreKeyExists, currentPreKeyId } = await verifyCurrentPreKeyExists();
            logger.info(`${preKeyCount} pre-keys found on server`);
            logger.info(`Current prekey ID: ${currentPreKeyId}, exists in storage: ${currentPreKeyExists}`);
            const lowServerCount = preKeyCount <= count;
            const missingCurrentPreKey = !currentPreKeyExists && currentPreKeyId > 0;
            const shouldUpload = lowServerCount || missingCurrentPreKey;
            if (shouldUpload) {
                const reasons = [];
                if (lowServerCount)
                    reasons.push(`server count low (${preKeyCount})`);
                if (missingCurrentPreKey)
                    reasons.push(`current prekey ${currentPreKeyId} missing from storage`);
                logger.info(`Uploading PreKeys due to: ${reasons.join(', ')}`);
                await uploadPreKeys(count);
            }
            else {
                logger.info(`PreKey validation passed - Server: ${preKeyCount}, Current prekey ${currentPreKeyId} exists`);
            }
        }
        catch (error) {
            logger.error({ error }, 'Failed to check/upload pre-keys during initialization');
            // Don't throw - allow connection to continue even if pre-key check fails
        }
    };
    const ignoreKeyRegistry = makeIgnoreKeyRegistry({
        getMeId: () => authState.creds.me?.id,
        getMeLid: () => authState.creds.me?.lid,
        logger
    });
    const onMessageReceived = async (data) => {
        await noise.decodeFrame(data, frame => {
            lastDateRecv = new Date();
            let anyTriggered = false;
            anyTriggered = ws.emit('frame', frame);
            if (!(frame instanceof Uint8Array)) {
                const msgId = frame.attrs.id;
                if (logger.level === 'trace') {
                    logger.trace({ xml: binaryNodeToString(frame), msg: 'recv xml' });
                }
                // Filters run before every other handler, so a dropped stanza never reaches the
                // decryption or persistence paths. The ack still goes out, otherwise the server
                // keeps re-delivering what the host just asked to ignore.
                if (ignoreKeyRegistry.shouldDrop(frame)) {
                    logger.debug({ tag: frame.tag, id: msgId, from: frame.attrs.from }, 'stanza dropped by ignoreKey');
                    if (ignoredStanzaNeedsAck(frame.tag)) {
                        sendNode(buildAckStanza(frame, undefined, authState.creds.me?.id)).catch(err => logger.error({ err, id: msgId }, 'failed to ack ignored stanza'));
                    }
                    return;
                }
                anyTriggered = ws.emit(`${DEF_TAG_PREFIX}${msgId}`, frame) || anyTriggered;
                const l0 = frame.tag;
                const l1 = frame.attrs || {};
                const l2 = Array.isArray(frame.content) ? frame.content[0]?.tag : '';
                for (const key of Object.keys(l1)) {
                    anyTriggered = ws.emit(`${DEF_CALLBACK_PREFIX}${l0},${key}:${l1[key]},${l2}`, frame) || anyTriggered;
                    anyTriggered = ws.emit(`${DEF_CALLBACK_PREFIX}${l0},${key}:${l1[key]}`, frame) || anyTriggered;
                    anyTriggered = ws.emit(`${DEF_CALLBACK_PREFIX}${l0},${key}`, frame) || anyTriggered;
                }
                anyTriggered = ws.emit(`${DEF_CALLBACK_PREFIX}${l0},,${l2}`, frame) || anyTriggered;
                anyTriggered = ws.emit(`${DEF_CALLBACK_PREFIX}${l0}`, frame) || anyTriggered;
                if (!anyTriggered && logger.level === 'debug') {
                    logger.debug({ unhandled: true, msgId, fromMe: false, frame }, 'communication recv');
                }
            }
        });
        data = null;
    };
    const end = async (error) => {
        if (closed) {
            logger.trace({ trace: error?.stack }, 'connection already closed');
            return;
        }
        closed = true;
        // Name the disconnect reason in the message itself. The code was always on `error.output`,
        // but a host does not always receive the Boom: a wrapper that re-emits this close as its own
        // `error` event forwards `message` and nothing else, and the messages alone cannot be told
        // apart — `CB:failure` says the constant 'Connection Failure' for a 401 device-removal and
        // for a transient 503 alike. A host that cannot distinguish them keeps reconnecting a
        // session that is really gone, which is how an unattended fleet turns one logout into a
        // re-auth loop and gets the number banned.
        //
        // Done here rather than at each `end()` call site because there are a dozen of them and a
        // new one would silently miss it. The existing text is kept as a prefix, so message matching
        // that already works keeps working; the suffix is additive.
        const statusCode = error?.output?.statusCode;
        if (statusCode !== undefined && typeof error?.message === 'string' && !error.message.includes(`[${statusCode} `)) {
            try {
                error.message = `${error.message} [${statusCode} ${DisconnectReason[statusCode] || 'unknown'}]`;
            }
            catch { }
        }
        logger.info({ trace: error?.stack }, error ? 'connection errored' : 'connection closed');
        // Signal-key writes are debounced (addTransactionCapability). Nothing else in the library
        // called flush, so every ratchet advance from the last window was dropped on close and the
        // next connection decrypted with stale state. Flush first: the close path below can hang.
        try {
            await keys.flush?.();
        }
        catch (err) {
            logger.error({ err }, 'failed to flush signal keys on close');
        }
        // Every caller invokes this as `void end(...)`, so a rejection from anywhere below is an
        // unhandled rejection and Node terminates the process - during a teardown, which is exactly
        // when a host is least able to afford losing every other account it runs. Nothing in a
        // teardown is worth propagating: log and finish tearing down.
        try {
            keepAliveReq?.cancel();
            clearSafeTimer(qrTimer);
            clearAllTimers();
            // release a pending reconnect wait so scheduleReconnect cannot stay suspended
            reconnectWaitResolve?.();
            reconnectWaitResolve = undefined;
            // a queued requestPairingCode would hang forever otherwise
            pairingReady = false;
            pairingInProgress = false;
            pairingCodeMode = false;
            pendingPairingReject?.(error || new Boom('Connection closed before pairing completed', { statusCode: DisconnectReason.connectionClosed }));
            ws.removeAllListeners('close');
            ws.removeAllListeners('open');
            ws.removeAllListeners('message');
            ws.removeAllListeners('frame');
            ws.removeAllListeners('error');
            signalRepository.close?.();
            if (!ws.isClosed && !ws.isClosing) {
                try {
                    await ws.close();
                }
                catch { }
            }
            const handlers = socketEndHandlers.slice();
            socketEndHandlers.length = 0;
            for (const handler of handlers) {
                try {
                    await handler(error);
                }
                catch (err) {
                    logger.error({ err }, 'error in socket end handler');
                }
            }
            try {
                ev.emit('connection.update', {
                    connection: 'close',
                    lastDisconnect: {
                        error,
                        date: new Date()
                    }
                });
            } catch { }
            ev.removeAllListeners('connection.update');
            ev.destroy();
        }
        catch (err) {
            logger.error({ err }, 'error while closing connection');
        }
    };
    /** rebuild the state that belongs to one transport connection, not to the socket object */
    const resetTransport = () => {
        keepAliveReq?.cancel();
        keepAliveReq = undefined;
        clearSafeTimer(qrTimer);
        qrTimer = undefined;
        lastDateRecv = undefined;
        ephemeralKeyPair = Curve.generateKeyPair();
        noise = makeNoiseHandler({
            keyPair: ephemeralKeyPair,
            NOISE_HEADER: NOISE_WA_HEADER,
            logger,
            routingInfo: authState?.creds?.routingInfo
        });
        // the media host token is issued per connection; a cached one fails every upload after this
        for (const handler of socketReconnectHandlers) {
            try {
                handler();
            }
            catch (err) {
                logger.error({ err }, 'error in socket reconnect handler');
            }
        }
    };
    /**
     * Transparent reconnect. The WebSocket client object is kept and only the raw socket and the
     * noise session under it are replaced, so every stanza listener registered by the layers above
     * (messages-recv, chats, the host) keeps working and the host never sees a `close` for a drop
     * that this socket can repair itself.
     */
    const scheduleReconnect = async (error) => {
        if (reconnecting || closed) {
            return;
        }
        reconnecting = true;
        const statusCode = error?.output?.statusCode;
        const maxAttempts = config.maxReconnectAttempts ?? 10;
        if (!config.autoReconnect || DEAD_DISCONNECT_REASONS.has(statusCode) || reconnectAttempts >= maxAttempts) {
            reconnecting = false;
            return end(error);
        }
        reconnectAttempts += 1;
        // 515 means the server wants the connection back now; backing off only delays it
        const immediate = statusCode === DisconnectReason.restartRequired;
        const base = config.reconnectDelayMs ?? 2000;
        const ceiling = config.maxReconnectDelayMs ?? 60000;
        const backoff = Math.min(ceiling, base * 2 ** (reconnectAttempts - 1));
        // jitter keeps a fleet from reconnecting in lockstep after a server-side blip
        const delayMs = immediate ? 0 : Math.round(backoff * (0.75 + Math.random() * 0.5));
        logger.info({ statusCode, attempt: reconnectAttempts, delayMs }, 'connection lost, reconnecting');
        // NOT 'close': a host reads close as "build a new socket", and a second socket for the same
        // account is what earns a 440 connectionReplaced
        ev.emit('connection.update', {
            connection: 'connecting',
            lastDisconnect: { error, date: new Date() }
        });
        await new Promise(resolve => {
            reconnectWaitResolve = resolve;
            reconnectTimer = safeSetTimeout(() => {
                reconnectWaitResolve = undefined;
                resolve();
            }, delayMs);
        });
        reconnectTimer = undefined;
        reconnecting = false;
        if (closed) {
            return;
        }
        try {
            resetTransport();
            ws.reconnect();
        }
        catch (err) {
            logger.error({ err }, 'failed to reopen the transport');
            return end(err);
        }
    };
    /** single entry point for every transport-level close */
    const handleDisconnect = (error) => {
        if (closed) {
            return;
        }
        return scheduleReconnect(error);
    };
    const waitForSocketOpen = async () => {
        if (ws.isOpen) {
            return;
        }
        if (ws.isClosed || ws.isClosing) {
            throw new Boom('Connection Closed', { statusCode: DisconnectReason.connectionClosed });
        }
        let onOpen;
        let onClose;
        await new Promise((resolve, reject) => {
            onOpen = () => resolve(undefined);
            onClose = mapWebSocketError(reject);
            ws.on('open', onOpen);
            ws.on('close', onClose);
            ws.on('error', onClose);
        }).finally(() => {
            ws.off('open', onOpen);
            ws.off('close', onClose);
            ws.off('error', onClose);
        });
    };
    /**
     * Keep-alive, modelled on zapo-js (src/transport/keepalive/WaKeepAlive.ts):
     * - self-rescheduling setTimeout with +-10% jitter (min 250ms), so a fleet of sockets in one
     *   process drifts apart instead of pinging in the same tick
     * - at most one ping in flight; a slow pong never stacks more pings on a busy loop
     * - no ping while other queries are pending and data arrived recently: the link is
     *   demonstrably alive and the ping would only add queue pressure
     * - "lost" is still decided by inbound silence (interval + grace), and skipped when the
     *   timer itself fired late (blocked event loop: pongs may be unread in the socket buffer)
     */
    const startKeepAliveRequest = () => {
        let timer;
        let stopped = false;
        let pingInFlight = false;
        let lastCheckAt;
        let expectedDelayMs = 0;
        const nextDelay = () => {
            const jitter = Math.max(250, Math.floor(keepAliveIntervalMs * 0.1));
            return Math.max(1000, keepAliveIntervalMs + Math.floor((Math.random() * 2 - 1) * jitter));
        };
        const schedule = (delayMs) => {
            if (stopped) {
                return;
            }
            expectedDelayMs = delayMs;
            timer = safeSetTimeout(() => {
                timer = undefined;
                cb();
                schedule(nextDelay());
            }, delayMs);
        };
        const cb = () => {
            if (!lastDateRecv) {
                lastDateRecv = new Date();
            }
            const now = Date.now();
            const sinceRecvMs = now - lastDateRecv.getTime();
            const lagMs = lastCheckAt ? now - lastCheckAt - expectedDelayMs : 0;
            lastCheckAt = now;
            const loopStalled = lagMs > keepAliveGracePeriodMs;
            if (loopStalled) {
                logger.warn({ lagMs, sinceLastRecvMs: sinceRecvMs }, 'event loop stalled; deferring keep-alive timeout');
            }
            if (sinceRecvMs > keepAliveIntervalMs + keepAliveGracePeriodMs && !loopStalled) {
                void handleDisconnect(new Boom('Connection was lost', { statusCode: DisconnectReason.connectionLost }));
                return;
            }
            if (!ws.isOpen) {
                logger.warn('keep alive called when WS not open');
                return;
            }
            if (pingInFlight) {
                logger.trace('keep alive skipped: ping already in flight');
                return;
            }
            if (pendingQueries > 0 && sinceRecvMs < keepAliveGracePeriodMs) {
                logger.trace({ pendingQueries, sinceRecvMs }, 'keep alive skipped: queries pending with recent inbound');
                return;
            }
            pingInFlight = true;
            query({
                tag: 'iq',
                attrs: {
                    id: generateMessageTag(),
                    to: S_WHATSAPP_NET,
                    type: 'get',
                    xmlns: 'w:p'
                },
                content: [{ tag: 'ping', attrs: {} }]
            }, keepAliveIntervalMs + keepAliveGracePeriodMs)
                .catch(err => {
                    // the verdict stays with inbound silence above; a failed ping alone is not "lost"
                    logger.warn({ trace: err.stack }, 'error in sending keep alive');
                })
                .finally(() => { pingInFlight = false; });
        };
        // random first tick staggers sockets that connect together (reconnect storms)
        schedule(Math.floor(Math.random() * (keepAliveIntervalMs / 2)));
        keepAliveReq = {
            cb,
            cancel: () => {
                stopped = true;
                clearSafeTimer(timer);
            }
        };
    };
    /** i have no idea why this exists. pls enlighten me */
    const sendPassiveIq = (tag) => query({
        tag: 'iq',
        attrs: {
            to: S_WHATSAPP_NET,
            xmlns: 'passive',
            type: 'set'
        },
        content: [{ tag, attrs: {} }]
    });
    /** logout & invalidate connection */
    const logout = async (msg) => {
        const jid = authState.creds.me?.id;
        if (jid) {
            await sendNode({
                tag: 'iq',
                attrs: {
                    to: S_WHATSAPP_NET,
                    type: 'set',
                    id: generateMessageTag(),
                    xmlns: 'md'
                },
                content: [
                    {
                        tag: 'remove-companion-device',
                        attrs: {
                            jid,
                            reason: 'user_initiated'
                        }
                    }
                ]
            });
        }
        void end(new Boom(msg || 'Intentional Logout', { statusCode: DisconnectReason.loggedOut }));
    };
    const sendPairingCodeRequest = async (phoneNumber, customPairingCode) => {
        const pairingCode = customPairingCode ?? bytesToCrockford(randomBytes(5));
        authState.creds.pairingCode = pairingCode;
        const jid = jidEncode(phoneNumber, 's.whatsapp.net');
        const pairingPlatform = getPairingCodePlatform(browser);
        try {
            // query, not sendNode: the server answers this IQ, and a fire-and-forget send would
            // hand back a code that the server already rejected
            const result = await query({
                tag: 'iq',
                attrs: {
                    to: S_WHATSAPP_NET,
                    type: 'set',
                    xmlns: 'md'
                },
                content: [
                    {
                        tag: 'link_code_companion_reg',
                        attrs: {
                            jid,
                            stage: 'companion_hello',
                            should_show_push_notification: 'true'
                        },
                        content: [
                            {
                                tag: 'link_code_pairing_wrapped_companion_ephemeral_pub',
                                attrs: {},
                                content: await generatePairingKey()
                            },
                            {
                                tag: 'companion_server_auth_key_pub',
                                attrs: {},
                                content: authState.creds.noiseKey.public
                            },
                            {
                                tag: 'companion_platform_id',
                                attrs: {},
                                content: pairingPlatform.id
                            },
                            {
                                tag: 'companion_platform_display',
                                attrs: {},
                                content: pairingPlatform.display
                            },
                            {
                                tag: 'link_code_pairing_nonce',
                                attrs: {},
                                content: '0'
                            }
                        ]
                    }
                ]
            });
            if (!result) {
                throw new Boom('Timed out waiting for pairing code response', { statusCode: DisconnectReason.timedOut });
            }
        }
        catch (error) {
            // roll the code back, otherwise a retry derives its pairing key from a stale code
            if (authState.creds.pairingCode === pairingCode) {
                authState.creds.pairingCode = undefined;
            }
            throw error;
        }
        // only claim the number once the server accepted it, so a failed attempt doesn't
        // leave creds.me pointing at an unregistered account
        authState.creds.me = { id: jid, name: '~' };
        ev.emit('creds.update', authState.creds);
        return pairingCode;
    };
    const requestPairingCode = async (phoneNumber, customPairingCode) => {
        if (customPairingCode && customPairingCode.length !== 8) {
            throw new Error('Custom pairing code must be exactly 8 chars');
        }
        // WhatsApp Web rejects these characters up front: the phone normalizes 0/I/O/U before it
        // derives its key, so a code containing them fails on the phone ("Couldn't link device")
        // with nothing on the wire. Fail here instead, where the caller can see it.
        const wantedCode = customPairingCode ? normalizePairingCode(customPairingCode) : undefined;
        if (wantedCode) {
            const invalid = invalidPairingCodeChars(wantedCode);
            if (invalid.length) {
                throw new Boom(`Custom pairing code "${wantedCode}" contains characters WhatsApp does not accept (${invalid.join(', ')}); allowed: ${PAIRING_CODE_ALPHABET}`, { statusCode: 400, data: { pairingCode: wantedCode, invalid } });
            }
        }
        if (pairingInProgress) {
            throw new Boom('A pairing request is already in progress', { statusCode: 400 });
        }
        pairingInProgress = true;
        pairingCodeMode = true;
        try {
            if (!pairingReady) {
                // Called before WhatsApp sent pair-device. The IQ would be dropped, so wait for
                // readiness instead of burning the attempt.
                logger.debug('pairing not ready yet, queuing request until pair-device is received');
                await new Promise((resolve, reject) => {
                    // Bounded: without this the caller waits on a pair-device that may never come
                    // and gets no answer until the socket happens to close.
                    const waitTimer = safeSetTimeout(() => {
                        pendingPairingResolve = undefined;
                        pendingPairingReject = undefined;
                        reject(new Boom('Timed out waiting for WhatsApp to accept pairing requests', { statusCode: DisconnectReason.timedOut }));
                    }, connectTimeoutMs);
                    pendingPairingResolve = () => {
                        clearSafeTimer(waitTimer);
                        pendingPairingResolve = undefined;
                        pendingPairingReject = undefined;
                        resolve();
                    };
                    pendingPairingReject = (err) => {
                        clearSafeTimer(waitTimer);
                        pendingPairingResolve = undefined;
                        pendingPairingReject = undefined;
                        reject(err);
                    };
                });
            }
            return await sendPairingCodeRequest(phoneNumber, wantedCode);
        }
        finally {
            pairingInProgress = false;
        }
    };
    async function generatePairingKey() {
        const salt = randomBytes(32);
        const randomIv = randomBytes(16);
        const key = await derivePairingCodeKey(authState.creds.pairingCode, salt);
        const ciphered = aesEncryptCTR(authState.creds.pairingEphemeralKeyPair.public, key, randomIv);
        return Buffer.concat([salt, randomIv, ciphered]);
    }
    const sendWAMBuffer = (wamBuffer) => {
        return query({
            tag: 'iq',
            attrs: {
                to: S_WHATSAPP_NET,
                id: generateMessageTag(),
                xmlns: 'w:stats'
            },
            content: [
                {
                    tag: 'add',
                    attrs: { t: Math.round(Date.now() / 1000) + '' },
                    content: wamBuffer
                }
            ]
        });
    };
    ws.on('message', onMessageReceived);
    ws.on('open', async () => {
        try {
            await validateConnection();
        }
        catch (err) {
            logger.error({ err }, 'error in validating connection');
            void handleDisconnect(err);
        }
    });
    ws.on('error', mapWebSocketError(handleDisconnect));
    ws.on('close', () => void handleDisconnect(new Boom('Connection Terminated', { statusCode: DisconnectReason.connectionClosed })));
    // the server terminated the connection
    ws.on('CB:xmlstreamend', () => void handleDisconnect(new Boom('Connection Terminated by Server', { statusCode: DisconnectReason.connectionClosed })));
    // QR gen
    ws.on('CB:iq,type:set,pair-device', async (stanza) => {
        const iq = {
            tag: 'iq',
            attrs: {
                to: S_WHATSAPP_NET,
                type: 'result',
                id: stanza.attrs.id
            }
        };
        await sendNode(iq);
        // from here the server accepts link_code_companion_reg, so release any queued request
        pairingReady = true;
        pendingPairingResolve?.();
        const pairDeviceNode = getBinaryNodeChild(stanza, 'pair-device');
        const refNodes = getBinaryNodeChildren(pairDeviceNode, 'ref');
        const noiseKeyB64 = Buffer.from(creds.noiseKey.public).toString('base64');
        const identityKeyB64 = Buffer.from(creds.signedIdentityKey.public).toString('base64');
        const advB64 = creds.advSecretKey;
        let qrMs = qrTimeout || 60000; // time to let a QR live
        const genPairQR = () => {
            if (!ws.isOpen) {
                return;
            }
            const refNode = refNodes.shift();
            if (!refNode) {
                // The refs exist for a QR. When the account is being linked by code nobody is
                // looking at one, and ending the socket here cut the attempt off while the user was
                // still walking to Linked devices - about 140s in, on the default timeouts.
                if (pairingCodeMode) {
                    logger.debug('QR refs exhausted while pairing by code, keeping the socket open');
                    return;
                }
                void end(new Boom('QR refs attempts ended', { statusCode: DisconnectReason.timedOut }));
                return;
            }
            const ref = refNode.content.toString('utf-8');
            const qr = buildPairingQRData(ref, noiseKeyB64, identityKeyB64, advB64, browser);
            ev.emit('connection.update', { qr });
            qrTimer = safeSetTimeout(genPairQR, qrMs);
            qrMs = qrTimeout || 20000; // shorter subsequent qrs
        };
        genPairQR();
    });
    // device paired for the first time
    // if device pairs successfully, the server asks to restart the connection
    ws.on('CB:iq,,pair-success', async (stanza) => {
        logger.debug('pair success recv');
        try {
            updateServerTimeOffset(stanza);
            const { reply, creds: updatedCreds } = configureSuccessfulPairing(stanza, creds);
            logger.info({ me: updatedCreds.me, platform: updatedCreds.platform }, 'pairing configured successfully, expect to restart the connection...');
            ev.emit('creds.update', updatedCreds);
            ev.emit('connection.update', { isNewLogin: true, qr: undefined });
            await sendNode(reply);
            void sendUnifiedSession();
        }
        catch (error) {
            logger.info({ trace: error.stack }, 'error in pairing');
            void end(error);
        }
    });
    // login complete
    ws.on('CB:success', async (node) => {
        // a completed handshake clears the reconnect budget: the next drop starts from the base delay
        reconnectAttempts = 0;
        reconnecting = false;
        try {
            updateServerTimeOffset(node);
            await uploadPreKeysToServerIfRequired();
            await sendPassiveIq('active');
            // After successful login, validate our key-bundle against server
            try {
                await digestKeyBundle();
            }
            catch (e) {
                logger.warn({ e }, 'failed to run digest after login');
            }
        }
        catch (err) {
            logger.warn({ err }, 'failed to send initial passive iq');
        }
        logger.info('opened connection to WA');
        clearTimeout(qrTimer); // will never happen in all likelyhood -- but just in case WA sends success on first try
        ev.emit('creds.update', { me: { ...authState.creds.me, lid: node.attrs.lid } });
        if (!authState.creds.me?.id) {
            // `me` absent: the spread above produced a lid-only identity, which hosts then read as
            // `sock.user.id === undefined`. Say so once per socket instead of letting it look healthy.
            logger.error({ credsKeys: Object.keys(authState.creds), registered: authState.creds.registered, hasAccount: !!authState.creds.account }, 'login completed but creds.me.id is missing — host reads sock.user.id unguarded');
        }
        ev.emit('connection.update', { connection: 'open' });
        void sendUnifiedSession();
        if (node.attrs.lid && authState.creds.me?.id) {
            const myLID = node.attrs.lid;
            setImmediate(async () => {
                try {
                    const myPN = authState.creds.me.id;
                    // Store our own LID-PN mapping
                    await signalRepository.lidMapping.storeLIDPNMappings([{ lid: myLID, pn: myPN }]);
                    // Create device list for our own user (needed for bulk migration)
                    const { user, device } = jidDecode(myPN);
                    await authState.keys.set({
                        'device-list': {
                            [user]: [device?.toString() || '0']
                        }
                    });
                    // migrate our own session
                    await signalRepository.migrateSession(myPN, myLID);
                    logger.info({ myPN, myLID }, 'Own LID session created successfully');
                }
                catch (error) {
                    logger.error({ error, lid: myLID }, 'Failed to create own LID session');
                }
            });
        }
    });
    ws.on('CB:stream:error', (node) => {
        const [reasonNode] = getAllBinaryNodeChildren(node);
        logger.error({ reasonNode, fullErrorNode: node }, 'stream errored out');
        const { reason, statusCode } = getErrorCodeFromStreamError(node);
        void handleDisconnect(new Boom(`Stream Errored (${reason})`, { statusCode, data: reasonNode || node }));
    });
    // stream fail, possible logout
    ws.on('CB:failure', async (node) => {
        const reason = +(node.attrs.reason || 500);
        if (reason === 405 && typeof config.version !== 'function') {
            // client_too_old: fetch the live WA Web build so the caller's reconnect uses it
            const latest = await fetchLatestWaWebVersion({});
            if (latest.isLatest) {
                latestVersionOverride = latest.version;
                logger.warn({ rejected: latestVersionOverride === config.version ? undefined : config.version, latest: latest.version }, 'server rejected the client version as too old (405); the next connection uses the latest WA Web version');
            }
            else {
                logger.warn({ err: latest.error?.message }, 'server rejected the client version as too old (405) and the latest version could not be fetched; pass a current `version`');
            }
        }
        void handleDisconnect(new Boom('Connection Failure', { statusCode: reason, data: node.attrs }));
    });
    ws.on('CB:ib,,downgrade_webclient', () => {
        void handleDisconnect(new Boom('Multi-device beta not joined', { statusCode: DisconnectReason.multideviceMismatch }));
    });
    // The server delivers the offline queue in windows and waits for another <offline_batch/>
    // before sending the next one. A single request only drained the first 100 stanzas, so a
    // larger queue never finished and grew on every reconnect. Request the next window each
    // time a queued stanza (attrs.offline) arrives, debounced so a burst yields one request.
    // ponytail: no stanza timeout; the terminal 'offline' bulletin ends the loop.
    let offlineResuming = false;
    let offlineBatchInFlight = false;
    let offlineBatchTimer;
    const requestOfflineBatch = () => {
        if (!offlineResuming || offlineBatchInFlight) {
            return;
        }
        offlineBatchInFlight = true;
        sendNode({
            tag: 'ib',
            attrs: {},
            content: [{ tag: 'offline_batch', attrs: { count: '100' } }]
        }).catch(err => {
            offlineBatchInFlight = false;
            logger.debug({ err }, 'offline batch request failed');
        });
    };
    ws.on('CB:ib,,offline_preview', (node) => {
        logger.info('offline preview received', JSON.stringify(node));
        offlineResuming = true;
        offlineBatchInFlight = false;
        requestOfflineBatch();
    });
    ws.on('frame', (frame) => {
        if (!offlineResuming || frame instanceof Uint8Array || frame.attrs?.offline === undefined) {
            return;
        }
        offlineBatchInFlight = false;
        clearTimeout(offlineBatchTimer);
        offlineBatchTimer = setTimeout(requestOfflineBatch, 100);
    });
    ws.on('CB:ib,,edge_routing', (node) => {
        const edgeRoutingNode = getBinaryNodeChild(node, 'edge_routing');
        const routingInfo = getBinaryNodeChild(edgeRoutingNode, 'routing_info');
        if (routingInfo?.content) {
            authState.creds.routingInfo = Buffer.from(routingInfo?.content);
            ev.emit('creds.update', authState.creds);
        }
    });
    let didStartBuffer = false;
    setImmediate(() => {
        if (creds.me?.id) {
            // start buffering important events
            // if we're logged in
            ev.buffer();
            didStartBuffer = true;
        }
        ev.emit('connection.update', { connection: 'connecting', receivedPendingNotifications: false, qr: undefined });
    });
    // called when all offline notifs are handled
    ws.on('CB:ib,,offline', (node) => {
        offlineResuming = false;
        clearTimeout(offlineBatchTimer);
        const child = getBinaryNodeChild(node, 'offline');
        const offlineNotifs = +(child?.attrs.count || 0);
        logger.info(`handled ${offlineNotifs} offline messages/notifications`);
        if (didStartBuffer) {
            ev.flush();
            logger.trace('flushed events for initial buffer');
        }
        ev.emit('connection.update', { receivedPendingNotifications: true });
    });
    // update credentials when required
    ev.on('creds.update', update => {
        const name = update.me?.name;
        // if name has just been received
        if (creds.me?.name !== name) {
            logger.debug({ name }, 'updated pushName');
            sendNode({
                tag: 'presence',
                attrs: { name: name }
            }).catch(err => {
                logger.warn({ trace: err.stack }, 'error in sending presence update on name change');
            });
        }
        Object.assign(creds, update);
        if (creds.me) {
            lastMe = creds.me;
        }
    });
    const updateServerTimeOffset = ({ attrs }) => {
        const tValue = attrs?.t;
        if (!tValue) {
            return;
        }
        const parsed = Number(tValue);
        if (Number.isNaN(parsed) || parsed <= 0) {
            return;
        }
        const localMs = Date.now();
        serverTimeOffsetMs = parsed * 1000 - localMs;
        logger.debug({ offset: serverTimeOffsetMs }, 'calculated server time offset');
    };
    const getUnifiedSessionId = () => {
        const offsetMs = 3 * TimeMs.Day;
        const now = Date.now() + serverTimeOffsetMs;
        const id = (now + offsetMs) % TimeMs.Week;
        return id.toString();
    };
    const sendUnifiedSession = async () => {
        if (!ws.isOpen) {
            return;
        }
        const node = {
            tag: 'ib',
            attrs: {},
            content: [
                {
                    tag: 'unified_session',
                    attrs: {
                        id: getUnifiedSessionId()
                    }
                }
            ]
        };
        try {
            await sendNode(node);
        }
        catch (error) {
            logger.debug({ error }, 'failed to send unified_session telemetry');
        }
    };
    const registerSocketEndHandler = (handler) => {
        socketEndHandlers.push(handler);
    };
    const registerSocketReconnectHandler = (handler) => {
        socketReconnectHandlers.push(handler);
    };
    /**
     * Fetches your account's standing when it comes to restrictions.
     * @returns Returns the state of the restrictions.
     */
    const fetchAccountReachoutTimelock = async () => {
        const queryResult = await executeWMexQuery({}, QueryIds.REACHOUT_TIMELOCK, XWAPaths.xwa2_fetch_account_reachout_timelock, query, generateMessageTag);
        const result = {
            isActive: !!queryResult?.is_active,
            timeEnforcementEnds: queryResult?.time_enforcement_ends && queryResult?.time_enforcement_ends !== '0'
                ? new Date(parseInt(queryResult.time_enforcement_ends, 10) * 1000)
                : undefined,
            enforcementType: queryResult?.enforcement_type ?? ReachoutTimelockEnforcementType.DEFAULT
        };
        ev.emit('connection.update', { reachoutTimeLock: result });
        return result;
    };
    /**
     * Fetches your account's new chat limits.
     * @returns Returns the quota and the usage.
     */
    const fetchNewChatMessageCap = async () => {
        return executeWMexQuery({ input: { type: 'INDIVIDUAL_NEW_CHAT_MSG' } }, QueryIds.MESSAGE_CAPPING_INFO, XWAPaths.xwa2_message_capping_info, query, generateMessageTag);
    };
    return {
        type: 'md',
        ws,
        ev,
        authState: { creds, keys },
        signalRepository,
        get user() {
            const me = authState.creds.me ?? lastMe;
            if (!me && !userMissingLogged) {
                userMissingLogged = true;
                logger.error(
                    {
                        credsKeys: Object.keys(authState.creds),
                        registered: authState.creds.registered,
                        hasAccount: !!authState.creds.account,
                        sameAuthObject: authState === config.auth
                    },
                    'sock.user is undefined: creds.me never arrived on this socket (host reads sock.user.id unguarded)'
                );
            }
            return me;
        },
        /**
         * True while the transport is repairing itself. A host that reads this does not build a
         * second socket for the same account, which is what a `ws.isOpen === false` check would
         * make it do during the backoff window and the handshake that follows.
         */
        get isReconnecting() {
            return reconnecting || (reconnectAttempts > 0 && !closed && !ws.isOpen);
        },
        generateMessageTag,
        ignoreKey: ignoreKeyRegistry.register,
        query,
        waitForMessage,
        waitForSocketOpen,
        sendRawMessage,
        sendNode,
        logout,
        end,
        registerSocketEndHandler,
        registerSocketReconnectHandler,
        onUnexpectedError,
        uploadPreKeys,
        uploadPreKeysToServerIfRequired,
        digestKeyBundle,
        rotateSignedPreKey,
        requestPairingCode,
        updateServerTimeOffset,
        sendUnifiedSession,
        wamBuffer: publicWAMBuffer,
        /** Waits for the connection to WA to reach a state */
        waitForConnectionUpdate: bindWaitForConnectionUpdate(ev),
        sendWAMBuffer,
        executeUSyncQuery,
        onWhatsApp,
        onWhatsAppUsername,
        fetchUsername,
        checkUsername,
        setUsername,
        deleteUsername,
        getMyUsername,
        setUsernamePin,
        fetchAccountReachoutTimelock,
        fetchNewChatMessageCap
    };
};
/**
 * map the websocket error to the right type
 * so it can be retried by the caller
 * */
function mapWebSocketError(handler) {
    return (error) => {
        handler(new Boom(`WebSocket Error (${error?.message})`, { statusCode: getCodeFromWSError(error), data: error }));
    };
}
//# sourceMappingURL=socket.js.map