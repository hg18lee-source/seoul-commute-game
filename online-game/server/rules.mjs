import { BUS_COURSE, BUS_STOPS, CHECKPOINTS, COURSE, COURSES, TRAIN_LINES, RIGHT_EXIT_RULES, insideRightStationExit } from '../dist/journey.js';

export const legacyRules = 'gongdeok-movement-v2-online-1';
export const previousRules = 'gongdeok-chungjeongno-walk-3';
export const originalExitRules = 'gongdeok-chungjeongno-walk-4';
export const rules = RIGHT_EXIT_RULES;
export const rankingRules = {[COURSE.id]:[rules,originalExitRules],[BUS_COURSE.id]:[originalExitRules]};
export const ruleVersions = {[rules]:'오른쪽 출구 동선',[originalExitRules]:'기존 출구 동선',[previousRules]:'기존 충정로 도보 코스',[legacyRules]:'이전 코스'};
export const courses = COURSES;
export const expiryMs = 10000;
const lines = TRAIN_LINES;
const bounds = {street:[-10,10,-48,32],hall:[-9,9,1,19],'exit-hall':[-6.72,6.72,1,19],platform:[-4.45,4.45,-25,25],
  vehicle:[-1.9,1.9,-11,11],office:[-9,9,-28,34],'exit-street':[-9,9,-28,34]};
const near = (s,x,z,r=2.35) => Math.hypot(s.x-x,s.z-z)<r+.015;
const close = (a,b) => Math.abs(a-b)<.012;
const spawn = (s,x,z) => close(s.x,x)&&close(s.z,z);
const range = (n,a,b) => Number.isFinite(n)&&n>=a&&n<=b;
const integer = (n,a,b) => Number.isInteger(n)&&range(n,a,b);
const boolean = n => typeof n==='boolean';
const trip = s => s.ride ? [s.ride.type,s.ride.index,s.ride.direction,s.ride.open,s.ride.bell] : null;
const identity = s => JSON.stringify([s.stage,s.line,s.station,s.busIndex,trip(s)]);
const still = (a,b) => identity(a)===identity(b)&&close(a.x,b.x)&&close(a.z,b.z)&&close(a.t,b.t)
  &&close(a.penalty,b.penalty)&&a.ride?.seated===b.ride?.seated&&a.ride?.grip===b.ride?.grip;
const sameTick = (a,b) => close(a.t,b.t)&&close(a.penalty,b.penalty);
const sameStops = (a,b) => a.line===b.line&&a.station===b.station&&a.busIndex===b.busIndex;
const endIndex = s => s.ride.type==='bus' ? BUS_STOPS.length-1 : lines[s.line].length-1;
const rideDelay = (s, course) => s.ride.type==='bus'
  ? (s.ride.open?course.busDoorSeconds:course.busTravelSeconds)
  : (s.ride.open?course.trainDoorSeconds:course.trainTravelSeconds);
const boardingWindow = (s, stageAt, open, course) => {
  const cycle=course.transport==='bus'?course.busCycleSeconds:course.trainCycleSeconds;
  return ((s.t-stageAt+cycle-5)%(cycle))<open+.07;
};
const target = (s, course) => s.ride.type==='bus' ? s.ride.index===course.destinationIndex
  : s.line===course.line&&s.ride.index===course.destinationIndex;

export function initialState(courseId=COURSE.id) {
  const course=COURSES[courseId]??COURSE;
  return {point:{t:0,x:CHECKPOINTS.entrance.start.x,z:CHECKPOINTS.entrance.start.z,penalty:0,
    stage:'street',line:course.line,station:course.origin,busIndex:course.startBusIndex??1,ride:null},
    stageAt:0, vehicleAt:0, wall:0, paused:false, pauseWall:0};
}

function snapshot(s) {
  if (!s || typeof s!=='object' || !Object.hasOwn(bounds,s.stage) || !Object.hasOwn(lines,s.line)
      || !lines[s.line].includes(s.station) || !integer(s.busIndex,0,BUS_STOPS.length-1)
      || !range(s.t,0,7200) || !range(s.penalty??0,0,7200)) return false;
  const [x0,x1,z0,z1]=bounds[s.stage];
  if (!range(s.x,x0-.01,x1+.01)||!range(s.z,z0-.01,z1+.01)) return false;
  if (s.stage!=='vehicle') return s.ride===null;
  const r=s.ride;
  return r&&['train','bus'].includes(r.type)&&integer(r.index,0,endIndex(s))
    &&[1,-1].includes(r.direction)&&boolean(r.open)&&boolean(r.bell)&&boolean(r.grip)&&boolean(r.seated);
}

