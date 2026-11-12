export class USyncPictureProtocol {
    constructor(type?: 'image' | 'preview');
    name: string;
    type: string;
    getQueryElement(): any;
    getUserElement(user: any): any;
    parser(node: any): {
        id: string | null;
        directPath: string | null;
        hash: string | null;
    } | null;
}
