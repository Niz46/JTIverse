import { Controller, Get, Post, Param, Query, Logger } from "@nestjs/common";
import { JikanService } from "./jikan/jikan.service";
import { AniListService } from "./jikan/anilist/anilist.service";
import { TmdbService } from "./tmdb/tmdb.service";
import { PrismaService } from "../../common/prisma.service";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";

/**
 * ADMIN-ONLY SYNC TRIGGERS + PUBLIC READ ENDPOINTS
 * --------------------------------------------------
 * The three POST /sync/* routes are now gated by @Roles('ADMIN') —
 * this replaces the earlier temporary @Public() workaround. Anyone
 * without an ADMIN-role User row gets a 403, including logged-in
 * regular users. This matters because these routes fire real outbound
 * requests to Jikan/AniList/TMDB on the server's behalf — an open
 * endpoint here is a rate-limit/quota abuse vector, not just a
 * theoretical concern.
 *
 * The three GET routes are @Public() — anonymous visitors need to
 * browse the catalog before signing up, per the product's own
 * onboarding flow. Read access and admin-trigger access are
 * deliberately different trust levels on the same controller.
 */
@Controller("content")
export class ContentController {
  private readonly logger = new Logger(ContentController.name);

  constructor(
    private readonly jikan: JikanService,
    private readonly anilist: AniListService,
    private readonly tmdb: TmdbService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles("ADMIN")
  @Post("sync/jikan")
  async syncJikan(@Query("page") page = "1") {
    const result = await this.jikan.syncPage(Number(page));
    this.logger.log(
      `Jikan sync page ${page}: ${result.count} items, hasNextPage=${result.hasNextPage}`,
    );
    return result;
  }

  @Roles("ADMIN")
  @Post("sync/anilist")
  async syncAniList(@Query("page") page = "1") {
    const result = await this.anilist.syncPage(Number(page));
    this.logger.log(
      `AniList sync page ${page}: ${result.count} items, hasNextPage=${result.hasNextPage}`,
    );
    return result;
  }

  @Roles("ADMIN")
  @Post("sync/tmdb")
  async syncTmdb(@Query("page") page = "1") {
    // Will return { hasNextPage: false, count: 0 } and log a compliance
    // warning until TMDB_COMMERCIAL_AGREEMENT_CONFIRMED is flipped —
    // see docs/TOS-COMPLIANCE.md. This is expected behavior, not a bug.
    const result = await this.tmdb.syncPage(Number(page));
    return result;
  }

  @Public()
  @Get()
  async list(@Query("type") type?: "ANIME" | "DONGHUA" | "MOVIE") {
    return this.prisma.content.findMany({
      where: type ? { type } : undefined,
      take: 50,
      orderBy: { rating: "desc" },
    });
  }

  @Public()
  @Get("stats/counts")
  async counts() {
    const [anime, donghua, movie] = await Promise.all([
      this.prisma.content.count({ where: { type: "ANIME" } }),
      this.prisma.content.count({ where: { type: "DONGHUA" } }),
      this.prisma.content.count({ where: { type: "MOVIE" } }),
    ]);
    return { anime, donghua, movie, total: anime + donghua + movie };
  }

  @Public()
  @Get(":id")
  async getOne(@Param("id") id: string) {
    return this.prisma.content.findUnique({ where: { id } });
  }
}
