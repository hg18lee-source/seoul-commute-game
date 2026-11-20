import { retentionDays } from '../server/app.mjs';
import { prune } from '../server/audit.mjs';
import { makePool,transaction } from '../server/db.mjs';
let pool;
try {
  pool=makePool();
  const count=await transaction(pool,db=>prune(db,retentionDays(process.env.AUDIT_RETENTION_DAYS)));
  console.log('Deleted audit rows:',count);
} catch {console.error('Audit retention failed.');process.exitCode=1;}
finally {await pool?.end();}
