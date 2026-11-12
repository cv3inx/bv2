export class USyncQuery {
    protocols: any[];
    users: any[];
    context: string;
    mode: string;
    withMode(mode: any): this;
    withContext(context: any): this;
    withUser(user: any): this;
    parseUSyncQueryResult(result: any): {
        errors: Record<string, {
            errorCode?: number;
            errorText?: string;
            errorBackoff?: number;
        }>;
        refresh: Record<string, number>;
        list: any[];
        sideList: any[];
    } | undefined;
    withDeviceProtocol(): this;
    withContactProtocol(): this;
    withStatusProtocol(): this;
    withDisappearingModeProtocol(): this;
    withBotProfileProtocol(): this;
    withLIDProtocol(): this;
    withUsernameProtocol(): this;
    withBusinessProtocol(profileVersion?: string): this;
    withPictureProtocol(type?: 'image' | 'preview'): this;
    withTextStatusProtocol(): this;
    withSidelistProtocol(useLidAddressing?: boolean): this;
    withFeatureProtocol(features?: string[]): this;
}
//# sourceMappingURL=USyncQuery.d.ts.map