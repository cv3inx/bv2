export interface BusinessProfile {
    wid: string;
    address?: string;
    description?: string;
    email?: string;
    website?: string[];
    category?: string;
    business_hours?: { timezone?: string; business_config: unknown[] };
}
