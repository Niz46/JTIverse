import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../../common/prisma.service";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { User } from "@prisma/client";
import { CommentModerationService } from "./comment-moderation.service";
import { CreateCommentDto, BODY_MAX_LENGTH, BODY_MIN_LENGTH } from "./dto/create-comment.dto";
import { ReportCommentDto, REASON_MAX_LENGTH } from "./dto/report-comment.dto";

/**
 * COMMENTS CONTROLLER (roadmap item #4)
 * ---------------------------------------
 * Follows two patterns already established elsewhere in this codebase
 * rather than inventing new ones:
 *
 *   1. TITLE SNAPSHOT (schema.prisma's own comment on Comment):
 *      titleSnapshotName/ColorHex/Tier are copied from the user's
 *      CURRENTLY EQUIPPED title at post time and never touched again.
 *      This endpoint does the copying — it does NOT live-join to
 *      Title/UserTitle for display, matching the schema's explicit
 *      instruction that historical comments must not silently change
 *      if a title is later unequipped or rebalanced. A user with no
 *      equipped title (equippedTitleId is null — see titles.controller.ts's
 *      unequip endpoint) gets the schema's own default snapshot
 *      values ("NPC" / #9CA3AF / COMMON), not a lookup failure.
 *
 *   2. TOKEN-GRANT QUEUE (jobs/token-grant.processor.ts, already
 *      built and registered in queue.module.ts, but not yet enqueued
 *      from anywhere in the codebase before this file). Posting a
 *      comment enqueues a COMMENT_COUNT job exactly the way a
 *      WatchEvent is described as doing in that processor's own
 *      docstring — this controller is the first real caller of that
 *      queue for a non-watch event.
 *
 * MODERATION: every comment passes through CommentModerationService
 * before being persisted. See that service's docstring for an honest
 * account of what it does and does NOT do yet (no real AI call wired
 * in — that decision hasn't been made). A REJECTED result throws
 * BadRequestException and nothing is written; FLAGGED and APPROVED
 * both persist. They differ in three ways: moderationStatus itself,
 * whether the comment appears in the public list endpoint below
 * (APPROVED only), and whether it enqueues a COMMENT_COUNT
 * token-grant job (APPROVED only — see the anti-abuse comment in
 * create() below, mirroring WatchEvent.watchedPercent's own
 * farming-prevention gate).
 */
@Controller("content/:contentId/comments")
export class CommentsController {
  private readonly logger = new Logger(CommentsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: CommentModerationService,
    @InjectQueue("token-grant") private readonly tokenGrantQueue: Queue,
  ) {}

