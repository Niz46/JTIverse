"use client";

/**
 * TOKEN BALANCE DISPLAY
 * ---------------------
 * Client component — reads from /users/me on mount.
 * Used in TopNav next to the user avatar. Shows 💰 {balance}.
 * Skeleton while loading, nothing if unauthenticated.
 */

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { usersApi } from "@/lib/api";
import { Skeleton } from "@/components/ui";

export function TokenBalance() {
  const { getToken, isSignedIn } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Nothing to fetch while signed out — and render() already returns null
    // in that case below, so there's no state to reset here.
    if (!isSignedIn) {
      return;
    }

    let cancelled = false;
    (async () => {
      // Re-arm the skeleton for this fetch cycle. Needed because `loading`
      // only ever starts `true` on mount — without this, re-running the
      // effect (e.g. a sign-out/sign-in) would leave the *previous*
      // balance on screen while the new one is still in flight.
      setLoading(true);
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const me = await usersApi.getMe(token);
        if (!cancelled) setBalance(me.tokenBalance);
      } catch {
        // silent — nav shouldn't crash over a balance fetch failure
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  if (!isSignedIn) return null;
  if (loading) return <Skeleton className="w-16 h-5 rounded-full" />;
  if (balance === null) return null;

  return (
    <span className="flex items-center gap-1.5 text-sm font-semibold text-(--color-gold) bg-(--color-gold-muted) border border-(--color-gold)/20 px-2.5 py-1 rounded-full">
      💰 {balance.toLocaleString()}
    </span>
  );
}
