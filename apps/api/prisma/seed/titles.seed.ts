import { PrismaClient, TitleTier } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

/**
 * TITLES SEED SCRIPT
 * -------------------
 * 75 titles, top-heavy distribution (Common 8, Uncommon 10, Rare 12,
 * Epic 18, Legendary 15, Mythic 12) — deliberately lean at the bottom,
 * wide variety at the top, per product decision to make the flex
 * tiers (Epic/Legendary/Mythic) the main draw.
 *
 * 4 of the 12 Mythic titles are ACHIEVEMENT-GATED (unlockNote set,
 * tokenCost still populated as a reference/display value but the
 * actual grant path for these is NOT "buy in shop" — the Titles
 * module (not yet built) must check the achievement condition before
 * allowing purchase, not just check token balance. This distinction
 * matters: don't let a future Titles-shop implementation treat
 * unlockNote as decorative text — it's a real gate.
 *
 * TOKEN COST CAVEAT: costs below are provisional, sized against an
 * ASSUMED task-reward range of 10-50 tokens per task (matching the
 * example rewards used earlier in this project's design docs) — NOT
 * validated against real seeded Task rows, because Tasks haven't
 * been seeded yet as of this script's writing. Once Tasks are
 * seeded, re-check that the top of this cost curve (5000-6000 for
 * top Mythics) is actually reachable in a reasonable timeframe
 * without being trivial — this is a balance pass to revisit, not a
 * finished, load-tested economy.
 *
 * IDEMPOTENT: uses upsert on the unique `name` field, safe to re-run.
 * isDefault: true is set on exactly ONE row (NPC) — ClerkWebhookController
 * queries for this exact flag when granting new-signup titles; if this
 * script is ever edited to add a second isDefault: true row, that
 * webhook logic (`findFirst` — takes whichever the DB happens to
 * return first) would nondeterministically break which title new
 * users get. Keep isDefault singular.
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

interface TitleSeed {
  name: string;
  tier: TitleTier;
  colorHex: string;
  gradientHex?: string;
  isAnimated?: boolean;
  tokenCost: number;
  isDefault?: boolean;
  unlockNote?: string;
  sortOrder: number;
}

const titles: TitleSeed[] = [
  // ============================================================
  // COMMON (8) — gray, cheap/free, the "everyone starts here" tier
  // ============================================================
  {
    name: "NPC",
    tier: "COMMON",
    colorHex: "#9CA3AF",
    tokenCost: 0,
    isDefault: true,
    sortOrder: 1,
  },
  {
    name: "Lurker",
    tier: "COMMON",
    colorHex: "#9CA3AF",
    tokenCost: 0,
    sortOrder: 2,
  },
  {
    name: "Casual Viewer",
    tier: "COMMON",
    colorHex: "#A1A1AA",
    tokenCost: 20,
    sortOrder: 3,
  },
  {
    name: "Newcomer",
    tier: "COMMON",
    colorHex: "#9CA3AF",
    tokenCost: 20,
    sortOrder: 4,
  },
  {
    name: "Background Character",
    tier: "COMMON",
    colorHex: "#A8A29E",
    tokenCost: 30,
    sortOrder: 5,
  },
  {
    name: "Side Quest",
    tier: "COMMON",
    colorHex: "#9CA3AF",
    tokenCost: 30,
    sortOrder: 6,
  },
  {
    name: "Filler Arc Enjoyer",
    tier: "COMMON",
    colorHex: "#A1A1AA",
    tokenCost: 40,
    sortOrder: 7,
  },
  {
    name: "Extra #3",
    tier: "COMMON",
    colorHex: "#9CA3AF",
    tokenCost: 40,
    sortOrder: 8,
  },

  // ============================================================
  // UNCOMMON (10) — green, low-mid cost
  // ============================================================
  {
    name: "Binge Watcher",
    tier: "UNCOMMON",
    colorHex: "#22C55E",
    tokenCost: 60,
    sortOrder: 9,
  },
  {
    name: "Otaku-in-Training",
    tier: "UNCOMMON",
    colorHex: "#16A34A",
    tokenCost: 60,
    sortOrder: 10,
  },
  {
    name: "Episode Skipper",
    tier: "UNCOMMON",
    colorHex: "#22C55E",
    tokenCost: 70,
    sortOrder: 11,
  },
  {
    name: "Comment Section Regular",
    tier: "UNCOMMON",
    colorHex: "#4ADE80",
    tokenCost: 70,
    sortOrder: 12,
  },
  {
    name: "Subbed Not Dubbed",
    tier: "UNCOMMON",
    colorHex: "#16A34A",
    tokenCost: 80,
    sortOrder: 13,
  },
  {
    name: "Donghua Discoverer",
    tier: "UNCOMMON",
    colorHex: "#22C55E",
    tokenCost: 80,
    sortOrder: 14,
  },
  {
    name: "Popcorn Ready",
    tier: "UNCOMMON",
    colorHex: "#4ADE80",
    tokenCost: 90,
    sortOrder: 15,
  },
  {
    name: "Room Regular",
    tier: "UNCOMMON",
    colorHex: "#16A34A",
    tokenCost: 90,
    sortOrder: 16,
  },
  {
    name: "Watchlist Hoarder",
    tier: "UNCOMMON",
    colorHex: "#22C55E",
    tokenCost: 100,
    sortOrder: 17,
  },
  {
    name: "Rewatch Enthusiast",
    tier: "UNCOMMON",
    colorHex: "#4ADE80",
    tokenCost: 100,
    sortOrder: 18,
  },

  // ============================================================
  // RARE (12) — blue, mid cost
  // ============================================================
  {
    name: "Arc Finisher",
    tier: "RARE",
    colorHex: "#3B82F6",
    tokenCost: 150,
    sortOrder: 19,
  },
  {
    name: "Plot Twist Survivor",
    tier: "RARE",
    colorHex: "#2563EB",
    tokenCost: 150,
    sortOrder: 20,
  },
  {
    name: "Lore Keeper",
    tier: "RARE",
    colorHex: "#3B82F6",
    tokenCost: 170,
    sortOrder: 21,
  },
  {
    name: "Room Host",
    tier: "RARE",
    colorHex: "#60A5FA",
    tokenCost: 170,
    sortOrder: 22,
  },
  {
    name: "Character Development Advocate",
    tier: "RARE",
    colorHex: "#2563EB",
    tokenCost: 190,
    sortOrder: 23,
  },
  {
    name: "Ending Theme Skipper Never",
    tier: "RARE",
    colorHex: "#3B82F6",
    tokenCost: 190,
    sortOrder: 24,
  },
  {
    name: "Studio Loyalist",
    tier: "RARE",
    colorHex: "#60A5FA",
    tokenCost: 210,
    sortOrder: 25,
  },
  {
    name: "Season Finale Veteran",
    tier: "RARE",
    colorHex: "#2563EB",
    tokenCost: 210,
    sortOrder: 26,
  },
  {
    name: "Cour Completionist",
    tier: "RARE",
    colorHex: "#3B82F6",
    tokenCost: 230,
    sortOrder: 27,
  },
  {
    name: "Genre Explorer",
    tier: "RARE",
    colorHex: "#60A5FA",
    tokenCost: 230,
    sortOrder: 28,
  },
  {
    name: "Streak Starter",
    tier: "RARE",
    colorHex: "#2563EB",
    tokenCost: 250,
    sortOrder: 29,
  },
  {
    name: "Token Saver",
    tier: "RARE",
    colorHex: "#3B82F6",
    tokenCost: 250,
    sortOrder: 30,
  },

  // ============================================================
  // EPIC (18) — purple, glow enabled, this is where variety opens up
  // ============================================================
  {
    name: "Aura Farmer",
    tier: "EPIC",
    colorHex: "#A855F7",
    tokenCost: 400,
    sortOrder: 31,
  },
  {
    name: "Main Character Energy",
    tier: "EPIC",
    colorHex: "#9333EA",
    tokenCost: 400,
    sortOrder: 32,
  },
  {
    name: "Isekai Survivor",
    tier: "EPIC",
    colorHex: "#A855F7",
    tokenCost: 430,
    sortOrder: 33,
  },
  {
    name: "Plot Armor Enjoyer",
    tier: "EPIC",
    colorHex: "#C084FC",
    tokenCost: 430,
    sortOrder: 34,
  },
  {
    name: "Foreshadowing Detector",
    tier: "EPIC",
    colorHex: "#9333EA",
    tokenCost: 460,
    sortOrder: 35,
  },
  {
    name: "Nakama Certified",
    tier: "EPIC",
    colorHex: "#A855F7",
    tokenCost: 460,
    sortOrder: 36,
  },
  {
    name: "Power Scaler",
    tier: "EPIC",
    colorHex: "#C084FC",
    tokenCost: 490,
    sortOrder: 37,
  },
  {
    name: "Tournament Arc Veteran",
    tier: "EPIC",
    colorHex: "#9333EA",
    tokenCost: 490,
    sortOrder: 38,
  },
  {
    name: "Cultivation Path Walker",
    tier: "EPIC",
    colorHex: "#A855F7",
    tokenCost: 520,
    sortOrder: 39,
  },
  {
    name: "Sect Elder",
    tier: "EPIC",
    colorHex: "#C084FC",
    tokenCost: 520,
    sortOrder: 40,
  },
  {
    name: "Watch Room Diplomat",
    tier: "EPIC",
    colorHex: "#9333EA",
    tokenCost: 550,
    sortOrder: 41,
  },
  {
    name: "Comment Section Sage",
    tier: "EPIC",
    colorHex: "#A855F7",
    tokenCost: 550,
    sortOrder: 42,
  },
  {
    name: "Backlog Slayer",
    tier: "EPIC",
    colorHex: "#C084FC",
    tokenCost: 580,
    sortOrder: 43,
  },
  {
    name: "Marathon Veteran",
    tier: "EPIC",
    colorHex: "#9333EA",
    tokenCost: 580,
    sortOrder: 44,
  },
  {
    name: "Weekly Grind Champion",
    tier: "EPIC",
    colorHex: "#A855F7",
    tokenCost: 610,
    sortOrder: 45,
  },
  {
    name: "Aura Investor",
    tier: "EPIC",
    colorHex: "#C084FC",
    tokenCost: 610,
    sortOrder: 46,
  },
  {
    name: "Certified Sigma Viewer",
    tier: "EPIC",
    colorHex: "#9333EA",
    tokenCost: 640,
    sortOrder: 47,
  },
  {
    name: "Protagonist Adjacent",
    tier: "EPIC",
    colorHex: "#A855F7",
    tokenCost: 640,
    sortOrder: 48,
  },

  // ============================================================
  // LEGENDARY (15) — orange/gold, strong glow, high cost
  // ============================================================
  {
    name: "Aura Farming King",
    tier: "LEGENDARY",
    colorHex: "#F59E0B",
    tokenCost: 1200,
    sortOrder: 49,
  },
  {
    name: "Isekai Protagonist",
    tier: "LEGENDARY",
    colorHex: "#D97706",
    tokenCost: 1200,
    sortOrder: 50,
  },
  {
    name: "Final Boss Energy",
    tier: "LEGENDARY",
    colorHex: "#F59E0B",
    tokenCost: 1300,
    sortOrder: 51,
  },
  {
    name: "Overpowered MC",
    tier: "LEGENDARY",
    colorHex: "#FBBF24",
    tokenCost: 1300,
    sortOrder: 52,
  },
  {
    name: "Hidden Ranker",
    tier: "LEGENDARY",
    colorHex: "#D97706",
    tokenCost: 1400,
    sortOrder: 53,
  },
  {
    name: "Heavenly Dao Disciple",
    tier: "LEGENDARY",
    colorHex: "#F59E0B",
    tokenCost: 1400,
    sortOrder: 54,
  },
  {
    name: "Watch Party Mastermind",
    tier: "LEGENDARY",
    colorHex: "#FBBF24",
    tokenCost: 1500,
    sortOrder: 55,
  },
  {
    name: "Franchise Completionist",
    tier: "LEGENDARY",
    colorHex: "#D97706",
    tokenCost: 1500,
    sortOrder: 56,
  },
  {
    name: "Sensei of the Comments",
    tier: "LEGENDARY",
    colorHex: "#F59E0B",
    tokenCost: 1600,
    sortOrder: 57,
  },
  {
    name: "Token Mogul",
    tier: "LEGENDARY",
    colorHex: "#FBBF24",
    tokenCost: 1600,
    sortOrder: 58,
  },
  {
    name: "S-Tier Reviewer",
    tier: "LEGENDARY",
    colorHex: "#D97706",
    tokenCost: 1700,
    sortOrder: 59,
  },
  {
    name: "Ascended Viewer",
    tier: "LEGENDARY",
    colorHex: "#F59E0B",
    tokenCost: 1700,
    sortOrder: 60,
  },
  {
    name: "Realm Breaker",
    tier: "LEGENDARY",
    colorHex: "#FBBF24",
    tokenCost: 1800,
    sortOrder: 61,
  },
  {
    name: "Certified Aura Farmer",
    tier: "LEGENDARY",
    colorHex: "#D97706",
    tokenCost: 1800,
    sortOrder: 62,
  },
  {
    name: "No-Life Champion",
    tier: "LEGENDARY",
    colorHex: "#F59E0B",
    tokenCost: 1900,
    sortOrder: 63,
  },

  // ============================================================
  // MYTHIC (12) — red/prismatic, animated, top of the economy.
  // 8 pure token-cost, 4 achievement-gated (unlockNote is a REAL
  // gate — see docstring above).
  // ============================================================
  {
    name: "Sigma Grindset",
    tier: "MYTHIC",
    colorHex: "#EF4444",
    gradientHex: "#F97316",
    isAnimated: true,
    tokenCost: 3000,
    sortOrder: 64,
  },
  {
    name: "Ohana Tier",
    tier: "MYTHIC",
    colorHex: "#EF4444",
    gradientHex: "#EC4899",
    isAnimated: true,
    tokenCost: 3200,
    sortOrder: 65,
  },
  {
    name: "Reality Warper",
    tier: "MYTHIC",
    colorHex: "#EF4444",
    gradientHex: "#8B5CF6",
    isAnimated: true,
    tokenCost: 3400,
    sortOrder: 66,
  },
  {
    name: "Author-Sama",
    tier: "MYTHIC",
    colorHex: "#EF4444",
    gradientHex: "#F59E0B",
    isAnimated: true,
    tokenCost: 3600,
    sortOrder: 67,
  },
  {
    name: "Beyond Human Comprehension",
    tier: "MYTHIC",
    colorHex: "#EF4444",
    gradientHex: "#3B82F6",
    isAnimated: true,
    tokenCost: 3800,
    sortOrder: 68,
  },
  {
    name: "Fourth Wall Breaker",
    tier: "MYTHIC",
    colorHex: "#EF4444",
    gradientHex: "#22C55E",
    isAnimated: true,
    tokenCost: 4000,
    sortOrder: 69,
  },
  {
    name: "The One Who Watches All",
    tier: "MYTHIC",
    colorHex: "#EF4444",
    gradientHex: "#EAB308",
    isAnimated: true,
    tokenCost: 4500,
    sortOrder: 70,
  },
  {
    name: "Living Legend",
    tier: "MYTHIC",
    colorHex: "#EF4444",
    gradientHex: "#F97316",
    isAnimated: true,
    tokenCost: 5000,
    sortOrder: 71,
  },

  // Achievement-gated — tokenCost shown for reference/display, but
  // Titles module must check the actual achievement condition, not
  // just token balance, before allowing equip/purchase.
  {
    name: "Site God",
    tier: "MYTHIC",
    colorHex: "#EF4444",
    gradientHex: "#DC2626",
    isAnimated: true,
    tokenCost: 6000,
    unlockNote: "Top 1 weekly leaderboard only",
    sortOrder: 72,
  },
  {
    name: "Aura Farming Emperor",
    tier: "MYTHIC",
    colorHex: "#EF4444",
    gradientHex: "#B91C1C",
    isAnimated: true,
    tokenCost: 6000,
    unlockNote: "Top 10 weekly leaderboard only",
    sortOrder: 73,
  },
  {
    name: "Unbroken Streak",
    tier: "MYTHIC",
    colorHex: "#EF4444",
    gradientHex: "#7C3AED",
    isAnimated: true,
    tokenCost: 5500,
    unlockNote: "Requires a 100-day consecutive login streak",
    sortOrder: 74,
  },
  {
    name: "First of Their Name",
    tier: "MYTHIC",
    colorHex: "#EF4444",
    gradientHex: "#DB2777",
    isAnimated: true,
    tokenCost: 6000,
    unlockNote:
      "Event-exclusive — awarded to the platform's first 100 registered users only",
    sortOrder: 75,
  },
];

async function main() {
  console.log(`Seeding ${titles.length} titles...`);

  const defaultCount = titles.filter((t) => t.isDefault).length;
  if (defaultCount !== 1) {
    throw new Error(
      `Expected exactly 1 title with isDefault: true, found ${defaultCount}. ` +
        `ClerkWebhookController's user.created handler relies on there being exactly one — fix the seed data before running.`,
    );
  }

  for (const title of titles) {
    await prisma.title.upsert({
      where: { name: title.name },
      create: title,
      update: title, // safe to re-run: updates existing rows to match this file rather than erroring on conflict
    });
  }

  const finalCount = await prisma.title.count();
  console.log(`Done. ${finalCount} Title rows now in database.`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
