import { Logger } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { verifyToken } from "@clerk/backend";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { RoomsService } from "./rooms.service";
import { PrismaService } from "../../common/prisma.service";
import { RoomStatus } from "@prisma/client";

/**
 * ROOMS GATEWAY — real-time half of the watch-sync layer
 * ----------------------------------------------------------
 * rooms.service.ts's docstring and app.module.ts's own comment both
 * already describe this file before it existed ("everything
 * downstream of [RoomsService] (RoomsGateway)... coordinates
 * WATCH-TOGETHER STATE"). This is that implementation, wired in for
 * the first time. Same non-negotiable boundary as everywhere else in
 * Rooms: this gateway relays presence and playback TIMESTAMPS, never
 * a video byte. Members load Content.officialWatchUrl in their own
 * browser; this only keeps their players' clocks in sync.
 *
 * AUTH: Socket.IO connections don't go through ClerkAuthGuard (that
 * guard is HTTP-request-shaped — it reads an Authorization header off
 * an Express Request). This gateway re-implements the same
 * verify-token-then-load-local-User check for the WS handshake
 * instead of trying to force an HTTP guard onto a socket. Every
 * RoomMember row requires a non-null userId (see schema.prisma), so
 * unlike ContentController's GET routes there is no meaningful
 * "anonymous" case here to support — a socket that fails auth is
 * disconnected immediately in handleConnection, before any event
 * handler below ever runs.
 *
 * The client is expected to pass its Clerk session token as
 * `auth: { token: "<jwt>" }` on the Socket.IO client's connection
 * options — NOT a query string, which frequently ends up logged by
 * intermediate proxies (see nginx.conf).
 */
@WebSocketGateway({
  namespace: "rooms",
  cors: {
    // Mirrors main.ts's HTTP CORS config exactly — same trusted
    // origin, same reasoning. Keep these two in lockstep.
    origin: process.env.WEB_APP_URL ?? "http://localhost:3000",
    credentials: true,
  },
})
export class RoomsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(RoomsGateway.name);

  constructor(
    private readonly rooms: RoomsService,
    private readonly prisma: PrismaService,
    @InjectQueue("token-grant") private readonly tokenGrantQueue: Queue,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;

    if (!token) {
      this.logger.warn(`Socket ${client.id} connected with no auth token`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
        authorizedParties: (process.env.CLERK_AUTHORIZED_PARTIES ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });

      const user = await this.prisma.user.findUnique({
        where: { clerkId: payload.sub },
        select: { id: true, username: true, isBanned: true },
      });

      if (!user || user.isBanned) {
        client.disconnect(true);
        return;
      }

      // Stashed for every subsequent event on this connection — same
      // spirit as ClerkAuthGuard attaching `request.user` once per
      // HTTP request, just scoped to the socket's lifetime instead.
      client.data.userId = user.id;
      client.data.username = user.username;
      client.data.currentRoomId = null as string | null;
    } catch (err) {
      this.logger.warn(
        `Socket ${client.id} failed auth: ${err instanceof Error ? err.message : String(err)}`,
      );
      client.disconnect(true);
    }
  }

  /**
   * Disconnect (tab close, network drop, explicit client-side
   * disconnect) is the ONLY place presence is guaranteed to be
   * cleaned up — a client that never sends an explicit 'room:leave'
   * (e.g. it just crashed) must not linger as an active member
   * forever. Idempotent via RoomsService.leaveRoom's own no-op check.
   */
  async handleDisconnect(client: Socket): Promise<void> {
    const roomId = client.data.currentRoomId as string | null;
    const userId = client.data.userId as string | undefined;
    if (!roomId || !userId) return;

    await this.rooms.leaveRoom(roomId, userId);
    client.to(roomId).emit("room:member-left", { userId });
  }

  /**
   * Join a room by its shareable code. Resolves the code to a real
   * Room (reusing RoomsService.getRoomByCode's existing NotFound/
   * Ended checks — no duplicated validation logic), records
   * membership, puts the socket in a Socket.IO room keyed by the
   * Room's internal id (not its code — codes are meant to be
   * human-shareable and are not guaranteed collision-proof against
   * concurrent code reuse after a room ends), then syncs the joiner
   * up to the room's current state.
   */
  @SubscribeMessage("room:join")
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { code: string },
  ): Promise<void> {
    const userId = client.data.userId as string;

    let room;
    try {
      room = await this.rooms.getRoomByCode(data.code);
    } catch (err) {
      client.emit("room:error", {
        message: err instanceof Error ? err.message : "Could not join room",
      });
      return;
    }

    const { isNewJoin } = await this.rooms.joinRoom(room.id, userId);

    client.data.currentRoomId = room.id;
    await client.join(room.id);

    // ROOM_JOIN_COUNT task trigger — only for a genuinely new join,
    // per rooms.service.ts's own reasoning on why isNewJoin exists.
    // Same enqueue-after-persist, fire-and-forget pattern established
    // in comments.controller.ts and rooms.controller.ts's create().
    if (isNewJoin) {
      this.tokenGrantQueue
        .add("room-join-count", { userId, taskType: "ROOM_JOIN_COUNT" })
        .catch((err) => {
          this.logger.error(
            `Failed to enqueue ROOM_JOIN_COUNT job for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    const members = await this.rooms.getActiveMembers(room.id);

    // Full state to the joiner (they have no prior context)...
    client.emit("room:state", {
      roomId: room.id,
      code: room.code,
      status: room.status,
      playbackPositionSec: room.playbackPositionSec,
      contentId: room.contentId,
      hostId: room.hostId,
      members,
    });

    // ...a lighter presence event to everyone already there.
    client.to(room.id).emit("room:member-joined", {
      userId,
      username: client.data.username,
    });
  }

  @SubscribeMessage("room:leave")
  async handleLeave(@ConnectedSocket() client: Socket): Promise<void> {
    const roomId = client.data.currentRoomId as string | null;
    const userId = client.data.userId as string;
    if (!roomId) return;

    await this.rooms.leaveRoom(roomId, userId);
    client.to(roomId).emit("room:member-left", { userId });
    await client.leave(roomId);
    client.data.currentRoomId = null;
  }

  /**
   * Host-only playback control. assertIsHost throws ForbiddenException
   * for anyone else — caught below and returned as a 'room:error' to
   * the caller rather than left to crash the socket handler, since a
   * thrown Nest HTTP exception has no meaning on a WS transport.
   */
  @SubscribeMessage("room:playback")
  async handlePlayback(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { status: RoomStatus; positionSec: number },
  ): Promise<void> {
    const roomId = client.data.currentRoomId as string | null;
    const userId = client.data.userId as string;
    if (!roomId) {
      client.emit("room:error", { message: "Not currently in a room" });
      return;
    }

    try {
      await this.rooms.assertIsHost(roomId, userId);
    } catch (err) {
      client.emit("room:error", {
        message: err instanceof Error ? err.message : "Not authorized",
      });
      return;
    }

    const updated = await this.rooms.updatePlaybackState(
      roomId,
      data.status,
      data.positionSec,
    );

    // Broadcast to the WHOLE room including the host — every client
    // converges on the server-confirmed value rather than trusting
    // its own locally-applied optimistic state, which is what
    // playbackPositionSec's "last-known-good snapshot for
    // reconnecting clients" comment in schema.prisma already assumes.
    this.server.to(roomId).emit("room:playback", {
      status: updated.status,
      positionSec: updated.playbackPositionSec,
      lastSyncedAt: updated.lastSyncedAt,
    });
  }
}
