import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { randomBytes } from "crypto";
import { ROOM_CODE_LENGTH } from "./dto/room.dto";

/**
 * ROOMS SERVICE — sync layer only
 * ---------------------------------
 * Per the confirmed scope: this service, and everything downstream
 * of it (RoomsGateway), coordinates WATCH-TOGETHER STATE — who's in
 * a room, what content they've agreed to watch, and playback
 * position/status for reconnecting clients. It never stores, reads,
 * or transmits an actual video byte. playbackPositionSec on the Room
 * model (schema.prisma) is a timestamp integer, not a media chunk —
 * each member's own browser loads and plays the content
 * independently via Content.officialWatchUrl, exactly as confirmed.
 */

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids ambiguous codes read aloud or over chat

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  private generateCode(): string {
    const bytes = randomBytes(ROOM_CODE_LENGTH);
    let code = "";
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    }
    return code;
  }

  async createRoom(hostId: string, contentId?: string, isPrivate = false) {
    if (contentId) {
      const content = await this.prisma.content.findUnique({
        where: { id: contentId },
        select: { id: true },
      });
      if (!content) {
        throw new NotFoundException(`No content with id ${contentId}`);
      }
    }

    // Retry on the astronomically unlikely code collision rather than
    // trusting uniqueness blindly — @@unique([code]) on Room is the
    // real backstop, this just avoids surfacing a raw P2002 to the
    // caller for something that's really just "roll again."
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const room = await this.prisma.room.create({
          data: {
            code: this.generateCode(),
            hostId,
            contentId,
            isPrivate,
          },
        });
        await this.prisma.roomMember.create({
          data: { roomId: room.id, userId: hostId },
        });
        return room;
      } catch (err: any) {
        if (err?.code === "P2002" && attempt < 4) continue;
        throw err;
      }
    }
    throw new BadRequestException(
      "Could not generate a unique room code — try again",
    );
  }

  async getRoomByCode(code: string) {
    const room = await this.prisma.room.findUnique({
      where: { code: code.toUpperCase() },
      include: { members: { where: { leftAt: null } } },
    });
    if (!room) {
      throw new NotFoundException("No room with that code");
    }
    if (room.status === "ENDED") {
      throw new BadRequestException("This room has ended");
    }
    return room;
  }

  async joinRoom(roomId: string, userId: string) {
    // Re-open an existing membership (leftAt cleared) rather than
    // creating a duplicate row — @@unique([roomId, userId]) on
    // RoomMember means a straight create() would throw for a user
    // who left and is rejoining.
    const existing = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });

    if (existing) {
      if (existing.leftAt === null) {
        return existing; // already an active member — idempotent
      }
      return this.prisma.roomMember.update({
        where: { id: existing.id },
        data: { leftAt: null, joinedAt: new Date() },
      });
    }

    return this.prisma.roomMember.create({
      data: { roomId, userId },
    });
  }

  async leaveRoom(roomId: string, userId: string) {
    const member = await this.prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!member || member.leftAt !== null) {
      return; // not an active member — nothing to do, not an error
    }
    await this.prisma.roomMember.update({
      where: { id: member.id },
      data: { leftAt: new Date() },
    });
  }

  async getActiveMemberCount(roomId: string): Promise<number> {
    return this.prisma.roomMember.count({
      where: { roomId, leftAt: null },
    });
  }

  /**
   * Only the host may drive PLAY/PAUSE/SEEK — this keeps one
   * authoritative timeline per room instead of members fighting over
   * playback state. Enforced here so both the Gateway and any future
   * REST equivalent share the same check.
   */
  async assertIsHost(roomId: string, userId: string): Promise<void> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { hostId: true },
    });
    if (!room) throw new NotFoundException("Room not found");
    if (room.hostId !== userId) {
      throw new ForbiddenException("Only the room host can control playback");
    }
  }

  async updatePlaybackState(
    roomId: string,
    status: "WAITING" | "PLAYING" | "PAUSED" | "ENDED",
    positionSec: number,
  ) {
    return this.prisma.room.update({
      where: { id: roomId },
      data: {
        status,
        playbackPositionSec: positionSec,
        lastSyncedAt: new Date(),
      },
    });
  }
}
