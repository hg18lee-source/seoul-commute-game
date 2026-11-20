import { entranceLanding, loadTransit } from './transit-scene.js';
import { loadCommuter, movementSpeed } from './hero/motion.js';
import { World } from './world.js';
import { api, createPlay, currentAccount, element, setAccount } from './online.js';
import { accountInterface } from './account-ui.js';

const $ = id => document.getElementById(id);
const keys = new Set();
const trainLines = {
  '5': ['마포', '공덕', '애오개', '충정로', '서대문'],
  '2': ['아현', '충정로', '시청', '을지로입구'],
};
const busStops = [
  '동도중학교.서울디자인고등학교', '공덕역1번출구', '마포역', '청암동강변삼성아파트',
  '원효2동산호아파트', '원효로풍전아파트', '원효로3가', '원효로2가사거리',
  '남정초등학교', '용산e편한세상', '용산꿈나무종합타운.원효로우체국', '용산경찰서',
  '남영역.민주화운동기념관', '숙대입구.서울시교육청역', '동자동',
  '서울역버스환승센터.강우규의거터', '북창동.소공동주민센터건너', '청계광장.광화문역5번출구',
];
const routes = [
  {name:'지하철 · 5 → 2호선', detail:'공덕 → 충정로 환승 → 시청', minutes:39},
  {name:'직행 · 7016번', detail:'공덕역1번출구 → 북창동·소공동주민센터건너', minutes:43},
];
const events = [45, 115, 195];

const pad = n => String(n).padStart(2, '0');
const clock = seconds => {
  const mins = 480 + Math.floor(seconds / 10);
  return pad(Math.floor(mins / 60) % 24) + ':' + pad(mins % 60);
};
const timeText = seconds => {
  const tenths = Math.round(seconds * 10);
  return pad(Math.floor(tenths / 600)) + ':' + pad(Math.floor(tenths / 10) % 60) + '.' + tenths % 10;
};
const near = (x,z,r=1.4) => Math.hypot(world.hero.position.x-x, world.hero.position.z-z)<r;

let world;
let run = null, paused = false, phone = false, selected = 0, priorFrame = performance.now();
let toastUntil = 0, lastPhoneMinute = -1, audio;
function button(label, action, style='btn') {
  const element = document.createElement('button');
  element.className = style;
  element.textContent = label;
  element.onclick = action;
  return element;
}
function notice(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  toastUntil = performance.now() + 2800;
}
function chime() {
  if (!audio || audio.state !== 'running') return;
  const tone = audio.createOscillator(), level = audio.createGain();
  tone.frequency.value = 650;
  level.gain.setValueAtTime(.045, audio.currentTime);
  level.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .22);
  tone.connect(level).connect(audio.destination);
  tone.start();
  tone.stop(audio.currentTime + .23);
}
let connection, starting=false;
const selectedCourses=['gongdeok-cityhall-rail','gongdeok-cityhall-bus'];
const ui=accountInterface({openDialog,closeDialog,button,menu,start,timeText});

