import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { BUS_COURSE, BUS_STOPS, COURSE, COURSES, TRAIN_LINES, RIGHT_EXIT_PATH, RIGHT_EXIT_RULES, RIGHT_STATION_EXIT, STATION_ENTRANCE } from '../dist/journey.js';
import { World } from '../dist/world.js';
import { buildGongdeok } from '../dist/gongdeok-street.js';
import { entranceHeight } from '../dist/transit-scene.js';
import { Group, Matrix4, Raycaster, Vector3 } from '../dist/vendor/three.module.js';
import { start, ranking } from '../server/plays.mjs';
import { initialState, originalExitRules, rules, validateBatch } from '../server/rules.mjs';

test('the single canonical course validates from Gongdeok entrance through Chungjeongno to office', () => {
  assert.deepEqual(Object.keys(COURSES), [COURSE.id,BUS_COURSE.id]);
  assert.equal(TRAIN_LINES[COURSE.line][COURSE.destinationIndex], COURSE.destination);
  let current=initialState();
  const play={course:COURSE.id,rules,start_ms:0,seen_ms:0,paused_ms:0,pause_ms:null,
    state:{...current,wall:0}};

  function emit(kind, after, before) {
    const wall=Math.round(after.t*1000);
    const event={kind,wall,after};
    if(before) event.before=before;
    const result=validateBatch(play,{wall,events:[event]},wall);
    assert.ok(result.state, `${kind} at ${after.stage}/${after.station} t=${after.t} from ${current.point.t}, xy=${after.x},${after.z} rejected: ${result.reason}`);
    current=result.state;
    play.state=result.state;
    play.seen_ms=wall;
  }
  function moveTo(t,x,z) {
    const start={...current.point};
    const count=Math.max(1,Math.ceil(Math.max(Math.abs(x-start.x),Math.abs(z-start.z))/4.5),Math.ceil((t-start.t)/2.5));
    for(let i=1;i<=count;i++) emit('sample',{...start,t:start.t+(t-start.t)*i/count,
      x:start.x+(x-start.x)*i/count,z:start.z+(z-start.z)*i/count});
  }
  function change(data) {
    const before={...current.point};
    emit('stage',{...before,...data},before);
  }
  function vehicle(data) {
    const before={...current.point};
    emit('vehicle',{...before,ride:{...before.ride,...data}},before);
  }

  emit('sample',{...current.point});
  const {entry,descentEnd,turn,exit}=STATION_ENTRANCE;
  moveTo(7.1,entry.x,entry.z-.08);
  change({stage:'entrance'});
  moveTo(9.2,entry.x,descentEnd-.08);
  change({stage:'entrance-corridor'});
  moveTo(9.6,entry.x,turn.z);
  moveTo(10.6,turn.x,turn.z);
  moveTo(12.1,exit.x,exit.z-.08);
  change({stage:'hall',x:0,z:14});
  moveTo(15.1,0,2);
  change({stage:'platform',x:0,z:8});
  moveTo(20.3,4.45,0);
  change({stage:'vehicle',x:0,z:4,ride:{type:'train',index:1,direction:COURSE.direction,
    open:false,bell:false,grip:false,seated:false}});
  moveTo(32.3,0,4);
  vehicle({index:2,open:true});
  moveTo(38.3,0,4);
  vehicle({open:false});
  moveTo(50.3,0,4);
  vehicle({index:COURSE.destinationIndex,open:true});
  moveTo(56,0,-11);
  change({stage:'platform',station:COURSE.destination,x:0,z:8,ride:null});
  moveTo(57.3,RIGHT_EXIT_PATH[1].x,RIGHT_EXIT_PATH[1].z);
  moveTo(63,RIGHT_STATION_EXIT.x,RIGHT_STATION_EXIT.z);
  change({stage:'exit-hall',x:0,z:14});
  moveTo(71,0,2);
  change({stage:'exit-street',x:0,z:34});
  moveTo(89,0,-25.2);

  assert.equal(current.point.stage,'exit-street');
  assert.ok(Math.abs(current.point.z+26)<1.2,'player should reach the finish portal');
});

