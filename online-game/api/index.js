import { randomUUID } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { app, configFrom } from '../server/app.mjs';
import { makePool } from '../server/db.mjs';

let handle;
export default {
  async fetch(request) {
    try {
      handle ??= app(makePool(),configFrom(),{scheduleCompletion:work=>{waitUntil(work);}});
    } catch {
      const requestId=randomUUID();
      console.error(JSON.stringify({event:'audit_write_failed',requestId,reason:'server_configuration'}));
      return Response.json({error:'service_error'},{status:503,headers:{'Cache-Control':'no-store','X-Request-Id':requestId}});
    }
    return handle(request);
  },
};
