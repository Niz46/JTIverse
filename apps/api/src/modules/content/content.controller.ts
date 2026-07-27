import { Controller, Get, Post, Param, Query, Logger } from '@nestjs/common';
import { JikanService } from './jikan/jikan.service';
import { AniListService } from './anilist/anilist.service';
import { TmdbService } from './tmdb/tmdb.service';
import { PrismaService } from '../../common/prisma.service';

/**
 * TESTING/ADMIN ENDPOINTS FOR CONTENT SYNC
 * -----------------------------------------
 * These POST /sync/* routes exist to manually trigger a single-page
 * sync for verification purposes (this is what we use for "step 3" —
 * confirming ingestion works against live APIs before relying on the
 * scheduled BullMQ job entirely). They are NOT rate-limited or
 * authenticated yet — that's a gap, not an oversight to ignore.
 *
 * !!! BEFORE PRODUCTION: gate these behind an admin-only auth guard.
 * An unauthenticated public endpoint that fires arbitrary outbound
 * requests to Jikan/AniList/TMDB on your server's behalf is an abuse
 * vector (someone could hammer it to burn your API rate limits or
 * your TMDB quota). Once the Auth module exists, wrap these three
 * POST routes in an @UseGuards(AdminGuard) — tracked, not forgotten.
 */
@Controller('content')
export class ContentController {
  private readonly logger = new Logger(ContentController.name);

  constructor(
    private readonly jikan: JikanService,
    private readonly anilist: AniListService,
    private readonly tmdb: TmdbService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('sync/jikan')
  async syncJikan(@Query('page') page = '1') {
    const result = await this.jikan.syncPage(Number(page));
    this.logger.log(`Jikan sync page ${page}: ${result.count} items, hasNextPage=${result.hasNextPage}`);
    return result;
  }

  @Post('sync/anilist')
  async syncAniList(@Query('page') page = '1') {
    const result = await this.anilist.syncPage(Number(page));
    this.logger.log(`AniList sync page ${page}: ${result.count} items, hasNextPage=${result.hasNextPage}`);
    return result;
  }

  @Post('sync/tmdb')
  async syncTmdb(@Query('page') page = '1') {
    // Will return { hasNextPage: false, count: 0 } and log a compliance
    // warning until TMDB_COMMERCIAL_AGREEMENT_CONFIRMED is flipped —
    // see docs/TOS-COMPLIANCE.md. This is expected behavior, not a bug.
    const result = await this.tmdb.syncPage(Number(page));
    return result;
  }

  @Get()
  async list(@Query('type') type?: 'ANIME' | 'DONGHUA' | 'MOVIE') {
    return this.prisma.content.findMany({
      where: type ? { type } : undefined,
      take: 50,
      orderBy: { rating: 'desc' },
    });
  }

  // FIXED: Moved 'stats/counts' ABOVE ':id' so the router evaluates it first
  @Get('stats/counts')
  async counts() {
    const [anime, donghua, movie] = await Promise.all([
      this.prisma.content.count({ where: { type: 'ANIME' } }),
      this.prisma.content.count({ where: { type: 'DONGHUA' } }),
      this.prisma.content.count({ where: { type: 'MOVIE' } }),
    ]);
    return { anime, donghua, movie, total: anime + donghua + movie };
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    return this.prisma.content.findUnique({ where: { id } });
  }
}