test('the connected entrance rejects early transitions and points inside the wall', () => {
  const {entry,descentEnd,turn,exit}=STATION_ENTRANCE;
  function check(stage,x,z,next,position={},version=rules) {
    const initial=initialState(), before={...initial.point,stage,x,z};
    const after={...before,stage:next,...position};
    const play={course:COURSE.id,rules:version,start_ms:0,seen_ms:0,paused_ms:0,pause_ms:null,
      state:{...initial,point:before}};
    return validateBatch(play,{wall:0,events:[{kind:'stage',wall:0,before,after}]},0);
  }
  assert.equal(check('street',entry.x,entry.z+.3,'entrance').reason,'bad_snapshot');
  assert.equal(check('street',-4,-32.1,'hall',{x:0,z:14}).reason,'stage_transition');
  assert.ok(check('street',-4,-32.1,'hall',{x:0,z:14},RIGHT_EXIT_RULES).state);
  assert.equal(check('entrance',entry.x,descentEnd+.6,'entrance-corridor').reason,'stage_transition');
  assert.equal(check('entrance-corridor',turn.x,turn.z,'hall',{x:0,z:14}).reason,'stage_transition');
  assert.equal(check('entrance-corridor',entry.x,exit.z,'hall',{x:0,z:14}).reason,'movement');
  assert.ok(check('entrance-corridor',exit.x,exit.z,'hall',{x:0,z:14}).state);
});

test('the 260 course validates from Gongdeok through Mapo Police and Ahyeon Elementary to Chungjeongno and the office', () => {
  assert.deepEqual(BUS_STOPS,['공덕역','마포경찰서','아현초등학교','충정로역']);
  assert.equal(BUS_COURSE.busNumber,'260');
  assert.equal(BUS_COURSE.destinationLabel,'충정로역');
  let current=initialState(BUS_COURSE.id);
  const play={course:BUS_COURSE.id,rules,start_ms:0,seen_ms:0,paused_ms:0,pause_ms:null,
    state:{...current,wall:0}};

  function emit(kind, after, before) {
    const wall=Math.round(after.t*1000);
    const event={kind,wall,after};
    if(before)event.before=before;
    const result=validateBatch(play,{wall,events:[event]},wall);
    assert.ok(result.state,`${kind} at ${after.stage} t=${after.t}, x=${after.x}, z=${after.z} rejected: ${result.reason}`);
    current=result.state;
    play.state=result.state;
    play.seen_ms=wall;
  }
  function moveTo(t,x,z) {
    const start={...current.point};
    const count=Math.max(1,Math.ceil(Math.hypot(x-start.x,z-start.z)/4.5),Math.ceil((t-start.t)/2.5));
    for(let i=1;i<=count;i++)emit('sample',{...start,t:start.t+(t-start.t)*i/count,
      x:start.x+(x-start.x)*i/count,z:start.z+(z-start.z)*i/count});
  }
  function change(data) {
    const before={...current.point};
    emit('stage',{...before,...data},before);
  }
  function vehicle(data) {
    const before={...current.point};
    emit('vehicle',{...before,ride:{...before.ride,...data}},before);
  }

  emit('sample',{...current.point});
  moveTo(13,7,-42);
  moveTo(47,7,-42);
  change({stage:'vehicle',x:0,z:4,ride:{type:'bus',index:BUS_COURSE.startBusIndex,direction:1,
    open:false,bell:false,grip:false,seated:false}});
  for(let index=BUS_COURSE.startBusIndex+1;index<=BUS_COURSE.destinationIndex;index++) {
    moveTo(current.point.t+BUS_COURSE.busTravelSeconds,0,4);
    vehicle({index,open:true,bell:index===BUS_COURSE.destinationIndex});
    if(index===BUS_COURSE.destinationIndex) {
      moveTo(current.point.t+2,1.1,-5);
      const before={...current.point};
      emit('bell',{...before,ride:{...before.ride,bell:true}},before);
      moveTo(current.point.t+2,0,-10.9);
      change({stage:'office',x:0,z:14,busIndex:BUS_COURSE.destinationIndex,ride:null});
      break;
    }
    moveTo(current.point.t+BUS_COURSE.busDoorSeconds,0,4);
    vehicle({open:false});
  }
  moveTo(current.point.t+5,0,-6);
  assert.equal(current.point.stage,'office');
  assert.ok(Math.abs(current.point.z+6)<1.2,'player reaches the office portal after riding the 260');
});

test('the 260 course rejects alighting at the wrong stop and passing Chungjeongno', () => {
  const makeRide=(index,open=true)=>{
    const state=initialState(BUS_COURSE.id);
    state.point={...state.point,t:12,x:0,z:-10.9,stage:'vehicle',ride:{type:'bus',index,direction:1,
      open,bell:true,grip:false,seated:false}};
    state.wall=12000;
    return {course:BUS_COURSE.id,rules,start_ms:0,seen_ms:12000,paused_ms:0,pause_ms:null,state};
  };
  const wrongStop=makeRide(1),before={...wrongStop.state.point};
  const wrong=validateBatch(wrongStop,{wall:12000,events:[{kind:'stage',wall:12000,before,
    after:{...before,stage:'street',x:7,z:-46,ride:null}}]},12000);
  assert.equal(wrong.reason,'stage_transition');

  const destination=makeRide(BUS_COURSE.destinationIndex),atStop={...destination.state.point};
  const missed=validateBatch(destination,{wall:12000,events:[{kind:'vehicle',wall:12000,before:atStop,
    after:{...atStop,ride:{...atStop.ride,open:false}}}]},12000);
  assert.equal(missed.reason,'vehicle_timing');
});

