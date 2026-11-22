import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { app } from '../server/app.mjs';
import { digest, passwords } from '../server/auth.mjs';
import { makePool } from '../server/db.mjs';
import { initialState } from '../server/rules.mjs';
import { migrate } from '../scripts/migrate.mjs';
import { journey } from './journey.mjs';

const uri=process.env.TEST_DATABASE_URL;
if (!uri||!new URL(uri).pathname.startsWith('/commute_test_')) {
  throw new Error('Set TEST_DATABASE_URL to an isolated empty database named commute_test_*');
}
const pool=makePool(uri), pepper=process.env.PASSWORD_PEPPER??randomBytes(32).toString('hex');
const origin='https://commute.example.test';
const routes={rail:'gongdeok-chungjeongno-office-walk'};
const testPin='0123';
const adminPassword='browser-fixture-only-admin-91831';
let now, fetchCount=0, breakUpstream=false;
const beginning=()=>{now=Date.now()-3600000;return now;};
const setClock=value=>{now=value;};
beginning();
const config={pepper,secure:true,seoulKey:'mock_seoul_key_dedicated',busKey:'mock_bus_key_dedicated',days:30,
  cronSecret:randomBytes(24).toString('hex')};
const handler=app(pool,config,{clock:()=>now,fetcher:async url=>{
  fetchCount++;
  assert.equal(typeof url,'string');
  if (breakUpstream) return new Response('upstream failure',{status:503});
  if (url.includes('subwayStationMaster')) return Response.json({
    subwayStationMaster:{RESULT:{CODE:'INFO-000'},list_total_count:1,row:[{BLDN_NM:'공덕',ROUTE:'5'}]}});
  const xml=url.includes('getBusRouteList')
    ? '<itemList><busRouteNm>7016</busRouteNm><busRouteId>123</busRouteId><stStationNm>공덕</stStationNm><edStationNm>시청</edStationNm></itemList>'
    : '<itemList><seq>1</seq><stationNm>공덕</stationNm><arsId>1234</arsId></itemList>';
  return new Response('<response><headerCd>0</headerCd>'+xml+'</response>');
}});

function browser(initial) {
  let cookie=initial?.cookie, csrf=initial?.csrf;
  const call=async (path,data,options={})=>{
    const headers=new Headers(options.headers);
    if (cookie&&!options.anonymous) headers.set('cookie',cookie);
    if (data!==undefined) {
      headers.set('Content-Type','application/json');
      if (options.origin!==false) headers.set('Origin',options.origin??origin);
      if (csrf&&options.csrf!==false) headers.set('x-csrf-token',csrf);
    }
    const url=origin+(path==='/administrator'?path:'/api/'+path);
    const response=await handler(new Request(url,{method:data===undefined?'GET':'POST',headers,
      body:data===undefined?undefined:JSON.stringify(data)}));
    const body=response.headers.get('content-type')?.includes('json')?await response.json():await response.text();
    const issued=response.headers.get('set-cookie');
    if (issued) cookie=issued.split(';')[0];
    if (body.user?.csrf) csrf=body.user.csrf;
    return {status:response.status,body,issued,id:response.headers.get('x-request-id')};
  };
  call.cookies=()=>({cookie,csrf});
  return call;
}

let alpha,beta,admin;
before(async()=>{
  const {rows:[existing]}=await pool.query("SELECT to_regclass('public.commute_users') AS users");
  assert.equal(existing.users,null,'use an empty isolated database');
  await migrate(pool);
  await migrate(pool);
});
after(()=>pool.end());

test('account rules, case-folding uniqueness, concurrent signup, and Argon2id',async()=>{
  alpha=browser();
  const signup=await alpha('signup',{nickname:'첫출근',password:testPin,role:'admin'});
  assert.equal(signup.status,201);
  assert.equal(signup.body.user.role,'player');
  assert.match(signup.issued, /^__Host-commute=.*; Path=\/; HttpOnly; SameSite=Lax; Secure$/);
  const {rows:[stored]}=await pool.query('SELECT password_hash FROM commute_users WHERE id=$1',[signup.body.user.id]);
  assert.match(stored.password_hash,/^\$argon2id\$/);
  assert.notEqual(stored.password_hash,testPin);
  for (const nickname of ['공 백','a123','닉!','ㄱ','A'.repeat(11),'Team\n','!']) {
    assert.equal((await browser()('signup',{nickname,password:testPin})).status,400);
  }
  for (const password of [123,'012','01234','٠١٢٣','0123\n']) {
    assert.equal((await browser()('signup',{nickname:'Invalid',password})).status,400);
  }
  beta=browser();
  const race=await Promise.all([
    beta('signup',{nickname:'Office',password:testPin}),
    browser()('signup',{nickname:'OFFICE',password:testPin}),
  ]);
  assert.deepEqual(race.map(x=>x.status).sort(),[201,409]);
  assert.equal((await beta('login',{nickname:'office',password:testPin})).status,200);
  assert.equal((await browser()('signup',{nickname:'첫출근',password:testPin})).status,409);
});

