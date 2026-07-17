declare module "cloudflare:workers" {
  export const env: Record<string, unknown> & { DB?: import("drizzle-orm/d1").AnyD1Database };
}
