import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { User, UserRole } from "@prisma/client";

/**
 * ADMIN CONTROLLER
 * ----------------
 * Every route here requires @Roles('ADMIN') — there is no @Public()
 * anywhere in this file, and there should never be. This is the
 * direct answer to "admin managing users and seeing their activity."
 *
 * Deliberate scope decisions, worth knowing before extending this:
 *   - User activity is exposed per-user, paginated, not as a global
 *     firehose of every event across every user. An admin looking
 *     into a specific account (a ban appeal, a suspicious token
 *     spike, a user report) needs THAT user's timeline — a global
 *     stream of every WatchEvent/Comment/TokenTransaction across
 *     all users at once isn't something an admin can usefully read,
 *     and it's a much larger query + potential privacy surface for
 *     no real benefit. If a global moderation feed is genuinely
 *     needed later, that's a deliberate new feature, not an
 *     extension of this endpoint.
 *   - Role changes are logged via the standard Logger for now —
 *     there is no separate AdminActionLog table yet. If you need an
 *     audit trail of who-changed-what for compliance/dispute reasons,
 *     that's a real, separate addition (a new model + writes here),
 *     not something to assume exists.
 *   - Banning a user does NOT delete or hide their existing comments/
 *     data — isBanned only blocks future authentication (see
 *     ClerkAuthGuard, which already throws UnauthorizedException for
 *     banned users). Deciding whether ban should also hide past
 *     comments is a product decision to make explicitly, same as
 *     the user.deleted webhook gap already flagged elsewhere.
 */