  /**
   * Public, paginated, APPROVED-only comment list for a piece of
   * content. FLAGGED comments are excluded here (visible to the
   * author via their own admin/activity view once that's wired, and
   * to admins via AdminController's per-user activity endpoint,
   * which already surfaces moderationStatus) rather than shown to
   * every visitor while still pending review.
   */
  @Public()
  @Get()
  async list(
    @Param("contentId") contentId: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = "30",
  ) {
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true },
    });
    if (!content) {
      throw new NotFoundException(`No content with id ${contentId}`);
    }

    const pageNum = Math.max(1, Number(page));
    const size = Math.min(100, Math.max(1, Number(pageSize))); // same hard ceiling pattern as admin.controller.ts's listUsers

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: { contentId, isDeleted: false, moderationStatus: "APPROVED" },
        select: {
          id: true,
          userId: true,
          user: { select: { username: true } },
          body: true,
          titleSnapshotName: true,
          titleSnapshotColorHex: true,
          titleSnapshotTier: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * size,
        take: size,
      }),
      this.prisma.comment.count({
        where: { contentId, isDeleted: false, moderationStatus: "APPROVED" },
      }),
    ]);

    // Flatten user.username to top-level username, matching
    // PublicComment's shape in packages/types/index.ts — same
    // reasoning as users.controller.ts's getPublicProfile flattening
    // equippedTitle: the DB shape (nested relation) and the public
    // API shape are allowed to differ, and this is where that
    // translation happens, not left for the frontend to work around.
    const flattened = comments.map(({ user, ...c }) => ({
      ...c,
      username: user.username,
    }));

    return {
      comments: flattened,
      pagination: {
        page: pageNum,
        pageSize: size,
        total,
        totalPages: Math.ceil(total / size),
      },
    };
  }

  /**
   * Post a comment. Requires auth (no @Public() — the global
   * ClerkAuthGuard applies). Snapshots the caller's equipped title,
   * runs the moderation check, persists, then enqueues the
   * COMMENT_COUNT token-grant job.
   */
  @Post()
  async create(
    @Param("contentId") contentId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: User,
  ) {
    if (typeof dto.body !== "string") {
      throw new BadRequestException("body must be a string");
    }
    const trimmedLength = dto.body.trim().length;
    if (trimmedLength < BODY_MIN_LENGTH) {
      throw new BadRequestException("Comment body cannot be empty");
    }
    if (dto.body.length > BODY_MAX_LENGTH) {
      throw new BadRequestException(
        `Comment body must be ${BODY_MAX_LENGTH} characters or fewer`,
      );
    }

    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true },
    });
    if (!content) {
      throw new NotFoundException(`No content with id ${contentId}`);
    }

    // Full user row for the title snapshot — @CurrentUser() carries
    // whatever ClerkAuthGuard attached, but re-fetching with the
    // explicit equippedTitle include here (rather than trusting a
    // possibly-stale req.user) matches titles-shop.controller.ts's
    // own reasoning for re-reading inside the money/state-changing
    // path rather than the value captured earlier in the request.
    const caller = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        equippedTitle: {
          select: {
            title: { select: { name: true, colorHex: true, tier: true } },
          },
        },
      },
    });

    const moderationResult = await this.moderation.moderate(dto.body);
    if (moderationResult.status === "REJECTED") {
      throw new BadRequestException(
        `Comment rejected by moderation: ${moderationResult.reason}`,
      );
    }

    // Falls back to the schema's own column defaults ("NPC" / gray /
    // COMMON) when equippedTitle is null — a user who has unequipped
    // (titles.controller.ts's unequip endpoint sets equippedTitleId
    // to null, a deliberate distinct state, not a fallback title)
    // should still be able to comment, just with the default badge.
    const snapshot = caller.equippedTitle?.title ?? {
      name: "NPC",
      colorHex: "#9CA3AF",
      tier: "COMMON" as const,
    };

    const comment = await this.prisma.comment.create({
      data: {
        userId: user.id,
        contentId,
        body: dto.body,
        titleSnapshotName: snapshot.name,
        titleSnapshotColorHex: snapshot.colorHex,
        titleSnapshotTier: snapshot.tier,
        moderationStatus: moderationResult.status,
      },
      select: {
        id: true,
        body: true,
        titleSnapshotName: true,
        titleSnapshotColorHex: true,
        titleSnapshotTier: true,
        moderationStatus: true,
        createdAt: true,
      },
    });

    // ANTI-ABUSE GATE, mirroring WatchEvent's own pattern: schema.prisma
    // gates WatchEvent's contribution to task progress behind
    // watchedPercent crossing a real-completion threshold specifically
    // so a user can't farm WATCH_COUNT by starting and immediately
    // abandoning content. Comment has no equivalent field to threshold
    // on, but moderationStatus serves the same anti-abuse purpose here:
    // only APPROVED comments enqueue a COMMENT_COUNT job. A FLAGGED
    // comment (caught by the heuristic spam check, or a future real AI
    // pass) must not earn task progress just because a queue call was
    // unconditional — that would make "post one-character spam
    // repeatedly" a viable token-farming strategy, undermining the
    // same token-economy integrity docs/TOS-COMPLIANCE.md's ledger
    // rules exist to protect. If a FLAGGED comment later gets manually
    // approved (once that review flow exists), that approval path is
    // the correct place to enqueue this job retroactively — not here.
    //
    // Enqueue AFTER the comment is persisted, not before — if create()
    // above had thrown, there would be nothing to count. Fire-and-forget
    // with a caught/logged error rather than awaited into the response:
    // a queue hiccup should delay the user's token progress, not their
    // comment actually posting. Mirrors token-grant.processor.ts's own
    // description of being triggered by "a WatchEvent, Comment, Room
    // creation/join, or daily-login event" — this is that trigger point
    // for Comment, wired in for the first time.
    if (moderationResult.status === "APPROVED") {
      this.tokenGrantQueue
        .add("comment-count", { userId: user.id, taskType: "COMMENT_COUNT" })
        .catch((err) => {
          this.logger.error(
            `Failed to enqueue COMMENT_COUNT token-grant job for user ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    this.logger.log(
      `User ${user.id} posted comment ${comment.id} on content ${contentId} (moderation: ${moderationResult.status})`,
    );

    return comment;
  }

  /**
   * Soft-delete. Own-comment only (ownership check before write,
   * same pattern as titles.controller.ts's equip endpoint) — no
   * admin override here, since AdminController's existing scope
   * note already says admin actions on user content are a deliberate
   * separate concern, not folded into user-facing routes.
   */
  @Delete(":commentId")
  async remove(
    @Param("contentId") contentId: string,
    @Param("commentId") commentId: string,
    @CurrentUser() user: User,
  ) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, contentId: true, isDeleted: true },
    });

    if (!comment || comment.contentId !== contentId || comment.isDeleted) {
      throw new NotFoundException(`No comment with id ${commentId}`);
    }

    if (comment.userId !== user.id) {
      throw new ForbiddenException("You do not own this comment");
    }

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { isDeleted: true },
    });

    this.logger.log(`User ${user.id} deleted comment ${commentId}`);

    return { id: commentId, isDeleted: true };
  }

  /**
   * Report a comment. Any authenticated user except the comment's
   * own author (reporting yourself is meaningless and would just add
   * noise to a moderation queue). Duplicate reports from the same
   * user on the same comment are blocked at the DB level — no
   * @@unique constraint on CommentReport in schema.prisma currently,
   * so this is checked explicitly here rather than assumed.
   */
  @Post(":commentId/report")
  async report(
    @Param("contentId") contentId: string,
    @Param("commentId") commentId: string,
    @Body() dto: ReportCommentDto,
    @CurrentUser() user: User,
  ) {
    if (typeof dto.reason !== "string" || dto.reason.trim().length === 0) {
      throw new BadRequestException("reason is required");
    }
    if (dto.reason.length > REASON_MAX_LENGTH) {
      throw new BadRequestException(
        `reason must be ${REASON_MAX_LENGTH} characters or fewer`,
      );
    }

    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, contentId: true, isDeleted: true },
    });

    if (!comment || comment.contentId !== contentId || comment.isDeleted) {
      throw new NotFoundException(`No comment with id ${commentId}`);
    }

    if (comment.userId === user.id) {
      throw new BadRequestException("You cannot report your own comment");
    }

    // GAP FLAGGED, same spirit as titles-shop.controller.ts's
    // tokenCost:0 catch: schema.prisma has no @@unique([commentId,
    // reporterId]) on CommentReport, so nothing at the DB level stops
    // the same user reporting the same comment repeatedly. Checked
    // explicitly here instead of assuming a constraint that doesn't
    // exist. If duplicate reports become a real problem, the fix is
    // a migration adding that unique index, not more application-code
    // checks layered on top of a missing constraint.
    const existing = await this.prisma.commentReport.findFirst({
      where: { commentId, reporterId: user.id },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException("You have already reported this comment");
    }

    const report = await this.prisma.commentReport.create({
      data: {
        commentId,
        reporterId: user.id,
        reason: dto.reason,
      },
      select: { id: true, createdAt: true },
    });

    this.logger.log(
      `User ${user.id} reported comment ${commentId}: "${dto.reason}"`,
    );

    return report;
  }
}
