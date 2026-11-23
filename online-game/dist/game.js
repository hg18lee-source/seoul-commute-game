import { entranceLanding, loadTransit } from './transit-scene.js';
import { loadCommuter, movementSpeed } from './hero/motion.js';
import { World } from './world.js';
import { api, createPlay, currentAccount, element, setAccount } from './online.js';
import { accountInterface } from './account-ui.js';
import { BUS_COURSE, BUS_STOPS, CHECKPOINTS, COURSE, COURSES, TRAIN_LINES, CONNECTED_ENTRANCE_RULES, RIGHT_EXIT_RULES, STATION_ENTRANCE, atEntranceExit, usesRightStationExit, insideRightStationExit } from './journey.js';

const $ = id => document.getElementById(id);
const keys = new Set();
const trainLines = TRAIN_LINES;
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
const selectedCourses=Object.keys(COURSES);
const ui=accountInterface({openDialog,closeDialog,button,menu,start,timeText});

function snapshot() {
  const {x,z}=world.hero.position;
  const {time:t,stage,line,station,busIndex,ride:current}=run;
  const ride=current?{type:current.type,index:current.index,direction:current.direction,open:current.open,bell:current.bell,
    grip:run.grip,seated:run.seated}:null;
  return {t,x,z,stage,line,station,busIndex,penalty:run.penaltySeconds,ride};
}
function capture(kind,before) { connection?.event(kind,before); }
function stage(mode,data={},before) {
  run.stage=mode;
  run.stageAt=run.time;
  world.busOnly=Boolean(run&&COURSES[run.course].transport==='bus');
  if(world.busOnly)world.transit={};
  world.setStage(mode,{...data,busOnly:world.busOnly,
    connectedEntrance:mode==='street'&&run.rules===CONNECTED_ENTRANCE_RULES});
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
  if(world)world.busOnly=false;
  world?.setStage('street',{intro:true,connectedEntrance:true});
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
    if(COURSES[course].transport==='train'&&(!world.transit.entrance||!world.transit.gate)){
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
    issued=await api('play-start',{course,exitRules:RIGHT_EXIT_RULES,entranceRules:CONNECTED_ENTRANCE_RULES});
  }
  catch (error) {ui.showError(error,status);}
  finally {starting=false;for (const item of oldButtons) item.disabled=false;}
  if (!issued) return;
  if (actions&&!actions.isConnected) {api('play-cancel',{id:issued.id}).catch(()=>{});return;}
  try {
    audio ||= new AudioContext();
    audio.resume().catch(()=>{});
  } catch {}
  const route=COURSES[course];
  run={time:0,route:course,course,rules:issued.rules,stage:'street',stageAt:0,line:route.line,station:route.origin,
    ride:null,hitAt:-2,penaltySeconds:0,grip:false,seated:false,motion:false,busIndex:route.startBusIndex??1,done:false};
  phone=paused=false;
  closeDialog();
  keys.clear();
  $('screen').replaceChildren();
  $('hud').hidden=$('mobile-controls').hidden=false;
  document.body.classList.add('playing');
  stage('street',{spawnX:CHECKPOINTS.entrance.start.x,spawnZ:CHECKPOINTS.entrance.start.z});
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
  if (run.stage === 'office') return '충정로역 인근 회사';
  if (run.stage==='exit-street') return '충정로역 밖 거리';
  if (run.stage === 'street' && COURSES[run.course].transport==='bus') return BUS_STOPS[run.busIndex];
  if (run.stage === 'street' && run.busIndex !== 1) return BUS_STOPS[run.busIndex];
  return run.stage === 'street' ? '공덕동' : run.station + '역';
}
function finalRailPlatform() {
  const course=COURSES[run.course];
  return run.stage==='platform'&&course.transport==='train'&&run.line===course.line&&run.station===course.destination;
}
function rightStationExit() {return usesRightStationExit(run.rules)&&finalRailPlatform();}
function options() {
  const course=COURSES[run.course], bus=course.transport==='bus';
  const stopCount=course.destinationIndex-(bus?(run.ride?.index??run.busIndex):trainLines[run.line].indexOf(run.station));
  const remaining=(run.stage==='office'||run.stage==='exit-street')?Math.ceil(Math.abs(world.hero.position.z-(course.finishPoint?.z??-26))/18)
    :run.ride?Math.max(1,Math.ceil(run.ride.nextAt-run.time)+Math.max(0,stopCount)*(bus?course.busTravelSeconds+course.busDoorSeconds:course.trainTravelSeconds+course.trainDoorSeconds)+12)
    :bus?Math.max(1,Math.ceil(doorTiming(course.busDoorSeconds).remaining)+Math.max(0,stopCount)*(course.busTravelSeconds+course.busDoorSeconds)+28)
      :Math.max(1,Math.ceil((course.destinationIndex-trainLines[run.line].indexOf(run.station))*(course.trainTravelSeconds+course.trainDoorSeconds)+28));
  return [{id:course.id,name:course.label,detail:(run.stage==='office'||run.stage==='exit-street')?'현재 위치 → 회사 입구':
      rightStationExit()?'승강장 오른쪽 바닥 화살표 → 출구로 이동 → 회사 입구':course.detail,
    minutes:Math.max(1,Math.ceil(remaining/10))}];
}
function drawPhone() {
  const list = options();
  selected = Math.min(selected,list.length-1);
  const destination=COURSES[run.course].destinationLabel||'충정로';
  openDialog('<div class="phone-notch"></div><div class="phone-top"><strong>출근 길찾기</strong><button class="close" id="phone-close" aria-label="닫기">×</button></div><div class="phone-content"><p class="phone-locations">'+locationName()+' → '+destination+' 회사</p><div id="phone-routes"></div><button class="btn" id="confirm-route">안내 시작 · Enter</button><p class="phone-note">↑↓ 경로 선택 · M 닫기<br>길찾기 중에도 시간은 흐릅니다.</p></div>', 'phone');
  for (const [index, route] of list.entries()) {
    const card = button('', () => { selected=index; drawPhone(); }, 'route-card'+(index===selected?' active':''));
    card.innerHTML = '<strong>'+route.name+'</strong><div>'+route.detail+'</div><small>환승 0회 · 도보 포함 · 약 '+route.minutes+'분 · '+clock(run.time+route.minutes*10)+' 도착</small>';
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
function platform(before) {
  const line = trainLines[run.line], index = line.indexOf(run.station);
  stage('platform',{station:run.station,line:run.line,neighbors:[line[index-1]??'회차',line[index+1]??'회차'],spawnZ:CHECKPOINTS.trainAlight.platform.z,
    rightExit:usesRightStationExit(run.rules)&&run.line===COURSES[run.course].line&&run.station===COURSES[run.course].destination},before);
}
function doorTiming(openSeconds) {
  const course=COURSES[run.course];
  const cycle = openSeconds === 5 ? BUS_COURSE.busCycleSeconds : course.trainCycleSeconds;
  const remaining = (run.time-run.stageAt+cycle-5)%cycle;
  return {open:remaining<openSeconds,remaining:remaining<openSeconds?openSeconds-remaining:cycle-remaining};
}
function ride(type, direction) {
  const before=snapshot();
  const course=COURSES[run.course];
  const index = type === 'bus' ? run.busIndex : trainLines[run.line].indexOf(run.station);
  run.ride = {type,index,direction,line:run.line,open:false,nextAt:run.time+(type==='bus'?course.busTravelSeconds:course.trainTravelSeconds),bell:false,warned:false};
  run.grip = run.seated = false;
  stage('vehicle',{type,line:run.line,next:nextName(run.ride),spawnZ:CHECKPOINTS.trainBoard.vehicle.z},before);
  notice(type==='bus'?'교통카드 확인 · '+course.busNumber+'번 버스 탑승':'열차 탑승');
}
function stopsFor(r) { return r.type==='bus'?BUS_STOPS:trainLines[r.line]; }
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
    const course=COURSES[run.course];
    if(r.type==='train'&&r.line===course.line&&r.index===course.destinationIndex){
      finish(false,'충정로역에서 하차하지 못했습니다. 다음 열차로 다시 도전하세요.');
      return;
    }
    if(r.type==='bus'&&r.index===course.destinationIndex){
      finish(false,course.destinationLabel+' 정류장을 지나쳤습니다. 다시 도전하세요.');
      return;
    }
    r.open=false;
    r.warned=false;
    r.bell=r.type==='bus'&&r.index===COURSES[run.course].destinationIndex;
    r.nextAt=run.time+(r.type==='bus'?COURSES[run.course].busTravelSeconds:COURSES[run.course].trainTravelSeconds);
  } else {
    const stops=stopsFor(r);
    if (!stops[r.index+r.direction]) r.direction*=-1;
    r.index+=r.direction;
    r.open=true;
    r.nextAt=run.time+(r.type==='bus'?COURSES[run.course].busDoorSeconds:COURSES[run.course].trainDoorSeconds);
    chime();
    notice('정차 · '+stopName(r));
    if (phone && !paused) drawPhone();
  }
  capture('vehicle',before);
}
function canExit(r) { return r.open && (r.type==='train'||r.bell||r.index===BUS_STOPS.length-1); }
function alight() {
  const before=snapshot(),r=run.ride;
  run.ride=null;
  run.grip=run.seated=false;
  if (r.type==='bus') {
    run.busIndex=r.index;
    if(COURSES[run.course].transport==='bus'&&r.index===COURSES[run.course].destinationIndex) {
      stage('office',{spawnX:CHECKPOINTS.busOfficeStart.office.x,spawnZ:CHECKPOINTS.busOfficeStart.office.z},before);
      notice(COURSES[run.course].destinationLabel+' 정류장에 도착했습니다. 앞쪽 회사까지 걸어가세요.');
    } else {
      stage('street',{spawnX:CHECKPOINTS.busStop.street.x,spawnZ:CHECKPOINTS.busStop.street.z-4},before);
      notice('잘못된 정류장에서 내렸습니다. '+COURSES[run.course].destinationLabel+'에서 내려야 합니다.');
      finish(false,'잘못된 정류장에서 내렸습니다. '+COURSES[run.course].destinationLabel+'에서 내려야 합니다.');
    }
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
    else if (r.type==='bus'&&spot?.id==='alight'&&canExit(r)) {
      if(r.index!==COURSES[run.course].destinationIndex)finish(false,'잘못된 정류장에서 내렸습니다. '+COURSES[run.course].destinationLabel+'에서 내려야 합니다.');
      else alight();
    }
    else if (spot?.seat) {world.sitAt(spot);run.seated=true;}
    return;
  }
  const before=snapshot();
  if (run.stage==='street'&&COURSES[run.course].transport==='bus'&&spot?.id==='bus') {
    const door=doorTiming(COURSES[run.course].busDoorSeconds);
    if(door.open)ride('bus',run.busIndex===BUS_STOPS.length-1?-1:1);
    else notice(COURSES[run.course].busNumber+'번 버스가 정류장에 도착할 때까지 '+Math.ceil(door.remaining)+'초 기다리세요.');
  }
  else if ((run.stage==='hall'||run.stage==='exit-hall')&&spot?.id==='gate') world.openGate(run.time);
  else if (run.stage==='platform'&&spot?.id==='exit') {
    if (run.station===COURSE.destination) {
      notice('밝은 표시를 따라 계속 걸어가 개찰구로 나가세요.');
    } else if (run.station==='충정로') {
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
  if (run.grip) run.grip=false;
  else if (near(.7,Math.round(z/2.5)*2.5,1.8)) {world.alignGrip(Math.round(z/2.5)*2.5);run.grip=true;}
  else notice('통로 손잡이 가까이에서 Space를 누르세요.');
}
async function finish(success,failureMessage='출근 경로를 완료하지 못했습니다.') {
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
    : '<h2>출근 실패</h2><p>'+failureMessage+'</p><div id="dialog-actions" class="button-row"></div>');
  $('dialog-actions').append(button('재도전',()=>start(course)),button('메인 화면',menu));
}
function refresh() {
  $('elapsed').textContent=timeText(run.time+run.penaltySeconds);
  $('clock').textContent=clock(run.time);
  $('location').textContent=locationName();
  const r=run.ride, spot=world.nearest();
  let guide='', hint='';
  if (r) {
    guide=r.type==='bus'?COURSES[run.course].destinationLabel+' 정류장에서 내리세요. 도착 전에 벨을 누르세요.':COURSES[run.course].destination+'역에서 열린 문으로 걸어 내리세요';
    const info=$('ride-info');
    info.hidden=false;
    world.setVehicleDestination((r.open?'정차 ':'다음 ')+ (r.open?stopName(r):nextName(r)));
    info.textContent=(r.type==='bus'?COURSES[run.course].busNumber+'번 버스':r.line+'호선 · 현재 '+stopName(r)+'역')+' · '+(r.open?'정차 중':'다음 '+nextName(r))+
      (r.open?' · '+(canExit(r)?'하차 가능':'하차 벨을 누르세요')+' · '+Math.ceil(r.nextAt-run.time)+'초':'')+(r.bell?' · 하차 요청':'')+(run.grip?' · 손잡이 잡는 중':'')+(run.seated?' · 착석 중':'');
    if (run.seated) hint='E · 일어나기';
    else if (run.grip) hint='Space · 손잡이 놓기';
    else if (spot?.id==='alight') hint=canExit(r)?(r.type==='bus'?'E · 뒷문에서 하차':'↑ · 열린 문으로 걸어 하차'):'문이 열릴 때까지 기다리세요';
    else if (spot?.seat||spot?.id==='bell') hint='E · '+spot.label;
  } else {
    $('ride-info').hidden=true;
    if (run.stage==='street') {
      const course=COURSES[run.course];
      if (world.streetBus) world.streetBus.position.z=CHECKPOINTS.busStop.street.z-Math.min(45,Math.max(0,doorTiming(BUS_COURSE.busDoorSeconds).remaining-1)*3);
      if(course.transport==='bus') {
        guide=course.busNumber+'번 · '+BUS_STOPS[course.startBusIndex]+' 정류장 · 노란 탑승 표시';
        if(spot?.id==='bus') {
          const door=doorTiming(course.busDoorSeconds);
          hint=door.open?'E · 정차한 '+course.busNumber+'번 버스 탑승':'정류장에서 대기 · 버스 도착까지 '+Math.ceil(door.remaining)+'초';
        }
      } else {
        guide='공덕역 입구 · 골목 왼쪽 앞';
        if (near(-5,-22,3.5)) hint=world.connectedEntrance?'오른쪽 계단으로 내려가세요':'좌우 통로로 맞춘 뒤 ↑ · 계단 내려가기';
      }
    }
    if (run.stage==='entrance'||run.stage==='entrance-corridor') {
      guide='대합실로 이동';
      const {x,z}=world.hero.position;
      hint=run.stage==='entrance'?'↑ · 오른쪽 계단 아래로 이동':
        z>STATION_ENTRANCE.turn.z+.45?'↑ · 바닥 화살표까지 이동':
        x<STATION_ENTRANCE.turn.x-.6?'→ · 우측 연결 통로':'↑ · 대합실로 이동';
    }
    if (run.stage==='hall'||run.stage==='exit-hall') {
      guide=run.stage==='exit-hall'?(world.gate.open?'열린 개찰구를 지나 역 밖으로 나가세요':'앞쪽 개찰구에서 교통카드를 찍으세요'):(world.gate.open?'열린 개찰구를 통과해 승강장으로 이동하세요':'앞쪽 개찰구에서 교통카드를 찍으세요');
      if(spot?.id==='gate') hint=world.gate.open?'↑ · 개찰구 통과':
        world.gate.startedAt===null?'E · 교통카드 찍기':'개찰구 열리는 중';
    }
    if (run.stage==='platform') {
      const course=COURSES[run.course];
      guide=rightStationExit()?'출구로 이동 · 오른쪽 바닥 화살표를 따라가세요':run.station===course.destination?'현재 '+course.destination+'역 · 하차 표시를 따라 출구로 이동하세요':`현재 ${run.station}역 · 오른쪽 승강장에서 ${course.destination} 방향 열차를 타세요`;
      const door=doorTiming(course.trainDoorSeconds);
      for (const train of world.platformTrains) train.position.z=door.open?0:-Math.min(85,door.remaining*8);
      if (spot?.direction) hint=spot.boarding?(door.open?'→ 노란 원 안에서 앞으로 걸어가 탑승하세요':'노란 원이 탑승 지점 · 열차까지 '+Math.ceil(door.remaining)+'초'):(door.open?(spot.direction===1?'→':'←')+' · '+spot.label+' · 문 열린 상태 '+Math.ceil(door.remaining)+'초':'열차까지 '+Math.ceil(door.remaining)+'초');
      if (spot?.alighting) hint=spot.id==='exit'&&run.station===COURSE.destination?'↑ · 표시를 따라 개찰구로 이동':'↑ · 계속 전진';
    }
    if (rightStationExit()&&insideRightStationExit(world.hero.position.x,world.hero.position.z))
      hint='방향키 · 출구로 이동';
    if (run.stage==='exit-street'||run.stage==='office') guide='거리를 따라 앞쪽 회사 입구까지 걸어가세요';
  }
  $('guide').textContent=guide;
  $('interaction').textContent=hint;
  $('interaction').hidden=!hint;
  $('mode-label').textContent=COURSES[run.course].label;
}
function step(dt) {
  run.time+=dt;
  rideStep();
  if(run.done)return;
  world.gateTick(run.time);
  let dx=0,dz=0;
  if (!phone&&!run.grip&&!run.seated) {
    dx=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
    dz=Number(keys.has('ArrowDown'))-Number(keys.has('ArrowUp'));
  }
  const running=Boolean((dx||dz)&&keys.has('Shift'));
  run.motion=world.move(dx,dz,dt,running?movementSpeed.run:movementSpeed.walk);
  if (run.motion) world.crowdCollision(running,dt,isRunning=>{
    if (run.time-run.hitAt>=2) {
      run.hitAt=run.time;
      const delay=isRunning?10:5;
      run.penaltySeconds+=delay;
      notice(`보행자와 충돌 · 기록 시간 +${delay}초`);
    }
  });
  world.advanceHero(dt,{running,grip:run.grip,seated:run.seated});
  const course=COURSES[run.course];
  const finishPoint=course.finishPoint??CHECKPOINTS.officeFinish.office;
  if ((run.stage===(course.transport==='bus'?'office':'exit-street'))&&near(finishPoint.x,finishPoint.z,finishPoint.radius)) { finish(true); return; }
  const {x,z}=world.hero.position;
  if(world.connectedEntrance&&run.stage==='street'&&world.entranceActive) {
    const before=snapshot();
    run.stage='entrance';
    capture('stage',before);
  } else if(run.stage==='entrance'&&z<=STATION_ENTRANCE.descentEnd) {
    const before=snapshot();
    run.stage='entrance-corridor';
    capture('stage',before);
  } else if(run.stage==='entrance-corridor'&&atEntranceExit(x,z)) {
    keys.clear();
    stage('hall',{station:run.station,line:run.line,fromEntrance:true},snapshot());
  } else if(course.transport==='train'&&!world.connectedEntrance&&run.stage==='street'&&run.busIndex===1&&
      z<=entranceLanding&&near(-5,entranceLanding,1.7)) {
    const before=snapshot();
    stage('hall',{station:run.station,line:run.line},before);
  } else if(run.stage==='hall'&&world.gate.open&&world.hero.position.z<=CHECKPOINTS.gate.triggerZ) {
    platform(snapshot());
  } else if(finalRailPlatform()&&(rightStationExit()
      ? (dx||dz)&&insideRightStationExit(world.hero.position.x,world.hero.position.z)
      : dz<0&&near(CHECKPOINTS.stationExit.platform.x,CHECKPOINTS.stationExit.platform.z,1.25))) {
    stage('exit-hall',{station:run.station,line:run.line,spawnX:CHECKPOINTS.stationExit.hall.x,spawnZ:CHECKPOINTS.stationExit.hall.z},snapshot());
    notice('개찰구 앞입니다. E로 카드를 찍고 계속 전진하세요.');
  } else if(run.stage==='exit-hall'&&world.gate.open&&world.hero.position.z<=CHECKPOINTS.gate.triggerZ) {
    stage('exit-street',{station:run.station,spawnX:CHECKPOINTS.stationExit.street.x,spawnZ:CHECKPOINTS.stationExit.street.z},snapshot());
    notice('역 밖으로 나왔습니다. 앞쪽 회사까지 이동하세요.');
  }
  const board=CHECKPOINTS.trainBoard.platform, exit=CHECKPOINTS.trainAlight.vehicle;
  if (course.transport==='train'&&run.stage==='platform'&&run.line===course.line&&run.station!==course.destination
      &&dx===course.direction&&near(board.x,board.z,board.radius)&&doorTiming(course.trainDoorSeconds).open) {
    const index=trainLines[run.line].indexOf(run.station);
    if (trainLines[run.line][index+Math.sign(dx)]) ride('train',Math.sign(dx));
  } else if (run.ride?.type==='train'&&dz<0&&near(exit.x,exit.z,exit.radius)&&canExit(run.ride)) alight();
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
    if (!event.repeat) keys.add(key);
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
  if (!run) world.setStage('street',{intro:true,connectedEntrance:true});
  priorFrame=performance.now();
  requestAnimationFrame(render);
} catch {
  notice('3D 화면을 열 수 없습니다. WebGL 2 지원 여부를 확인해 주세요.');
}
