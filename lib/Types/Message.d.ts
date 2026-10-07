export { proto as WAProto };
export type WAMessage = proto.IWebMessageInfo & { key: WAMessageKey };
export type WAMessageKey = proto.IMessageKey & {
    remoteJidAlt?: string;
    participantAlt?: string;
    remoteJidUsername?: string;
};
export type WAMessageContent = proto.IMessage;
export type MessageUpsertType = 'append' | 'notify';
export type WAMessageUpdate = { key: WAMessageKey; update: Partial<WAMessage> };
export type WAMediaUpload = Buffer | { url: string | URL } | { stream: import('node:stream').Readable };
export const AssociationType: typeof proto.MessageAssociation.AssociationType;
export const ButtonHeaderType: typeof proto.Message.ButtonsMessage.HeaderType;
export const ButtonType: typeof proto.Message.ButtonsMessage.Button.Type;
export const CarouselCardType: typeof proto.Message.InteractiveMessage.CarouselMessage.CarouselCardType;
export const ListType: typeof proto.Message.ListMessage.ListType;
export const ProtocolType: typeof proto.Message.ProtocolMessage.Type;
export const WAMessageStubType: typeof proto.WebMessageInfo.StubType;
export const WAMessageStatus: typeof proto.WebMessageInfo.Status;
export const WAMessageAddressingMode: any;
import { proto } from '../../WAProto/index.js';
//# sourceMappingURL=Message.d.ts.map
