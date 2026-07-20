import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewClient } from "./review-client";

// Private operator page reached from the review email — keep it out of search.
export const metadata: Metadata = {
  title: "Review Watch Together access",
  robots: { index: false, follow: false },
};

export default function ReviewPage() {
  return (
    <Suspense fallback={<section className="page-frame" style={{ padding: "60px 18px" }} />}>
      <ReviewClient />
    </Suspense>
  );
}
