import { EventEmitter } from "events";
import { Agent } from "https";
export type ConnectionManagerSession = {
    id: string;
    [key: string]: any;
};
export type ConnectionManagerOptions = {
    /** Build one socket for a session. Called again for every reconnect. */
    create: (session: ConnectionManagerSession) => Promise<any> | any;
    sessions?: ConnectionManagerSession[];
    maxConcurrent?: number;
    reconnect?: boolean;
    baseDelayMs?: number;
    maxDelayMs?: number;
    maxAttempts?: number;
    staggerMs?: number;
    logger?: any;
};
export type ConnectionManagerStats = {
    total: number;
    idle: number;
    connecting: number;
    open: number;
    reconnecting: number;
    closed: number;
    failed: number;
    activeConnects: number;
    queuedConnects: number;
};
export declare class ConnectionManager extends EventEmitter {
    #private;
    constructor(options: ConnectionManagerOptions);
    start(): ConnectionManagerStats;
    get(id: string): any | null;
    stop(id: string): boolean;
    close(): Promise<void>;
    stats(): ConnectionManagerStats;
}
export declare const makeConnectionManager: (options: ConnectionManagerOptions) => ConnectionManager;
export declare const makeWssAgent: (options?: {
    maxSockets?: number;
    keepAlive?: boolean;
    keepAliveMsecs?: number;
}) => Agent;
