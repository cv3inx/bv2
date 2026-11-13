export interface WACallEvent {
    id: string;
    from: string;
    chatId?: string;
    date: Date;
    offline: boolean;
    status: string;
    isVideo?: boolean;
    isGroup?: boolean;
    callKey?: Uint8Array;
    audioCodecs?: unknown[];
    audioCodec?: unknown;
    videoCodec?: unknown;
    isLightweight?: boolean;
    silenceReason?: string;
    peerJid?: string;
    participants?: unknown[];
    muted?: boolean;
    enabled?: boolean;
    state?: string;
    latencyMs?: number;
}
