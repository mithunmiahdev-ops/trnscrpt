import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;
export const pool = new Pool({ connectionString: config.databaseUrl });

export const JOB_STATES = ['queued', 'processing', 'completed', 'failed', 'expired'];

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source_url TEXT NOT NULL,
      platform TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      stage TEXT,
      language TEXT,
      segments JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours'
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON jobs (expires_at);
  `);
}

export async function createJob({ id, sourceUrl, platform }) {
  await pool.query(
    `INSERT INTO jobs (id, source_url, platform, status, stage)
     VALUES ($1, $2, $3, 'queued', 'queued')`,
    [id, sourceUrl, platform]
  );
}

export async function updateJob(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = $${i}`);
    values.push(val);
    i += 1;
  }
  sets.push(`updated_at = now()`);
  values.push(id);
  await pool.query(`UPDATE jobs SET ${sets.join(', ')} WHERE id = $${i}`, values);
}

export async function getJob(id) {
  const { rows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function deleteExpiredJobs() {
  await pool.query(`UPDATE jobs SET status = 'expired' WHERE expires_at < now() AND status != 'expired'`);
}
