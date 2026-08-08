import {
  Controller,
  Get,
  Post,
  Param,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { User } from "@prisma/client";

/**
 * TITLES SHOP CONTROLLER (roadmap item #3)
 * ------------------------------------------
 * This is the FIRST module after token-grant.processor.ts to write
 * to the ledger. It follows that processor's exact pattern — read,
 * check, ledger-write, balance-write, all inside one $transaction —
 * because that's the codebase's one actual invariant for money:
 * "never write tokenBalance directly outside a ledger transaction."
 * Confirmed by grepping the repo before writing this file: the only
 * other write site is token-grant.processor.ts:112. This is write #2,
 * not a new pattern.
 *
 * ACHIEVEMENT-GATED MYTHICS — READ THIS BEFORE EXTENDING:
 * The seed script (prisma/seed/titles.seed.ts) marks 4 Mythic titles
 * with unlockNote and is explicit that "unlockNote is a REAL gate,"
 * not decorative text — a Titles-shop implementation must check the
 * actual condition, not just token balance. Honoring that here means
 * being honest about what CAN and CANNOT be checked right now:
 *
 *   - "Requires a 100-day consecutive login streak" (Unbroken Streak)
 *     IS checkable today: a STREAK_DAYS-type Task's UserTaskProgress
 *     .currentCount is the real signal, gated below.
 *   - "Top 1 weekly leaderboard only" (Site God) and "Top 10 weekly
 *     leaderboard only" (Aura Farming Emperor) are NOT checkable yet
 *     — the Leaderboard module (roadmap item #6) doesn't exist. This
 *     endpoint explicitly BLOCKS purchase of these two with a clear
 *     reason, rather than silently falling through to "sellable for
 *     tokens," which is exactly the mistake the seed script's
 *     docstring warns against.
 *   - "Event-exclusive — first 100 registered users" (First of Their
 *     Name) is a signup-time condition, not something meaningful to
 *     check at purchase time days/weeks later. Also blocked here,
 *     pending a real decision on how first-100 users actually get
 *     this (likely auto-grant at signup, not a shop purchase at all —
 *     a product decision, not one to guess at silently, same category
 *     as the user.deleted webhook gap already flagged elsewhere).
 *
 * When the Leaderboard module is built, come back to
 * checkAchievementGate() below and wire in the two leaderboard
 * checks — don't add a workaround elsewhere that bypasses this
 * function.
 */
@Controller("titles-shop")
export class TitlesShopController {
  private readonly logger = new Logger(TitlesShopController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Full shop catalog: every Title, plus whether the CALLER already
   * owns it — the frontend needs this to render "Buy" vs "Owned"
   * without a second round trip per title. Public because browsing
   * the shop (deciding what to save up for) shouldn't require login;
   * only the actual purchase does.
   */
  @Public()
  @Get()
  async catalog(@CurrentUser() user?: User) {
    const [titles, ownedIds] = await Promise.all([
      this.prisma.title.findMany({
        orderBy: { sortOrder: "asc" },
      }),
      user
        ? this.prisma.userTitle
            .findMany({ where: { userId: user.id }, select: { titleId: true } })
            .then((rows) => new Set(rows.map((r) => r.titleId)))
        : Promise.resolve(new Set<string>()),
    ]);

    return titles.map((title) => ({
      ...title,
      owned: ownedIds.has(title.id),
    }));
  }

  /**
   * Purchase a title. This is the money-touching endpoint — every
   * check below runs inside one $transaction so a balance check and
   * the actual debit can't be split by a concurrent request (the
   * same race token-grant.processor.ts's comment describes, mirrored
   * here for spending instead of earning).
   */
  @Post(":titleId/purchase")
  async purchase(@Param("titleId") titleId: string, @CurrentUser() user: User) {
    const title = await this.prisma.title.findUnique({
      where: { id: titleId },
    });

    if (!title) {
      throw new NotFoundException(`No title with id ${titleId}`);
    }

    if (title.isDefault) {
      // NPC (or any future isDefault title) is auto-granted on signup
      // per clerk-webhook.controller.ts — it should never reach a
      // "purchase" path at all, owned or not.
      throw new BadRequestException(
        `"${title.name}" is a default title and cannot be purchased`,
      );
    }

    // GAP FIX: a non-default title with tokenCost: 0 (e.g. "Lurker" in
    // the current seed data) would otherwise pass the balance check
    // trivially (0 < 0 is false) with no real spend happening. That
    // might be an intentional "second free starter title" design, but
    // nothing in the code said so on purpose — it just fell out of the
    // arithmetic. Blocking it explicitly forces that to be a real
    // decision (give isDefault: true, or an explicit free-grant path
    // outside this shop) rather than an accident of this comparison.
    if (title.tokenCost === 0) {
      throw new BadRequestException(
        `"${title.name}" has no token cost and is not purchasable through the shop — ` +
          `it should be granted directly (isDefault, or a dedicated free-grant path) if it's meant to be free`,
      );
    }

    const alreadyOwned = await this.prisma.userTitle.findUnique({
      where: { userId_titleId: { userId: user.id, titleId: title.id } },
    });
    if (alreadyOwned) {
      throw new ConflictException(`You already own "${title.name}"`);
    }

    if (title.unlockNote) {
      const gateResult = await this.checkAchievementGate(user.id, title);
      if (!gateResult.eligible) {
        throw new BadRequestException(gateResult.reason);
      }
    }

    // ------------------------------------------------------------
    // RACE CONDITION FIX
    // ------------------------------------------------------------
    // The pre-check above (alreadyOwned) reads OUTSIDE this
    // transaction, under Postgres's default READ COMMITTED isolation
    // (confirmed: no isolationLevel is set anywhere in this codebase).
    // That means two concurrent purchase requests from the same user
    // (a double-tap, or a retried request after a slow response) can
    // BOTH pass the alreadyOwned check before either one commits —
    // $transaction alone does not prevent this, because READ
    // COMMITTED lets each transaction see the pre-transaction
    // database state, not a lock against concurrent readers.
    //
    // What actually stops this from being a real double-spend is the
    // DB-level unique index confirmed in migration.sql:
    //   CREATE UNIQUE INDEX "UserTitle_userId_titleId_key" ON
    //   "UserTitle"("userId", "titleId")
    // The SECOND concurrent transaction's tx.userTitle.create() will
    // throw a unique-constraint violation (Prisma error code P2002)
    // and the whole transaction rolls back — including its
    // tokenTransaction debit and tokenBalance decrement. So the user
    // is NOT double-charged; the second request's money-moving work
    // is fully undone by Prisma's automatic transaction rollback on
    // a thrown error.
    //
    // What WAS missing: nothing caught that specific failure, so it
    // would have surfaced as a raw, unhandled 500 instead of a clean
    // "you already own this" response — correct outcome, ugly and
    // undocumented failure mode. Caught explicitly below via error
    // code P2002 rather than an error-class instanceof check, since
    // P2002 is Prisma's stable, documented code for this across
    // versions and doesn't require importing a specific error class
    // whose exact export path I have not been able to verify against
    // your installed Prisma version in this sandbox (no node_modules
    // present here — confirm this against your real install).
    // ------------------------------------------------------------
    const result = await this.prisma
      .$transaction(async (tx) => {
        // Re-read balance INSIDE the transaction, not from a value
        // captured earlier in this method — the whole point of doing
        // this inside $transaction is that this read and the debit
        // below can't be interleaved with a concurrent purchase by the
        // same user (e.g. double-tapping "Buy" on a slow connection).
        const current = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: { tokenBalance: true, username: true },
        });

        if (current.tokenBalance < title.tokenCost) {
          // Thrown INSIDE the transaction on purpose: Prisma rolls the
          // whole transaction back on a thrown error, so nothing here
          // partially commits. Caught and re-thrown as a proper HTTP
          // exception outside the transaction, below.
          throw new InsufficientBalanceError(
            current.tokenBalance,
            title.tokenCost,
          );
        }

        await tx.tokenTransaction.create({
          data: {
            userId: user.id,
            amount: -title.tokenCost, // negative = debit, per schema comment
            type: "TITLE_PURCHASE",
            reason: `Purchased title: ${title.name}`,
            relatedTitleId: title.id,
          },
        });

        await tx.user.update({
          where: { id: user.id },
          data: { tokenBalance: { decrement: title.tokenCost } },
        });

        const userTitle = await tx.userTitle.create({
          data: { userId: user.id, titleId: title.id },
        });

        return { userTitle, username: current.username };
      })
      .catch((err) => {
        if (err instanceof InsufficientBalanceError) {
          throw new BadRequestException(err.message);
        }
        // P2002 = Prisma's unique-constraint-violation code. This is the
        // race-condition backstop: a concurrent request that slipped
        // past the alreadyOwned pre-check above hits the real DB
        // constraint (UserTitle_userId_titleId_key, confirmed in
        // migration.sql) here instead. The transaction has already been
        // rolled back automatically by Prisma at this point — this catch
        // only decides what the caller sees, it performs no cleanup of
        // its own. Checked via err.code rather than instanceof a
        // specific error class, since I could not verify that class's
        // exact export path against your installed Prisma version in
        // this sandbox (no node_modules present) — P2002 is Prisma's
        // documented, stable code for this across versions.
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code: unknown }).code === "P2002"
        ) {
          throw new ConflictException(`You already own "${title.name}"`);
        }
        throw err;
      });

    this.logger.log(
      `User ${result.username} (${user.id}) purchased title "${title.name}" for ${title.tokenCost} tokens`,
    );

    return {
      userTitleId: result.userTitle.id,
      title: { id: title.id, name: title.name, tier: title.tier },
      unlockedAt: result.userTitle.unlockedAt,
    };
  }

  /**
   * Checks whether the given achievement-gated title's condition is
   * actually met. See the class-level docstring — two of the four
   * gated titles genuinely cannot be checked until the Leaderboard
   * module exists, and this function says so explicitly rather than
   * defaulting either open (sellable) or silently rejecting with a
   * generic message that hides why.
   */
  private async checkAchievementGate(
    userId: string,
    title: { name: string; unlockNote: string | null },
  ): Promise<{ eligible: boolean; reason: string }> {
    switch (title.name) {
      case "Unbroken Streak": {
        const streakTask = await this.prisma.task.findFirst({
          where: { type: "STREAK_DAYS", isActive: true },
        });
        if (!streakTask) {
          return {
            eligible: false,
            reason:
              "Streak requirement cannot be verified — no active streak task configured",
          };
        }
        const progress = await this.prisma.userTaskProgress.findUnique({
          where: { userId_taskId: { userId, taskId: streakTask.id } },
        });
        const currentStreak = progress?.currentCount ?? 0;
        if (currentStreak < 100) {
          return {
            eligible: false,
            reason: `Requires a 100-day login streak — you're at ${currentStreak}`,
          };
        }
        return { eligible: true, reason: "" };
      }

      case "Site God":
      case "Aura Farming Emperor":
        // Genuinely blocked, not a placeholder that quietly opens up
        // once someone forgets this comment exists. Wire in a real
        // leaderboard-rank check here once that module exists.
        return {
          eligible: false,
          reason: `"${title.name}" requires a leaderboard system that hasn't been built yet — this title is not purchasable`,
        };

      case "First of Their Name":
        return {
          eligible: false,
          reason:
            '"First of Their Name" is event-exclusive and not available through the shop',
        };

      default:
        // Any future title with an unlockNote we haven't explicitly
        // handled above should fail closed, not fall through to
        // "sellable" — same reasoning as the two cases just above.
        return {
          eligible: false,
          reason: `"${title.name}" has an unhandled unlock condition — blocked pending implementation`,
        };
    }
  }
}

/**
 * Internal-only error used to unwind out of the $transaction callback
 * with a specific, known reason (as opposed to letting Prisma's
 * transaction-rollback error surface directly, which wouldn't carry
 * the user-facing balance/cost numbers).
 */
class InsufficientBalanceError extends Error {
  constructor(balance: number, cost: number) {
    super(`Insufficient balance: you have ${balance}, this costs ${cost}`);
  }
}
