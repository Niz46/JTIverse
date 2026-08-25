/**
 * TITLE BADGE
 * -----------
 * The platform's signature UI element. Renders a user's equipped title
 * with tier-appropriate styling from TITLE_TIER_CONFIG in packages/types.
 *
 * TIERS:
 *   COMMON / UNCOMMON / RARE — solid colour, no glow, no animation
 *   EPIC / LEGENDARY         — solid colour + CSS box-shadow glow
 *   MYTHIC                   — CSS gradient shimmer animation (3s loop)
 *                              uses colorHex → gradientHex gradient
 *
 * This component is used in two contexts:
 *   1. Inline next to a username (comment list, profile header)
 *      → size="sm" or size="md"
 *   2. Shop catalog card
 *      → size="lg" with showTier=true
 *
 * It reads the snapshot fields from comments (titleSnapshotName, etc.)
 * or live title fields from the user/shop — the prop shape accepts both.
 */

import { TITLE_TIER_CONFIG, type TitleTier } from "@anime-platform/types";

export interface TitleBadgeProps {
  name: string;
  tier: TitleTier;
  colorHex: string;
  gradientHex?: string | null;
  isAnimated?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  showTier?: boolean;
  className?: string;
}

export function TitleBadge({
  name,
  tier,
  colorHex,
  gradientHex,
  isAnimated,
  size = "sm",
  showTier = false,
  className = "",
}: TitleBadgeProps) {
  const config = TITLE_TIER_CONFIG[tier];

  const sizeClasses = {
    xs: "text-[10px] px-1.5 py-0.5",
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2.5 py-1",
    lg: "text-base px-3 py-1.5",
  };

  // MYTHIC: gradient background animated
  if (config.animated && gradientHex) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-semibold rounded-full ${sizeClasses[size]} title-badge-mythic ${className}`}
        style={{
          background: `linear-gradient(135deg, ${colorHex}, ${gradientHex}, ${colorHex})`,
          backgroundSize: "200% 200%",
          color: "#fff",
          boxShadow: `0 0 12px ${colorHex}80`,
        }}
        title={config.label}
      >
        {showTier && (
          <span className="opacity-70 uppercase tracking-widest text-[9px]">
            {config.label}
          </span>
        )}
        {name}
      </span>
    );
  }

  // EPIC / LEGENDARY: solid colour + glow
  if (config.glow) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${sizeClasses[size]} ${className}`}
        style={{
          color: colorHex,
          borderColor: `${colorHex}60`,
          backgroundColor: `${colorHex}15`,
          boxShadow: `0 0 8px ${colorHex}50`,
        }}
        title={config.label}
      >
        {showTier && (
          <span className="opacity-60 uppercase tracking-widest text-[9px]">
            {config.label}
          </span>
        )}
        {name}
      </span>
    );
  }

  // COMMON / UNCOMMON / RARE: solid colour, no effects
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${sizeClasses[size]} ${className}`}
      style={{
        color: colorHex,
        borderColor: `${colorHex}40`,
        backgroundColor: `${colorHex}10`,
      }}
      title={config.label}
    >
      {showTier && (
        <span className="opacity-60 uppercase tracking-widest text-[9px]">
          {config.label}
        </span>
      )}
      {name}
    </span>
  );
}

// ============================================================
// TIER COLOUR PILL — used on shop filter tabs
// ============================================================

export function TierPill({
  tier,
  active,
  onClick,
}: {
  tier: TitleTier;
  active: boolean;
  onClick: () => void;
}) {
  const config = TITLE_TIER_CONFIG[tier];
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1 rounded-full font-medium transition-all border cursor-pointer ${
        active ? "opacity-100 scale-105" : "opacity-50 hover:opacity-75"
      }`}
      style={{
        color: config.defaultColorHex,
        borderColor: `${config.defaultColorHex}50`,
        backgroundColor: active ? `${config.defaultColorHex}20` : "transparent",
      }}
    >
      {config.label}
    </button>
  );
}
