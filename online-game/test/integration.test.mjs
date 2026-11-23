import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { app } from '../server/app.mjs';
import { digest, passwords } from '../server/auth.mjs';
import { makePool } from '../server/db.mjs';
import { initialState, officialRules, previousRules } from '../server/rules.mjs';
import { BUS_COURSE, RIGHT_EXIT_RULES } from '../dist/journey.js';
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
const handler=app(pool,config,{clock:()=>now,scheduleCompletion:work=>work,fetcher:async url=>{
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

function browser(initial, handle=handler) {
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
    const response=await handle(new Request(url,{method:data===undefined?'GET':'POST',headers,
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
  for (const nickname of ['','공 백','a123','닉!','ㄱ','A'.repeat(11),'Team\n','!']) {
    assert.equal((await browser()('signup',{nickname,password:testPin})).status,400);
  }
  for (const password of [123,'','012','01234','0A23','٠١٢٣','0123\n']) {
    assert.equal((await browser()('signup',{nickname:'Invalid',password})).status,400);
  }
  const maxLength=browser();
  assert.equal((await maxLength('signup',{nickname:'Abcdefghij',password:testPin})).status,201);
  assert.equal((await maxLength('login',{nickname:'ABCDEFGHIJ',password:testPin})).status,200);
  beta=browser();
  const race=await Promise.all([
    beta('signup',{nickname:'Office',password:testPin}),
    browser()('signup',{nickname:'OFFICE',password:testPin}),
  ]);
  assert.deepEqual(race.map(x=>x.status).sort(),[201,409]);
  assert.equal((await beta('login',{nickname:'office',password:testPin})).status,200);
  assert.equal((await browser()('signup',{nickname:'첫출근',password:testPin})).status,409);
});

test('tutorial session check never creates a play, record or audit entry',async()=>{
  const counts=async()=>(await pool.query(
    'SELECT (SELECT count(*) FROM commute_plays) AS plays, '+
    '(SELECT count(*) FROM commute_records) AS records, '+
    '(SELECT count(*) FROM commute_audit) AS audit'
  )).rows[0];
  const before=await counts();
  assert.equal((await browser()('tutorial-access')).status,204);
  assert.equal((await alpha('tutorial-access')).status,403);
  assert.equal((await alpha('tutorial-access',{})).status,405);
  assert.deepEqual(await counts(),before);
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
  const userId=(await alpha('session')).body.user.id;
  const older=[
    [randomUUID(),routes.rail,RIGHT_EXIT_RULES],
    [randomUUID(),BUS_COURSE.id,previousRules],
  ];
  for (const [id,course,version] of older) {
    await pool.query('INSERT INTO commute_records(play_id,user_id,course,rules,tenths,finished_at) VALUES($1,$2,$3,$4,1,$5)',
      [id,userId,course,version,new Date(now-1000)]);
    const empty=await alpha('ranking?course='+course+'&rules='+version);
    assert.equal(empty.status,200);
    assert.deepEqual(empty.body.rows,[]);
  }
  const first=await journey(alpha,setClock,beginning(),routes.rail,{pause:true});
  assert.equal(first.result.body.best,first.result.body.tenths);
  const duplicate=await alpha('play-finish',{id:first.id,seq:first.seq,wall:first.wall,events:[]});
  assert.deepEqual([duplicate.status,duplicate.body.error],[409,'play_closed']);
  await journey(beta,setClock,beginning(),routes.rail);
  const second=await journey(alpha,setClock,beginning(),routes.rail,{secondRecord:true});
  assert.equal(second.result.body.best,first.result.body.tenths);
  const rail=(await alpha('ranking?course='+routes.rail)).body.rows;
  assert.deepEqual(rail.map(row=>row.rank),[1,1]);
  assert.equal(rail.filter(row=>row.mine).length,1);
  assert.equal(rail[0].tenths,first.result.body.tenths);
  const bus=await journey(alpha,setClock,beginning(),BUS_COURSE.id);
  assert.equal(bus.result.body.best,bus.result.body.tenths);
  const busRanking=(await alpha('ranking?course='+BUS_COURSE.id)).body.rows;
  assert.deepEqual(busRanking,[{nickname:'첫출근',tenths:bus.result.body.tenths,rank:1,mine:true}]);
  const anotherBrowser=browser();
  await anotherBrowser('login',{nickname:'첫출근',password:testPin});
  const own=(await anotherBrowser('records?user='+((await beta('session')).body.user.id))).body.rows;
  assert.equal(own.length,5);
  assert.deepEqual(own.filter(row=>row.previousVersion).map(row=>row.play_id).sort(),
    older.map(([id])=>id).sort());
  for (const [id,course,version] of older) {
    const stored=(await pool.query('SELECT course,rules,tenths FROM commute_records WHERE play_id=$1',[id])).rows;
    assert.deepEqual(stored,[{course,rules:version,tenths:1}]);
  }
  const afterRestart=app(pool,config);
  const reloaded=await afterRestart(new Request(origin+'/api/records',{headers:{cookie:anotherBrowser.cookies().cookie}}));
  assert.equal((await reloaded.json()).rows.length,5);
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
  assert.ok(dashboard.body.nextCursor);
  const cursorPage=await admin('admin-audit?'+new URLSearchParams({page:'2',before:dashboard.body.nextCursor}));
  assert.equal(cursorPage.status,200);
  assert.ok(cursorPage.body.rows.length);
  const firstPageIds=new Set(dashboard.body.rows.map(row=>row.id));
  assert.ok(cursorPage.body.rows.every(row=>!firstPageIds.has(row.id)));
  assert.equal((await admin('admin-audit?before=invalid')).status,400);
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

test('daily completion refresh follows committed records, KST, authorization and recovery',async()=>{
  const date='2001-02-03';
  const start=Date.parse(date+'T00:00:00+09:00'), end=start+86400000;
  const overview=async()=> {
    const result=await admin('admin-completions');
    assert.equal(result.status,200);
    assert.equal(result.body.date,date);
    return result.body;
  };
  const userId=(await alpha('session')).body.user.id;
  async function fixture(course,rules,tenths,finished) {
    const id=randomUUID();
    await pool.query('INSERT INTO commute_records(play_id,user_id,course,rules,tenths,finished_at) VALUES($1,$2,$3,$4,$5,$6)',
      [id,userId,course,rules,tenths,new Date(finished)]);
    return id;
  }
  async function reconcile(expected) {
    const dash=await overview();
    const {rows}=await pool.query('SELECT play_id,course,rules,tenths,finished_at FROM commute_records');
    const source=rows.filter(r=>r.rules===officialRules[r.course]&&r.finished_at>=start&&r.finished_at<end);
    assert.equal(dash.count,source.length);
    assert.equal(dash.count,expected);
    for (const course of dash.byCourse) {
      const qualifying=source.filter(row=>row.course===course.course).sort((a,b)=>
        a.tenths-b.tenths||a.finished_at-b.finished_at||a.play_id.localeCompare(b.play_id));
      assert.equal(course.rules,officialRules[course.course]);
      assert.equal(course.count,qualifying.length);
      assert.deepEqual(course.fastest,qualifying.length?{playId:qualifying[0].play_id,tenths:qualifying[0].tenths}:null);
    }
    return dash;
  }

  for (const endpoint of ['admin-completions','admin-completion-evidence','admin-completion-runs']) {
    assert.equal((await alpha(endpoint)).status,403);
    assert.equal((await browser()(endpoint)).status,401);
  }
  assert.equal((await alpha('admin-completion-recalculate',{})).status,403);
  assert.equal((await admin('admin-completion-recalculate',{},{csrf:false})).status,403);
  assert.equal((await admin('admin-completion-evidence?date=2026-02-30')).status,400);
  now=start;
  await fixture(routes.rail,RIGHT_EXIT_RULES,1,start);
  await fixture(routes.rail,officialRules[routes.rail],1,start-1);
  await fixture(BUS_COURSE.id,officialRules[BUS_COURSE.id],1,end);
  await browser()('tutorial-access');
  const invalid=await alpha('play-start',{course:routes.rail});
  const rejected=await alpha('play-finish',{id:invalid.body.id,seq:1,wall:0,
    events:[{kind:'sample',wall:0,after:initialState().point}]});
  assert.equal(rejected.status,422);
  const cancelled=await alpha('play-start',{course:routes.rail});
  assert.equal((await alpha('play-cancel',{id:cancelled.body.id})).status,200);
  await reconcile(0);

  const slow=await journey(alpha,setClock,now,routes.rail,{secondRecord:true});
  const afterFirst=await reconcile(1);
  assert.deepEqual(afterFirst.byCourse.find(row=>row.course===routes.rail).fastest,{playId:slow.id,tenths:840});
  assert.ok(afterFirst.runId&&afterFirst.lastSuccessAt&&afterFirst.matchesLastRun);
  const retries=await Promise.all([1,2].map(()=>alpha('play-finish',{id:slow.id,seq:slow.seq,wall:slow.wall,events:[]})));
  assert.ok(retries.every(r=>r.status===409));
  assert.equal((await reconcile(1)).runId,afterFirst.runId);

  const raceStart=start+300000;
  const finishTogether=Promise.withResolvers();
  let finishers=0;
  const concurrentJourney=(account,course)=>{
    let time=raceStart;
    const client=browser(account.cookies(),app(pool,config,{clock:()=>time,scheduleCompletion:work=>work}));
    const raceClient=async (action,...args)=>{
      if (action==='play-finish') {
        if (++finishers===2) finishTogether.resolve();
        await finishTogether.promise;
      }
      return client(action,...args);
    };
    return journey(raceClient,value=>{time=value;},raceStart,course);
  };
  const [fast,bus]=await Promise.all([concurrentJourney(alpha,routes.rail),concurrentJourney(beta,BUS_COURSE.id)]);
  now=start+600000;
  const afterRace=await reconcile(3);
  assert.deepEqual(afterRace.byCourse.find(row=>row.course===routes.rail).fastest,{playId:fast.id,tenths:830});
  assert.equal(afterRace.byCourse.find(row=>row.course===BUS_COURSE.id).fastest.playId,bus.id);
  const slower=await journey(alpha,setClock,now,routes.rail,{secondRecord:true});
  assert.equal((await reconcile(4)).byCourse.find(row=>row.course===routes.rail).fastest.playId,fast.id);

  const lock=await pool.connect();
  let duringFailure;
  try {
    await lock.query("SELECT pg_advisory_lock(624023082, $1::date - DATE '2000-01-01')",[date]);
    let scheduled, settled=false;
    const independent=browser(alpha.cookies(),app(pool,config,{clock:()=>now,scheduleCompletion:work=>{
      scheduled=work.finally(()=>{settled=true;});
    }}));
    duringFailure=await journey(independent,setClock,now,routes.rail,{secondRecord:true});
    assert.ok(scheduled);
    assert.equal(settled,false,'official finish does not wait for the aggregate lock');
    const stillSaved=await reconcile(5);
    assert.equal(stillSaved.matchesLastRun,false);
    await scheduled;
    const refused=await admin('admin-completion-recalculate',{});
    assert.equal(refused.status,503);
    const afterFailure=await overview();
    assert.equal(afterFailure.latestRun.id,refused.body.runId);
    assert.equal(afterFailure.latestRun.status,'failed');
    assert.notEqual(afterFailure.runId,refused.body.runId);
  } finally {
    try {await lock.query('SELECT pg_advisory_unlock_all()');} finally {lock.release();}
  }
  const recovered=await admin('admin-completion-recalculate',{});
  assert.equal(recovered.status,200);
  assert.equal(recovered.body.status,'success');
  assert.equal((await reconcile(5)).runId,recovered.body.runId);
  const unchanged=await admin('admin-completion-recalculate',{});
  assert.equal(unchanged.body.status,'unchanged');

  const afterRecalculate=await overview();
  assert.equal(afterRecalculate.latestRun.id,unchanged.body.runId);
  assert.equal(afterRecalculate.latestRun.cause,'admin_recalculate');
  assert.equal(afterRecalculate.latestRun.status,'unchanged');
  assert.equal(afterFirst.latestRun.id,afterFirst.runId);
  assert.equal(afterFirst.latestRun.cause,'record_saved');
  assert.equal(afterFirst.latestRun.status,'success');
  const runs=(await admin('admin-completion-runs')).body.rows;
  const failed=runs.find(row=>row.play_id===duringFailure.id);
  assert.equal(failed.status,'failed');
  assert.equal(failed.reason,'aggregate_error');
  assert.equal(failed.request_id,duringFailure.result.id);
  assert.equal((await admin('admin-detail?id='+failed.request_id)).body.request.outcome,'ALLOW');
  assert.equal(runs.find(row=>row.id===recovered.body.runId).request_id,recovered.id);
  assert.equal(runs.find(row=>row.id===afterFirst.runId).play_id,slow.id);
  assert.ok(runs.some(row=>row.cause==='admin_recalculate'&&row.status==='failed'&&row.reason==='aggregate_error'));
  assert.ok(runs.every(row=>row.id&&row.started_at&&row.ended_at&&row.target_date===date));
  for (const secret of [adminPassword,alpha.cookies().cookie,uri,pepper]) {
    assert.equal(JSON.stringify(runs).includes(secret),false);
  }
  assert.equal((await admin('admin-completion-runs')).body.rows.length,runs.length);
  const evidence=(await admin('admin-completion-evidence')).body.rows;
  assert.deepEqual(evidence.map(row=>row.play_id).sort(),[slow.id,fast.id,bus.id,slower.id,duringFailure.id].sort());
  assert.deepEqual(evidence.filter(row=>row.fastest).map(row=>row.play_id).sort(),[fast.id,bus.id].sort());

  const boundaryId=await fixture(routes.rail,officialRules[routes.rail],1,start);
  const beforeMidnight=await fixture(BUS_COURSE.id,officialRules[BUS_COURSE.id],1,end-1);
  const fillers=await Promise.all(Array.from({length:20},()=>fixture(routes.rail,officialRules[routes.rail],1000,start+500)));
  now=end-1;
  assert.equal((await reconcile(27)).byCourse.find(row=>row.course===BUS_COURSE.id).fastest.playId,beforeMidnight);
  const pageOne=(await admin('admin-completion-evidence')).body;
  assert.ok(pageOne.nextCursor);
  await fixture(routes.rail,officialRules[routes.rail],1000,end-2);
  now=end;
  const pageTwo=(await admin('admin-completion-evidence?'+new URLSearchParams({date,before:pageOne.nextCursor}))).body;
  assert.equal(pageTwo.nextCursor,null);
  assert.deepEqual([...pageOne.rows,...pageTwo.rows].map(row=>row.play_id).sort(),
    [...evidence.map(row=>row.play_id),boundaryId,beforeMidnight,...fillers].sort());
  const nextDay=(await admin('admin-completions')).body;
  assert.equal(nextDay.date,'2001-02-04');
  assert.equal(nextDay.count,1);
  assert.equal(nextDay.byCourse.find(row=>row.course===routes.rail).fastest,null);
  now=end+86400000;
  const emptyDay=(await admin('admin-completions')).body;
  assert.equal(emptyDay.count,0);
  assert.equal(emptyDay.lastSuccessAt,null);
  assert.equal(emptyDay.latestRun,null);
  assert.ok(emptyDay.byCourse.every(row=>row.fastest===null));
});
