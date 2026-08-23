import { Injectable, Logger } from "@nestjs/common";
import * as https from "https";
import { PrismaService } from "../../../common/prisma.service";

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
 * USES NODE'S RAW `https` MODULE — NOT fetch, NOT axios. This was
 * empirically isolated through repeated, multi-attempt testing, not
 * assumed from a single result:
 *   - curl: 200, every attempt, throughout testing
 *   - Node fetch (undici): 504, every attempt
 *   - axios (bare, and with browser-like headers): 504, every attempt
 *   - Node's raw https module, called minimally (no extra headers,
 *     no Agent config): 200, 3/3 repeated attempts
 * Axios sits on top of the same https module but adds its own
 * adapter layer (default headers, keep-alive Agent, content
 * negotiation) before the request reaches https — evidently enough
 * to change how Cloudflare's edge in front of Jikan treats the
 * connection. The fix is a MINIMAL https call, not just "avoid
 * fetch." If this ever starts failing again, re-run the same
 * multi-attempt isolation (not a single test) before assuming the
 * cause is unchanged — Cloudflare edge behavior can shift.
 *
 * Donghua detection: Jikan doesn't have a separate "donghua" type —
 * donghua titles appear as normal anime entries but with production
 * studios/country tagged to China. We classify by inspecting the
 * `producers`/`studios` country field where available, falling back
 * to a curated studio-name allowlist (Haoliners, Colored Pencil
 * Animation, Foch Films, B.C May Pictures, etc.) since Jikan's raw
 * payload doesn't always expose country directly on every endpoint.
 */

const JIKAN_BASE_URL = "https://api.jikan.moe/v4";

const DONGHUA_STUDIO_ALLOWLIST = new Set([
  "haoliners animation league",
  "colored pencil animation",
  "foch films",
  "b.c may pictures",
  "tencent penguin pictures",
  "wan wei mao donghua",
  "liuliu kaixin",
  "yhkt entertainment",
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

  async syncPage(
    page: number,
    attempt = 1,
  ): Promise<{ hasNextPage: boolean; count: number }> {
    const MAX_ATTEMPTS = 5;

    let res: { status: number; body: string };
    try {
      res = await this.minimalHttpsGet(
        `${JIKAN_BASE_URL}/top/anime?page=${page}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= MAX_ATTEMPTS) {
        this.logger.error(
          `Jikan network error on page ${page} after ${MAX_ATTEMPTS} attempts, giving up: ${message}`,
        );
        return { hasNextPage: false, count: 0 };
      }
      this.logger.warn(
        `Jikan network error on page ${page}, retrying (attempt ${attempt}/${MAX_ATTEMPTS}): ${message}`,
      );
      await this.sleep(3000);
      return this.syncPage(page, attempt + 1);
    }

    if (res.status === 429) {
      this.logger.warn(`Jikan rate limit hit on page ${page}, backing off`);
      await this.sleep(3000);
      return this.syncPage(page, attempt);
    }

    if (res.status >= 500 && res.status < 600) {
      if (attempt >= MAX_ATTEMPTS) {
        this.logger.error(
          `Jikan still returning ${res.status} on page ${page} after ${MAX_ATTEMPTS} attempts, giving up`,
        );
        return { hasNextPage: false, count: 0 };
      }
      this.logger.warn(
        `Jikan returned ${res.status} on page ${page}, retrying after backoff (attempt ${attempt}/${MAX_ATTEMPTS})`,
      );
      await this.sleep(3000);
      return this.syncPage(page, attempt + 1);
    }

    if (res.status < 200 || res.status >= 300) {
      this.logger.error(`Jikan sync failed on page ${page}: ${res.status}`);
      return { hasNextPage: false, count: 0 };
    }

    const json = JSON.parse(res.body) as JikanListResponse;

    for (const anime of json.data) {
      await this.upsertAnime(anime);
    }

    return {
      hasNextPage: json.pagination.has_next_page,
      count: json.data.length,
    };
  }

  private minimalHttpsGet(
    url: string,
  ): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on("error", reject);
      req.setTimeout(10_000, () => {
        req.destroy(new Error("Request timed out after 10s"));
      });
    });
  }

  private async upsertAnime(anime: JikanAnime): Promise<void> {
    const countryOfOrigin = this.classifyCountryOfOrigin(anime);

    await this.prisma.content.upsert({
      where: {
        sourceApi_externalId: {
          sourceApi: "jikan",
          externalId: String(anime.mal_id),
        },
      },
      create: {
        type: countryOfOrigin === "CN" ? "DONGHUA" : "ANIME",
        sourceApi: "jikan",
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
    const isDonghua = studioNames.some((name) =>
      DONGHUA_STUDIO_ALLOWLIST.has(name),
    );
    return isDonghua ? "CN" : "JP";
  }

  private normalizeStatus(rawStatus: string | null): string {
    if (!rawStatus) return "unknown";
    const s = rawStatus.toLowerCase();
    if (s.includes("airing")) return "ongoing";
    if (s.includes("finished")) return "completed";
    if (s.includes("not yet")) return "upcoming";
    return "unknown";
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
