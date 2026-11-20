import { MathUtils, Quaternion, Vector3 } from '../vendor/three.module.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';

// These are the existing game speeds. Travel itself remains outside the animator.
export const movementSpeed = Object.freeze({walk:3.6, run:5.4});
const tau = 2*Math.PI;
const mix = MathUtils.lerp;
const clamp = MathUtils.clamp;
const smooth = t => t*t*(3-2*t);
const settle = (value,target,dt,rate) => mix(value,target,1-Math.exp(-rate*dt));
const forward = new Vector3(0,0,-1);
const axisX = new Vector3(1,0,0);
const WALK = {stride:1.72, contact:.51, clearance:.105};
const RUN = {stride:2.36, contact:.38, clearance:.22};

export async function loadCommuter() {
  const {scene} = await new GLTFLoader().loadAsync(new URL('./commuter.glb',import.meta.url).href);
  scene.traverse(node => {
    if (node.isSkinnedMesh) {
      node.castShadow = true;
      node.frustumCulled = false;
    }
  });
  return scene;
}

export class CommuterMotion {
  constructor(model) {
    this.model = model;
    const bones = new Map();
    model.traverse(node => { if (node.isBone) bones.set(node.name.replaceAll('.',''),node); });
    const bone = name => {
      const result = bones.get(name);
      if (!result) throw new Error('Missing commuter bone: '+name);
      return result;
    };
    this.hips = bone('Pelvis');
    this.spine = bone('Spine');
    this.chest = bone('Chest');
    this.head = bone('Head');
    this.limbs = ['L','R'].map(side => {
      const limb = {
        thigh:bone('Thigh'+side), shin:bone('Shin'+side), foot:bone('Foot'+side),
        arm:bone('UpperArm'+side), forearm:bone('Forearm'+side), hand:bone('Hand'+side),
      };
      limb.thighRest = limb.shin.position.clone().normalize();
      limb.shinRest = limb.foot.position.clone().normalize();
      return limb;
    });
    this.restY = this.hips.position.y;
    this.inverse = new Quaternion();
    this.scratch = Array.from({length:8},() => new Vector3());
    this.reset();
  }

  reset(yaw=0) {
    this.phase=.18;
    this.gait=0;
    this.runMix=0;
    this.idleTime=0;
    this.seatMix=0;
    this.gripMix=0;
    this.yaw=yaw;
    this.state='Idle';
    this.release=0;
    this.model.rotation.y=yaw;
    this.pose();
  }

  advance(dt,{distance=0,speed=0,yaw=this.yaw,running=false,seated=false,grip=false}={}) {
    if (!(dt>0)) return;
    const delta = Math.atan2(Math.sin(yaw-this.yaw),Math.cos(yaw-this.yaw));
    this.yaw += clamp(delta,-10*dt,10*dt);
    this.model.rotation.y=this.yaw;
    const walking=distance>1e-5&&!seated&&!grip;
    const brisk=running&&walking;
    this.runMix=settle(this.runMix,brisk?1:0,dt,9);
    const turning=Math.abs(delta)>.19;
    this.seatMix=settle(this.seatMix,seated?1:0,dt,14);
    this.gripMix=settle(this.gripMix,grip?1:0,dt,15);
    const gaitTarget=walking ? (turning ? .57 : 1)*clamp(speed/1.4,.25,1) : 0;
    this.gait=settle(this.gait,gaitTarget,dt,walking?15:16);
    if (walking) {
      const stride=mix(WALK.stride,RUN.stride,this.runMix);
      this.phase=(this.phase+distance/stride)%1;
      this.release=.26;
    } else {
      this.release=Math.max(0,this.release-dt);
      if (seated||grip) this.release=0;
    }
    this.state=seated?'Seat':grip?'Grip':walking?(turning?'Turn':brisk?'Run':'Walk'):this.release?'Stop':'Idle';
    this.idleTime+=dt;
    this.pose();
  }

