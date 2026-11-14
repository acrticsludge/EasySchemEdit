/// <reference types="@cloudflare/workers-types" />

export interface Env {
  ASSETS: Fetcher;
  PROJECTS_BUCKET: R2Bucket;
  NEON_DATABASE_URL: string;
  SESSION_SECRET: string;
}