function sample(a,b) {
  const dt=b.t-a.t;
  const penaltyDelta=(b.penalty??0)-(a.penalty??0);
  return identity(a)===identity(b)&&dt>=-.001
    &&penaltyDelta>=0&&penaltyDelta<=60&&penaltyDelta%5===0
    &&Math.hypot(a.x-b.x,a.z-b.z)<=5.4*Math.max(0,dt)+.085;
}

function board(a,b,stageAt,type,direction,index,course) {
  const position=type==='train'?CHECKPOINTS.trainBoard.vehicle:CHECKPOINTS.busStop.vehicle;
  return b.stage==='vehicle'&&sameStops(a,b)&&spawn(b,position.x,position.z)&&b.ride.type===type
    &&b.ride.index===index&&b.ride.direction===direction&&!b.ride.open&&!b.ride.bell
    &&boardingWindow(a,stageAt,type==='bus'?course.busDoorSeconds:course.trainDoorSeconds,course);
}

function transition(a,b,stageAt,course,version) {
  if (!sameTick(a,b)) return false;
  switch (a.stage) {
    case 'street':
      if (course.transport==='train') {
        const entry=CHECKPOINTS.entrance.street, hall=CHECKPOINTS.entrance.hall;
        return b.stage==='hall'&&a.busIndex===1&&sameStops(a,b)&&(version===legacyRules?near(a,-5,-24):a.z<=entry.z+.01&&near(a,entry.x,entry.z,entry.radius))
          &&spawn(b,hall.x,hall.z);
      }
      return course.transport==='bus'&&near(a,CHECKPOINTS.busStop.street.x,CHECKPOINTS.busStop.street.z,CHECKPOINTS.busStop.street.radius)
        &&board(a,b,stageAt,'bus',a.busIndex===BUS_STOPS.length-1?-1:1,a.busIndex,course);
    case 'hall':
      return b.stage==='platform'&&sameStops(a,b)&&(version===legacyRules?near(a,0,1.6):
        Math.abs(a.x)<=CHECKPOINTS.gate.hall.maxX&&a.z<=CHECKPOINTS.gate.hall.maxZ)
        &&spawn(b,CHECKPOINTS.gate.platform.x,CHECKPOINTS.gate.platform.z);
    case 'platform': {
      const index=lines[a.line].indexOf(a.station), direction=a.x<0?-1:1;
      if (b.stage==='vehicle') {
        const boarding=CHECKPOINTS.trainBoard.platform;
        return a.line===course.line&&index<course.destinationIndex&&direction===course.direction
          &&index+direction<lines[a.line].length&&near(a,direction*boarding.x,boarding.z,boarding.radius)
          &&board(a,b,stageAt,'train',direction,index,course);
      }
      const stationExit=CHECKPOINTS.stationExit;
      if (a.station===course.destination) {
        const exitContact=version===RIGHT_EXIT_RULES
          ? a.line===course.line&&insideRightStationExit(a.x,a.z)
          : near(a,stationExit.platform.x,stationExit.platform.z);
        return exitContact&&b.stage==='exit-hall'&&sameStops(a,b)
          &&spawn(b,stationExit.hall.x,stationExit.hall.z);
      }
      if (!near(a,stationExit.platform.x,stationExit.platform.z)) return false;
      if (a.station==='충정로') return b.stage==='hall'&&b.line!==a.line&&b.station===a.station
        &&b.busIndex===a.busIndex&&spawn(b,0,14);
      return a.station==='공덕'&&b.stage==='street'&&sameStops(a,b)&&spawn(b,-5,-20);
    }
    case 'exit-hall':
      return a.station===course.destination&&b.stage==='exit-street'&&sameStops(a,b)
        &&near(a,0,CHECKPOINTS.gate.triggerZ,.9)&&spawn(b,CHECKPOINTS.stationExit.street.x,CHECKPOINTS.stationExit.street.z);
    case 'vehicle': {
      const r=a.ride, bus=r.type==='bus';
      const trainExit=CHECKPOINTS.trainAlight.vehicle;
      const busExit=CHECKPOINTS.busOfficeStart.office;
      if (!r.open||!near(a,0,bus?-10.9:trainExit.z,bus?2.35:trainExit.radius)||(bus&&!r.bell&&r.index!==course.destinationIndex)) return false;
      if (target(a,course)&&r.type==='bus') return b.stage==='office'&&a.line===b.line&&a.station===b.station
        &&b.busIndex===r.index&&spawn(b,busExit.x,busExit.z);
      if (bus) return false;
      return b.stage==='platform'&&b.line===a.line&&b.station===lines[a.line][r.index]&&b.busIndex===a.busIndex&&spawn(b,0,8);
    }
    default: return false;
  }
}

