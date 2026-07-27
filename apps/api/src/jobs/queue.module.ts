import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";

/**
 * Registers the two queues the existing processors expect:
 *   - 'content-sync'  -> ContentSyncProcessor
 *   - 'token-grant'   -> TokenGrantProcessor
 * Both processors were written against these exact queue names
 * (@Processor('content-sync') / @Processor('token-grant')) — this
 * module is what makes those decorators resolve to a real, connected
 * queue instead of throwing at startup.
 */
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? "localhost",
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    BullModule.registerQueue({ name: "content-sync" }, { name: "token-grant" }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
