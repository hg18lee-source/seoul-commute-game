import { allow, block, pageNumber, uuid } from './plays.mjs';

export async function audit(db, ctx, result, duration) {
  const calls=ctx.external??[];
  await db.query(
    'INSERT INTO commute_audit(id,at,user_id,action,method,http_status,outcome,reason,duration_ms,play_id,cache_hit,external_calls,external_failures) '+
    'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
    [ctx.id,new Date(ctx.at),ctx.user?.id??null,ctx.action,ctx.method,result.status,result.outcome,result.reason,
      Math.max(0,Math.round(duration)),ctx.playId??null,ctx.cached??null,calls.length,calls.filter(call=>call.result!=='ok').length]);
  for (const [i,call] of calls.entries()) {
    await db.query('INSERT INTO commute_upstream(request_id,call_number,provider,operation,at,duration_ms,http_status,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [ctx.id,i+1,call.provider,call.operation,new Date(call.at),call.duration,call.status,call.result]);
  }
}

const fields='a.id,a.at,a.user_id,u.nickname,a.action,a.method,a.http_status,a.outcome,a.reason,a.duration_ms,'+
  'a.play_id,a.cache_hit,a.external_calls,a.external_failures';
const outcomes=['ALLOW','BLOCK','FAIL'];

export async function dashboard(db,url,actions) {
  const p=url.searchParams, from=p.get('from'), to=p.get('to'), action=p.get('action'),
    outcome=p.get('outcome'), user=p.get('user'), page=pageNumber(url);
  const now=new Date();
  const lastWeek=new Date(now.getTime()-7*86400000);
  const isoDay=/^\d{4}-\d{2}-\d{2}$/;
  if ([from,to].some(day=>day&&(!isoDay.test(day)||!Number.isFinite(Date.parse(day))))
      ||(user&&!uuid(user))||(action&&!actions.includes(action))||(outcome&&!outcomes.includes(outcome))) return block(400,'filter');
  const data=[from ? new Date(from+'T00:00:00+09:00') : lastWeek,
    to ? new Date(Date.parse(to+'T00:00:00+09:00')+86400000) : now];
  if (data[0]>=data[1]) return block(400,'filter');
  let where='a.at >= $1 AND a.at < $2';
  for (const [field,value] of [['user_id',user],['action',action],['outcome',outcome]]) {
    if (value) {data.push(value);where+=' AND a.'+field+'=$'+data.length;}
  }
  const join=' FROM commute_audit a LEFT JOIN commute_users u ON a.user_id=u.id WHERE '+where;
  const {rows:[users]}=await db.query("SELECT count(*)::int AS total FROM commute_users");
  const {rows:[metrics]}=await db.query(
    "SELECT count(*)::int AS requests,count(*) FILTER (WHERE a.outcome='ALLOW')::int AS allowed,"+
    "count(*) FILTER (WHERE a.outcome='BLOCK')::int AS blocked,count(*) FILTER (WHERE a.outcome='FAIL')::int AS failed,"+
    "count(*) FILTER (WHERE a.action='transit')::int AS transit_requests,count(*) FILTER (WHERE a.cache_hit)::int AS cache_hits,"+
    'COALESCE(sum(a.external_calls),0)::int AS external_calls,COALESCE(sum(a.external_failures),0)::int AS external_failures'+join,data);
  const {rows:byAction}=await db.query('SELECT a.action,count(*)::int AS count'+join+' GROUP BY a.action ORDER BY count DESC,a.action',data);
  const {rows:byUser}=await db.query('SELECT a.user_id,u.nickname,count(*)::int AS count'+join+
    ' GROUP BY a.user_id,u.nickname ORDER BY count DESC,a.user_id LIMIT 26 OFFSET $'+(data.length+1),[...data,(page-1)*25]);
  const {rows}=await db.query('SELECT '+fields+join+' ORDER BY a.at DESC,a.id LIMIT 26 OFFSET $'+(data.length+1),[...data,(page-1)*25]);
  return allow({users:users.total,metrics,byAction,byUser:byUser.slice(0,25),rows:rows.slice(0,25),
    page,next:rows.length>25||byUser.length>25,actions},200,'admin_view');
}

export async function detail(db,url) {
  const id=url.searchParams.get('id');
  if (!uuid(id)) return block(400,'request_id');
  const {rows:[request]}=await db.query('SELECT '+fields+
    ' FROM commute_audit a LEFT JOIN commute_users u ON a.user_id=u.id WHERE a.id=$1',[id]);
  if (!request) return block(404,'request_not_found');
  const {rows:external}=await db.query('SELECT call_number,provider,operation,at,duration_ms,http_status,result FROM commute_upstream WHERE request_id=$1 ORDER BY call_number',[id]);
  const {rows:[play]}=request.play_id?await db.query('SELECT id,course,rules,status,started_at,seen_at,invalid_reason FROM commute_plays WHERE id=$1',[request.play_id]):{rows:[]};
  return allow({request,external,play:play??null},200,'admin_detail');
}

export async function prune(db, days) {
  await db.query("UPDATE commute_plays SET status='invalid',invalid_reason='connection_lost' WHERE status='active' AND seen_at<=now()-interval '10 seconds'");
  const {rowCount}=await db.query("DELETE FROM commute_audit WHERE at<now()-$1*interval '1 day'",[days]);
  await db.query("DELETE FROM commute_progress WHERE received_at<now()-$1*interval '1 day'",[days]);
  return rowCount;
}