function vehicleChange(a,b,vehicleAt,course) {
  if (a.stage!=='vehicle'||b.stage!=='vehicle'||!sameStops(a,b)||!spawn(b,a.x,a.z)||!sameTick(a,b)
      ||a.ride.type!==b.ride.type||a.ride.open===b.ride.open||a.t-vehicleAt<rideDelay(a,course)-.06) return false;
  const r=a.ride, n=b.ride;
  if (r.open) return n.direction===r.direction&&n.index===r.index&&n.bell===r.bell
    &&!(r.type==='bus'&&r.index===course.destinationIndex);
  const direction=r.index+r.direction<0||r.index+r.direction>endIndex(a) ? -r.direction : r.direction;
  const nextIndex=r.index+direction;
  return n.direction===direction&&n.index===nextIndex
    &&n.bell===(r.type==='bus'&&nextIndex===course.destinationIndex);
}

function bellChange(a,b) {
  if (a.ride?.type!=='bus'||b.ride?.type!=='bus'||!b.ride.bell||!near(a,1.1,-5)
      ||!sameTick(a,b)||!spawn(b,a.x,a.z)) return false;
  return identity({...a,ride:{...a.ride,bell:true}})===identity(b);
}

function cleanPoint({t,x,z,penalty=0,stage,line,station,busIndex,ride}) {
  const cleanRide=ride&&{type:ride.type,index:ride.index,direction:ride.direction,open:ride.open,bell:ride.bell,
    grip:ride.grip,seated:ride.seated};
  return {t,x,z,penalty,stage,line,station,busIndex,ride:cleanRide};
}

// Sample positions and action boundaries are client reports. Server receipt bounds their clock.
export function validateBatch(play, body, receiptMs) {
  const course=COURSES[play.course];
  const state=structuredClone(play.state), events=body.events, wall=body.wall;
  const elapsed=receiptMs-Number(play.start_ms);
  const lastSeen=Number(play.seen_ms);
  let pausedMs=play.paused_ms;
  let pausedAt=play.pause_ms===null ? null : Number(play.pause_ms);
  if (!Array.isArray(events)||events.length<1||events.length>48||!range(wall,state.wall,elapsed+1500)) return {reason:'bad_batch'};
  const checked=[];
  let lastEvent=state.wall;
  for (const event of events) {
    if (!event||!range(event.wall,lastEvent,wall)||wall-event.wall>expiryMs
        ||!snapshot(event.after)||!Object.hasOwn(courses,play.course)) return {reason:'bad_snapshot'};
    const after=cleanPoint(event.after);
    const entry={kind:event.kind,wall:event.wall,after};
    const at=Math.round(Math.max(Number(play.start_ms),lastSeen,receiptMs-(wall-event.wall)));
    const activeMs=at-Number(play.start_ms)-pausedMs-(pausedAt===null?0:at-pausedAt);
    if (Math.abs(after.t*1000-activeMs)>3200) return {reason:'client_clock'};
    if (state.paused&&event.kind!=='resume'&&event.kind!=='sample') return {reason:'paused_action'};

    if (event.kind==='pause'||event.kind==='resume'||event.kind==='sample') {
      if (state.paused ? !still(state.point,after) : !sample(state.point,after)) return {reason:'movement_or_pause'};
      if (event.kind==='pause') {
        if (state.paused) return {reason:'pause_sequence'};
        state.paused=true;
        pausedAt=at;
        state.pauseWall=event.wall;
      } else if (event.kind==='resume') {
        if (!state.paused||pausedAt===null) return {reason:'pause_sequence'};
        pausedMs+=Math.max(0,at-pausedAt);
        pausedAt=null;
        state.paused=false;
      }
    } else {
      const before=event.before;
      if (!snapshot(before)||!sample(state.point,before)) return {reason:'movement'};
      entry.before=cleanPoint(before);
      if (event.kind==='stage') {
        if (!transition(before,after,state.stageAt,course,play.rules)) return {reason:'stage_transition'};
        state.stageAt=after.t;
        if (after.ride) state.vehicleAt=after.t;
      } else if (event.kind==='vehicle') {
        if (!vehicleChange(before,after,state.vehicleAt,course)) return {reason:'vehicle_timing'};
        state.vehicleAt=after.t;
      } else if (event.kind==='bell') {
        if (!bellChange(before,after)) return {reason:'bus_bell'};
      } else return {reason:'unknown_event'};
    }
    checked.push(entry);
    state.point=after;
    lastEvent=event.wall;
  }
  state.wall=wall;
  return {state,pausedMs,pausedAt,checked};
}