test('login error parity, cookies, same-origin requests, and player/admin isolation',async()=>{
  const a=await browser()('login',{nickname:'Office',password:'9999'});
  const b=await browser()('login',{nickname:'Unknown',password:'9999'});
  assert.deepEqual([a.status,a.body,a.issued],[401,b.body,null]);
  assert.equal(b.status,401);
  assert.equal((await browser()('login',{nickname:'Office',password:testPin},{origin:'https://elsewhere.test'})).status,403);
  assert.equal((await browser()('login',{nickname:'Office',password:testPin},{origin:false})).status,403);
  for (const action of ['play-start','play-progress','play-finish']) {
    assert.equal((await browser()(action,{})).status,401);
  }
  assert.equal((await browser()('records')).status,401);
  assert.equal((await browser()('transit')).status,401);
  assert.equal((await alpha('play-start',{course:routes.rail},{csrf:false})).status,403);
  assert.equal((await alpha('admin-audit')).status,403);
  assert.equal((await alpha('admin-detail')).status,403);
  assert.equal((await alpha('/administrator')).status,403);
  assert.equal((await browser()('/administrator')).status,401);
  await pool.query("INSERT INTO commute_users(id,nickname,login_id,password_hash,role) VALUES ($1,'운영자','운영자',$2,'admin')",
    [randomUUID(),await passwords(pepper).create(adminPassword)]);
  assert.equal((await browser()('login',{nickname:'운영자',password:testPin})).status,401);
  admin=browser();
  assert.equal((await admin('admin-login',{nickname:'운영자',password:adminPassword})).status,200);
  assert.match((await admin('/administrator')).body,/요청 이력/);
  assert.equal((await admin('play-start',{course:routes.rail})).status,403);
});

test('logout, session expiry, malformed token and concurrent session handling',async()=>{
  const temporary=browser();
  assert.equal((await temporary('login',{nickname:'Office',password:testPin})).status,200);
  const retained=browser(temporary.cookies());
  assert.equal((await temporary('logout',{})).status,200);
  assert.equal((await retained('records')).status,401);
  const expired=browser();
  await expired('login',{nickname:'Office',password:testPin});
  const token=expired.cookies().cookie.split('=')[1];
  await pool.query("UPDATE commute_sessions SET expires_at=now()-interval '1 minute' WHERE token_hash=$1",[digest(token)]);
  assert.equal((await expired('records')).status,401);
  assert.equal((await browser({cookie:'__Host-commute='+randomBytes(32).toString('base64url')})('records')).status,401);
  assert.equal((await beta('records')).status,200);
});

test('wrong owner, wrong session, teleports, paused movement, timeouts, and cancelled plays',async()=>{
  const startTime=beginning();
  const own=await alpha('play-start',{course:routes.rail});
  assert.equal(own.status,201);
  const p=initialState().point;
  const update=(id,seq,wall,after=p,kind='sample')=>({id,seq,wall,events:[{kind,wall,after,password:'not-a-stored-field'}]});
  assert.equal((await beta('play-finish',update(own.body.id,1,0))).status,404);
  const second=browser();
  await second('login',{nickname:'첫출근',password:testPin});
  assert.equal((await second('play-progress',update(own.body.id,1,0))).status,404);
  assert.equal((await alpha('play-progress',update(own.body.id,1,0))).status,200);
  const {rows:[sanitized]}=await pool.query('SELECT events FROM commute_progress WHERE play_id=$1',[own.body.id]);
  assert.equal(Object.hasOwn(sanitized.events[0],'password'),false);
  now=startTime+1000;
  const impossible=await alpha('play-progress',update(own.body.id,2,1000,{...p,t:1,z:-30}));
  assert.deepEqual([impossible.status,impossible.body.error],[422,'movement_or_pause']);
  assert.equal((await alpha('play-finish',update(own.body.id,2,1000))).status,409);
  const cancelled=await alpha('play-start',{course:routes.rail});
  assert.equal((await alpha('play-cancel',{id:cancelled.body.id})).status,200);
  assert.equal((await alpha('play-finish',update(cancelled.body.id,1,0))).status,409);
  const expired=await alpha('play-start',{course:routes.rail});
  now+=10000;
  assert.equal((await alpha('play-progress',update(expired.body.id,1,10000))).body.error,'connection_lost');
  const paused=await alpha('play-start',{course:routes.rail});
  assert.equal((await alpha('play-progress',update(paused.body.id,1,0,p,'pause'))).status,200);
  assert.equal((await alpha('play-progress',update(paused.body.id,2,0,{...p,x:1}))).status,422);
  const portal=await alpha('play-start',{course:routes.rail});
  assert.equal((await alpha('play-finish',update(portal.body.id,1,0))).body.error,'portal_required');
  assert.equal((await alpha('records')).body.rows.length,0);
});

