import { Module } from "@nestjs/common";
import { CommonModule } from "./common/common.module";
import { QueueModule } from "./common/queue.module";
import { ContentModule } from "./modules/content/content.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AdminModule } from "./modules/admin/admin.module";
import { UsersModule } from "./modules/users/users.module";
import { TitlesModule } from "./modules/titles/titles.module";

/**
 * Comments, Rooms, Leaderboard modules are still empty scaffolding —
 * Auth, Admin, Users, and Titles (equip/unequip) now exist and are
 * wired in below.
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
  ],
})
export class AppModule {}
