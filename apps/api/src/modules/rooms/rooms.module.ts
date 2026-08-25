import { Module } from "@nestjs/common";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";
import { RoomsGateway } from "./rooms.gateway";
import { QueueModule } from "../../common/queue.module";

/**
 * Imports QueueModule for the same reason CommentsModule does:
 * RoomsController and RoomsGateway both inject the 'token-grant'
 * queue directly via @InjectQueue to enqueue ROOM_CREATE_COUNT /
 * ROOM_JOIN_COUNT jobs.
 *
 * THIS FILE DID NOT EXIST BEFORE. RoomsController and RoomsService
 * were both already fully written, but with no module to wire them
 * into a Nest DI graph, and no import of a RoomsModule in
 * app.module.ts, the entire feature was dead code — confirmed
 * against the actual boot log, which has no /rooms/* route at all
 * next to every other controller's routes. Registering this module
 * below and importing it in app.module.ts is what makes /rooms
 * routes (and the 'rooms' WebSocket namespace) actually exist.
 */
@Module({
  imports: [QueueModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomsGateway],
})
export class RoomsModule {}