function snapshot() {
  const {x,z}=world.hero.position;
  const {time:t,hp,stage,line,station,busIndex,ride:current}=run;
  const ride=current?{type:current.type,index:current.index,direction:current.direction,open:current.open,bell:current.bell,
    grip:run.grip,seated:run.seated}:null;
  return {t,x,z,hp,stage,line,station,busIndex,ride};
}
function capture(kind,before) { connection?.event(kind,before); }
function stage(mode,data={},before) {
  run.stage=mode;
  run.stageAt=run.time;
  world.setStage(mode,data);
  if (before) capture('stage',before);
}
function menu() {
  connection?.cancel();
  connection=undefined;
  run=null;
  paused=phone=false;
  keys.clear();
  $('dialog').hidden=$('hud').hidden=$('mobile-controls').hidden=true;
  document.body.classList.remove('playing');
  world?.setStage('street',{intro:true});
  ui.renderMenu();
}
async function start(course) {
  if (starting||!currentAccount()||!selectedCourses.includes(course)) return;
  const actions=$('dialog-actions'), status=$('course-status')??element('p');
  if (!status.isConnected) actions?.before(status);
  if (!world) {status.textContent='3D 장면을 아직 열 수 없습니다. WebGL 2 지원 여부를 확인해 주세요.';return;}
  starting=true;
  status.textContent='게임 장면을 준비하는 중…';
  const oldButtons=[...(actions?.querySelectorAll('button')??[])];
  for (const item of oldButtons) item.disabled=true;
  let issued;
  try {
    if(!world.transit.entrance||!world.transit.gate){
      const {loaded,failures}=await loadTransit(count=>{
        status.textContent='역 입구·개찰구 불러오는 중 ('+count+'/2)';
      });
      if(failures.length){
        status.textContent='3D 자산을 불러오지 못했습니다. 코스 버튼을 눌러 다시 시도하세요.';
        return;
      }
      world.transit=loaded;
    }
    if(actions&&!actions.isConnected)return;
    status.textContent='공식 플레이를 발급하는 중…';
    issued=await api('play-start',{course});
  }
  catch (error) {ui.showError(error,status);}
  finally {starting=false;for (const item of oldButtons) item.disabled=false;}
  if (!issued) return;
  if (actions&&!actions.isConnected) {api('play-cancel',{id:issued.id}).catch(()=>{});return;}
  try {
    audio ||= new AudioContext();
    audio.resume().catch(()=>{});
  } catch {}
  run={time:0,hp:100,route:selectedCourses.indexOf(course),course,stage:'street',stageAt:0,line:'5',station:'공덕',
    ride:null,disruption:null,eventIndex:0,hitAt:-2,grip:false,seated:false,motion:false,busIndex:1,done:false};
  phone=paused=false;
  closeDialog();
  keys.clear();
  $('screen').replaceChildren();
  $('hud').hidden=$('mobile-controls').hidden=false;
  document.body.classList.add('playing');
  stage('street',{spawnX:-5,spawnZ:15});
  priorFrame=performance.now();
  connection=createPlay(issued.id,snapshot,playAborted);
  connection.sync();
  if (document.hidden||!document.hasFocus()) pause();
  refresh();
  notice('M을 눌러 출근 경로를 확인하세요.');
}
function playAborted(error,saving) {
  if (!run) return;
  connection=undefined;
  run.done=true;
  paused=phone=false;
  keys.clear();
  $('hud').hidden=$('mobile-controls').hidden=true;
  if (error.status===401) setAccount(null);
  openDialog('<h2>출근 종료</h2><p id="abort-reason"></p><div id="dialog-actions" class="button-row"></div>');
  $('abort-reason').textContent=saving?'저장 응답을 받지 못했습니다. 내 기록에서 결과를 확인해 주세요.':
    error.message==='connection_lost'?'연결이 끊겨 출근이 종료되었습니다. 이번 플레이 기록은 저장되지 않았습니다.':
    '서버가 이번 플레이를 종료했습니다. 공식 기록에 반영되지 않았습니다.';
  $('dialog-actions').append(button('메인 화면',menu));
}
function openDialog(html, className='dialog-card') {
  $('dialog').innerHTML = '<section class="'+ className +'" role="dialog" aria-modal="true">'+html+'</section>';
  $('dialog').hidden = false;
}
function closeDialog() { $('dialog').hidden = true; $('dialog').replaceChildren(); }
function pause() {
  if (!run || run.done) return;
  if (!connection?.check()) return;
  paused = !paused;
  priorFrame=performance.now();
  capture(paused?'pause':'resume');
  connection.sync();
  keys.clear();
  if (paused) {
    openDialog('<h2>일시정지</h2><p>게임 시계와 출근 기록이 멈췄습니다.</p><div id="dialog-actions" class="button-row"></div>','dialog-card online-pause');
    $('dialog-actions').append(button('계속 출근', pause), button('메인 화면', menu));
  } else if (phone) drawPhone();
  else closeDialog();
}
function locationName() {
  if (run.ride) return stopName(run.ride);
  if (run.stage === 'office') return '시청역 인근 회사';
  if (run.stage === 'street' && run.busIndex !== 1) return busStops[run.busIndex];
  return run.stage === 'street' ? '공덕동' : run.station + '역';
}
function options() {
  if (run.stage === 'office') return [{id:run.route,name:'도보',detail:'현재 위치 → 회사 입구',minutes:Math.ceil(Math.abs(world.hero.position.z+26)/18)}];
  if (run.ride?.type === 'bus' || (run.stage === 'street' && run.busIndex !== 1))
    return [{...routes[1],id:1,detail:locationName()+' → 북창동·소공동주민센터건너',minutes:Math.max(6,(16-(run.ride?.index ?? run.busIndex))*2)}];
  if (run.stage !== 'street') {
    const target = run.line === '5' ? '충정로 환승 → 시청' : '시청';
    return [{...routes[0],id:0,detail:locationName()+' → '+target,minutes:run.line==='5'?24:11}];
  }
  const route=routes[run.route];
  return [{...route,id:run.route,minutes:Math.max(1,route.minutes-Math.floor(run.time/23))}];
}
function drawPhone() {
  const list = options();
  selected = Math.min(selected,list.length-1);
  openDialog('<div class="phone-notch"></div><div class="phone-top"><strong>출근 길찾기</strong><button class="close" id="phone-close" aria-label="닫기">×</button></div><div class="phone-content"><p class="phone-locations">'+locationName()+' → 시청 회사</p><div id="phone-routes"></div><button class="btn" id="confirm-route">안내 시작 · Enter</button><p class="phone-note">↑↓ 경로 선택 · M 닫기<br>길찾기 중에도 시간은 흐릅니다.</p></div>', 'phone');
  for (const [index, route] of list.entries()) {
    const card = button('', () => { selected=index; drawPhone(); }, 'route-card'+(index===selected?' active':''));
    card.innerHTML = '<strong>'+route.name+'</strong><div>'+route.detail+'</div><small>환승 '+(route.id===0&&run.line==='5'&&run.stage!=='office'?'1':'0')+'회 · 도보 포함 · 약 '+route.minutes+'분 · '+clock(run.time+route.minutes*10)+' 도착</small>';
    card.setAttribute('aria-pressed', String(index===selected));
    $('phone-routes').append(card);
  }
  $('confirm-route').onclick = confirmRoute;
  $('phone-close').onclick = togglePhone;
}
function togglePhone() {
  if (!run || run.done || paused) return;
  phone = !phone;
  keys.clear();
  if (phone) { selected=Math.max(0,options().findIndex(r=>r.id===run.route)); drawPhone(); }
  else closeDialog();
}
function confirmRoute() {
  run.route=options()[selected]?.id ?? run.route;
  togglePhone();
}
function damage(points, reason) {
  run.hp = Math.max(0,run.hp-points);
  $('damage').classList.remove('flash');
  void $('damage').offsetWidth;
  $('damage').classList.add('flash');
  notice(reason+' −'+points);
}
function platform(before) {
  const line = trainLines[run.line], index = line.indexOf(run.station);
  stage('platform',{station:run.station,line:run.line,neighbors:[line[index-1]??'회차',line[index+1]??'회차'],spawnZ:8},before);
}
function doorTiming(openSeconds) {
  const cycle = openSeconds === 5 ? 42 : 48;
  const remaining = (run.time-run.stageAt+cycle-5)%cycle;
  return {open:remaining<openSeconds,remaining:remaining<openSeconds?openSeconds-remaining:cycle-remaining};
}
function ride(type, direction) {
  const before=snapshot();
  const index = type === 'bus' ? run.busIndex : trainLines[run.line].indexOf(run.station);
  run.ride = {type,index,direction,line:run.line,open:false,nextAt:run.time+(type==='bus'?13:53),bell:false,warned:false};
  run.grip = run.seated = false;
  stage('vehicle',{type,line:run.line,next:nextName(run.ride),spawnZ:4},before);
  notice(type==='bus'?'교통카드 확인 · 7016 탑승':'열차 탑승');
}
function stopsFor(r) { return r.type==='bus'?busStops:trainLines[r.line]; }
function nextName(r) { return stopsFor(r)[r.index+r.direction] ?? '회차'; }
function stopName(r) { return stopsFor(r)[r.index]; }
function rideStep() {
  const r=run.ride;
  if (!r) return;
  if (r.open && r.nextAt-run.time<=2 && !r.warned) {
    r.warned=true;
    chime();
    notice('문이 곧 닫힙니다.');
  }
  if (run.time<r.nextAt) return;
  const before=snapshot();
  if (r.open) {
    r.open=false;
    r.warned=false;
    r.bell=r.type==='bus'&&r.index===busStops.length-1;
    r.nextAt=run.time+(r.type==='bus'?13:53);
  } else {
    const stops=stopsFor(r);
    if (!stops[r.index+r.direction]) r.direction*=-1;
    r.index+=r.direction;
    r.open=true;
    r.nextAt=run.time+(r.type==='bus'?5:6);
    chime();
    notice('정차 · '+stopName(r));
    if (phone && !paused) drawPhone();
  }
  capture('vehicle',before);
}
function canExit(r) { return r.open && (r.type==='train'||r.bell||r.index===busStops.length-1); }
function alight() {
  const before=snapshot(),r=run.ride;
  run.ride=null;
  run.grip=run.seated=false;
  if ((r.type==='bus'&&r.index===16)||(r.type==='train'&&stopName(r)==='시청')) {
    stage('office',{station:'시청',spawnZ:34},before);
  } else if (r.type==='bus') {
    run.busIndex=r.index;
    stage('street',{spawnX:7,spawnZ:-38},before);
    notice('정류장에서 7016번에 다시 탈 수 있습니다.');
  } else {
    run.station=stopName(r);
    platform(before);
  }
}
function action() {
  if (run.done||paused||phone) return;
  const r=run.ride, spot=world.nearest();
  if (r) {
    if (run.seated) { run.seated=false; return; }
    if (run.grip) { notice('Space로 손잡이를 놓으세요.'); return; }
    if (r.type==='bus'&&spot?.id==='bell') { const before=snapshot(); r.bell=true; capture('bell',before); notice('하차 벨을 눌렀습니다.'); }
    else if (r.type==='bus'&&spot?.id==='alight'&&canExit(r)) alight();
    else if (spot?.seat) run.seated=true;
    return;
  }
  const before=snapshot();
  if (run.stage==='street'&&spot?.id==='bus'&&run.route===1) {
    if (doorTiming(5).open) ride('bus',run.busIndex===busStops.length-1?-1:1);
    else notice('앞문이 열리면 E로 탑승하세요.');
  } else if (run.stage==='hall'&&spot?.id==='gate') world.openGate(run.time);
  else if (run.stage==='platform'&&spot?.id==='exit') {
    if (run.station==='충정로') {
      run.line=run.line==='5'?'2':'5';
      stage('hall',{station:run.station,line:run.line},before);
      notice(run.line+'호선 환승 통로');
    } else if (run.station==='공덕') stage('street',{spawnX:-5,spawnZ:-20},before);
    else notice('반대편 승강장에서 되돌아갈 수 있습니다.');
  }
}
function grip() {
  if (!run?.ride||run.done||paused||phone||run.seated) return;
  const z=world.hero.position.z;
  if (run.grip || near(.7,Math.round(z/2.5)*2.5,1.8)) run.grip=!run.grip;
  else notice('통로 손잡이 가까이에서 Space를 누르세요.');
}
function eventStep(running) {
  if (run.eventIndex<events.length && run.time>=events[run.eventIndex]) {
    run.eventIndex++;
    run.disruption={ride:run.ride,until:run.time+4};
    chime();
  }
  const event=run.disruption;
  if (!event || run.time<event.until) return;
  run.disruption=null;
  if (event.ride && run.ride===event.ride) {
    if (!run.grip&&!run.seated) damage(event.ride.type==='bus'?8:5,event.ride.type==='bus'?'버스 급정거':'열차 흔들림');
    else notice('손잡이·좌석으로 피해를 피했습니다.');
  } else if (!event.ride && !run.ride && running) damage(6,'젖은 바닥에서 미끄러짐');
  else notice('해프닝을 안전하게 통과했습니다.');
}
async function finish(success) {
  run.done=true;
  phone=false;
  keys.clear();
  $('hud').hidden=$('mobile-controls').hidden=true;
  const active=connection, course=run.course;
  let result;
  if (success) {
    openDialog('<h2>도착</h2><p role="status">서버에서 기록을 검증하는 중…</p>');
    try {result=await active.finish();}
    catch (error) {
      if (connection===active) playAborted(error,error.status===undefined||error.status>=500);
      return;
    }
  } else active.cancel();
  connection=undefined;
  openDialog(success
    ? '<section class="result"><h2>도착</h2><div class="time-label">이번 기록</div><div class="time-main">'+timeText(result.tenths/10)+'</div>'+
      (result.best===null?'':'<div class="time-label">최고 기록</div><div class="time-best">'+timeText(result.best/10)+'</div>')+'</section><div id="dialog-actions" class="button-row"></div>'
    : '<h2>출근 실패</h2><p>체력이 모두 소진되었습니다.</p><div id="dialog-actions" class="button-row"></div>');
  $('dialog-actions').append(button('재도전',()=>start(course)),button('메인 화면',menu));
}
function refresh() {
  $('hp').textContent=Math.ceil(run.hp);
  $('hpbar').style.width=run.hp+'%';
  $('elapsed').textContent=timeText(run.time);
  $('clock').textContent=clock(run.time);
  $('location').textContent=locationName();
  const r=run.ride, spot=world.nearest();
  let guide='', hint='';
  if (r) {
    guide=r.type==='bus'?'하차할 정류장 전에 벨을 누르세요':'시청 또는 충정로에서 열린 문으로 걸어 내리세요';
    const info=$('ride-info');
    info.hidden=false;
    info.textContent=(r.type==='bus'?'7016번':r.line+'호선')+' · '+(r.open?'정차 '+stopName(r):'다음 '+nextName(r))+
      (r.open?' · '+(canExit(r)?'하차 가능':'하차 벨을 누르세요')+' · '+Math.ceil(r.nextAt-run.time)+'초':'')+(r.bell?' · 하차 요청':'')+(run.grip?' · 손잡이 잡는 중':'')+(run.seated?' · 착석 중':'');
    if (run.seated) hint='E · 일어나기';
    else if (run.grip) hint='Space · 손잡이 놓기';
    else if (spot?.id==='alight') hint=canExit(r)?(r.type==='bus'?'E · 뒷문에서 하차':'↑ · 열린 문으로 걸어 하차'):'문이 열릴 때까지 기다리세요';
    else if (spot?.seat||spot?.id==='bell') hint='E · '+spot.label;
  } else {
    $('ride-info').hidden=true;
    if (run.stage==='street') {
      if (world.streetBus) world.streetBus.position.z=-42-Math.min(45,Math.max(0,doorTiming(5).remaining-1)*3);
      guide=run.route===1||run.busIndex!==1?'7016 정류장 · 큰길 오른쪽 아래':'공덕역 입구 · 골목 왼쪽 앞';
      if (spot?.id==='bus'&&run.route===1) {
        const door=doorTiming(5);
        hint=door.open?'E · 7016 앞문 승차 · '+Math.ceil(door.remaining)+'초':'다음 7016까지 '+Math.ceil(door.remaining)+'초';
      }
      if (run.busIndex===1&&run.route===0&&near(-5,-22,3.5)) hint='좌우 통로로 맞춘 뒤 ↑ · 계단 내려가기';
    }
    if (run.stage==='hall') {
      guide=world.gate.open?'열린 개찰구를 통과해 승강장으로 이동하세요':'앞쪽 개찰구에서 교통카드를 찍으세요';
      if(spot?.id==='gate') hint=world.gate.open?'↑ · 개찰구 통과':
        world.gate.startedAt===null?'E · 교통카드 찍기':'개찰구 열리는 중';
    }
    if (run.stage==='platform') {
      guide=run.station==='충정로'&&run.line==='5'?'환승하려면 뒤쪽 통로로 이동하세요':'오른쪽 승강장 · '+(run.line==='5'?'충정로 방향':'시청 방향');
      const door=doorTiming(6);
      for (const train of world.platformTrains) train.position.z=door.open?0:-Math.min(85,door.remaining*8);
      if (spot?.direction) hint=door.open?(spot.direction===1?'→':'←')+' · '+spot.label+' · 문 열린 상태 '+Math.ceil(door.remaining)+'초':'열차까지 '+Math.ceil(door.remaining)+'초';
      if (spot?.id==='exit') hint=run.station==='충정로'?'E · 환승 통로':'E · 역 출구';
    }
    if (run.stage==='office') guide='앞쪽 빨간 직장 포털까지 걸어가세요';
  }
  $('guide').textContent=guide;
  $('interaction').textContent=hint;
  $('interaction').hidden=!hint;
  $('event').hidden=!run.disruption;
  if (run.disruption) $('event').textContent=run.disruption.ride?'주의 · 차량이 흔들립니다. Space로 손잡이를 잡거나 좌석에 앉으세요.':'주의 · 젖은 바닥입니다. 걷거나 멈추세요.';
  $('mode-label').textContent='대표 코스 · 공덕 → 시청';
}
function step(dt) {
  run.time+=dt;
  rideStep();
  world.gateTick(run.time);
  let dx=0,dz=0;
  if (!phone&&!run.grip&&!run.seated) {
    dx=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
    dz=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));
  }
  const running=Boolean((dx||dz)&&keys.has('Shift'));
  run.motion=world.move(dx,dz,dt,running?movementSpeed.run:movementSpeed.walk);
  if (running) run.hp=Math.max(0,run.hp-.2*dt);
  if (run.motion) world.crowdCollision(running,dt,()=>{
    if (run.time-run.hitAt>=2) { run.hitAt=run.time; damage(3,'보행자 충돌'); }
  });
  world.advanceHero(dt,{running,grip:run.grip,seated:run.seated});
  eventStep(running);
  if (run.hp<=0) { finish(false); return; }
  if (run.stage==='office'&&near(0,-26,1.2)) { finish(true); return; }
  if(run.stage==='street'&&run.route===0&&run.busIndex===1&&
      world.hero.position.z<=entranceLanding&&near(-5,entranceLanding,1.7)) {
    const before=snapshot();
    stage('hall',{station:run.station,line:run.line},before);
  } else if(run.stage==='hall'&&world.gate.open&&world.hero.position.z<=2.05) {
    platform(snapshot());
  }
  if (run.stage==='platform'&&dx&&near(Math.sign(dx)*4.45,0,.85)&&doorTiming(6).open) {
    const index=trainLines[run.line].indexOf(run.station);
    if (trainLines[run.line][index+Math.sign(dx)]) ride('train',Math.sign(dx));
  } else if (run.ride?.type==='train'&&dz<0&&near(0,-11,.85)&&canExit(run.ride)) alight();
  if (phone&&lastPhoneMinute!==Math.floor(run.time/10)) { lastPhoneMinute=Math.floor(run.time/10); drawPhone(); }
  refresh();
}
function render(now) {
  const dt=Math.max(0,(now-priorFrame)/1000);
  priorFrame=now;
  if (run&&!paused&&!run.done) {
    // Limit movement jumps while keeping the actual active clock in sync.
    if (dt>.25) { run.time+=dt-.25; }
    const count=Math.max(1,Math.ceil(Math.min(dt,.25)/.05));
    for (let i=0;i<count&&!run.done;i++) step(Math.min(dt,.25)/count);
  }
  if (now>toastUntil) $('toast').classList.remove('show');
  if (!paused) world.update(Math.min(dt,.05),run?.time??now/1000,{
    intro:!run,ended:!!run?.done,seated:run?.seated,
    rideMoving:!!run?.ride&&!run.ride.open&&!run.done,
  });
  requestAnimationFrame(render);
}
function bind() {
  addEventListener('keydown',event=>{
    if (event.target instanceof HTMLInputElement) return;
    const key=event.key;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Escape'].includes(key)) event.preventDefault();
    if (!run||run.done) return;
    if (key==='Escape'&&!event.repeat) { pause(); return; }
    if (paused) return;
    if (key.toLowerCase()==='m'&&!event.repeat) { togglePhone(); return; }
    if (phone) {
      if (key==='ArrowUp'||key==='ArrowDown') { selected=Math.max(0,Math.min(options().length-1,selected+(key==='ArrowUp'?-1:1))); drawPhone(); }
      if (key==='Enter'&&!event.repeat) { event.preventDefault(); confirmRoute(); }
      return;
    }
    keys.add(key);
    if (!event.repeat&&key.toLowerCase()==='e') action();
    if (!event.repeat&&key===' ') grip();
  });
  addEventListener('keyup',event=>keys.delete(event.key));
  function suspend() {
    keys.clear();
    if (run&&!run.done&&!paused) pause();
  }
  addEventListener('blur',suspend);
  document.addEventListener('visibilitychange',()=>{if (document.hidden) suspend();});
  $('phoneButton').onclick=togglePhone;
  $('pauseButton').onclick=pause;
  $('settings').onclick=()=>{
    if (run&&!run.done) return pause();
    if (connection) return;
    openDialog('<h2>조작</h2><p>방향키 이동 · Shift 달리기 · M 길찾기 · E 상호작용 · Esc 일시정지</p><button class="btn" id="settings-close">닫기</button>');
    $('settings-close').onclick=closeDialog;
  };
  $('brand').onclick=event=>{event.preventDefault(); if (run&&!run.done) pause(); else if (!connection) menu();};
  for (const b of document.querySelectorAll('[data-key]')) {
    b.onpointerdown=event=>{event.preventDefault(); b.setPointerCapture(event.pointerId); if (!phone&&!paused) keys.add(b.dataset.key);};
    b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>keys.delete(b.dataset.key);
  }
  for (const b of document.querySelectorAll('[data-action]')) b.onclick=()=>{ if (run&&!run.done) (b.dataset.action==='e'?action:grip)(); };
}
try {setAccount((await api('session')).user);} catch {}
menu();
bind();
$('loading').hidden=true;
if (!currentAccount()&&new URLSearchParams(location.search).has('admin')) ui.accountForm('admin-login');
try {
  world=new World($('world'),await loadCommuter());
  if (!run) world.setStage('street',{intro:true});
  priorFrame=performance.now();
  requestAnimationFrame(render);
} catch {
  notice('3D 화면을 열 수 없습니다. WebGL 2 지원 여부를 확인해 주세요.');
}
