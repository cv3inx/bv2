export class USyncSidelistProtocol {
    constructor(useLidAddressing?: boolean);
    name: string;
    useLidAddressing: boolean;
    getQueryElement(): any;
    getUserElement(user: any): any;
    parser(node: any): {
        type: string | null;
    } | null;
}
