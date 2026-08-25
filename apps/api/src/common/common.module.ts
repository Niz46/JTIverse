import { Module, Global } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaService } from "./prisma.service";

/**
 * Marked @Global so every feature module gets PrismaService without
 * each one separately importing CommonModule — reduces import noise
 * across auth/users/content/tokens/titles/comments/rooms modules,
 * all of which need database access.
 *
 * ThrottlerModule and ScheduleModule live here for the same reason:
 * they're cross-cutting infrastructure, not feature-specific.
 *
 *   - ThrottlerModule.forRoot(...) registers the in-memory rate-limit
 *     storage ONCE. It is deliberately re-exported (not just
 *     imported) so that feature controllers can apply
 *     `@UseGuards(ThrottlerGuard)` directly — see comments.controller.ts's
 *     create() and titles-shop.controller.ts's purchase() — without
 *     each of those modules separately importing ThrottlerModule.
 *     No APP_GUARD is registered for it here: this project's existing
 *     convention (see roles.guard.ts's docstring) is narrow, opt-in,
 *     per-route guards rather than a blanket global one, and that
 *     convention is kept rather than overridden for this one guard.
 *   - ScheduleModule.forRoot() only needs to be imported ONCE
 *     anywhere in the app for @Cron()-decorated methods anywhere
 *     else (e.g. jobs/content-sync.scheduler.ts) to be picked up by
 *     Nest's SchedulerRegistry — it does not need to be re-exported
 *     for that to work, decorator metadata is scanned app-wide.
 */
@Global()
@Module({
  imports: [
    ThrottlerModule.forRoot([
      { name: "default", ttl: 60_000, limit: 120 }, // generous default; expensive routes override with their own @Throttle()
    ]),
    ScheduleModule.forRoot(),
  ],
  providers: [PrismaService],
  exports: [PrismaService, ThrottlerModule, ScheduleModule],
})
export class CommonModule {}
