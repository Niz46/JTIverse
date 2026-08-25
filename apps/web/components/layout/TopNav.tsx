/**
 * TOP NAV
 * -------
 * Server component for the outer shell (links, logo).
 * TokenBalance and UserButton are client islands nested inside.
 *
 * Structure:
 *   [JTIverse]   [Anime] [Donghua] [Movies]   [💰 balance] [User]
 *
 * Mobile: hamburger collapses the catalog links.
 * Auth state: Clerk's <UserButton /> handles avatar + sign-out.
 */

import Link from "next/link";
import { UserButton, SignInButton, Show } from "@clerk/nextjs";
import { TokenBalance } from "@/components/user/TokenBalance";
import { MobileNav } from "./MobileNav";

const NAV_LINKS = [
  { href: "/anime", label: "Anime" },
  { href: "/donghua", label: "Donghua" },
  { href: "/movies", label: "Movies" },
] as const;

export function TopNav() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-(--color-border) bg-bg/90 backdrop-blur-md">
      <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 md:px-6">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-lg text-(--color-text) hover:text-(--color-accent-hover) transition-colors flex-none"
        >
          <span
            className="text-xl font-black tracking-tight"
            style={{
              background: "linear-gradient(135deg, #6366f1, #818cf8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            JTIverse
          </span>
        </Link>

        {/* Desktop catalog links */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-3 py-1.5 text-sm font-medium text-(--color-text-2) hover:text-(--color-text) hover:bg-(--color-surface-2) rounded-lg transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right side: token balance + auth */}
        <div className="flex items-center gap-3">
          {/* Token balance — client island, only visible when signed in */}
          <Show when="signed-in">
            <TokenBalance />
          </Show>

          {/* Clerk auth — UserButton shows avatar+menu when signed in */}
          <Show when="signed-in">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8",
                },
              }}
              userProfileUrl="/profile"
            />
          </Show>

          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="text-sm font-medium px-4 py-1.5 rounded-lg bg-(--color-accent) text-white hover:bg-(--color-accent-hover) transition-colors cursor-pointer">
                Sign in
              </button>
            </SignInButton>
          </Show>

          {/* Mobile hamburger */}
          <MobileNav links={NAV_LINKS} />
        </div>
      </nav>
    </header>
  );
}
