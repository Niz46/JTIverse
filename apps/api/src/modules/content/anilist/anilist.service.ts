import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma.service";

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

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

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

const ANIME_RECOMMENDATIONS_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      recommendations(sort: RATING_DESC, perPage: 12) {
        nodes {
          mediaRecommendation {
            id
          }
        }
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

  /**
   * Fetches curated community recommendations from AniList for a given media ID.
   * Returns an array of external AniList string IDs.
   */
  async getRecommendations(aniListId: number | string): Promise<string[]> {
    const numericId =
      typeof aniListId === "string" ? parseInt(aniListId, 10) : aniListId;
    if (isNaN(numericId)) return [];

    try {
      const res = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: ANIME_RECOMMENDATIONS_QUERY,
          variables: { id: numericId },
        }),
      });

      if (res.status === 429) {
        this.logger.warn(
          `AniList rate limit hit on recommendation lookup for ID ${aniListId}`,
        );
        return [];
      }

      if (!res.ok) {
        this.logger.warn(
          `AniList recommendation lookup failed with status ${res.status}`,
        );
        return [];
      }

      const json = await res.json();
      const nodes = json?.data?.Media?.recommendations?.nodes ?? [];

      return nodes
        .map(
          (n: { mediaRecommendation?: { id: number } }) =>
            n?.mediaRecommendation?.id,
        )
        .filter((id: number | undefined): id is number => Boolean(id))
        .map(String);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to fetch AniList recommendations for ID ${aniListId}: ${message}`,
      );
      return [];
    }
  }

  async syncPage(
    page: number,
  ): Promise<{ hasNextPage: boolean; count: number }> {
    try {
      const res = await fetch(ANILIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const mediaList: AniListMedia[] = json?.data?.Page?.media ?? [];

      for (const media of mediaList) {
        await this.upsertMedia(media);
      }

      return {
        hasNextPage: json?.data?.Page?.pageInfo?.hasNextPage ?? false,
        count: mediaList.length,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`AniList sync exception on page ${page}: ${message}`);
      return { hasNextPage: false, count: 0 };
    }
  }

  private async upsertMedia(media: AniListMedia): Promise<void> {
    const countryOfOrigin = media.countryOfOrigin || "JP";
    const contentType = countryOfOrigin === "CN" ? "DONGHUA" : "ANIME";

    await this.prisma.content.upsert({
      where: {
        sourceApi_externalId: {
          sourceApi: "anilist",
          externalId: String(media.id),
        },
      },
      create: {
        type: contentType,
        sourceApi: "anilist",
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
  }

  private stripHtml(html: string | null): string | null {
    if (!html) return null;
    return html.replace(/<[^>]*>/g, "").trim();
  }

  private buildTrailerUrl(
    trailer: { site: string; id: string } | null,
  ): string | null {
    if (!trailer) return null;
    if (trailer.site === "youtube")
      return `https://www.youtube.com/embed/${trailer.id}`;
    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
