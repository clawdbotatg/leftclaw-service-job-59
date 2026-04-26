import { Suspense } from "react";
import GameView from "./GameView";

// Server wrapper so we can export `generateStaticParams` for static export.
// The actual UI lives in the "use client" GameView component — gameId is read
// from the URL via `useParams()` at runtime.
// For static export: pre-render HTML shells for a range of game IDs so the
// IPFS gateway can serve them by URL. Each shell is the same client component;
// the actual gameId is read at runtime via `useParams()`. Bump the upper bound
// when a deploy approaches the limit.
export function generateStaticParams() {
  const params: { id: string }[] = [{ id: "placeholder" }];
  for (let i = 0; i <= 1000; i++) params.push({ id: i.toString() });
  return params;
}

export const dynamicParams = false;

const Page = () => (
  <Suspense
    fallback={
      <div className="flex items-center justify-center grow p-8">
        <span className="loading loading-spinner" />
      </div>
    }
  >
    <GameView />
  </Suspense>
);

export default Page;
