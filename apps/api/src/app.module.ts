import { Module } from "@nestjs/common";
import { CommonModule } from "./common/common.module";
import { QueueModule } from "./common/queue.module";
import { ContentModule } from "./modules/content/content.module";
import { AuthModule } from "./modules/auth/auth.module";

/**
 * Users, Titles, Comments, Rooms, Leaderboard modules are still empty
 * scaffolding — Auth now exists and is wired in below.
 */
@Module({
  imports: [CommonModule, QueueModule, ContentModule, AuthModule],
})
export class AppModule {}
