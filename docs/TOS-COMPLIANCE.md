# Terms-of-Service & Legal Compliance Tracker

This document tracks the specific compliance gates this project depends on.
Update the status table whenever something changes — this is the single
place engineering, not just legal/business, checks before flipping a
feature flag live.

## 1. TMDB Commercial License

**Status: 🔴 NOT CONFIRMED — DO NOT ENABLE `TMDB_COMMERCIAL_AGREEMENT_CONFIRMED`**

- Free TMDB API tier is licensed for **non-commercial use only**.
- This project monetizes via Google AdSense + an in-app token economy,
  which makes it a commercial use of TMDB's data.
- TMDB's API Terms of Use state commercial use requires a **separate
  written agreement**, negotiated directly with TMDB (their "API for
  Business" offering).
- **Action item**: contact TMDB's business team before enabling movie
  ingestion in any environment that serves ads or is publicly monetized.
- Log correspondence and confirmed terms here once received:
  - Date contacted: _______
  - Response received: _______
  - Terms confirmed (attach or link agreement): _______

**Until this is confirmed**, `apps/api/src/modules/content/tmdb/tmdb.service.ts`
hard-blocks syncing via the `TMDB_COMMERCIAL_AGREEMENT_CONFIRMED` boolean.
This is intentional friction — do not remove the gate to "just test it,"
since a staging environment with ads-enabled code paths still counts as
commercial use in practice.

**Fallback while unconfirmed**: OMDb API (free tier, lower rate limits,
simpler data) can serve as a stopgap for movie metadata that doesn't
carry the same commercial-agreement requirement — verify OMDb's own
terms before relying on this long-term, they were not the primary
research focus and should be re-checked.

## 2. Video Hosting — Legal Boundary

**This project does not host, embed, proxy, or link to unlicensed video
files.** Content pages surface metadata (via Jikan/AniList/TMDB) and, where
available, an `officialWatchUrl` pointing to a legitimate licensed
destination (official streaming platform, official YouTube upload, etc.).

Watch Rooms sync **playback state**, not video streams — members are
expected to be watching via their own legal access to the content
(analogous to Teleparty's model for Netflix). Rooms must never be
implemented as a video relay/proxy. If a future contributor proposes
adding actual video hosting or embedding of unlicensed streams, that is
a full-stop escalation to product/legal before any code is written —
see the HiAnime/AniWave case studies below for why.

**Why this matters concretely**: both HiAnime (formerly Zoro.to/Aniwatch)
and AniWave (formerly 9anime) were shut down following enforcement action
from the Alliance for Creativity and Entertainment, with HiAnime added to
the USTR's notorious-piracy-markets list days before its shutdown. Their
technical/UI quality is irrelevant to that outcome — the video-hosting
model itself is what triggered it. This project's entire competitive
differentiation (Titles/tokens/rooms/community) depends on the platform
existing long enough for users to invest time in it; that requires never
adopting their content-sourcing model.

## 3. Google AdSense

**Status: 🟡 Planned, not yet applied for**

- AdSense Publisher Policies prohibit ad placement alongside unauthorized
  copyrighted video — this is the same boundary as Section 2 above, not
  a separate risk to manage.
- Do not apply for an AdSense account until the site has real content
  and reasonable organic traffic; day-one placeholder sites are commonly
  rejected or delayed.
- Ad script must be lazy-loaded / injected async — see
  `apps/web/components/ads/` — to protect Core Web Vitals and the
  "fast, streamed experience" product requirement.
- Expect a meaningful share of this audience to run ad blockers; do not
  size token-economy costs against optimistic RPM assumptions before
  real revenue data exists.

## 4. Token Economy — Regulatory Guardrail

**Tokens must remain non-transferable and non-redeemable for real
currency, and must never be purchasable with real money.** They are
earned only through in-site engagement (tasks) and spent only on
cosmetic Titles. This keeps the mechanic squarely in "loyalty/cosmetic
points" territory rather than drifting toward something resembling
a monetary instrument or gambling-adjacent mechanic, which would carry
a materially different (and heavier) compliance burden.

If a future feature proposes:

- allowing tokens to be bought with real money,
- allowing tokens to be transferred user-to-user,
- allowing tokens to be cashed out,

any of these is a scope change requiring a fresh compliance review
before implementation, not an incremental addition to the existing system.
