/**
 * HOMEPAGE (server component)
 * ---------------------------
 * Fetches trending anime + donghua + movies from the API at request time.
 * Falls back gracefully when the catalog is empty (sync not yet run).
 *
 * Layout:
 *  1. Hero — platform value prop
 *  2. Trending Anime row
 *  3. Trending Donghua row
 *  4. Trending Movies row
 *  5. How It Works — 3-step explainer of the token economy
 */

import Link from "next/link";
import { contentApi } from "@/lib/api";
import { ContentRow } from "@/components/content/ContentCard";
import type { PublicContent } from "@anime-platform/types";

async function getTrending(): Promise<{
  anime: PublicContent[];
  donghua: PublicContent[];
  movies: PublicContent[];
}> {
  try {
    const [anime, donghua, movies] = await Promise.all([
      contentApi.list("ANIME"),
      contentApi.list("DONGHUA"),
      contentApi.list("MOVIE"),
    ]);
    return { anime, donghua, movies };
  } catch {
    // API offline or empty catalog — homepage still renders
    return { anime: [], donghua: [], movies: [] };
  }
}

export default async function HomePage() {
  const { anime, donghua, movies } = await getTrending();
  const hasCatalog =
    anime.length > 0 || donghua.length > 0 || movies.length > 0;

  return (
    <div className="flex flex-col">
      {/* ======================================================
          HERO
         ====================================================== */}
      <section className="relative overflow-hidden border-b border-(--color-border)">
        {/* Background gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -20%, #6366f130, transparent)",
          }}
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-7xl px-4 md:px-6 py-20 md:py-28 flex flex-col items-center text-center gap-6">
          {/* Eyebrow */}
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-(--color-accent) bg-(--color-accent-muted) border border-accent/30 px-3 py-1 rounded-full">
            🎌 Watch-to-Earn Platform
          </span>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-none max-w-3xl">
            Watch.{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #f59e0b, #fbbf24)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Earn.
            </span>{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #6366f1, #818cf8)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Flex.
            </span>
          </h1>

          <p className="text-base md:text-lg text-(--color-text-2) max-w-xl leading-relaxed">
            Stream anime and donghua, earn tokens for every episode you finish,
            and spend them on exclusive titles that flex in every comment you
            post.
          </p>

          <div className="flex items-center gap-3 flex-wrap justify-center">
            <Link
              href="/anime"
              className="px-6 py-2.5 rounded-lg font-semibold text-sm bg-(--color-accent) text-white hover:bg-(--color-accent-hover) transition-colors"
            >
              Browse Anime
            </Link>
            <Link
              href="/donghua"
              className="px-6 py-2.5 rounded-lg font-semibold text-sm bg-(--color-surface-2) text-(--color-text) border border-(--color-border) hover:border-(--color-border-2) hover:bg-(--color-surface-3) transition-colors"
            >
              Browse Donghua
            </Link>
          </div>
        </div>
      </section>

      {/* ======================================================
          TRENDING ROWS
         ====================================================== */}
      <div className="mx-auto w-full max-w-7xl px-0 md:px-6 py-10 flex flex-col gap-10">
        {hasCatalog ? (
          <>
            {anime.length > 0 && (
              <ContentRow
                title="Trending Anime"
                contents={anime.slice(0, 12)}
                viewAllHref="/anime"
              />
            )}
            {donghua.length > 0 && (
              <ContentRow
                title="Trending Donghua"
                contents={donghua.slice(0, 12)}
                viewAllHref="/donghua"
              />
            )}
            {movies.length > 0 && (
              <ContentRow
                title="Movies"
                contents={movies.slice(0, 12)}
                viewAllHref="/movies"
              />
            )}
          </>
        ) : (
          <EmptyCatalogBanner />
        )}
      </div>

      {/* ======================================================
          HOW IT WORKS
         ====================================================== */}
      <section className="border-t border-(--color-border) bg-(--color-surface)">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-16 flex flex-col items-center gap-10">
          <div className="text-center flex flex-col gap-2">
            <h2 className="text-2xl md:text-3xl font-bold text-(--color-text)">
              How It Works
            </h2>
            <p className="text-(--color-text-2) text-sm max-w-md">
              JTIverse rewards you for watching. The more you watch, the higher
              your status.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl">
            {HOW_IT_WORKS.map((step, i) => (
              <div
                key={step.title}
                className="flex flex-col items-center text-center gap-3 p-6 rounded-xl bg-(--color-surface-2) border border-(--color-border)"
              >
                <span className="text-3xl" aria-hidden="true">
                  {step.icon}
                </span>
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-(--color-accent)">
                    Step {i + 1}
                  </p>
                  <p className="font-bold text-(--color-text)">
                    {step.title}
                  </p>
                  <p className="text-xs text-(--color-muted) leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Link
            href="/shop"
            className="text-sm font-semibold text-(--color-accent) hover:text-(--color-accent-hover) transition-colors"
          >
            Browse the Titles Shop →
          </Link>
        </div>
      </section>
    </div>
  );
}

// ============================================================
// CONSTANTS
// ============================================================

const HOW_IT_WORKS = [
  {
    icon: "📺",
    title: "Watch Content",
    description:
      "Finish episodes of anime, donghua, or movies. Every completed watch earns you tokens automatically.",
  },
  {
    icon: "💰",
    title: "Earn Tokens",
    description:
      "Tokens stack up as you watch, comment, and join watch rooms. Hit milestones for bonus rewards.",
  },
  {
    icon: "🏆",
    title: "Flex Your Title",
    description:
      "Spend tokens in the Titles Shop on exclusive profile titles. Your title shows on every comment you post.",
  },
];

// ============================================================
// EMPTY CATALOG BANNER
// ============================================================

function EmptyCatalogBanner() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center px-4">
      <span className="text-5xl" aria-hidden="true">
        🎌
      </span>
      <h2 className="text-xl font-bold text-(--color-text)">
        Catalog loading soon
      </h2>
      <p className="text-sm text-(--color-muted) max-w-sm">
        The content catalog is being populated. Check back shortly — or sign in
        as an admin and trigger a sync from the admin panel.
      </p>
      <Link
        href="/sign-up"
        className="px-5 py-2 rounded-lg text-sm font-medium bg-(--color-accent) text-white hover:bg-(--color-accent-hover) transition-colors"
      >
        Create an account
      </Link>
    </div>
  );
}
