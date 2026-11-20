import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { makePool, transaction } from '../server/db.mjs';

export async function migrate(pool) {
  const directory=new URL('../migrations/',import.meta.url);
  const names=(await readdir(directory)).filter(name=>/^\d{3}_[a-z_]+\.sql$/.test(name)).sort();
  return transaction(pool,async db=>{
    await db.query('SELECT pg_advisory_xact_lock(624023081)');
    await db.query('CREATE TABLE IF NOT EXISTS commute_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of names) {
      const applied=await db.query('SELECT name FROM commute_migrations WHERE name=$1',[name]);
      if (applied.rowCount) continue;
      await db.query(await readFile(new URL(name,directory),'utf8'));
      await db.query('INSERT INTO commute_migrations(name) VALUES($1)',[name]);
    }
  });
}

if (process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  let pool;
  try {pool=makePool(process.env.DIRECT_DATABASE_URL||process.env.DATABASE_URL);await migrate(pool);console.log('Migration complete');}
  catch {console.error('Migration failed. Check connectivity and migration permissions.');process.exitCode=1;}
  finally {await pool?.end();}
}
