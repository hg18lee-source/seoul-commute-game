import assert from 'node:assert/strict';
import { initialState } from '../server/rules.mjs';
import { BUS_COURSE, COURSE, CONNECTED_ENTRANCE_RULES, RIGHT_EXIT_RULES, RIGHT_EXIT_PATH, STATION_ENTRANCE } from '../dist/journey.js';

export async function journey(client,setTime,start,course,{pause=false, secondRecord=false, collisions=false, cancelAfterCollisions=false}={}) {
  const {body:{id},status}=await client('play-start',{course,exitRules:RIGHT_EXIT_RULES,entranceRules:CONNECTED_ENTRANCE_RULES});
  assert.equal(status,201);
  let seq=0, point=initialState(course).point, elapsed=0, paused=0;
  const wall=()=>Math.round((elapsed+paused)*1000);
  async function batch(message='play-progress',kind='sample',before) {
    setTime(start+wall());
    const result=await client(message,{id,seq:++seq,wall:wall(),events:[{kind,wall:wall(),before,after:point}]});
    assert.equal(result.status,message==='play-finish'?201:200,JSON.stringify(result.body));
    return result;
  }
  async function tick(t,x=point.x,z=point.z) {
    const from={...point};
    const duration=t-elapsed;
    const count=Math.ceil(duration/2.5);
    for (let i=1;i<=count;i++) {
      const f=i/count;
      elapsed=from.t+duration*f;
      point={...point,t:elapsed,x:from.x+(x-from.x)*f,z:from.z+(z-from.z)*f};
      await batch();
    }
  }
  async function stage(data) {
    const before=point;
    point={...point,...data};
    await batch('play-progress','stage',before);
  }
  async function vehicle(change) {
    const before=point;
    point={...point,ride:{...point.ride,...change}};
    await batch('play-progress','vehicle',before);
  }
  async function penalty(seconds) {
    point={...point,penalty:(point.penalty??0)+seconds};
    await batch();
  }
  const board=(type,index)=>stage({stage:'vehicle',x:0,z:4,ride:{type,index,direction:1,open:false,bell:false,grip:false,seated:false}});

  await batch();
  if (course===COURSE.id) {
    const {entry,descentEnd,turn,exit}=STATION_ENTRANCE;
    await tick(7.1,entry.x,entry.z-.08);
    await stage({stage:'entrance'});
    await tick(9.2,entry.x,descentEnd-.08);
    await stage({stage:'entrance-corridor'});
    await tick(9.6,entry.x,turn.z);
    await tick(10.6,turn.x,turn.z);
    await tick(12.1,exit.x,exit.z-.08);
    if (collisions) { await penalty(5); await penalty(10); }
    if (cancelAfterCollisions) {
      const result=await client('play-cancel',{id});
      assert.equal(result.status,200,JSON.stringify(result.body));
      return {result,id,point};
    }
    await stage({stage:'hall',x:0,z:14});
    await tick(15.1,0,2);
    await stage({stage:'platform',x:0,z:8});
    await tick(20.3,4.45,0);
    await board('train',1);
    if (pause) {
      await batch('play-progress','pause');
      paused+=2;
      await batch();
      paused+=3;
      await batch('play-progress','resume');
    }
    await tick(32.3,0,-11);
    await vehicle({index:2,open:true});
    await tick(38.3);
    await vehicle({open:false});
    await tick(50.3,0,4);
    await vehicle({index:COURSE.destinationIndex,open:true});
    await tick(56,0,-11);
    await stage({stage:'platform',station:COURSE.destination,x:0,z:8,ride:null});
    await tick(57.3,RIGHT_EXIT_PATH[1].x,RIGHT_EXIT_PATH[1].z);
    await tick(63,RIGHT_EXIT_PATH[2].x,RIGHT_EXIT_PATH[2].z);
    await stage({stage:'exit-hall',x:0,z:14});
    await tick(71,0,2);
    await stage({stage:'exit-street',x:0,z:34});
  } else if(course===BUS_COURSE.id) {
    await tick(13,7,-42);
    await tick(47);
    await board('bus',BUS_COURSE.startBusIndex);
    for (let i=BUS_COURSE.startBusIndex+1;i<=BUS_COURSE.destinationIndex;i++) {
      await tick(elapsed+BUS_COURSE.busTravelSeconds,0,4);
      await vehicle({index:i,open:true,bell:i===BUS_COURSE.destinationIndex});
      if (i===BUS_COURSE.destinationIndex) {
        await tick(elapsed+2,1.1,-5);
        const before=point;
        point={...point,ride:{...point.ride,bell:true}};
        await batch('play-progress','bell',before);
        await tick(elapsed+2,0,-10.9);
        await stage({stage:'office',x:0,z:14,busIndex:BUS_COURSE.destinationIndex,ride:null});
        break;
      }
      await tick(elapsed+BUS_COURSE.busDoorSeconds);
      await vehicle({open:false});
    }
  } else {
    throw new Error('Unknown journey course: '+course);
  }
  const finishPoint=course===COURSE.id?{x:0,z:-25.2}:BUS_COURSE.finishPoint;
  if(course===COURSE.id) await tick(elapsed+12,finishPoint.x,finishPoint.z);
  else await tick(elapsed+5,finishPoint.x,finishPoint.z);
  if (secondRecord) await tick(elapsed+1,0,finishPoint.z);
  const result=await batch('play-finish');
  assert.equal(result.body.tenths,Math.round(elapsed*10)+Math.round((point.penalty??0)*10));
  return {result,id,seq,point,wall:wall()};
}
