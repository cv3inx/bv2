export type AnchorGuardLimits = {
    maxText: number;
    maxCaption: number;
    maxMentions: number;
    maxGroupMentions: number;
    maxButtons: number;
    maxSections: number;
    maxRows: number;
    maxCards: number;
    maxDepth: number;
    maxNodes: number;
    maxBytes: number;
    maxParamsJson: number;
    maxInvisibleRun: number;
    maxCombiningRun: number;
    maxNewlines: number;
};
export declare const ANCHORGUARD_DEFAULTS: AnchorGuardLimits;
export type AnchorGuardDetectOptions = Partial<AnchorGuardLimits> & {
    /** Pre-computed encoded size, checked against `maxBytes` without re-encoding. */
    byteLength?: number;
    /** Pass the `proto` namespace to also measure the encoded size. Costs an encode per check. */
    proto?: any;
};
export type AnchorGuardDetectResult = {
    flagged: boolean;
    reasons: string[];
};
export declare const detectBug: (message: any, options?: AnchorGuardDetectOptions) => AnchorGuardDetectResult;
export type AnchorGuardDetection = {
    direction: 'incoming' | 'outgoing' | 'group-add';
    jid?: string;
    sender?: string;
    message?: any;
    content?: any;
    reasons: string[];
    burst?: boolean;
};
export type AnchorGuardOptions = {
    /** Delete a flagged inbound message. Default `true`. */
    autoDelete?: boolean;
    /** `'auto'` revokes own messages and deletes others locally. Default `'auto'`. */
    deleteMode?: 'auto' | 'everyone' | 'me';
    /** Guard `messages.upsert`. Default `true`. */
    guardIncoming?: boolean;
    /** Wrap `sock.sendMessage` and reject crash payloads. Default `false`. */
    guardOutgoing?: boolean;
    /** Block the sender of a flagged message. Default `false`. */
    blockOnBug?: boolean;
    /** Only guard own chats. Default `false`. */
    selfOnly?: boolean;
    thresholds?: Partial<AnchorGuardLimits>;
    onDetect?: (detection: AnchorGuardDetection) => void | Promise<void>;
    proto?: any;
    /** Messages from one sender inside `burstWindowMs` before it counts as a burst. `0` disables. */
    burstThreshold?: number;
    burstWindowMs?: number;
    /** Remove the sender from the group on burst. Needs admin. Default `false`. */
    kickOnBurst?: boolean;
    /** Flag/kick when a burst-flagged inviter adds this account to a group. Default `false`. */
    guardGroupAdds?: boolean;
    /** Guard Meta AI's numbers instead of exempting them. Default `false`. */
    metaAiNumbers?: boolean;
    ownJid?: string;
    logger?: any;
};
export declare const createAnchorGuard: (sock: any, options?: AnchorGuardOptions) => {
    detect: (message: any) => AnchorGuardDetectResult;
    stop: () => void;
};
export declare const createAntiBugGuard: typeof createAnchorGuard;
