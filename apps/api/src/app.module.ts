import { Module } from "@nestjs/common";
import { CommonModule } from "./common/common.module";
import { QueueModule } from "./common/queue.module";
import { ContentModule } from "./modules/content/content.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AdminModule } from "./modules/admin/admin.module";

/**
 * Users, Titles, Comments, Rooms, Leaderboard modules are still empty
 * scaffolding — Auth and Admin now exist and are wired in below.
 */
@Module({
  imports: [CommonModule, QueueModule, ContentModule, AuthModule, AdminModule],
})
export class AppModule {}
