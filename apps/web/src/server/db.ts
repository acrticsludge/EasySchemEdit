import { neon } from '@neondatabase/serverless';
import type { Env } from './env.ts';

export type SqlClient = ReturnType<typeof neon>;

export function getDb(env: Env): SqlClient {
  const url = env.NEON_DATABASE_URL;
  if (!url || typeof url !== 'string' || url.trim() === '') {
    throw new Error('Missing NEON_DATABASE_URL environment variable');
  }
  return neon(url.trim());
}