test('collision penalty increases record time without changing player position or stopping movement', () => {
  const current=initialState();
  const play={course:COURSE.id,rules,start_ms:0,seen_ms:0,paused_ms:0,pause_ms:null,
    state:{...current,wall:0}};
  const before={...current.point};
  const penalized={...before,penalty:5};
  const accepted=validateBatch(play,{wall:0,events:[{kind:'sample',wall:0,after:penalized}]},0);
  assert.ok(accepted.state,accepted.reason);
  assert.equal(accepted.state.point.penalty,5);
  assert.equal(accepted.state.point.x,before.x);
  assert.equal(accepted.state.point.z,before.z);

  play.state=accepted.state;
  const forgedSample=validateBatch(play,{wall:0,events:[{kind:'sample',wall:0,
    after:{...penalized,penalty:11}}]},0);
  assert.equal(forgedSample.reason,'movement_or_pause');
});

test('platform transition validates the exact exit area without confusing it with a transfer', () => {
  const transition = ({ x, z, line = COURSE.line, station = COURSE.destination, version = rules, target = 'exit-hall', nextLine = line }) => {
    const current = initialState();
    const before = { ...current.point, stage:'platform', station, line, x, z };
    const after = { ...before, stage:target, x:0, z:14, line:nextLine };
    const play = { course:COURSE.id, rules:version, start_ms:0, seen_ms:0, paused_ms:0, pause_ms:null,
      state:{ ...current, point:before } };
    return validateBatch(play,{wall:0,events:[{kind:'stage',wall:0,before,after}]},0);
  };
  const { x, z, radius } = RIGHT_STATION_EXIT;
  assert.equal(transition({x:0,z}).reason,'stage_transition');
  assert.equal(transition({x:x+radius+.01,z}).reason,'stage_transition');
  assert.equal(transition({x,z,line:'2'}).reason,'stage_transition');
  assert.equal(transition({x,z,station:'애오개'}).reason,'stage_transition');
  assert.ok(transition({x,z}).state);
  assert.ok(transition({x:0,z,version:originalExitRules}).state);
  assert.ok(transition({x:0,z,line:'2',nextLine:'5',target:'hall',version:originalExitRules,station:'충정로'}).reason);
});

test('the imported stair and added connection have continuous floors, walls and overhead clearance', async t => {
  const previous={self:globalThis.self,createImageBitmap:globalThis.createImageBitmap,document:globalThis.document};
  t.after(()=>Object.assign(globalThis,previous));
  globalThis.self=globalThis;
  // Decode the actual GLB geometry. Texture upload and canvas drawing require a browser.
  globalThis.createImageBitmap=async()=>({width:1024,height:1024});
  globalThis.document={createElement:()=>({getContext:()=>({
    fillRect(){},fillText(){},drawImage(){},
    getImageData:()=>({data:[0,0,0,255]}),
    createLinearGradient:()=>({addColorStop(){}}),
  })})};
  const {GLTFLoader}=await import('../dist/hero/vendor/loaders/GLTFLoader.js');
  const bytes=await readFile(new URL('../dist/transit-assets/gongdeok-entrance.glb',import.meta.url));
  const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const world=Object.assign(Object.create(World.prototype),{root:new Group(),entranceActive:true});
  buildGongdeok(world.root,asset,false,true);
  world.buildEntranceConnection();
  world.root.updateMatrixWorld(true);

  const model=world.root.getObjectByName('공덕역 1번 출구');
  for(const name of ['Glass','Auto_Steps_low','Handler_Center_low']) assert.ok(model.getObjectByName(name));
  for(const name of ['Floor','Floor_Underground','Wall']) assert.equal(model.getObjectByName(name),undefined);
  assert.ok(asset.scene.getObjectByName('Floor'));

  const e=STATION_ENTRANCE;
  const ray=(x,y,z,dx,dy,dz)=>new Raycaster(new Vector3(x,y,z),new Vector3(dx,dy,dz)).intersectObject(world.root,true)[0];
  assert.ok(Math.abs(ray(-2.5,1,-26,0,-1,0).point.y)<.025,'adjacent pavement is intact');
  for(const z of [-25.8,-27.7,-29.15,-30.3]) {
    const x=e.entry.x, feet=entranceHeight(x,z);
    const tread=ray(x,feet+.55,z,0,-1,0);
    assert.ok(tread&&Math.abs(tread.point.y-feet)<.17,`feet and step align at ${z}`);
  }
  assert.ok(ray(e.entry.x,.04,-26,0,-1,0).point.y<-.8,'no street slab over the stair');
  for(const [x,z] of [[e.landing.x,e.landing.z],[e.turn.x,e.turn.z],[e.exit.x,e.exit.z]]) {
    assert.ok(Math.abs(ray(x,-2,z,0,-1,0).point.y-e.landing.y)<.006);
    assert.equal(ray(x,-2,z,0,1,0).point.y.toFixed(3),e.ceiling.toFixed(3));
    world.hero={position:new Vector3(x,e.landing.y,z)};
    const camera=world.constrainEntranceCamera(new Vector3(x,1,z+4));
    assert.ok(camera.y<e.ceiling-.17&&camera.distanceTo(world.hero.position)>1);
  }
  assert.ok(Math.abs(ray(e.landing.x,-2,e.landing.z,0,0,-1).point.z-e.bend)<.02,
    'the front wall closes the end of the shaft');
  assert.ok(Math.abs(ray(e.turn.x,-2,e.turn.z,0,0,-1).point.z-e.end)<.02,
    'the right passage remains open until the end wall');
});

