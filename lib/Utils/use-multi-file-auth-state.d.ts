export function useMultiFileAuthState(folder: any, logger?: any): Promise<{
    state: {
        creds: any;
        keys: {
            get: (type: any, ids: any) => Promise<{}>;
            set: (data: any) => Promise<void>;
        };
    };
    saveCreds: () => void;
    _flushCreds: () => Promise<void>;
    _destroy: () => void;
}>;
//# sourceMappingURL=use-multi-file-auth-state.d.ts.map
