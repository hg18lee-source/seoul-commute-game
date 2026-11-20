export const rules = 'gongdeok-movement-v2-online-1';
export const courses = {
  'gongdeok-cityhall-rail': {label:'공덕 → 시청 · 5·2호선', transport:'train'},
  'gongdeok-cityhall-bus': {label:'공덕 → 시청 · 7016번', transport:'bus'},
};
export const expiryMs = 10000;
const lines = {5:['마포','공덕','애오개','충정로','서대문'],2:['아현','충정로','시청','을지로입구']};
const bounds = {street:[-10,10,-48,32],hall:[-9,9,1,19],platform:[-4.45,4.45,-25,25],
  vehicle:[-1.9,1.9,-11,11],office:[-9,9,-28,34]};
const near = (s,x,z,r=2.35) => Math.hypot(s.x-x,s.z-z)<r+.015;
const close = (a,b) => Math.abs(a-b)<.012;
const spawn = (s,x,z) => close(s.x,x)&&close(s.z,z);
const range = (n,a,b) => Number.isFinite(n)&&n>=a&&n<=b;
const integer = (n,a,b) => Number.isInteger(n)&&range(n,a,b);
const boolean = n => typeof n==='boolean';
const trip = s => s.ride ? [s.ride.type,s.ride.index,s.ride.direction,s.ride.open,s.ride.bell] : null;
const identity = s => JSON.stringify([s.stage,s.line,s.station,s.busIndex,trip(s)]);
const still = (a,b) => identity(a)===identity(b)&&close(a.x,b.x)&&close(a.z,b.z)&&close(a.hp,b.hp)&&close(a.t,b.t)
  &&a.ride?.seated===b.ride?.seated&&a.ride?.grip===b.ride?.grip;
const sameTick = (a,b) => close(a.t,b.t)&&close(a.hp,b.hp);
const sameStops = (a,b) => a.line===b.line&&a.station===b.station&&a.busIndex===b.busIndex;
const endIndex = s => s.ride.type==='bus' ? 17 : lines[s.line].length-1;
const rideDelay = s => s.ride.type==='bus' ? (s.ride.open?5:13) : (s.ride.open?6:53);
const boardingWindow = (s, stageAt, open) => ((s.t-stageAt+(open===5?42:48)-5)%(open===5?42:48))<open+.07;
const target = s => s.ride.type==='bus' ? s.ride.index===16 : lines[s.line][s.ride.index]==='시청';

export function initialState() {
  return {point:{t:0,x:-5,z:15,hp:100,stage:'street',line:'5',station:'공덕',busIndex:1,ride:null},
    stageAt:0, vehicleAt:0, wall:0, paused:false, pauseWall:0};
}

function snapshot(s) {
  if (!s || typeof s!=='object' || !Object.hasOwn(bounds,s.stage) || !Object.hasOwn(lines,s.line)
      || !lines[s.line].includes(s.station) || !integer(s.busIndex,0,17)
      || !range(s.t,0,7200) || !range(s.hp,0,100)) return false;
  const [x0,x1,z0,z1]=bounds[s.stage];
  if (!range(s.x,x0-.01,x1+.01)||!range(s.z,z0-.01,z1+.01)) return false;
  if (s.stage!=='vehicle') return s.ride===null;
  const r=s.ride;
  return r&&['train','bus'].includes(r.type)&&integer(r.index,0,endIndex(s))
    &&[1,-1].includes(r.direction)&&boolean(r.open)&&boolean(r.bell)&&boolean(r.grip)&&boolean(r.seated);
}

function sample(a,b) {
  const dt=b.t-a.t;
  return identity(a)===identity(b)&&dt>=-.001
    &&Math.hypot(a.x-b.x,a.z-b.z)<=5.4*Math.max(0,dt)+.085
    &&b.hp<=a.hp+.001&&(a.hp>0||b.hp===0);
}

function board(a,b,stageAt,type,direction,index) {
  return b.stage==='vehicle'&&sameStops(a,b)&&spawn(b,0,4)&&b.ride.type===type
    &&b.ride.index===index&&b.ride.direction===direction&&!b.ride.open&&!b.ride.bell
    &&boardingWindow(a,stageAt,type==='bus'?5:6);
}

