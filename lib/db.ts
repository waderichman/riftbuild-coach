import pg from "pg";

const { Pool } = pg;

type DbPool = InstanceType<typeof Pool>;
const globalForDb = globalThis as unknown as { __rbPool?: DbPool };

function createPool(): DbPool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  return new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
}

export function isDbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDbPool(): DbPool | null {
  if (!isDbEnabled()) return null;
  if (!globalForDb.__rbPool) {
    globalForDb.__rbPool = createPool() as DbPool;
  }
  return globalForDb.__rbPool || null;
}

export async function dbQuery<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = getDbPool();
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function dbHealthCheck(): Promise<boolean> {
  try {
    const rows = await dbQuery<{ ok: number }>("SELECT 1 as ok");
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function acquireJobLock(jobName: string, lockMinutes = 20): Promise<boolean> {
  try {
    await dbQuery(
      `
      INSERT INTO job_locks (job_name, locked_until, updated_at)
      VALUES ($1, NOW() + ($2 || ' minutes')::interval, NOW())
      ON CONFLICT (job_name)
      DO UPDATE SET
        locked_until = CASE
          WHEN job_locks.locked_until <= NOW() THEN NOW() + ($2 || ' minutes')::interval
          ELSE job_locks.locked_until
        END,
        updated_at = NOW();
      `,
      [jobName, String(lockMinutes)]
    );

    const rows = await dbQuery<{ locked: boolean }>(
      "SELECT (locked_until > NOW()) as locked FROM job_locks WHERE job_name = $1",
      [jobName]
    );

    return rows[0]?.locked === true;
  } catch {
    return false;
  }
}

export async function releaseJobLock(jobName: string): Promise<void> {
  try {
    await dbQuery("UPDATE job_locks SET locked_until = NOW(), updated_at = NOW() WHERE job_name = $1", [jobName]);
  } catch {
    // ignore
  }
}
