export const USYNC_FEATURES: string[];
export class USyncFeatureProtocol {
    constructor(features?: string[]);
    name: string;
    features: string[];
    getQueryElement(): any;
    getUserElement(): null;
    parser(node: any): Record<string, any> | null;
}