function transition(a,b,stageAt,transport) {
  if (a.hp<=0||!sameTick(a,b)) return false;
  switch (a.stage) {
    case 'street':
      if (transport==='train') {
        return b.stage==='hall'&&a.busIndex===1&&sameStops(a,b)&&near(a,-5,-24)&&spawn(b,0,14);
      }
      return near(a,7,-42)&&board(a,b,stageAt,'bus',a.busIndex===17?-1:1,a.busIndex);
    case 'hall':
      return b.stage==='platform'&&sameStops(a,b)&&near(a,0,1.6)&&spawn(b,0,8);
    case 'platform': {
      const index=lines[a.line].indexOf(a.station), direction=a.x<0?-1:1;
      if (b.stage==='vehicle') {
        return index+direction>=0&&index+direction<lines[a.line].length&&near(a,direction*4.45,0,.85)
          &&board(a,b,stageAt,'train',direction,index);
      }
      if (!near(a,0,24)) return false;
      if (a.station==='충정로') return b.stage==='hall'&&b.line!==a.line&&b.station===a.station
        &&b.busIndex===a.busIndex&&spawn(b,0,14);
      return a.station==='공덕'&&b.stage==='street'&&sameStops(a,b)&&spawn(b,-5,-20);
    }
    case 'vehicle': {
      const r=a.ride, bus=r.type==='bus';
      if (!r.open||!near(a,0,bus?-10.9:-11,bus?2.35:.85)||(bus&&!r.bell&&r.index!==17)) return false;
      if (target(a)) return b.stage==='office'&&sameStops(a,b)&&spawn(b,0,34);
      if (bus) return b.stage==='street'&&a.line===b.line&&a.station===b.station&&b.busIndex===r.index&&spawn(b,7,-38);
      return b.stage==='platform'&&b.line===a.line&&b.station===lines[a.line][r.index]&&b.busIndex===a.busIndex&&spawn(b,0,8);
    }
    default: return false;
  }
}

function vehicleChange(a,b,vehicleAt) {
  if (a.stage!=='vehicle'||b.stage!=='vehicle'||!sameStops(a,b)||!spawn(b,a.x,a.z)||!sameTick(a,b)
      ||a.ride.type!==b.ride.type||a.ride.open===b.ride.open||a.t-vehicleAt<rideDelay(a)-.06) return false;
  const r=a.ride, n=b.ride;
  if (r.open) return n.direction===r.direction&&n.index===r.index&&n.bell===(r.type==='bus'&&r.index===17);
  const direction=r.index+r.direction<0||r.index+r.direction>endIndex(a) ? -r.direction : r.direction;
  return n.direction===direction&&n.index===r.index+direction&&n.bell===r.bell;
}

function bellChange(a,b) {
  if (a.ride?.type!=='bus'||b.ride?.type!=='bus'||!b.ride.bell||!near(a,1.1,-5)
      ||!sameTick(a,b)||!spawn(b,a.x,a.z)) return false;
  return identity({...a,ride:{...a.ride,bell:true}})===identity(b);
}

function cleanPoint({t,x,z,hp,stage,line,station,busIndex,ride}) {
  const cleanRide=ride&&{type:ride.type,index:ride.index,direction:ride.direction,open:ride.open,bell:ride.bell,
    grip:ride.grip,seated:ride.seated};
  return {t,x,z,hp,stage,line,station,busIndex,ride:cleanRide};
}

// Sample positions and action boundaries are client reports. Server receipt bounds their clock.
export function validateBatch(play, body, receiptMs) {
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
        if (!transition(before,after,state.stageAt,courses[play.course].transport)) return {reason:'stage_transition'};
        state.stageAt=after.t;
        if (after.ride) state.vehicleAt=after.t;
      } else if (event.kind==='vehicle') {
        if (!vehicleChange(before,after,state.vehicleAt)) return {reason:'vehicle_timing'};
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
