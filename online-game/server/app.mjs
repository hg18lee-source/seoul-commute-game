import { randomUUID, timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { authentication } from './auth.mjs';
import { audit, dashboard, detail, prune } from './audit.mjs';
import { transaction } from './db.mjs';
import { advance, allow, block, fail, ranking, records, start, uuid } from './plays.mjs';
import { courses } from './rules.mjs';
import { transit } from './transit.mjs';
import { adminPage } from './admin-page.mjs';
import { completionOverview, completionEvidence, completionRuns, logCompletionFailure,
  newCompletionRun, refreshCompletions, seoulDate } from './daily-completions.mjs';

const routes={
  session:['GET','public'],signup:['POST','public'],login:['POST','public'],'admin-login':['POST','public'],
  logout:['POST','member'],courses:['GET','member'],records:['GET','player'],ranking:['GET','player'],
  'play-start':['POST','player'],'play-progress':['POST','player'],'play-finish':['POST','player'],
  'play-cancel':['POST','player'],transit:['GET','member'],
  'admin-page':['GET','admin'],'admin-audit':['GET','admin'],'admin-detail':['GET','admin'],
  'admin-completions':['GET','admin'],'admin-completion-evidence':['GET','admin'],
  'admin-completion-runs':['GET','admin'],'admin-completion-recalculate':['POST','admin'],
  'audit-prune':['GET','cron'],
};
const actions=[...Object.keys(routes),'unknown'];
class Rejected extends Error {
  constructor(status,reason) {super(reason);this.status=status;}
}

async function jsonBody(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json') throw new Rejected(415,'json_required');
  const stream=request.body?.getReader();
  if (!stream) throw new Rejected(400,'json_body');
  let length=0;
  const chunks=[];
  for (;;) {
    const {done,value}=await stream.read();
    if (done) break;
    length+=value.byteLength;
    if (length>65536) {
      await stream.cancel();
      throw new Rejected(413,'body_too_large');
    }
    chunks.push(value);
  }
  try {
    const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed||typeof parsed!=='object'||Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {throw new Rejected(400,'json_body');}
}

function cronAuthorized(header, secret) {
  if (typeof secret!=='string'||secret.length<16||typeof header!=='string') return false;
  const a=Buffer.from(header), b=Buffer.from('Bearer '+secret);
  return a.length===b.length&&timingSafeEqual(a,b);
}

export function retentionDays(value) {
  const days=Number(value??30);
  if (!Number.isInteger(days)||days<1||days>365) throw new Error('AUDIT_RETENTION_DAYS_INVALID');
  return days;
}

export function configFrom(env=process.env) {
  return {pepper:env.PASSWORD_PEPPER,secure:env.VERCEL==='1'||env.COOKIE_SECURE==='1',
    cronSecret:env.CRON_SECRET,days:retentionDays(env.AUDIT_RETENTION_DAYS),
    seoulKey:env.SEOUL_OPENAPI_KEY,busKey:env.DATA_GO_KR_SERVICE_KEY};
}

function evidenceDate(url, now) {
  const date=url.searchParams.get('date');
  if (date===null) return seoulDate(now);
  const at=new Date(date+'T00:00:00+09:00');
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(at.getTime())||seoulDate(at)!==date)
    throw new Rejected(400,'aggregate_date');
  return date;
}

function evidenceCursor(url) {
  const before=url.searchParams.get('before');
  if (before===null) return;
  const [at,playId,extra]=before.split(',');
  const ms=new Date(at);
  if (extra!==undefined||!uuid(playId)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(at)
    ||!Number.isFinite(ms.getTime())||ms.toISOString().slice(0,23)!==at.slice(0,23))
    throw new Rejected(400,'aggregate_cursor');
  return {at,playId};
}

function runCursor(url) {
  const before=url.searchParams.get('before');
  if (before!==null&&(!/^[1-9]\d{0,18}$/.test(before)||BigInt(before)>9223372036854775807n))
    throw new Rejected(400,'aggregate_cursor');
  return before;
}

export function app(pool,config,{fetcher=fetch,clock=Date.now,scheduleCompletion=()=>{}}={}) {
  const auth=authentication(config);
  async function refreshSavedRecord(run) {
    try {
      await transaction(pool,db=>refreshCompletions(db,run,clock));
    } catch {
      try {await transaction(pool,db=>logCompletionFailure(db,run,new Date(clock())));}
      catch {
        console.error(JSON.stringify({event:'aggregate_log_failed',runId:run.id,requestId:run.requestId,
          playId:run.playId,reason:'aggregate_error'}));
      }
    }
  }
  async function route(db, ctx, request, url) {
    const definition=routes[ctx.action];
    const mutating=request.method==='POST';
    const session=await auth.find(db,request.headers,mutating&&
      (ctx.action.startsWith('play-')||ctx.action==='logout'));
    ctx.user=ctx.verifiedUser=session.user;
    ctx.tokenHash=session.tokenHash;
    if (!definition) return block(404,'unknown_api');
    const [method,permission]=definition;
    if (method!==request.method) return {...block(405,'method'),allowMethod:method};
    if (permission==='cron') {
      if (!cronAuthorized(request.headers.get('authorization'),config.cronSecret)) return block(403,'cron_denied');
      return allow({pruned:await prune(db,config.days)},200,'retention');
    }
    if (permission!=='public'&&!session.user) {
      const denied=block(401,session.invalid?'session_invalid':'login_required');
      if (ctx.action==='admin-page') denied.html='<!doctype html><meta charset="utf-8"><title>관리자 인증</title><p>관리자 로그인이 필요합니다. <a href="/?admin=1">관리자 로그인</a>';
      return denied;
    }
    if (['admin','player'].includes(permission)&&permission!==session.user.role) return block(403,'role_denied');
    if (mutating) {
      if (request.headers.get('origin')!==url.origin) return block(403,'origin');
      if (session.user&&permission!=='public'&&!auth.validCsrf(session,request.headers.get('x-csrf-token'))) return block(403,'csrf');
    }
    const body=mutating?await jsonBody(request):null;
    switch (ctx.action) {
      case 'session':
        return session.invalid?{...block(401,'session_invalid'),cookie:auth.clear}:allow({user:session.view??null});
      case 'signup': {
        const user=await auth.signup(db,body);
        if (user===null) return block(400,'account_input');
        if (user===false) return block(409,'duplicate_id');
        ctx.user=user;
        const issued=await auth.issue(db,user);
        return {...allow(issued.body,201,'signup_ok'),cookie:issued.cookie};
      }
      case 'login':
      case 'admin-login': {
        const user=await auth.login(db,body,ctx.action==='login'?'player':'admin');
        if (!user) return fail(401,'credentials');
        ctx.user=ctx.verifiedUser=user;
        const issued=await auth.issue(db,user);
        return {...allow(issued.body,200,'login_ok'),cookie:issued.cookie};
      }
      case 'logout':
        await db.query('UPDATE commute_sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1',[ctx.tokenHash]);
        await db.query("UPDATE commute_plays SET status='cancelled',invalid_reason='logout' WHERE session_hash=$1 AND status='active'",[ctx.tokenHash]);
        return {...allow({},200,'logout'),cookie:auth.clear};
      case 'courses':return allow({courses});
      case 'records':return records(db,ctx,url);
      case 'ranking':return ranking(db,ctx,url);
      case 'play-start':return start(db,ctx,body,clock());
      case 'play-progress':
      case 'play-finish':
      case 'play-cancel':return advance(db,ctx,body,ctx.action,clock());
      case 'transit':return transit(db,ctx,config,fetcher);
      case 'admin-page':return {...allow({},200,'admin_page'),html:adminPage};
      case 'admin-audit':return dashboard(db,url,actions);
      case 'admin-detail':return detail(db,url);
      case 'admin-completions':return allow(await completionOverview(db,seoulDate(ctx.at)));
      case 'admin-completion-evidence':return allow(await completionEvidence(db,evidenceDate(url,ctx.at),evidenceCursor(url)));
      case 'admin-completion-runs':return allow(await completionRuns(db,evidenceDate(url,ctx.at),runCursor(url)));
      case 'admin-completion-recalculate': {
        const run=newCompletionRun({cause:'admin_recalculate',requestId:ctx.id,date:seoulDate(ctx.at),start:new Date(clock())});
        const result=await refreshCompletions(db,run,clock);
        return result.status==='failed'
          ? {...fail(503,'aggregate_error'),body:{error:'aggregate_error',...result}}
          : allow(result,200,'aggregate_'+result.status);
      }
      default:return block(404,'unknown_api');
    }
  }

  return async request=>{
    const url=new URL(request.url);
    const operation=url.pathname==='/administrator'?'admin-page':
      url.pathname==='/api'&&url.searchParams.getAll('__operation').length===1?url.searchParams.get('__operation'):
      url.pathname.startsWith('/api/')?url.pathname.slice(5):'';
    if (operation==='tutorial-access') {
      const headers={'Cache-Control':'private, no-store'};
      if (!['GET','HEAD'].includes(request.method))
        return new Response(null,{status:405,headers:{...headers,Allow:'GET, HEAD'}});
      try {
        const {user}=await auth.find(pool,request.headers,false);
        return new Response(null,{status:user?403:204,headers});
      } catch {
        return new Response(null,{status:503,headers});
      }
    }
    const ctx={id:randomUUID(),at:clock(),action:Object.hasOwn(routes,operation)?operation:'unknown',
      method:/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(request.method)?request.method:'OTHER'};
    const started=performance.now();
    let result;
    try {
      result=await transaction(pool,async db=>{
        let output;
        try {output=await route(db,ctx,request,url);}
        catch (error) {
          if (!(error instanceof Rejected)) throw error;
          output=block(error.status,error.message);
        }
        await audit(db,ctx,output,performance.now()-started);
        return output;
      });
    } catch {
      result=fail(503,'service_error');
      ctx.user=ctx.verifiedUser;
      try {await transaction(pool,db=>audit(db,ctx,result,performance.now()-started));}
      catch {console.error(JSON.stringify({event:'audit_write_failed',requestId:ctx.id,action:ctx.action,reason:'service_error'}));}
    }
    if (result.savedRecord) {
      const {playId,finishedAt}=result.savedRecord;
      const run=newCompletionRun({cause:'record_saved',requestId:ctx.id,playId,date:seoulDate(finishedAt),start:new Date(clock())});
      const work=refreshSavedRecord(run);
      try {await scheduleCompletion(work);}
      catch {console.error(JSON.stringify({event:'aggregate_schedule_failed',runId:run.id,requestId:ctx.id,playId,reason:'aggregate_error'}));}
    }
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','X-Request-Id':ctx.id};
    if (result.cookie) headers['Set-Cookie']=result.cookie;
    if (result.allowMethod) headers.Allow=result.allowMethod;
    if (result.html) {
      headers['Content-Type']='text/html; charset=utf-8';
      headers['Content-Security-Policy']="default-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'";
      return new Response(result.html,{status:result.status,headers});
    }
    if (request.method==='HEAD') return new Response(null,{status:result.status,headers});
    return Response.json(result.body,{status:result.status,headers});
  };
}
