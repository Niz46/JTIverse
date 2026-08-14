import { Controller, Post, Get, Delete, Param, Body } from "@nestjs/common";
import { RoomsService } from "./rooms.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { User } from "@prisma/client";
import { CreateRoomDto } from "./dto/room.dto";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

/**
 * ROOMS CONTROLLER — lifecycle only (create / lookup / leave).
 * PLAY / PAUSE / SEEK are real-time and belong on RoomsGateway
 * (WebSocket), not here — an HTTP round trip per playback tick would
 * defeat the point of a sync layer. This controller exists for the
 * parts that are naturally request/response: creating a room before
 * anyone's connected yet, and looking one up by its shareable code.
 */
@Controller("rooms")
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    @InjectQueue("token-grant") private readonly tokenGrantQueue: Queue,
  ) {}

  @Post()
  async create(@Body() dto: CreateRoomDto, @CurrentUser() user: User) {
    const room = await this.rooms.createRoom(
      user.id,
      dto.contentId,
      dto.isPrivate ?? false,
    );

    // ROOM_CREATE_COUNT task type already exists in packages/types —
    // wiring the trigger point now, same enqueue-after-persist,
    // fire-and-forget pattern established in comments.controller.ts.
    this.tokenGrantQueue
      .add("room-create-count", {
        userId: user.id,
        taskType: "ROOM_CREATE_COUNT",
      })
      .catch(() => {
        /* logged inside the processor's own error handling; a queue
           hiccup here must not fail room creation, which already
           succeeded and was returned to the client. */
      });

    return room;
  }

  @Public()
  @Get(":code")
  async getByCode(@Param("code") code: string) {
    return this.rooms.getRoomByCode(code);
  }

  @Delete(":roomId/leave")
  async leave(@Param("roomId") roomId: string, @CurrentUser() user: User) {
    await this.rooms.leaveRoom(roomId, user.id);
    return { roomId, left: true };
  }
}
