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

/**
 * Rooms and Leaderboard modules are still empty scaffolding — Auth,
 * Admin, Users, Titles (equip/unequip + shop), and now Comments all
 * exist and are wired in below. See docs/TOS-COMPLIANCE.md before
 * touching Rooms: it must sync playback state only, never host or
 * proxy video.
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
  ],
})
export class AppModule {}
