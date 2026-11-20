import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';

export function makePool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL_REQUIRED');
  const pool = new pg.Pool({connectionString, max: 4, idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 3500});
  pool.on('error', () => console.error(JSON.stringify({event:'db_pool_error'})));
  if (process.env.VERCEL === '1') attachDatabasePool(pool);
  return pool;
}

export async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN; SET LOCAL statement_timeout = 18000');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
