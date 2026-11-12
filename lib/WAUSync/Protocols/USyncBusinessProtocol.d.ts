export class USyncBusinessProtocol {
    constructor(profileVersion?: string);
    name: string;
    profileVersion: string;
    getQueryElement(): any;
    getUserElement(user: any): any;
    parser(node: any): any;
}
