import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";

/**
 * CONTENT SYNC SCHEDULER
 * ----------------------
 * content-sync.processor.ts's own docstring already says syncs run
 * "on a schedule (cron trigger enqueues this job — see
 * common/scheduler.module.ts), NOT on-demand per user request" — but
 * no such scheduler existed anywhere in the codebase; the only way
 * to trigger a sync was ContentController's manual, ADMIN-only POST
 * routes. This file is that missing piece.
 *
 * JIKAN + ANILIST ONLY, deliberately. TMDB is NOT auto-scheduled
 * here: tmdb.service.ts hard-gates behind
 * TMDB_COMMERCIAL_AGREEMENT_CONFIRMED (false until someone has
 * actually confirmed commercial terms with TMDB in writing — see
 * docs/TOS-COMPLIANCE.md). Wiring an automatic recurring job against
 * a source this codebase has explicitly, loudly gated would quietly
 * undermine that gate's entire purpose the moment someone flips the
 * boolean without also thinking about scheduling. TMDB sync stays
 * a deliberate, manual, admin-triggered action until that's resolved.
 *
 * Every 12 hours, starting a fresh sync from page 1 each time —
 * matches content-sync.processor.ts's own reasoning that this
 * catalog "doesn't change minute-to-minute" and going stale by at
 * most one cycle is an acceptable tradeoff. The processor's own
 * MAX_PAGES_PER_RUN + continuation-job logic already handles a
 * catalog too large to finish in one run; this scheduler doesn't
 * need to duplicate that.
 */
@Injectable()
export class ContentSyncScheduler {
  private readonly logger = new Logger(ContentSyncScheduler.name);

  constructor(
    @InjectQueue("content-sync") private readonly contentSyncQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_12_HOURS)
  async scheduleJikanSync(): Promise<void> {
    await this.enqueue("jikan");
  }

  @Cron(CronExpression.EVERY_12_HOURS)
  async scheduleAniListSync(): Promise<void> {
    await this.enqueue("anilist");
  }

  private async enqueue(source: "jikan" | "anilist"): Promise<void> {
    try {
      await this.contentSyncQueue.add(`${source}-scheduled-sync`, {
        source,
        startPage: 1,
      });
      this.logger.log(`Enqueued scheduled ${source} content-sync job`);
    } catch (err) {
      this.logger.error(
        `Failed to enqueue scheduled ${source} sync: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