@Controller("admin")
@Roles("ADMIN")
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated user list, searchable by username/email, filterable by
   * role/ban status. This is the "managing the users" list view.
   */
  @Get("users")
  async listUsers(
    @Query("search") search?: string,
    @Query("role") role?: UserRole,
    @Query("banned") banned?: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "25",
  ) {
    const pageNum = Math.max(1, Number(page));
    const size = Math.min(100, Math.max(1, Number(pageSize))); // hard ceiling — an admin fat-fingering pageSize=100000 shouldn't be able to force a massive query

    const where = {
      ...(search
        ? {
            OR: [
              { username: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(role ? { role } : {}),
      ...(banned !== undefined ? { isBanned: banned === "true" } : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isBanned: true,
          isShadowbanned: true,
          tokenBalance: true,
          createdAt: true,
          lastActiveAt: true,
          // Deliberately NOT selecting passwordHash (unused under Clerk
          // anyway, but never return it regardless) or clerkId (internal
          // identity-provider linkage, no admin-UI use for it).
        },
        orderBy: { lastActiveAt: "desc" },
        skip: (pageNum - 1) * size,
        take: size,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page: pageNum,
        pageSize: size,
        total,
        totalPages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Single-user detail view — the summary an admin sees before
   * drilling into that user's activity feed below.
   */
  @Get("users/:id")
  async getUser(@Param("id") id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        gender: true,
        avatarUrl: true,
        bio: true,
        role: true,
        isBanned: true,
        isShadowbanned: true,
        tokenBalance: true,
        hasCompletedOnboarding: true,
        createdAt: true,
        lastActiveAt: true,
        equippedTitle: {
          select: {
            title: { select: { name: true, tier: true, colorHex: true } },
          },
        },
        _count: {
          select: {
            watchHistory: true,
            comments: true,
            tokenTransactions: true,
            roomsCreated: true,
            roomMemberships: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`No user with id ${id}`);
    }

    return user;
  }

  /**
   * This user's activity timeline — watch events, comments, and token
   * transactions, merged and sorted by time, paginated. This is the
   * actual "seeing the activities done on the project by the users"
   * feature. Scoped to one user at a time, per the scope note above.
   */
  @Get("users/:id/activity")
  async getUserActivity(
    @Param("id") id: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "30",
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException(`No user with id ${id}`);
    }

    const pageNum = Math.max(1, Number(page));
    const size = Math.min(100, Math.max(1, Number(pageSize)));

    // Three activity types pulled independently, then merged in memory
    // and re-paginated. This is simpler than a raw SQL UNION across
    // three differently-shaped tables, at the cost of over-fetching
    // slightly per type — acceptable at this project's current scale.
    // If a single user's combined activity ever exceeds a few thousand
    // rows, revisit this with a proper UNION query instead.
    const fetchSize = pageNum * size; // fetch enough of each type to cover pages up to this one

    const [watchEvents, comments, tokenTransactions] = await Promise.all([
      this.prisma.watchEvent.findMany({
        where: { userId: id },
        select: {
          id: true,
          startedAt: true,
          isCompleted: true,
          watchedPercent: true,
          content: { select: { title: true, type: true } },
        },
        orderBy: { startedAt: "desc" },
        take: fetchSize,
      }),
      this.prisma.comment.findMany({
        where: { userId: id },
        select: {
          id: true,
          createdAt: true,
          body: true,
          moderationStatus: true,
          content: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: fetchSize,
      }),
      this.prisma.tokenTransaction.findMany({
        where: { userId: id },
        select: {
          id: true,
          createdAt: true,
          amount: true,
          type: true,
          reason: true,
        },
        orderBy: { createdAt: "desc" },
        take: fetchSize,
      }),
    ]);

    const merged = [
      ...watchEvents.map((e) => ({
        activityType: "WATCH" as const,
        timestamp: e.startedAt,
        summary: `${e.isCompleted ? "Completed" : "Started"} ${e.content.type.toLowerCase()}: ${e.content.title}`,
        detail: { watchedPercent: e.watchedPercent },
      })),
      ...comments.map((c) => ({
        activityType: "COMMENT" as const,
        timestamp: c.createdAt,
        summary: `Commented on ${c.content.title}`,
        detail: { body: c.body, moderationStatus: c.moderationStatus },
      })),
      ...tokenTransactions.map((t) => ({
        activityType: "TOKEN" as const,
        timestamp: t.createdAt,
        summary: t.reason,
        detail: { amount: t.amount, type: t.type },
      })),
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const startIndex = (pageNum - 1) * size;
    const pageItems = merged.slice(startIndex, startIndex + size);

    return {
      activity: pageItems,
      pagination: {
        page: pageNum,
        pageSize: size,
        hasMore: merged.length > startIndex + size,
      },
    };
  }

  /**
   * Ban / unban. Deliberately a dedicated endpoint rather than a
   * generic PATCH /users/:id that accepts arbitrary field changes —
   * an admin should not be able to silently change a user's email,
   * tokenBalance, etc. through a loosely-typed update. Each
   * admin-mutable field gets its own explicit, narrow endpoint.
   */
  @Patch("users/:id/ban")
  async setBanStatus(
    @Param("id") id: string,
    @Body("banned") banned: boolean,
    @CurrentUser() admin: User,
  ) {
    if (typeof banned !== "boolean") {
      throw new BadRequestException(
        'Body must include a boolean "banned" field',
      );
    }

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) {
      throw new NotFoundException(`No user with id ${id}`);
    }

    if (target.role === "ADMIN" && banned) {
      // An admin banning another admin is almost certainly a mistake
      // or requires a higher-privilege action than this endpoint —
      // block it rather than silently allow admin-on-admin lockout.
      throw new BadRequestException(
        "Cannot ban an ADMIN user through this endpoint",
      );
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isBanned: banned },
      select: { id: true, username: true, isBanned: true },
    });

    this.logger.log(
      `Admin ${admin.username} (${admin.id}) set isBanned=${banned} for user ${updated.username} (${updated.id})`,
    );

    return updated;
  }

  /**
   * Role change. Same "own dedicated endpoint" reasoning as ban above.
   */
  @Patch("users/:id/role")
  async setRole(
    @Param("id") id: string,
    @Body("role") role: UserRole,
    @CurrentUser() admin: User,
  ) {
    if (!["USER", "MODERATOR", "ADMIN"].includes(role)) {
      throw new BadRequestException(`Invalid role: ${role}`);
    }

    if (id === admin.id && role !== "ADMIN") {
      // Prevents an admin from accidentally demoting themselves and
      // getting locked out of every @Roles('ADMIN') route with no
      // other admin account to fix it. Deliberately conservative.
      throw new BadRequestException(
        "Cannot change your own role away from ADMIN",
      );
    }

    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) {
      throw new NotFoundException(`No user with id ${id}`);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, username: true, role: true },
    });

    this.logger.log(
      `Admin ${admin.username} (${admin.id}) set role=${role} for user ${updated.username} (${updated.id})`,
    );

    return updated;
  }

  /**
   * Site-wide activity summary — aggregate counts, not per-event
   * detail. This is the dashboard-level "how is the site doing"
   * view; drill into a specific user via the endpoints above for
   * the detailed timeline.
   */
  @Get("overview")
  async overview() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      activeUsers24h,
      activeUsers7d,
      totalComments,
      totalWatchEvents,
      tokensGranted7d,
      bannedCount,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { lastActiveAt: { gte: since24h } } }),
      this.prisma.user.count({ where: { lastActiveAt: { gte: since7d } } }),
      this.prisma.comment.count({ where: { isDeleted: false } }),
      this.prisma.watchEvent.count(),
      this.prisma.tokenTransaction.aggregate({
        where: { createdAt: { gte: since7d }, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      this.prisma.user.count({ where: { isBanned: true } }),
    ]);

    return {
      totalUsers,
      activeUsers24h,
      activeUsers7d,
      totalComments,
      totalWatchEvents,
      tokensGrantedLast7Days: tokensGranted7d._sum.amount ?? 0,
      bannedCount,
    };
  }
}
