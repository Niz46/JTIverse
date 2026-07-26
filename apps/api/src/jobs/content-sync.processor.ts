import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JikanService } from '../modules/content/jikan/jikan.service';
import { AniListService } from '../modules/content/anilist/anilist.service';
import { TmdbService } from '../modules/content/tmdb/tmdb.service';
import { PrismaService } from '../common/prisma.service';

/**
 * CONTENT SYNC PROCESSOR
 * ----------------------
 * Runs on a schedule (cron trigger enqueues this job — see
 * common/scheduler.module.ts), NOT on-demand per user request.
 * This is the entire point of the ingestion-service design: users
 * hitting your site read from Postgres, which is fast and doesn't
 * care about Jikan's 60/min ceiling. The catalog goes stale by at
 * most one sync cycle (e.g. every 6-12h), which is an acceptable
 * tradeoff for metadata that doesn't change minute-to-minute.
 *
 * Job payload shape: { source: 'jikan' | 'anilist' | 'tmdb', startPage?: number }
 */
@Processor('content-sync')
export class ContentSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentSyncProcessor.name);
  private readonly MAX_PAGES_PER_RUN = 20; // safety ceiling per invocation

  constructor(
    private readonly jikan: JikanService,
    private readonly anilist: AniListService,
    private readonly tmdb: TmdbService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { source, startPage = 1 } = job.data as {
      source: 'jikan' | 'anilist' | 'tmdb';
      startPage?: number;
    };

    this.logger.log(`Starting ${source} sync from page ${startPage}`);

    let page = startPage;
    let hasNextPage = true;
    let totalSynced = 0;

    while (hasNextPage && page - startPage < this.MAX_PAGES_PER_RUN) {
      const result = await this.runSyncPage(source, page);
      hasNextPage = result.hasNextPage;
      totalSynced += result.count;
      page++;
    }

    this.logger.log(`${source} sync complete: ${totalSynced} items across ${page - startPage} pages`);

    // If we hit the safety ceiling but there's more to sync, re-enqueue
    // a continuation job so a single run never blocks the worker forever.
    if (hasNextPage) {
      await job.queue.add('content-sync-continuation', { source, startPage: page });
    }

    if (source === 'anilist') {
      await this.reconcileDonghuaClassification();
    }
  }

  private async runSyncPage(
    source: 'jikan' | 'anilist' | 'tmdb',
    page: number,
  ): Promise<{ hasNextPage: boolean; count: number }> {
    switch (source) {
      case 'jikan':
        return this.jikan.syncPage(page);
      case 'anilist':
        return this.anilist.syncPage(page);
      case 'tmdb':
        return this.tmdb.syncPage(page);
    }
  }

  /**
   * AniList exposes an explicit `countryOfOrigin` field; Jikan doesn't,
   * so Jikan-sourced rows are classified via a studio-name allowlist
   * that's inherently less reliable. This pass finds titles that exist
   * from BOTH sources (matched by normalized title) where the Jikan
   * row was tagged ANIME but AniList's explicit field says CN, and
   * corrects the Jikan row to DONGHUA. This keeps your donghua section
   * accurate even for entries Jikan's studio-guess got wrong.
   */
  private async reconcileDonghuaClassification(): Promise<void> {
    const anilistDonghua = await this.prisma.content.findMany({
      where: { sourceApi: 'anilist', countryOfOrigin: 'CN' },
      select: { title: true },
    });

    const donghuaTitles = new Set(anilistDonghua.map((c) => c.title.toLowerCase().trim()));

    const jikanMismatches = await this.prisma.content.findMany({
      where: {
        sourceApi: 'jikan',
        type: 'ANIME',
        title: { in: Array.from(donghuaTitles), mode: 'insensitive' },
      },
    });

    for (const row of jikanMismatches) {
      await this.prisma.content.update({
        where: { id: row.id },
        data: { type: 'DONGHUA', countryOfOrigin: 'CN' },
      });
    }

    if (jikanMismatches.length > 0) {
      this.logger.log(`Reconciled ${jikanMismatches.length} Jikan rows to DONGHUA via AniList cross-check`);
    }
  }
}
