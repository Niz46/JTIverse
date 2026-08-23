// apps/api/src/modules/recommendations/recommendations.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { Content } from "@prisma/client";
import { AniListService } from "../content/anilist/anilist.service";
import Redis from "ioredis";

export interface ScoredContent extends Content {
  similarityScore: number;
  matchReasons: string[];
}

const GENRE_WEIGHT = 1.0;
const STUDIO_MATCH_BONUS = 0.3;
const COUNTRY_MATCH_BONUS = 0.15;
const TYPE_MATCH_BONUS = 0.1;
const ANILIST_BOOST = 1.5;
const CANDIDATE_POOL_SIZE = 200; // Pre-filter pool size before scoring

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);
  private readonly redis = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly anilistService: AniListService,
  ) {}

  async getSimilar(contentId: string, limit = 10): Promise<ScoredContent[]> {
    const cacheKey = `recommendations:similar:${contentId}:${limit}`;

    // 1. Redis Cache Check
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as ScoredContent[];
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Redis cache fetch error: ${msg}`);
    }

    // 2. Fetch source content (Updated to use sourceApi and externalId)
    const source = await this.prisma.content.findUnique({
      where: { id: contentId },
      select: {
        id: true,
        genres: true,
        studio: true,
        countryOfOrigin: true,
        type: true,
        sourceApi: true,
        externalId: true,
      },
    });

    if (!source) {
      return [];
    }

    const sourceGenres: string[] = source.genres || [];

    if (sourceGenres.length === 0) {
      return this.getFallbackRecommendations(source.type, contentId, limit);
    }

    // 3. Fetch optional AniList external recommendations
    let externalAniListIds: string[] = [];

    // Check if the source is explicitly from AniList to use its externalId
    const sourceAniListId =
      source.sourceApi === "anilist" ? source.externalId : null;

    if (
      sourceAniListId &&
      typeof this.anilistService.getRecommendations === "function"
    ) {
      try {
        externalAniListIds =
          await this.anilistService.getRecommendations(sourceAniListId);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `AniList recommendation lookup failed: ${errorMessage}`,
        );
      }
    }

    // 4. Pre-filter candidate titles sharing at least one genre
    const candidates = await this.prisma.content.findMany({
      where: {
        id: { not: contentId },
        genres: { hasSome: sourceGenres },
      },
      take: CANDIDATE_POOL_SIZE,
      orderBy: { rating: "desc" },
    });

    // 5. Compute Jaccard similarity score & weighted bonuses
    const sourceSet = new Set<string>(sourceGenres);

    const scored: ScoredContent[] = candidates.map((candidate) => {
      const candidateGenres: string[] = candidate.genres || [];
      const candidateSet = new Set<string>(candidateGenres);

      // Intersection and Union for Jaccard coefficient
      const intersection = [...sourceSet].filter((g) => candidateSet.has(g));
      const union = new Set<string>([...sourceSet, ...candidateSet]);

      let score =
        union.size > 0 ? (intersection.length / union.size) * GENRE_WEIGHT : 0;

      const matchReasons: string[] = [];
      if (intersection.length > 0) {
        matchReasons.push(
          `shares ${intersection.length} genre${intersection.length > 1 ? "s" : ""}: ${intersection.join(", ")}`,
        );
      }

      if (candidate.studio && candidate.studio === source.studio) {
        score += STUDIO_MATCH_BONUS;
        matchReasons.push(`same studio (${candidate.studio})`);
      }

      if (
        candidate.countryOfOrigin &&
        candidate.countryOfOrigin === source.countryOfOrigin
      ) {
        score += COUNTRY_MATCH_BONUS;
      }

      if (candidate.type === source.type) {
        score += TYPE_MATCH_BONUS;
      }

      // External boost from AniList curated recommendations
      const candidateAniListId =
        candidate.sourceApi === "anilist" ? candidate.externalId : null;
      if (
        candidateAniListId &&
        externalAniListIds.includes(candidateAniListId)
      ) {
        score *= ANILIST_BOOST;
        matchReasons.push("curated recommendation from AniList");
      }

      return {
        ...candidate,
        similarityScore: score,
        matchReasons,
      };
    });

    const result = scored
      .sort(
        (a, b) =>
          b.similarityScore - a.similarityScore ||
          (b.rating ?? 0) - (a.rating ?? 0),
      )
      .slice(0, limit);

    // 6. Cache result in Redis for 12 hours (43,200 seconds)
    try {
      await this.redis.set(cacheKey, JSON.stringify(result), "EX", 43200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to write recommendation cache to Redis: ${msg}`);
    }

    return result;
  }

  private async getFallbackRecommendations(
    type: Content["type"],
    excludeId: string,
    limit: number,
  ): Promise<ScoredContent[]> {
    const results = await this.prisma.content.findMany({
      where: { type, id: { not: excludeId } },
      orderBy: { rating: "desc" },
      take: limit,
    });

    return results.map((c) => ({
      ...c,
      similarityScore: 0,
      matchReasons: ["no genre data — showing top-rated"],
    }));
  }
}
