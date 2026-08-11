import { Module } from "@nestjs/common";
import { CommentsController } from "./comments.controller";
import { CommentModerationService } from "./comment-moderation.service";
import { QueueModule } from "../../common/queue.module";

/**
 * Imports QueueModule (unlike TitlesModule, which needs no queue
 * access) because CommentsController injects the 'token-grant' queue
 * directly via @InjectQueue to enqueue COMMENT_COUNT jobs — that
 * queue is registered once in QueueModule.registerQueue(...) and
 * every consumer imports QueueModule to get a working injection
 * token for it, same as ContentModule does for 'content-sync'.
 */
@Module({
  imports: [QueueModule],
  controllers: [CommentsController],
  providers: [CommentModerationService],
})
export class CommentsModule {}
