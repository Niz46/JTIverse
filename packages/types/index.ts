// ============================================================
// SHARED TYPES — imported by both apps/web and apps/api
// ============================================================
// Keep these in lockstep with prisma/schema.prisma enums.
// If you add an enum value in Prisma, mirror it here in the same PR,
// or the frontend title-badge renderer / color map will silently
// fall through to a default case for the new value.
// ============================================================

export type Gender = 'MALE' | 'FEMALE' | 'UNSPECIFIED';

export type ContentType = 'ANIME' | 'DONGHUA' | 'MOVIE';

export type TitleTier =
  | 'COMMON'
  | 'UNCOMMON'
  | 'RARE'
  | 'EPIC'
  | 'LEGENDARY'
  | 'MYTHIC';

export type TaskType =
  | 'WATCH_COUNT'
  | 'COMMENT_COUNT'
  | 'ROOM_CREATE_COUNT'
  | 'ROOM_JOIN_COUNT'
  | 'STREAK_DAYS'
  | 'INVITE_COUNT';

export type TokenTransactionType =
  | 'TASK_REWARD'
  | 'TITLE_PURCHASE'
  | 'ADMIN_GRANT'
  | 'ADMIN_DEDUCT'
  | 'REFUND';

export type RoomStatus = 'WAITING' | 'PLAYING' | 'PAUSED' | 'ENDED';

export type UserRole = 'USER' | 'MODERATOR' | 'ADMIN';

export type ModerationAction = 'APPROVED' | 'FLAGGED' | 'REJECTED';

// ------------------------------------------------------------
// Tier display config — single source of truth for title styling.
// Both the shop UI and the comment-badge renderer import this,
// so a tier's look only ever needs to change in one place.
// ------------------------------------------------------------

export interface TierConfig {
  label: string;
  defaultColorHex: string;
  glow: boolean;
  animated: boolean;
}

export const TITLE_TIER_CONFIG: Record<TitleTier, TierConfig> = {
  COMMON: { label: 'Common', defaultColorHex: '#9CA3AF', glow: false, animated: false },
  UNCOMMON: { label: 'Uncommon', defaultColorHex: '#22C55E', glow: false, animated: false },
  RARE: { label: 'Rare', defaultColorHex: '#3B82F6', glow: false, animated: false },
  EPIC: { label: 'Epic', defaultColorHex: '#A855F7', glow: true, animated: false },
  LEGENDARY: { label: 'Legendary', defaultColorHex: '#F59E0B', glow: true, animated: false },
  MYTHIC: { label: 'Mythic', defaultColorHex: '#EF4444', glow: true, animated: true },
};

// ------------------------------------------------------------
// Core entity shapes (client-facing — trimmed of internal-only fields)
// ------------------------------------------------------------

export interface PublicUser {
  id: string;
  username: string;
  gender: Gender;
  avatarUrl: string | null;
  bio: string | null;
  tokenBalance: number;
  equippedTitle: PublicTitle | null;
  role: UserRole;
  createdAt: string;
}

export interface PublicTitle {
  id: string;
  name: string;
  tier: TitleTier;
  colorHex: string;
  gradientHex: string | null;
  isAnimated: boolean;
  tokenCost: number;
  isDefault: boolean;
  unlockNote: string | null;
}

export interface PublicContent {
  id: string;
  type: ContentType;
  title: string;
  titleNative: string | null;
  synopsis: string | null;
  coverImageUrl: string | null;
  bannerImageUrl: string | null;
  episodeCount: number | null;
  releaseYear: number | null;
  genres: string[];
  countryOfOrigin: string | null;
  rating: number | null;
  status: string | null;
  officialWatchUrl: string | null;
  trailerEmbedUrl: string | null;
}

export interface PublicComment {
  id: string;
  userId: string;
  username: string;
  contentId: string;
  body: string;
  // Rendered from the SNAPSHOT fields, not live title data — see schema notes.
  titleSnapshotName: string;
  titleSnapshotColorHex: string;
  titleSnapshotTier: TitleTier;
  createdAt: string;
}

export interface PublicTask {
  id: string;
  name: string;
  description: string;
  type: TaskType;
  threshold: number;
  tokenReward: number;
  isRepeatable: boolean;
}

export interface UserTaskProgressView {
  taskId: string;
  currentCount: number;
  threshold: number;
  isCompleted: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  equippedTitle: PublicTitle | null;
  score: number; // meaning depends on leaderboard type (tokens earned, content watched, etc.)
}

export interface RoomState {
  id: string;
  code: string;
  hostId: string;
  contentId: string | null;
  status: RoomStatus;
  isPrivate: boolean;
  playbackPositionSec: number;
  memberCount: number;
}

// ------------------------------------------------------------
// WebSocket event payloads (rooms) — shared contract between
// the NestJS Gateway and the Next.js socket client.
// ------------------------------------------------------------

export type RoomClientEvent =
  | { type: 'JOIN_ROOM'; roomCode: string }
  | { type: 'LEAVE_ROOM'; roomId: string }
  | { type: 'PLAY'; roomId: string; positionSec: number }
  | { type: 'PAUSE'; roomId: string; positionSec: number }
  | { type: 'SEEK'; roomId: string; positionSec: number };

export type RoomServerEvent =
  | { type: 'ROOM_STATE'; room: RoomState }
  | { type: 'MEMBER_JOINED'; userId: string; username: string }
  | { type: 'MEMBER_LEFT'; userId: string }
  | { type: 'PLAYBACK_SYNC'; status: RoomStatus; positionSec: number; issuedBySocketId: string };
