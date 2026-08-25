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
    if (!isSignedIn) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
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
