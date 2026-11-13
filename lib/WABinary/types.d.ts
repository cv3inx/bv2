export type BinaryNodeAttributes = Record<string, string>;
export type BinaryNode = {
    tag: string;
    attrs: BinaryNodeAttributes;
    content?: BinaryNode[] | Uint8Array | string;
};
