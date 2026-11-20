import assert from 'node:assert/strict';
import { initialState } from '../server/rules.mjs';

export async function journey(client,setTime,start,course,{pause=false, secondRecord=false}={}) {
  const {body:{id},status}=await client('play-start',{course});
  assert.equal(status,201);
  let seq=0, point=initialState().point, elapsed=0, paused=0;
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
  const board=(type,index)=>stage({stage:'vehicle',x:0,z:4,ride:{type,index,direction:1,open:false,bell:false,grip:false,seated:false}});

  await batch();
  if (course.endsWith('rail')) {
    await tick(8,-5,-23);
    await stage({stage:'hall',x:0,z:14});
    await tick(11,0,2);
    await stage({stage:'platform',x:0,z:8});
    await tick(16.2,4.45,0);
    await board('train',1);
    if (pause) {
      await batch('play-progress','pause');
      paused+=2;
      await batch();
      paused+=3;
      await batch('play-progress','resume');
    }
    await tick(69.2,0,-11);
    await vehicle({index:2,open:true});
    await tick(75.2);
    await vehicle({open:false});
    await tick(128.2);
    await vehicle({index:3,open:true});
    await stage({stage:'platform',station:'충정로',x:0,z:8,ride:null});
    await tick(132,0,24);
    await stage({stage:'hall',line:'2',x:0,z:14});
    await tick(135,0,2);
    await stage({stage:'platform',x:0,z:8});
    await tick(140.2,4.45,0);
    await board('train',1);
    await tick(193.2,0,-11);
    await vehicle({index:2,open:true});
  } else {
    await tick(13,7,-42);
    await tick(47);
    await board('bus',1);
    for (let i=2;i<=16;i++) {
      await tick(elapsed+13,0,i===16?-5:4);
      await vehicle({index:i,open:true});
      if (i===16) {
        const before=point;
        point={...point,ride:{...point.ride,bell:true}};
        await batch('play-progress','bell',before);
        await tick(elapsed+2,0,-10.9);
      } else {
        await tick(elapsed+5);
        await vehicle({open:false});
      }
    }
  }
  await stage({stage:'office',x:0,z:34,ride:null});
  await tick(elapsed+12,0,-25.2);
  if (secondRecord) await tick(elapsed+1,0,-26);
  const result=await batch('play-finish');
  assert.equal(result.body.tenths,Math.round(elapsed*10));
  return {result,id,seq,point,wall:wall()};
}
