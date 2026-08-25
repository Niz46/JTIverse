import type { Metadata } from "next";
import { contentApi } from "@/lib/api";
import { ContentGrid } from "@/components/content/ContentCard";
import { EmptyState } from "@/components/ui";
import type { PublicContent } from "@anime-platform/types";

export const metadata: Metadata = {
  title: "Anime",
  description: "Browse all anime on JTIverse.",
};

export default async function AnimePage() {
  let contents: PublicContent[] = [];
  try {
    contents = await contentApi.list("ANIME");
  } catch {
    /* empty catalog */
  }

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-8 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-(--color-text)">Anime</h1>
        <p className="text-sm text-(--color-muted)">{contents.length} titles</p>
      </div>

      {contents.length === 0 ? (
        <EmptyState
          icon="🎌"
          title="No anime yet"
          description="Content is being synced. Check back shortly."
        />
      ) : (
        <ContentGrid contents={contents} />
      )}
    </div>
  );
}