test('validated fixed completion journey, tied ranks, retry, and durable own history',async()=>{
  await journey(alpha,setClock,beginning(),routes.rail,{collisions:true,cancelAfterCollisions:true});
  const first=await journey(alpha,setClock,beginning(),routes.rail,{pause:true});
  assert.equal(first.result.body.best,null);
  const duplicate=await alpha('play-finish',{id:first.id,seq:first.seq,wall:first.wall,events:[]});
  assert.deepEqual([duplicate.status,duplicate.body.error],[409,'play_closed']);
  await journey(beta,setClock,beginning(),routes.rail);
  const second=await journey(alpha,setClock,beginning(),routes.rail,{secondRecord:true});
  assert.equal(second.result.body.best,first.result.body.tenths);
  const rail=(await alpha('ranking?course='+routes.rail)).body.rows;
  assert.deepEqual(rail.map(row=>row.rank),[1,1]);
  assert.equal(rail.filter(row=>row.mine).length,1);
  const anotherBrowser=browser();
  await anotherBrowser('login',{nickname:'첫출근',password:testPin});
  const own=(await anotherBrowser('records?user='+((await beta('session')).body.user.id))).body.rows;
  assert.equal(own.length,2);
  assert.ok(own.every(row=>row.course===routes.rail));
  const afterRestart=app(pool,config);
  const reloaded=await afterRestart(new Request(origin+'/api/records',{headers:{cookie:anotherBrowser.cookies().cookie}}));
  assert.equal((await reloaded.json()).rows.length,2);
});

test('logged API results, cross-request cache, external calls and sanitized admin detail',async()=>{
  beginning();
  const calls=await Promise.all([alpha('transit'),beta('transit')]);
  assert.equal(fetchCount,3);
  assert.deepEqual(calls.map(call=>call.body.cached).sort(),[false,true]);
  const miss=calls.find(call=>!call.body.cached), hit=calls.find(call=>call.body.cached);
  await pool.query("UPDATE commute_transit_cache SET expires_at=now()-interval '1 second'");
  breakUpstream=true;
  const failure=await alpha('transit');
  assert.equal(failure.status,502);
  assert.equal(fetchCount,5);
  assert.equal((await beta('transit')).body.cached,true);
  for (const [entry,outcome,total,failed] of [[miss,'ALLOW',3,0],[hit,'ALLOW',0,0],[failure,'FAIL',2,2]]) {
    const detail=await admin('admin-detail?id='+entry.id);
    assert.equal(detail.status,200);
    assert.equal(detail.body.request.outcome,outcome);
    assert.equal(detail.body.request.external_calls,total);
    assert.equal(detail.body.request.external_failures,failed);
    assert.equal(detail.body.external.length,total);
    for (const secret of [config.seoulKey,config.busKey,alpha.cookies().cookie,uri]) {
      assert.equal(JSON.stringify(detail.body).includes(secret),false);
    }
  }
  const dashboard=await admin('admin-audit');
  assert.equal(dashboard.status,200);
  assert.ok(dashboard.body.metrics.allowed>0&&dashboard.body.metrics.blocked>0&&dashboard.body.metrics.failed>0);
  assert.equal(dashboard.body.metrics.transit_requests,5);
  assert.equal(dashboard.body.metrics.cache_hits,2);
  assert.equal(dashboard.body.metrics.external_calls,5);
  assert.equal((await admin('admin-audit?action=login&outcome=FAIL')).body.rows.every(row=>row.reason==='credentials'),true);
  assert.ok((await admin('admin-audit?page=2')).body.rows.length);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM commute_audit WHERE id=$1',[miss.id])).rows[0].count,1);
  assert.equal((await admin('audit-prune')).status,403);
  assert.equal((await admin('audit-prune',undefined,{headers:{authorization:'Bearer '+config.cronSecret}})).status,200);
});

test('Vercel rewrite dispatch and database outage keep error metadata safe',async()=>{
  const route=await handler(new Request(origin+'/api?__operation=session'));
  assert.equal(route.status,200);
  assert.deepEqual(await route.json(),{user:null});
  const bad=await handler(new Request(origin+'/api?__operation=session&__operation=admin-audit'));
  assert.equal(bad.status,404);
  const errorPayload='synthetic-connection-message-should-not-be-reported';
  const disconnected={connect:async()=>{throw new Error(errorPayload);}};
  const log=[], original=console.error;
  try {
    console.error=(message)=>log.push(JSON.parse(message));
    const response=await app(disconnected,config)(new Request(origin+'/api/session'));
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'service_error'});
    assert.deepEqual(log,[{event:'audit_write_failed',requestId:response.headers.get('x-request-id'),action:'session',
      reason:'service_error'}]);
    assert.equal(JSON.stringify(log).includes(errorPayload),false);
  } finally {console.error=original;}
});
