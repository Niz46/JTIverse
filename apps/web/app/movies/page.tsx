import type { Metadata } from "next";
import { contentApi } from "@/lib/api";
import { ContentGrid } from "@/components/content/ContentCard";
import { EmptyState } from "@/components/ui";
import type { PublicContent } from "@anime-platform/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Movies",
  description: "Browse anime and donghua movies on JTIverse.",
};

export default async function MoviesPage() {
  let contents: PublicContent[] = [];
  try {
    contents = await contentApi.list("MOVIE");
  } catch (err) {
    console.error("Failed to load movie content:", err);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-8 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-(--color-text)">Movies</h1>
        <p className="text-sm text-(--color-muted)">{contents.length} titles</p>
      </div>

      {contents.length === 0 ? (
        <EmptyState
          icon="🎬"
          title="No movies yet"
          description="Content is being synced. Check back shortly."
        />
      ) : (
        <ContentGrid contents={contents} />
      )}
    </div>
  );
}
