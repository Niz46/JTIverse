import { Module } from "@nestjs/common";
import { CommonModule } from "./common/common.module";
import { QueueModule } from "./common/queue.module";
import { ContentModule } from "./modules/content/content.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AdminModule } from "./modules/admin/admin.module";
import { UsersModule } from "./modules/users/users.module";
import { TitlesModule } from "./modules/titles/titles.module";
import { CommentsModule } from "./modules/comments/comments.module";
import { RecommendationsModule } from "./modules/recommendations/recommendations.module";
import { RoomsModule } from "./modules/rooms/rooms.module";

/**
 * Leaderboard module is still empty scaffolding — Auth, Admin, Users,
 * Titles (equip/unequip + shop), Comments, Recommendations, and now
 * Rooms all exist and are wired in below.
 *
 * ROOMS WAS ALREADY FULLY WRITTEN (rooms.controller.ts,
 * rooms.service.ts) but had no rooms.module.ts and was never listed
 * here — meaning it never actually ran. See rooms.module.ts's own
 * docstring for how that was confirmed against the real boot log.
 * This import is what turns it on, together with the new
 * RoomsGateway (real-time join/playback sync) it now also wires in.
 *
 * See docs/TOS-COMPLIANCE.md before touching Rooms further: it must
 * sync playback state only, never host or proxy video.
 */
@Module({
  imports: [
    CommonModule,
    QueueModule,
    ContentModule,
    AuthModule,
    AdminModule,
    UsersModule,
    TitlesModule,
    CommentsModule,
    RecommendationsModule,
    RoomsModule,
  ],
})
export class AppModule {}