test('right-side guide uses the safe floor, retains pillars, and is removed on scene cleanup', t => {
  const oldDocument=globalThis.document;
  t.after(()=>{globalThis.document=oldDocument;});
  globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
  const world=Object.assign(Object.create(World.prototype),{
    root:new Group(),scene:new Group(),spots:[],npcs:[],platformTrains:[],mode:'platform',
    people(_count, area){this.crowdLimit=area.offset-area.z/2;},
  });
  world.scene.add(world.root);
  world.platform({station:COURSE.destination,line:COURSE.line,rightExit:true});
  const {x,z}=RIGHT_STATION_EXIT;
  const portal=world.root.getObjectByName('출구로 이동');
  assert.equal(portal.position.x,x);
  assert.equal(portal.position.z,z);
  assert.ok(portal.position.z+RIGHT_STATION_EXIT.radius<world.crowdLimit);
  assert.ok(portal.position.x+RIGHT_STATION_EXIT.radius<4.45);
  assert.deepEqual(world.spots,[]);
  const trail=world.root.getObjectByName('출구 바닥 화살표');
  const pillars=world.root.children.filter(object=>object.geometry?.parameters?.height===6);
  assert.equal(pillars.length,5);
  assert.ok(trail.count>10);
  const matrix=new Matrix4();
  for(let i=0;i<trail.count;i++){
    trail.getMatrixAt(i,matrix);
    const p=new Vector3().setFromMatrixPosition(matrix);
    assert.ok(p.x>=0 && p.x<4.45 && p.y>.3);
    assert.ok(pillars.every(pillar=>Math.hypot(pillar.position.x-p.x,pillar.position.z-p.z)>.9));
  }
  world.clear();
  assert.equal(world.scene.getObjectByName('출구 바닥 화살표'),undefined);
  world.platform({station:COURSE.origin,line:COURSE.line});
  assert.ok(world.spots.some(spot=>spot.id==='train-board'));
  assert.equal(world.root.getObjectByName('출구로 이동'),undefined);
});

test('play compatibility and server-selected official ranking rules', async () => {
  const ctx={user:{id:'local-player'}};
  const db={query:async()=>({rows:[]})};
  for(const [course,capabilities,expected] of [
    [COURSE.id,{entranceRules:rules,exitRules:RIGHT_EXIT_RULES},rules],
    [COURSE.id,{exitRules:RIGHT_EXIT_RULES},RIGHT_EXIT_RULES],
    [COURSE.id,{},originalExitRules],
    [BUS_COURSE.id,{entranceRules:rules},originalExitRules],
  ]) assert.equal((await start(db,ctx,{course,...capabilities},0)).body.rules,expected);
  for(const [course,requested,expected] of [
    [COURSE.id,'',rules], [COURSE.id,originalExitRules,rules], [BUS_COURSE.id,rules,originalExitRules],
  ]) {
    const url=new URL('http://127.0.0.1/?'+new URLSearchParams({course,rules:requested}));
    const rankDb={query:async(_sql,args)=>{
      assert.deepEqual(args,[course,expected,ctx.user.id,0]);
      return {rows:[]};
    }};
    assert.deepEqual((await ranking(rankDb,ctx,url)).body,{rows:[],next:false,page:1,course});
  }
});
