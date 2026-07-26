import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';

/**
 * ANILIST INGESTION SERVICE
 * -------------------------
 * GraphQL source, ~90 req/min. We request only the fields we render
 * (per AniList's own best-practice guidance) rather than over-fetching.
 *
 * AniList's schema DOES expose a country-of-origin field directly
 * (`countryOfOrigin`, ISO codes like "CN", "JP", "KR") — this makes
 * AniList our PRIMARY source for donghua classification, with the
 * Jikan studio-allowlist as a fallback for entries AniList hasn't
 * catalogued yet. When both sources have the same title, we prefer
 * AniList's countryOfOrigin value over Jikan's studio-based guess.
 */

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

const ANIME_PAGE_QUERY = `
  query ($page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage }
      media(type: ANIME, sort: POPULARITY_DESC) {
        id
        title { romaji english native }
        description
        countryOfOrigin
        coverImage { extraLarge }
        bannerImage
        episodes
        seasonYear
        genres
        studios(isMain: true) { nodes { name } }
        averageScore
        status
        trailer { site id }
      }
    }
  }
`;

interface AniListMedia {
  id: number;
  title: { romaji: string; english: string | null; native: string | null };
  description: string | null;
  countryOfOrigin: string; // "JP" | "CN" | "KR" etc.
  coverImage: { extraLarge: string | null };
  bannerImage: string | null;
  episodes: number | null;
  seasonYear: number | null;
  genres: string[];
  studios: { nodes: { name: string }[] };
  averageScore: number | null; // 0-100 scale from AniList
  status: string;
  trailer: { site: string; id: string } | null;
}

@Injectable()
export class AniListService {
  private readonly logger = new Logger(AniListService.name);

  constructor(private readonly prisma: PrismaService) {}

  async syncPage(page: number): Promise<{ hasNextPage: boolean; count: number }> {
    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ANIME_PAGE_QUERY, variables: { page } }),
    });

    if (res.status === 429) {
      this.logger.warn(`AniList rate limit hit on page ${page}, backing off`);
      await this.sleep(2000);
      return this.syncPage(page);
    }

    if (!res.ok) {
      this.logger.error(`AniList sync failed on page ${page}: ${res.status}`);
      return { hasNextPage: false, count: 0 };
    }

    const json = await res.json();
    const mediaList: AniListMedia[] = json.data.Page.media;

    for (const media of mediaList) {
      await this.upsertMedia(media);
    }

    return {
      hasNextPage: json.data.Page.pageInfo.hasNextPage,
      count: mediaList.length,
    };
  }

  private async upsertMedia(media: AniListMedia): Promise<void> {
    const countryOfOrigin = media.countryOfOrigin || 'JP';
    const contentType = countryOfOrigin === 'CN' ? 'DONGHUA' : 'ANIME';

    await this.prisma.content.upsert({
      where: {
        sourceApi_externalId: {
          sourceApi: 'anilist',
          externalId: String(media.id),
        },
      },
      create: {
        type: contentType,
        sourceApi: 'anilist',
        externalId: String(media.id),
        title: media.title.english ?? media.title.romaji,
        titleNative: media.title.native,
        synopsis: this.stripHtml(media.description),
        coverImageUrl: media.coverImage.extraLarge,
        bannerImageUrl: media.bannerImage,
        episodeCount: media.episodes,
        releaseYear: media.seasonYear,
        genres: media.genres,
        studio: media.studios.nodes[0]?.name ?? null,
        countryOfOrigin,
        rating: media.averageScore ? media.averageScore / 10 : null, // normalize 0-100 -> 0-10
        status: media.status.toLowerCase(),
        trailerEmbedUrl: this.buildTrailerUrl(media.trailer),
      },
      update: {
        title: media.title.english ?? media.title.romaji,
        synopsis: this.stripHtml(media.description),
        coverImageUrl: media.coverImage.extraLarge,
        episodeCount: media.episodes,
        genres: media.genres,
        rating: media.averageScore ? media.averageScore / 10 : null,
        status: media.status.toLowerCase(),
        syncedAt: new Date(),
      },
    });

    // Cross-check: if this same title exists from Jikan with a different
    // country classification, prefer AniList's explicit field. This
    // reconciliation pass runs as a separate step in the sync job
    // rather than inline here, to keep this upsert fast — see
    // jobs/content-sync.processor.ts `reconcileDonghuaClassification()`.
  }

  private stripHtml(html: string | null): string | null {
    if (!html) return null;
    return html.replace(/<[^>]*>/g, '').trim();
  }

  private buildTrailerUrl(trailer: { site: string; id: string } | null): string | null {
    if (!trailer) return null;
    if (trailer.site === 'youtube') return `https://www.youtube.com/embed/${trailer.id}`;
    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
