import { PrismaClient, TaskType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

/**
 * TASKS SEED SCRIPT
 * ------------------
 * Seeds the Task table so TokenGrantProcessor has rows to match
 * against. Without this, every token-grant job runs successfully
 * but finds zero active tasks and does nothing — the token economy
 * is a no-op until this script has been run at least once.
 *
 * TOKEN REWARD CALIBRATION:
 * Costs in titles.seed.ts range from 20 (cheapest paid Common) to
 * 6000 (top Mythics). Rewards here are sized so a genuinely active
 * user (watches regularly, comments, uses rooms) can earn a mid-tier
 * Epic (~500 tokens) within a few weeks of real use. A user grinding
 * to a Legendary/Mythic should feel like an achievement, not a grind.
 *
 * The 100-day STREAK_DAYS task at threshold:100 is the gate for
 * the "Unbroken Streak" Mythic title — see titles-shop.controller.ts's
 * checkAchievementGate(). Keep its name exactly "100-Day Streak" and
 * type exactly "STREAK_DAYS" or that gate check will find no matching
 * task and block the purchase with a "cannot be verified" error.
 *
 * IDEMPOTENT: uses upsert on the unique `name` field, safe to re-run.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

interface TaskSeed {
  name: string;
  description: string;
  type: TaskType;
  threshold: number;
  tokenReward: number;
  isRepeatable: boolean;
  isActive: boolean;
}

const tasks: TaskSeed[] = [
  // ============================================================
  // WATCH_COUNT — watching content is the platform's core loop
  // ============================================================
  {
    name: "First Watch",
    description: "Watch your first title to completion.",
    type: "WATCH_COUNT",
    threshold: 1,
    tokenReward: 10,
    isRepeatable: false,
    isActive: true,
  },
  {
    name: "Watch 5 Titles",
    description: "Complete 5 titles.",
    type: "WATCH_COUNT",
    threshold: 5,
    tokenReward: 30,
    isRepeatable: false,
    isActive: true,
  },
  {
    name: "Watch 10 Titles",
    description: "Complete 10 titles.",
    type: "WATCH_COUNT",
    threshold: 10,
    tokenReward: 75,
    isRepeatable: false,
    isActive: true,
  },
  {
    name: "Watch 25 Titles",
    description: "Complete 25 titles.",
    type: "WATCH_COUNT",
    threshold: 25,
    tokenReward: 150,
    isRepeatable: false,
    isActive: true,
  },
  {
    name: "Watch 50 Titles",
    description: "Complete 50 titles.",
    type: "WATCH_COUNT",
    threshold: 50,
    tokenReward: 300,
    isRepeatable: false,
    isActive: true,
  },
  {
    name: "Watch 100 Titles",
    description: "Complete 100 titles. A true connoisseur.",
    type: "WATCH_COUNT",
    threshold: 100,
    tokenReward: 600,
    isRepeatable: false,
    isActive: true,
  },

  // ============================================================
  // COMMENT_COUNT — community engagement rewards
  // ============================================================
  {
    name: "First Comment",
    description: "Post your first comment on any title.",
    type: "COMMENT_COUNT",
    threshold: 1,
    tokenReward: 5,
    isRepeatable: false,
    isActive: true,
  },
  {
    name: "Post 10 Comments",
    description: "Post 10 comments across any titles.",
    type: "COMMENT_COUNT",
    threshold: 10,
    tokenReward: 30,
    isRepeatable: false,
    isActive: true,
  },
  {
    name: "Post 50 Comments",
    description: "Post 50 comments. The community voice.",
    type: "COMMENT_COUNT",
    threshold: 50,
    tokenReward: 100,
    isRepeatable: false,
    isActive: true,
  },
  {
    name: "Post 100 Comments",
    description: "Post 100 comments. A true critic.",
    type: "COMMENT_COUNT",
    threshold: 100,
    tokenReward: 200,
    isRepeatable: false,
    isActive: true,
  },

  // ============================================================
  // ROOM_CREATE_COUNT — hosting watch parties
  // ============================================================
  {
    name: "Create First Room",
    description: "Create your first watch room.",
    type: "ROOM_CREATE_COUNT",
    threshold: 1,
    tokenReward: 20,
    isRepeatable: false,
    isActive: true,
  },
  {
    name: "Create 5 Rooms",
    description: "Create 5 watch rooms. The gracious host.",
    type: "ROOM_CREATE_COUNT",
    threshold: 5,
    tokenReward: 60,
    isRepeatable: false,
    isActive: true,
  },

  // ============================================================
  // ROOM_JOIN_COUNT — participating in watch parties
  // ============================================================
  {
    name: "Join First Room",
    description: "Join your first watch room.",
    type: "ROOM_JOIN_COUNT",
    threshold: 1,
    tokenReward: 10,
    isRepeatable: false,
    isActive: true,
  },
  {
    name: "Join 10 Rooms",
    description: "Join 10 watch rooms. A social watcher.",
    type: "ROOM_JOIN_COUNT",
    threshold: 10,
    tokenReward: 50,
    isRepeatable: false,
    isActive: true,
  },
  {
    name: "Join 25 Rooms",
    description: "Join 25 watch rooms.",
    type: "ROOM_JOIN_COUNT",
    threshold: 25,
    tokenReward: 100,
    isRepeatable: false,
    isActive: true,
  },

  // ============================================================
  // STREAK_DAYS — daily login / activity streaks.
  // isRepeatable: true means TokenGrantProcessor resets
  // currentCount to 0 after granting, so the streak can re-trigger.
  //
  // IMPORTANT: The "100-Day Streak" task is the gate for the
  // "Unbroken Streak" Mythic title in titles-shop.controller.ts.
  // Its type ("STREAK_DAYS") must match what that gate check queries.
  // ============================================================
  {
    name: "7-Day Streak",
    description: "Stay active 7 days in a row.",
    type: "STREAK_DAYS",
    threshold: 7,
    tokenReward: 50,
    isRepeatable: true,
    isActive: true,
  },
  {
    name: "30-Day Streak",
    description: "Stay active 30 days in a row.",
    type: "STREAK_DAYS",
    threshold: 30,
    tokenReward: 200,
    isRepeatable: true,
    isActive: true,
  },
  {
    name: "100-Day Streak",
    description:
      "Stay active 100 consecutive days. Required for the Unbroken Streak Mythic title.",
    type: "STREAK_DAYS",
    threshold: 100,
    tokenReward: 500,
    isRepeatable: true,
    isActive: true,
  },
];

async function main() {
  console.log(`Seeding ${tasks.length} tasks...`);

  for (const task of tasks) {
    await prisma.task.upsert({
      where: { name: task.name } as any,
      create: task,
      update: task,
    });
  }

  const finalCount = await prisma.task.count();
  console.log(`Done. ${finalCount} Task rows now in database.`);

  // Sanity-check: warn if the streak gate task is missing, because
  // titles-shop.controller.ts will block "Unbroken Streak" purchases
  // with a "cannot be verified" error without it.
  const streakGateTask = await prisma.task.findFirst({
    where: { type: "STREAK_DAYS", isActive: true, threshold: 100 },
  });
  if (!streakGateTask) {
    console.warn(
      "WARNING: No active STREAK_DAYS task with threshold:100 found. " +
        "The Unbroken Streak Mythic title purchase gate will fail until one exists.",
    );
  }
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
