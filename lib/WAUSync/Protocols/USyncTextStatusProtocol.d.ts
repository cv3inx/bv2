export class USyncTextStatusProtocol {
    name: string;
    getQueryElement(): any;
    getUserElement(): null;
    parser(node: any): {
        text: string | null;
        emoji: string | null;
        setAt: Date;
        expiresAt: Date | null;
    } | null;
}
