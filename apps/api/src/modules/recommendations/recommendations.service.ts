// apps/api/src/modules/recommendations/recommendations.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { Content } from "@prisma/client";

export interface ScoredContent extends Content {
  similarityScore: number;
  matchReasons: string[];
}

const GENRE_WEIGHT = 1.0;
const STUDIO_MATCH_BONUS = 0.3;
const COUNTRY_MATCH_BONUS = 0.15;
const TYPE_MATCH_BONUS = 0.1;
const CANDIDATE_POOL_SIZE = 200; // pre-filter before scoring, avoid full-table scans

@Injectable()
export class RecommendationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSimilar(contentId: string, limit = 10): Promise<ScoredContent[]> {
    const source = await this.prisma.content.findUniqueOrThrow({
      where: { id: contentId },
      select: {
        id: true,
        genres: true,
        studio: true,
        countryOfOrigin: true,
        type: true,
      },
    });

    if (source.genres.length === 0) {
      // No genre data to compare against — fall back to same-type, highest-rated
      // rather than returning nothing. Flagged as a fallback, not silently
      // returning empty and looking broken to the user.
      return this.getFallbackRecommendations(source.type, contentId, limit);
    }

    // Pre-filter: only pull candidates sharing at least one genre.
    // Postgres array overlap (@@index([genres]) already exists on Content)
    // makes this filter cheap before we do similarity math in-process.
    const candidates = await this.prisma.content.findMany({
      where: {
        id: { not: contentId },
        genres: { hasSome: source.genres },
      },
      take: CANDIDATE_POOL_SIZE,
      orderBy: { rating: "desc" },
    });

    const scored = candidates.map((candidate) => {
      const sourceSet = new Set(source.genres);
      const candidateSet = new Set(candidate.genres);
      const intersection = [...sourceSet].filter((g) => candidateSet.has(g));
      const union = new Set([...sourceSet, ...candidateSet]);

      // Jaccard similarity on genre overlap — standard, explainable,
      // no ML infra required to stand this up today.
      let score = intersection.length / union.size;
      const matchReasons: string[] =
        intersection.length > 0
          ? [
              `shares ${intersection.length} genre${intersection.length > 1 ? "s" : ""}: ${intersection.join(", ")}`,
            ]
          : [];

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

      return { ...candidate, similarityScore: score, matchReasons };
    });

    return scored
      .sort(
        (a, b) =>
          b.similarityScore - a.similarityScore ||
          (b.rating ?? 0) - (a.rating ?? 0),
      )
      .slice(0, limit);
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
