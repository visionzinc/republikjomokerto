export type UserRole = 'superadmin' | 'admin' | 'member' | 'guest';

export type AccountStatus = 'active' | 'suspended';

export type LocationType = 'real' | 'fictional';

export type SocialLinks = {
  instagram?: string;
  twitter?: string;
  discord?: string;
  tiktok?: string;
  youtube?: string;
  github?: string;
  website?: string;
};

export interface PublicUser {
  id: string;
  username: string;
  email?: string;
  role: UserRole;
  avatarUrl: string;
  googleLinked: boolean;
  accountStatus?: AccountStatus;
  suspendedReason?: string;
  createdAt: string;
}

export interface KtpProfile {
  userId: string;
  ktpSerial: string;
  fullName: string;
  title: string;
  locationType: LocationType;
  locationName: string;
  faction: string;
  motto: string;
  bloodGroup: string;
  socialLinks: SocialLinks;
  verifiedByAdmin: boolean;
  issuedAt: string;
}

export interface CitizenRecord {
  user: PublicUser;
  ktp: KtpProfile | null;
}

export interface TimelinePost {
  id: string;
  authorId: string;
  authorUsername: string;
  authorAvatar: string;
  authorRole: UserRole;
  authorTitle?: string;
  contentText: string;
  imageUrl?: string;
  imageMimeType?: string;
  locationTag: string;
  likesCount: number;
  likedByMe?: boolean;
  createdAt: string;
}

export interface ChatRoom {
  id: string;
  name: string;
  description: string;
  type: 'channel' | 'dm' | 'group';
  realmTag: string;
  participants?: string[];
  creatorId?: string;
  coCreatorIds?: string[];
  isArchived?: boolean;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderUsername: string;
  senderAvatar: string;
  senderRole: UserRole;
  messageText: string;
  createdAt: string;
}

export interface BlockedUserEntry {
  blockedUserId: string;
  username: string;
  avatarUrl: string;
  createdAt: string;
}

export type ReportTargetType = 'user' | 'post' | 'message';
export type ReportStatus = 'pending' | 'resolved' | 'dismissed';

export interface ContentReport {
  id: string;
  reporterId: string;
  reporterUsername: string;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId: string;
  targetUsername: string;
  targetSnippet: string;
  category: string;
  reason: string;
  status: ReportStatus;
  resolutionNote?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type AppealStage =
  | 'pledoi'
  | 'replik'
  | 'duplik'
  | 'rejected_for_kasasi'
  | 'kasasi'
  | 'accepted'
  | 'final_rejected';

export interface ModerationAppeal {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string;
  suspendedReason?: string;
  stage: AppealStage;
  pledoiText: string;
  replikText?: string;
  duplikText?: string;
  kasasiText?: string;
  adminVerdictNote?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MapPinItem {
  id: string;
  authorId: string;
  authorUsername: string;
  title: string;
  description: string;
  gameTag: string;
  mode: LocationType;
  lat?: number;
  lng?: number;
  realmId?: string;
  realmX?: number;
  realmY?: number;
  placeUri?: string;
  createdAt: string;
}

export interface FictionalRealm {
  id: string;
  name: string;
  originGame: string;
  summary: string;
  anchorX: number;
  anchorY: number;
}

export const DEFAULT_AVATAR_URL = '/src/assets/images/avatar_default_citizen_1795010738640.jpg';
export const REPUBLIC_SEAL_URL = '/src/assets/images/seal_jomokerto_emblem_1795010738592.jpg';
export const HERO_CIVIC_URL = '/src/assets/images/hero_jomokerto_civic_1795010737788.jpg';
export const REALM_ATLAS_URL = '/src/assets/images/realm_atlas_bg_1795010739682.jpg';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
  'image/x-icon',
] as const;

export const ALLOWED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.avif',
  '.svg',
  '.bmp',
  '.tif',
  '.tiff',
  '.ico',
] as const;

export const AI_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '21:9',
] as const;

export type AiAspectRatio = (typeof AI_ASPECT_RATIOS)[number];

export const FICTIONAL_REALMS: FictionalRealm[] = [
  {
    id: 'ngawi-prime',
    name: 'Ngawi Prime',
    originGame: 'Republik Jomokerto',
    summary: 'Ibu kota administratif dan titik nol peradaban penjomok dunia.',
    anchorX: 34,
    anchorY: 46,
  },
  {
    id: 'sumeru',
    name: 'Sumeru Rainforest',
    originGame: 'Genshin Impact',
    summary: 'Distrik Akademiya, kedai kopi Irminsul, dan markas riset resin.',
    anchorX: 52,
    anchorY: 28,
  },
  {
    id: 'mondstadt',
    name: 'Mondstadt Tavern',
    originGame: 'Genshin Impact',
    summary: 'Zona kebebasan, diskusi meta mingguan, dan bard keliling.',
    anchorX: 25,
    anchorY: 22,
  },
  {
    id: 'inazuma',
    name: 'Inazuma Archipelago',
    originGame: 'Genshin Impact',
    summary: 'Kepulauan esports malam hari dan turnamen kartu lokal.',
    anchorX: 74,
    anchorY: 64,
  },
  {
    id: 'los-santos',
    name: 'Los Santos Ngawi',
    originGame: 'GTA Roleplay',
    summary: 'Distrik balap motor dan bengkel modifikasi antar warga.',
    anchorX: 60,
    anchorY: 74,
  },
];
