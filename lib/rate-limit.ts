// Best-effort in-memory limiter for edge routes. Serverless instances reset it,
// so it damps bursts and scripted abuse rather than promising a hard quota;
// that is the right trade for free tools with no external state.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function allowRequest(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets) if (bucket.resetAt < now) buckets.delete(bucketKey);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export function clientKey(headers: Headers) {
  // Prefer Vercel's own client-IP header (platform-set, not client-spoofable),
  // then x-real-ip, then the first forwarded hop.
  return headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")
    || headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}
