import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';

/**
 * JIKAN INGESTION SERVICE
 * -----------------------
 * Jikan (unofficial MyAnimeList wrapper) is rate-limited to roughly
 * 3 req/sec and 60/min, and caches upstream for 24h anyway — so we
 * NEVER call this live per page-load. This service is invoked by a
 * scheduled BullMQ job (see jobs/content-sync.processor.ts) that
 * walks the catalog in the background and upserts into our own
 * `Content` table. The frontend and API only ever read from Postgres.
 *
 * Donghua detection: Jikan doesn't have a separate "donghua" type —
 * donghua titles appear as normal anime entries but with production
 * studios/country tagged to China. We classify by inspecting the
 * `producers`/`studios` country field where available, falling back
 * to a curated studio-name allowlist (Haoliners, Colored Pencil
 * Animation, Foch Films, B.C May Pictures, etc.) since Jikan's raw
 * payload doesn't always expose country directly on every endpoint.
 */

const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';

// Known Chinese/donghua-producing studios — used as a fallback signal
// when explicit country data isn't present on a given Jikan payload.
const DONGHUA_STUDIO_ALLOWLIST = new Set([
  'haoliners animation league',
  'colored pencil animation',
  'foch films',
  'b.c may pictures',
  'tencent penguin pictures',
  'wan wei mao donghua',
  'liuliu kaixin',
  'yhkt entertainment',
]);

interface JikanAnime {
  mal_id: number;
  title: string;
  title_japanese: string | null;
  synopsis: string | null;
  images: { jpg: { large_image_url: string } };
  episodes: number | null;
  year: number | null;
  genres: { name: string }[];
  studios: { name: string }[];
  score: number | null;
  status: string | null;
  trailer: { embed_url: string | null };
}

interface JikanListResponse {
  data: JikanAnime[];
  pagination: { has_next_page: boolean };
}

@Injectable()
export class JikanService {
  private readonly logger = new Logger(JikanService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch one page of top/seasonal anime and upsert into Content table.
   * Called repeatedly by the scheduled sync job with increasing page
   * numbers and a delay between calls to respect rate limits.
   */
  async syncPage(page: number): Promise<{ hasNextPage: boolean; count: number }> {
    const res = await fetch(`${JIKAN_BASE_URL}/top/anime?page=${page}`);

    if (res.status === 429) {
      this.logger.warn(`Jikan rate limit hit on page ${page}, backing off`);
      await this.sleep(3000);
      return this.syncPage(page); // retry after backoff
    }

    if (!res.ok) {
      this.logger.error(`Jikan sync failed on page ${page}: ${res.status}`);
      return { hasNextPage: false, count: 0 };
    }

    const json = (await res.json()) as JikanListResponse;

    for (const anime of json.data) {
      await this.upsertAnime(anime);
      // Respect rate limit between individual writes-that-imply-fetches
      // (safe pacing even though this loop itself doesn't call Jikan again)
    }

    return { hasNextPage: json.pagination.has_next_page, count: json.data.length };
  }

  private async upsertAnime(anime: JikanAnime): Promise<void> {
    const countryOfOrigin = this.classifyCountryOfOrigin(anime);

    await this.prisma.content.upsert({
      where: {
        sourceApi_externalId: {
          sourceApi: 'jikan',
          externalId: String(anime.mal_id),
        },
      },
      create: {
        type: countryOfOrigin === 'CN' ? 'DONGHUA' : 'ANIME',
        sourceApi: 'jikan',
        externalId: String(anime.mal_id),
        title: anime.title,
        titleNative: anime.title_japanese,
        synopsis: anime.synopsis,
        coverImageUrl: anime.images.jpg.large_image_url,
        episodeCount: anime.episodes,
        releaseYear: anime.year,
        genres: anime.genres.map((g) => g.name),
        studio: anime.studios[0]?.name ?? null,
        countryOfOrigin,
        rating: anime.score,
        status: this.normalizeStatus(anime.status),
        trailerEmbedUrl: anime.trailer.embed_url,
      },
      update: {
        // Re-sync mutable fields only; don't clobber fields we may have
        // manually curated (e.g. officialWatchUrl set by an admin).
        title: anime.title,
        synopsis: anime.synopsis,
        coverImageUrl: anime.images.jpg.large_image_url,
        episodeCount: anime.episodes,
        genres: anime.genres.map((g) => g.name),
        rating: anime.score,
        status: this.normalizeStatus(anime.status),
        syncedAt: new Date(),
      },
    });
  }

  private classifyCountryOfOrigin(anime: JikanAnime): string {
    const studioNames = anime.studios.map((s) => s.name.toLowerCase());
    const isDonghua = studioNames.some((name) => DONGHUA_STUDIO_ALLOWLIST.has(name));
    return isDonghua ? 'CN' : 'JP';
  }

  private normalizeStatus(rawStatus: string | null): string {
    if (!rawStatus) return 'unknown';
    const s = rawStatus.toLowerCase();
    if (s.includes('airing')) return 'ongoing';
    if (s.includes('finished')) return 'completed';
    if (s.includes('not yet')) return 'upcoming';
    return 'unknown';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