  pose() {
    const {phase,gait,runMix,seatMix,gripMix}=this;
    const stance=mix(WALK.contact,RUN.contact,runMix);
    const stride=mix(WALK.stride,RUN.stride,runMix);
    const reach=stride*stance/2;
    const travelAt = t => t<stance ? mix(-reach,reach,t/stance) :
      mix(reach,-reach,smooth((t-stance)/(1-stance)));
    const excursion = Math.max(Math.abs(travelAt(phase)),Math.abs(travelAt((phase+.5)%1)))*gait;
    // Lower the pelvis only as much as the current stride needs for ground contact.
    const legReach=.756;
    const standHeight=.767;
    const dip=gait*mix(.012,.036,runMix) +
      Math.max(0,standHeight-Math.sqrt(legReach*legReach-excursion*excursion))*gait +
      seatMix*.365;
    this.hips.position.y=this.restY-dip;
    this.spine.rotation.x=-gait*mix(.045,.19,runMix)-seatMix*.07;
    this.chest.rotation.y=Math.sin(phase*tau)*gait*mix(.07,.10,runMix);
    this.chest.rotation.z=Math.cos(phase*tau)*gait*.022;
    this.chest.rotation.x=Math.sin(this.idleTime*1.9)*.012*(1-gait);
    this.head.rotation.x=-(this.spine.rotation.x+this.chest.rotation.x)*.72;
    for (const [index,limb] of this.limbs.entries()) {
      const t=(phase+index*.5)%1;
      const swing=t<stance?0:(t-stance)/(1-stance);
      // During stance the foot travels backward at character speed.
      const lift=mix(WALK.clearance,RUN.clearance,runMix)*Math.sin(Math.PI*swing)**1.55;
      const side=index===0?-1:1;
      const footX=side*(.096+seatMix*.041);
      const footY=.115+lift*gait-.022*seatMix;
      const footZ=.012+travelAt(t)*gait-.33*seatMix;
      const pitch=(t>=stance ? Math.sin(tau*swing)*.20 : 0)*gait;
      this.solveLeg(limb,footX,footY,footZ,pitch);
      const armCycle=Math.cos(t*tau);
      limb.arm.rotation.set(
        mix(armCycle*gait*mix(.37,.61,runMix)-gait*.10,-1.68,gripMix),
        side*.055, -side*(.035+gait*.045)
      );
      limb.forearm.rotation.set(
        mix(.06+gait*mix(.19,.86,runMix)*(1+.35*armCycle),.78,gripMix),
        0, side*.07
      );
      limb.hand.rotation.x=-.10*gait;
    }
  }

  solveLeg(limb,x,y,z,pitch) {
    const [hip,target,direction,bend,knee,upper,lower,footAxis]=this.scratch;
    hip.copy(this.hips.position).add(limb.thigh.position);
    target.set(x,y,z);
    direction.subVectors(target,hip);
    const a=limb.shin.position.length(), b=limb.foot.position.length();
    const d=clamp(direction.length(),.08,a+b-.002);
    direction.normalize();
    const along=(a*a+d*d-b*b)/(2*d);
    bend.copy(forward).addScaledVector(direction,-forward.dot(direction)).normalize();
    knee.copy(hip).addScaledVector(direction,along).addScaledVector(bend,Math.sqrt(Math.max(0,a*a-along*along)));
    target.copy(hip).addScaledVector(direction,d);
    upper.subVectors(knee,hip).normalize();
    limb.thigh.quaternion.setFromUnitVectors(limb.thighRest,upper);
    lower.subVectors(target,knee).normalize();
    footAxis.copy(lower);
    this.inverse.copy(limb.thigh.quaternion).invert();
    footAxis.applyQuaternion(this.inverse);
    limb.shin.quaternion.setFromUnitVectors(limb.shinRest,footAxis);
    this.inverse.copy(limb.thigh.quaternion).multiply(limb.shin.quaternion).invert();
    limb.foot.quaternion.setFromAxisAngle(axisX,pitch).premultiply(this.inverse);
  }
}
