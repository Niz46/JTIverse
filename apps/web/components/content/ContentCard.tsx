/**
 * CONTENT CARD
 * ------------
 * The most-used component in the app. Renders a single content item
 * in 2:3 aspect ratio with cover image, title, rating, and genre tags.
 *
 * Used in:
 *  - Homepage trending rows (horizontal scroll)
 *  - Catalog grid pages (/anime, /donghua, /movies)
 *  - Recommendations row on content detail page
 *
 * Layout: fixed 2:3 aspect cover image, metadata below.
 * No image → gradient placeholder using a deterministic colour
 * derived from the title string so it's visually distinct per item.
 */

import Link from "next/link";
import Image from "next/image";
import type { PublicContent } from "@anime-platform/types";
import { Skeleton } from "@/components/ui";

interface ContentCardProps {
  content: PublicContent;
  /** compact = smaller text, no genre tags — used in recs row */
  compact?: boolean;
}

export function ContentCard({ content, compact = false }: ContentCardProps) {
  return (
    <Link
      href={`/content/${content.id}`}
      className="group flex flex-col gap-2 focus-visible:outline-none"
    >
      {/* Cover image — 2:3 aspect ratio */}
      <div
        className="relative w-full overflow-hidden rounded-lg bg-(--color-surface-2) border border-(--color-border) group-hover:border-(--color-border-2) transition-all duration-200 group-hover:scale-[1.02]"
        style={{ aspectRatio: "2/3" }}
      >
        {content.coverImageUrl ? (
          <Image
            src={content.coverImageUrl}
            alt={content.title}
            fill
            sizes="(max-width: 640px) 40vw, (max-width: 1024px) 20vw, 160px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <PlaceholderCover title={content.title} />
        )}

        {/* Type tag overlay */}
        <span className="absolute top-2 left-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/60 text-white/80 uppercase tracking-wide">
          {content.type}
        </span>

        {/* Rating overlay — bottom right */}
        {content.rating && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded bg-black/70 text-(--color-gold)">
            ★ {content.rating.toFixed(1)}
          </span>
        )}
      </div>

      {/* Metadata */}
      <div className="flex flex-col gap-1 min-w-0">
        <p
          className={`font-semibold leading-snug text-(--color-text) line-clamp-2 group-hover:text-(--color-accent-hover) transition-colors ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {content.title}
        </p>

        {!compact && (
          <>
            <p className="text-xs text-(--color-muted)">
              {[content.releaseYear, content.countryOfOrigin]
                .filter(Boolean)
                .join(" · ")}
            </p>

            {content.genres.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {content.genres.slice(0, 3).map((g) => (
                  <span
                    key={g}
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-(--color-surface-2) text-(--color-text-2) border border-(--color-border)"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Link>
  );
}

// ============================================================
// PLACEHOLDER COVER — deterministic colour from title string
// ============================================================

function PlaceholderCover({ title }: { title: string }) {
  // Deterministic hue from title — same title always same colour
  const hue =
    title.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;

  return (
    <div
      className="w-full h-full flex items-end p-3"
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 30% 12%), hsl(${hue} 20% 8%))`,
      }}
    >
      <p className="text-xs text-white/40 font-medium leading-tight line-clamp-3">
        {title}
      </p>
    </div>
  );
}

// ============================================================
// CONTENT CARD SKELETON — loading state
// ============================================================

export function ContentCardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton
        className="w-full rounded-lg"
        style={{ aspectRatio: "2/3" } as React.CSSProperties}
      />
      <Skeleton className="h-4 w-4/5 rounded" />
      <Skeleton className="h-3 w-2/5 rounded" />
    </div>
  );
}

// ============================================================
// CONTENT GRID — responsive grid of cards
// ============================================================

interface ContentGridProps {
  contents: PublicContent[];
  loading?: boolean;
  skeletonCount?: number;
}

export function ContentGrid({
  contents,
  loading,
  skeletonCount = 10,
}: ContentGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <ContentCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
      {contents.map((c) => (
        <ContentCard key={c.id} content={c} />
      ))}
    </div>
  );
}

// ============================================================
// HORIZONTAL SCROLL ROW — for homepage trending sections
// ============================================================

interface ContentRowProps {
  title: string;
  contents: PublicContent[];
  loading?: boolean;
  viewAllHref?: string;
}

export function ContentRow({
  title,
  contents,
  loading,
  viewAllHref,
}: ContentRowProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-4 md:px-0">
        <h2 className="text-lg font-bold text-(--color-text)">{title}</h2>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            className="text-sm text-(--color-accent) hover:text-(--color-accent-hover) transition-colors"
          >
            View all →
          </Link>
        )}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 px-4 md:px-0 scrollbar-thin">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex-none w-32 sm:w-36 md:w-40">
                <ContentCardSkeleton />
              </div>
            ))
          : contents.map((c) => (
              <div key={c.id} className="flex-none w-32 sm:w-36 md:w-40">
                <ContentCard key={c.id} content={c} />
              </div>
            ))}
      </div>
    </section>
  );
}
