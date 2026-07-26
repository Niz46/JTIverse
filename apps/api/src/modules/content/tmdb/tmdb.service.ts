import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';

/**
 * TMDB INGESTION SERVICE
 * -----------------------
 * !!! COMPLIANCE GATE — READ BEFORE ENABLING IN PRODUCTION !!!
 * TMDB's free tier is licensed for NON-COMMERCIAL use only. This
 * project is explicitly being built for monetization (AdSense +
 * token economy). Per TMDB's API Terms of Use, commercial use
 * requires a SEPARATE WRITTEN AGREEMENT with TMDB — a free API key
 * alone does not grant you that right once ads/monetization go live.
 *
 * `TMDB_COMMERCIAL_AGREEMENT_CONFIRMED` below is a hard boolean gate.
 * Do not flip it to true until someone on the team has actually
 * emailed TMDB's API-for-business contact and confirmed terms in
 * writing. This is intentionally loud and annoying to bypass —
 * that's the point. See docs/TOS-COMPLIANCE.md for the tracked
 * status and correspondence log.
 */
const TMDB_COMMERCIAL_AGREEMENT_CONFIRMED = false;

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

interface TmdbMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  status: string;
}

interface TmdbListResponse {
  results: TmdbMovie[];
  page: number;
  total_pages: number;
}

@Injectable()
export class TmdbService {
  private readonly logger = new Logger(TmdbService.name);
  private readonly apiKey = process.env.TMDB_API_KEY;
  private readonly imageBaseUrl = 'https://image.tmdb.org/t/p/w780';

  // Minimal local genre-id -> name map for the IDs TMDB commonly returns
  // on /discover and /popular; extend via the /genre/movie/list endpoint
  // during a one-time bootstrap sync if you need full coverage.
  private readonly genreMap: Record<number, string> = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
    80: 'Crime', 18: 'Drama', 14: 'Fantasy', 27: 'Horror',
    9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction', 53: 'Thriller',
  };

  constructor(private readonly prisma: PrismaService) {}

  async syncPage(page: number): Promise<{ hasNextPage: boolean; count: number }> {
    if (!TMDB_COMMERCIAL_AGREEMENT_CONFIRMED) {
      this.logger.error(
        'TMDB sync blocked: commercial agreement not yet confirmed. ' +
          'This project monetizes via ads/tokens, which requires a written ' +
          'agreement with TMDB beyond the free non-commercial key. ' +
          'Flip TMDB_COMMERCIAL_AGREEMENT_CONFIRMED to true only after ' +
          'confirming terms — see docs/TOS-COMPLIANCE.md.',
      );
      return { hasNextPage: false, count: 0 };
    }

    if (!this.apiKey) {
      this.logger.error('TMDB_API_KEY not set in environment');
      return { hasNextPage: false, count: 0 };
    }

    const res = await fetch(
      `${TMDB_BASE_URL}/movie/popular?api_key=${this.apiKey}&page=${page}`,
    );

    if (res.status === 429) {
      this.logger.warn(`TMDB rate limit hit on page ${page}, backing off`);
      await this.sleep(1500);
      return this.syncPage(page);
    }

    if (!res.ok) {
      this.logger.error(`TMDB sync failed on page ${page}: ${res.status}`);
      return { hasNextPage: false, count: 0 };
    }

    const json = (await res.json()) as TmdbListResponse;

    for (const movie of json.results) {
      await this.upsertMovie(movie);
    }

    return { hasNextPage: json.page < json.total_pages, count: json.results.length };
  }

  private async upsertMovie(movie: TmdbMovie): Promise<void> {
    const releaseYear = movie.release_date
      ? new Date(movie.release_date).getFullYear()
      : null;

    await this.prisma.content.upsert({
      where: {
        sourceApi_externalId: {
          sourceApi: 'tmdb',
          externalId: String(movie.id),
        },
      },
      create: {
        type: 'MOVIE',
        sourceApi: 'tmdb',
        externalId: String(movie.id),
        title: movie.title,
        synopsis: movie.overview,
        coverImageUrl: movie.poster_path ? `${this.imageBaseUrl}${movie.poster_path}` : null,
        bannerImageUrl: movie.backdrop_path ? `${this.imageBaseUrl}${movie.backdrop_path}` : null,
        releaseYear,
        genres: movie.genre_ids.map((id) => this.genreMap[id]).filter(Boolean),
        countryOfOrigin: null, // TMDB requires an extra /movie/{id} call for production_countries; fetched lazily on detail-page cache-miss, not in bulk sync
        rating: movie.vote_average,
        status: this.normalizeStatus(movie.status),
      },
      update: {
        title: movie.title,
        synopsis: movie.overview,
        rating: movie.vote_average,
        syncedAt: new Date(),
      },
    });
  }

  private normalizeStatus(rawStatus: string): string {
    const s = rawStatus?.toLowerCase() ?? '';
    if (s.includes('released')) return 'completed';
    if (s.includes('production') || s.includes('post')) return 'upcoming';
    return 'unknown';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
