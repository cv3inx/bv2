import type { Contact } from './Contact.js';
export type ParticipantAction = 'add' | 'remove' | 'promote' | 'demote';
export interface GroupParticipant extends Contact {
    admin?: 'admin' | 'superadmin' | null | false;
}
export interface GroupMetadata {
    id: string;
    subject: string;
    participants: GroupParticipant[];
    notify?: string;
    addressingMode?: 'lid' | 'pn';
    owner?: string;
    ownerPn?: string;
    ownerUsername?: string;
    owner_country_code?: string;
    subjectOwner?: string;
    subjectOwnerPn?: string;
    subjectOwnerUsername?: string;
    subjectTime?: number;
    creation?: number;
    size?: number;
    desc?: string;
    descId?: string;
    descOwner?: string;
    descOwnerPn?: string;
    descOwnerUsername?: string;
    descTime?: number;
    restrict?: boolean;
    announce?: boolean;
    isCommunity?: boolean;
    isCommunityAnnounce?: boolean;
    joinApprovalMode?: boolean;
    memberAddMode?: boolean;
    linkedParent?: string;
    ephemeralDuration?: number;
}
