import { Injectable, Logger } from "@nestjs/common";
import { ModerationAction } from "@prisma/client";

/**
 * COMMENT MODERATION SERVICE — REAL AI INTEGRATION
 * --------------------------------------------------
 * Calls OpenAI's Moderations endpoint (free, purpose-built for this
 * exact task — no prompt-engineering decision required to get started).
 * Requires OPENAI_API_KEY in your environment.
 *
 * FAILS CLOSED: any error calling the provider (network, bad key,
 * rate limit, malformed response) returns FLAGGED, never APPROVED.
 * A moderation service being down must never silently mean "let
 * everything through unchecked" — see the original heuristic
 * version's docstring for why this matters for this project
 * specifically (comments feed the token economy).
 *
 * TUNING FOR THIS PROJECT'S TONE: OpenAI's default categories will
 * over-flag normal anime-community trash talk ("this arc is
 * dogshit", "bro really thinks he's the aura farming king lol").
 * The category checks below are deliberately narrower than "flag
 * anything scored above 0" — see CATEGORY_THRESHOLDS. Revisit these
 * numbers once you have real comment volume to tune against; they
 * are a reasonable starting point, not a validated final answer.
 */

const OPENAI_MODERATION_URL = "https://api.openai.com/v1/moderations";

// Only these categories can flag a comment on this platform, and each
// needs to clear its own bar — not just "any nonzero score." Anime
// comment sections run sarcastic and competitive by design; a
// generic "flag anything" config would bury real moderation under
// false positives from normal trash-talk.
const CATEGORY_THRESHOLDS: Record<string, number> = {
  harassment: 0.5,
  "harassment/threatening": 0.3,
  hate: 0.5,
  "hate/threatening": 0.3,
  sexual: 0.5,
  "sexual/minors": 0.05, // near-zero tolerance — see child-safety note below
  violence: 0.6,
  "violence/graphic": 0.6,
  "self-harm": 0.3,
  "self-harm/intent": 0.2,
  "self-harm/instructions": 0.2,
};

interface OpenAiModerationResponse {
  results: {
    flagged: boolean;
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
  }[];
}

export interface ModerationResult {
  status: ModerationAction;
  reason: string;
}

@Injectable()
export class CommentModerationService {
  private readonly logger = new Logger(CommentModerationService.name);
  private readonly apiKey = process.env.OPENAI_API_KEY;

  async moderate(body: string): Promise<ModerationResult> {
    const trimmed = body.trim();

    if (trimmed.length === 0) {
      return { status: "REJECTED", reason: "Empty or whitespace-only body" };
    }

    if (!this.apiKey) {
      this.logger.error(
        "OPENAI_API_KEY not set — failing closed. Comments will be held for review until this is configured.",
      );
      return { status: "FLAGGED", reason: "Moderation not configured" };
    }

    try {
      const res = await fetch(OPENAI_MODERATION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          input: trimmed,
          model: "omni-moderation-latest",
        }),
        signal: AbortSignal.timeout(8_000),
      });

      if (!res.ok) {
        this.logger.error(`OpenAI moderation API returned ${res.status}`);
        return {
          status: "FLAGGED",
          reason: "Moderation service error — held for review",
        };
      }

      const json = (await res.json()) as OpenAiModerationResponse;
      const result = json.results[0];

      if (!result) {
        return {
          status: "FLAGGED",
          reason: "Moderation returned no result — held for review",
        };
      }

      const triggeredCategories = Object.entries(CATEGORY_THRESHOLDS)
        .filter(
          ([category, threshold]) =>
            (result.category_scores[category] ?? 0) >= threshold,
        )
        .map(([category]) => category);

      if (triggeredCategories.length > 0) {
        return {
          status: "FLAGGED",
          reason: `Flagged for: ${triggeredCategories.join(", ")}`,
        };
      }

      return { status: "APPROVED", reason: "Passed AI moderation" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Moderation call failed, failing closed: ${message}`);
      return {
        status: "FLAGGED",
        reason: "Moderation check failed — held for review",
      };
    }
  }
}
