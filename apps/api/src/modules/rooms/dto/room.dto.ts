export const ROOM_CODE_LENGTH = 6;

export interface CreateRoomDto {
  contentId?: string;
  isPrivate?: boolean;
}

export interface JoinRoomDto {
  code: string;
}
