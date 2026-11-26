import * as T from '../dist/vendor/three.module.js';

const rand=(seed=1)=>()=>((seed=Math.imul(1664525,seed)+1013904223>>>0)/4294967296);
const facade=8.8;
const stairShift=5.4;
const axisY=new T.Vector3(0,1,0);
const unit=new T.BoxGeometry(1,1,1);
const shadeColors=[0x5b7730,0x76953b,0x386a2a,0x5e8731,0x91a64a];

function canvas(w,h) {
  const c=document.createElement('canvas');
  c.width=w;c.height=h;
  return [c,c.getContext('2d')];
}
function texture(c) {
  const tex=new T.CanvasTexture(c);
  tex.colorSpace=T.SRGBColorSpace;
  tex.anisotropy=4;
  return tex;
}

function surface(type) {
  const [c,g]=canvas(512,512), r=rand(142+type.length);
  if(type==='paving') {
    const ys=[0,64,128,192,256,320,384,448,512];
    for(let j=0;j<8;j++){
      for(let x=-2;x<6;x++) {
        const l=157+Math.floor(r()*27), start=x*128+(j%2)*64;
        g.fillStyle=`rgb(${l},${l+2},${l+2})`;
        g.fillRect(start,ys[j],128,ys[j+1]-ys[j]);
        g.fillStyle='#75797b';
        g.fillRect(start,ys[j],128,2);
        g.fillRect(start,ys[j],2,ys[j+1]-ys[j]);
        g.fillStyle='#d4d5d4';
        g.fillRect(start+3,ys[j]+2,125,1);
      }
    }
  } else {
    g.fillStyle=type==='road'?'#494b4e':type==='granite'?'#b5b5ac':'#bebcb2';
    g.fillRect(0,0,512,512);
  }
  const pixels=g.getImageData(0,0,512,512);
  for(let i=0;i<pixels.data.length;i+=4){
    const noise=(r()-.5)*(type==='road'?30:15);
    for(let ch=0;ch<3;ch++) pixels.data[i+ch]+=noise;
  }
  g.putImageData(pixels,0,0);
  for(let i=0;i<720;i++){
    g.fillStyle=i%2?'rgba(221,217,208,.16)':'rgba(47,43,36,.14)';
    g.fillRect(r()*512,r()*512,.7+r()*2,.6+r()*1.8);
  }
  const tex=texture(c);
  tex.wrapS=tex.wrapT=T.RepeatWrapping;
  return tex;
}

function environment(renderer) {
  const [c,g]=canvas(512,256);
  const grad=g.createLinearGradient(0,0,0,256);
  grad.addColorStop(0,'#4f82bf');grad.addColorStop(.48,'#c1d8eb');
  grad.addColorStop(.52,'#bbb9a9');grad.addColorStop(1,'#545353');
  g.fillStyle=grad;g.fillRect(0,0,512,256);
  const r=rand(15);
  for(let i=0;i<25;i++){
    const w=6+r()*19,h=9+r()*30,x=i*21;
    g.fillStyle=['#757e83','#b5b5ad','#8a989b'][i%3];
    g.fillRect(x,135-h,w,h);
    g.fillStyle='#bac6c9';
    for(let y=138-h;y<132;y+=5)g.fillRect(x+2,y,w*.77,2);
  }
  const map=texture(c);
  map.mapping=T.EquirectangularReflectionMapping;
  const pmrem=new T.PMREMGenerator(renderer);
  const target=pmrem.fromEquirectangular(map);
  map.dispose();pmrem.dispose();
  return target;
}

function label(group,text,sub,x,y,z,w,h,angle,color) {
  const [c,g]=canvas(512,128);
  g.fillStyle=color;g.fillRect(0,0,512,128);
  g.fillStyle='#f7f4e8';g.textAlign='center';g.textBaseline='middle';
  g.font='700 65px "Malgun Gothic",sans-serif';
  g.fillText(text,256,sub?51:64,490);
  if(sub){
    g.font='500 27px "Malgun Gothic",sans-serif';
    g.fillText(sub,256,101,480);
  }
  const obj=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:texture(c)}));
  obj.position.set(x,y,z);obj.rotation.y=angle;group.add(obj);
}

export function buildStreet(renderer,scene) {
  const simplified=new Set();
  const root=new T.Group();
  scene.add(root);
  scene.background=new T.Color(0x7eb0e3);
  scene.fog=new T.Fog(0xa9c1d6,80,174);
  const env=environment(renderer);
  scene.environment=env.texture;
  scene.environmentIntensity=.59;
  const hemi=new T.HemisphereLight(0xe4eeff,0x8c8270,1.71);
  const sun=new T.DirectionalLight(0xfff2da,3.05);
  sun.position.set(-25,35,-52);
  sun.target.position.set(2,0,-12);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-32,right:30,top:34,bottom:-33,near:.3,far:111});
  sun.shadow.autoUpdate=false;
  sun.shadow.needsUpdate=true;
  sun.shadow.normalBias=.030;sun.shadow.bias=-.0002;
  scene.add(hemi,sun,sun.target,new T.AmbientLight(0xf4ecdf,.24));

  const make=(name,color,settings={})=>new T.MeshStandardMaterial({name,color,roughness:.82,...settings});
  const matte=(name,color)=>new T.MeshLambertMaterial({name,color});
  const bump=surface('granite');
  bump.colorSpace=T.NoColorSpace;
  bump.repeat.set(22,170);
  bump.anisotropy=2;
  const mats={
    asphalt:make('아스팔트',0xa2a4a7,{map:surface('road'),roughness:.98}),
    paving:make('보도 석판',0xc4c8cb,{map:surface('paving'),bumpMap:bump,bumpScale:.021,roughness:.93}),
    granite:make('화강석',0xbfc4c6,{map:surface('granite'),roughness:.83}),
    concrete:make('콘크리트',0xb9b4a5,{map:surface('concrete'),roughness:.88}),
    pale:matte('밝은 패널',0xd5d8d7), cream:matte('백색 석판',0xd0c4af),
    slate:matte('흑회색 석판',0x3f4749), gray:matte('회색 패널',0x858e91),
    grayBlue:matte('청회색 패널',0x707f87), brick:matte('적갈색 외장',0xa66e56),
    dark:matte('깊은 창 안쪽',0x212a2e), wood:make('목재',0x85664e,{roughness:.78}),
    metal:make('스테인리스',0x7d898d,{roughness:.30,metalness:.74}),
    black:make('도장 프레임',0x243031,{roughness:.55,metalness:.32}),
    glass:make('상점 외부 유리',0x668b98,{roughness:.23,metalness:.35,transparent:true,opacity:.47,depthWrite:false}),
    blueWindow:make('커튼월',0x547483,{roughness:.21,metalness:.51}),
    railGlass:make('난간 유리',0x71a2a9,{roughness:.23,metalness:.1,transparent:true,opacity:.21,depthWrite:false}),
    paint:make('차선 도색',0xecebe3,{roughness:.96}), yellow:make('황색 도색',0xe0b329),
    tactile:matte('점자블록',0xc49b30), dots:matte('돌기',0xe0ba43),
    orange:make('주황 탄성봉',0xd47633), blue:make('청색 간판 프레임',0x21669c),
    lamp:make('점포 조명',0xf5e8bf,{emissive:0xcda568,emissiveIntensity:.55}),
    bark:matte('수피',0x65533d), soil:matte('가로수 흙',0x616050),
    tyre:make('타이어',0x26272a,{roughness:.96}), red:make('미등/노면 표지',0xaa3432),
    carWhite:make('차체 백색',0xd9e0e4,{roughness:.29,metalness:.32}),
    carBlue:make('차체 청색',0x31566b,{roughness:.33,metalness:.34}),
    carGray:make('차체 은색',0x8e999d,{roughness:.27,metalness:.45}),
  };
  const batches=new Map(), dummy=new T.Object3D();
  function part(mat,x,y,z,w,h,d,{cast=false,receive=true,yaw=0,roll=0}={}) {
    const sector=Math.floor(z/45)+':'+(x>0?'right':'left');
    const id=[mat,cast,receive,sector].join(':');
    if(!batches.has(id)) batches.set(id,{mat,cast,receive,matrices:[]});
    dummy.position.set(x,y,z);dummy.scale.set(w,h,d);
    dummy.rotation.set(0,yaw,roll);dummy.updateMatrix();
    batches.get(id).matrices.push(dummy.matrix.clone());
  }
  function ground(mat,x,z,w,d,repeat,y) {
    const map=mats[mat].map;
    map.repeat.set(w/repeat,d/repeat);
    const m=new T.Mesh(new T.PlaneGeometry(w,d),mats[mat]);
    m.rotation.x=-Math.PI/2;m.position.set(x,y,z);m.receiveShadow=true;root.add(m);
  }
  ground('asphalt',-8.15,-53,17,154,7.5,-.145);
  ground('paving',4.39,-52,8.76,150,2.65,0);
  part('concrete',-18.1,-.06,-52,3.3,.13,150);
  part('gray',-9,-.42,-51,85,.16,156);
  part('granite',.01,-.078,-52,.22,.151,150);
  part('slate',-.16,-.13,-52,.13,.027,150);
  part('yellow',-.24,-.138,-52,.065,.009,150,{receive:false});
  for(let z=19;z>-121;z-=1.23)part('gray',.013,-.001,z,.23,.007,.013);
  part('paint',-1.67,-.137,-34,.086,.008,110);
  for(let z=11;z>-72;z-=2.15)part('paint',-.88,-.136,z,1.68,.008,.085,{yaw:-.53});
  for(const x of [-5.2,-9.3,-13.12]) {
    for(let z=14;z>-121;z-=8.6)part('paint',x,-.135,z,.105,.008,3.35);
  }
  part('red',-4.0,-.137,-10,2.1,.006,3.4);
  const [roadCanvas,rg]=canvas(128,128);
  rg.fillStyle='#a23f37';rg.fillRect(0,0,128,128);
  rg.strokeStyle='#e8e3df';rg.lineWidth=5;rg.beginPath();rg.ellipse(64,64,53,45,0,0,Math.PI*2);rg.stroke();
  rg.font='700 65px sans-serif';rg.textAlign='center';rg.textBaseline='middle';rg.fillStyle='#eee9dc';rg.fillText('30',64,66);
  const mph=new T.Mesh(new T.PlaneGeometry(2,3.24),new T.MeshBasicMaterial({map:texture(roadCanvas)}));
  mph.rotation.x=-Math.PI/2;mph.position.set(-4,-.131,-10);root.add(mph);
  for(const z of [-2,-4.3,-6.6]){
    part('orange',-.61,.22,z,.085,.72,.085,{cast:true});
    part('paint',-.61,.38,z,.087,.12,.087);
  }

  const buildings=[
    {z:5.65,w:11.8,levels:4,skin:'grayBlue',form:'store',title:'한빛 생활상가',sub:'문구 · 생활용품',sign:'#b44c32'},
    {z:-5.55,w:10.55,levels:3,skin:'slate',form:'arcade',title:'연우안경',sub:'안경 · 콘택트렌즈',sign:'#363c3d'},
    {z:-17.5,w:13,levels:4,skin:'gray',form:'arcade',title:'소담약방',sub:'건강 상담',sign:'#53615b'},
    {z:-30.5,w:12.5,levels:7,skin:'pale',form:'tower',title:'새길빌딩',sub:'업무시설',sign:'#364d62'},
    {z:-44,w:12,levels:4,skin:'cream',form:'brick',title:'모퉁이빵집',sub:'오늘 구운 빵',sign:'#856f58'},
    {z:-56,w:11,levels:5,skin:'brick',form:'brick',title:'서울 작은식당',sub:'점심 · 저녁',sign:'#495b4d'},
  ];

  function frontage(spec) {
    const {z,w,levels,skin,form}=spec;
    const base=form==='tower'?8.04:facade;
    const pitch=form==='tower'?3.3:form==='arcade'?3.15:3.06;
    const h=3.55+levels*pitch;
    const q=(m,u,y,depth,width,height,thick,opts)=>
      part(m,base+depth,y,z+u,thick,height,width,opts);
    q(skin,0,h/2,3.75,w,h,4.45,{cast:true});
    const steps=form==='tower'?4:form==='arcade'?3:form==='brick'?3:4;
    const span=(w-.48)/steps;
    const capMat=form==='brick'?'cream':'granite';
    for(let i=0;i<steps;i++){
      const u=(i-(steps-1)/2)*span,openingW=span-.35;
      const door=i===Math.floor(steps/2),bottom=door?.035:.36;
      const top=2.77, middle=(top+bottom)/2, height=top-bottom;
      q('dark',u,middle,1.48,openingW+.17,height+.04,.062);
      q('wood',u,.03,.85,openingW+.10,.045,1.31);
      q('cream',u,2.74,.92,openingW+.10,.047,1.18);
      q('slate',u+openingW*.5,middle,.85,.085,height,1.27);
      if(!door){
        q('lamp',u,2.69,.93,openingW*.52,.046,.12,{receive:false});
        q('wood',u,.92,.89,openingW*.85,.081,.50);
        q('cream',u,.48,1.13,openingW*.79,.52,.24);
      }
      q('glass',u,middle,.24,openingW-.08,height-.035,.031,{receive:false});
      q('black',u-openingW/2,middle,.13,.089,height,.24);
      q('black',u+openingW/2,middle,.13,.089,height,.24);
      q('metal',u,top,.14,openingW,.083,.24);
      q(capMat,u,bottom-.022,.14,openingW,.09,.36);
      if(door) {
        q('black',u,middle,.154,.068,height,.135);
        q('metal',u+.10,1.02,.107,.044,.34,.085);
      }else{
        q('wood',u,.79,.52,openingW,.071,.28);
        q('wood',u,1.29,.52,openingW,.062,.28);
        for(let n=0;n<6;n++){
          const j=u+(n-2.5)*openingW/7;
          q(['gray','cream','brick'][n%3],j,.885,.40,openingW*.085,.15+(n%2)*.11,.09);
        }
        q('lamp',u,2.55,.39,openingW*.47,.06,.12,{receive:false});
      }
      q(skin,u,.18,.16,span-.04,door?0.025:.37,.41);
      q(skin,u+span/2,1.42,.16,.30,2.86,.42);
    }
    q(skin,-w/2+.13,h/2,.14,.26,h,.43,{cast:true});
    q(skin,w/2-.13,h/2,.14,.26,h,.43,{cast:true});
    q(form==='store'?'wood':'black',0,2.83,-.32,w-.61,.16,.76,{cast:true});
    q('black',0,2.746,-.68,w-.60,.081,.065);
    if(form==='store'||form==='brick'){
      const color=form==='store'?'brick':'cream';
      q(color,0,2.64,-.41,w*.83,.055,.91,{roll:.23,cast:true});
      q(color,0,2.50,-.855,w*.83,.18,.075);
      for(const u of [-w*.29,w*.29])q('metal',u,2.49,-.34,.07,.044,.77,{roll:.20});
    }
    q(form==='tower'?'blue':skin,0,3.19,-.08,w-.36,.61,.31,{cast:true});
    const signZ=form==='store'?z-3.88:z;
    const signW=form==='store'?3.8:Math.min(w-.60,5.2);
    label(root,spec.title,spec.sub,base-.25,3.22,signZ,signW,form==='store'?.61:.52,-Math.PI/2,spec.sign);
    q(capMat,0,3.56,.017,w+.04,.16,.43);
    for(let f=0;f<levels;f++){
      const y=3.58+f*pitch;
      const floorBays=form==='tower'?6:form==='arcade'?3:form==='store'?4:3;
      const bay=(w-.39)/floorBays;
      const wh=form==='tower'?2.43:form==='arcade'?1.35:1.73;
      const sill=form==='arcade'?1.0:.52;
      const wy=y+sill+wh/2;
      const ww=bay*(form==='tower'?.91:form==='arcade'?.84:.65);
      q(skin,0,y+sill/2,.27,w,sill,.51);
      const remaining=pitch-wh-sill;
      q(skin,0,y+sill+wh+remaining/2,.265,w,remaining,.515);
      for(let i=0;i<floorBays;i++){
        const u=(i-(floorBays-1)/2)*bay;
        q(form==='brick'?'glass':'blueWindow',u,wy,.37,ww,wh,.038,{receive:false});
        q('black',u-ww/2,wy,.22,.063,wh,.15);
        q('black',u+ww/2,wy,.22,.063,wh,.15);
        if(form!=='tower')q('black',u,wy,.26,.056,wh,.113);
        q(capMat,u,wy-wh/2,.13,ww+.14,.083,.28);
        for(const side of [-1,1])q(skin,u+side*(ww+bay)/4,wy,.26,(bay-ww)/2,wh,.52);
      }
      if(form==='tower'||form==='brick')q('pale',0,y+.06,.01,w,.045,.23);
    }
    q(capMat,0,h,.14,w+.15,.24,.50,{cast:true});
    q(skin,0,h+.54,2.18,w*.65,.93,3.44,{cast:true});
    if(form==='tower'){
      for(const u of [-w*.39,w*.39])q('blue',u,7.6,-.16,.33,10.2,.40,{cast:true});
      q('blue',0,12.65,-.16,w*.82,.35,.40,{cast:true});
    }
  }
  buildings.forEach(frontage);
  for(const [x,z,w,d,h,mat] of [
    [-24,12,9,13,24,'grayBlue'],[-22,-4,8,13,17,'pale'],[-24,-20,9,12,29,'cream'],
    [-24,-38,12,15,20,'gray'],[-24,-58,10,14,16,'grayBlue'],[-23,-75,9,10,23,'pale'],
    [13,-73,8,12,18,'pale'],[14,-94,11,15,24,'grayBlue'],[17,-113,12,15,30,'pale'],
    [-16,-105,10,12,18,'grayBlue'],[-7,-123,11,9,16,'grayBlue'],[7,-136,14,14,27,'pale'],
  ]) {
    part(mat,x,h/2,z,w,h,d,{cast:z>-48});
    part('pale',x,h+.12,z,w+.31,.24,d+.28);
    part('gray',x,h+.56,z,w*.54,.88,d*.5);
    if(x<0&&z>-55){
      part('pale',x+w/2+.104,2.76,z,.23,.15,d*.90);
      for(const freckle of [-.34,-.12,.12,.34])
        part(mat,x+w/2+.073,h*.53,z+d*freckle,.20,h*.89,.27);
    }
    for(let y=2.4;y<h-1;y+=2.53){
      part('blueWindow',x+(x<0?1:-1)*(w/2+.026),y,z,.051,1.24,d*.74,{receive:false});
      part('blueWindow',x,y,z+d/2+.026,w*.76,1.26,.05,{receive:false});
      for (const u of [-.29,0,.29])part(mat,x+w*u,y,z+d/2+.065,.075,1.31,.03);
    }
  }

  // Open stairwell. The paving plane is split locally so descending treads are visible.
  const paving=root.children.find(m=>m.material===mats.paving);
  paving.geometry.dispose();
  root.remove(paving);
  const groundSections=[
    [4.39,(-126-21.7+stairShift)/2,8.76,104.3+stairShift],
    [4.39,(-14+23+stairShift)/2,8.76,37-stairShift],
    [1.89,-17.85+stairShift,3.76,7.70],
    [7.82,-17.85+stairShift,1.90,7.70],
  ];
  for(const [x,z,w,d] of groundSections) {
    const geo=new T.PlaneGeometry(w,d);
    const uv=geo.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setXY(i,(x+(uv.getX(i)-.5)*w)/8.76,(uv.getY(i)*d-z-d/2)/150);
    const m=new T.Mesh(geo,mats.paving);
    m.rotation.x=-Math.PI/2;m.position.set(x,0,z);m.receiveShadow=true;root.add(m);
  }
  const stair=(mat,x,y,z,...sizes)=>part(mat,x,y,z+stairShift,...sizes);
  const sx=5.30,sz=-17.83;
  stair('granite',sx,.055,-13.91,3.78,.115,.37,{cast:true});
  for(const x of [3.78,6.84]){
    stair('granite',x,.33,sz,.34,.67,7.61,{cast:true});
    stair('dark',x,-.82,sz,.34,1.64,7.64);
    stair('metal',x,1.13,sz,.105,.096,7.62);
    for(const z of [-14.09,-16.09,-18.31,-20.23,-21.55])stair('metal',x,.91,z,.077,.52,.073);
    stair('railGlass',x,.891,sz,.028,.40,7.25,{receive:false});
  }
  stair('slate',sx,-.83,-21.54,3.03,1.66,.22);
  for(let i=0;i<13;i++){
    const y=-.07-i*.114,z=-14.21-i*.37;
    stair(i%2?'gray':'granite',sx,y-.07,z,2.78,.14,.381);
    stair('metal',sx,y+.002,z+.178,2.75,.016,.043);
  }
  stair('dark',sx,-1.65,sz,3.16,.18,7.67);
  stair('granite',3.02,.74,-18.88,.35,1.47,.42,{cast:true});
  label(root,'공덕역','5 · 6호선  |  1번 출구',3.02,1.085,-18.644+stairShift,.338,.51,0,'#466474');
  stair('granite',7.03,.55,-14.49,.41,1.11,.40,{cast:true});
  stair('black',7.03,.89,-14.265,.35,.39,.06);
  label(root,'1번 출구','공덕역',7.03,.89,-14.228+stairShift,.33,.35,0,'#466474');
  stair('tactile',5.21,.010,-13.26,4.20,.019,.50);
  stair('tactile',5.08,.010,-11.96,.66,.021,2.24);
  for(let i=0;i<27;i++)for(let row=0;row<3;row++)stair('dots',3.22+i*.153,.020,-13.44+row*.151,.057,.010,.056,{receive:false});
  for(let i=0;i<15;i++)for(let col=0;col<4;col++)stair('dots',4.84+col*.153,.023,-12.99+i*.146,.053,.012,.058,{receive:false});

  // Framed station canopy leaves the stair approach and curbside bypass open.
  for(const x of [3.56,7.00])for(const z of [-14.1,-19.9]){
    stair('granite',x,.20,z,.28,.40,.26,{cast:true});
    stair('metal',x,1.76,z,.135,2.74,.15,{cast:true});
  }
  stair('slate',5.28,3.13,-17.0,4.04,.27,6.62,{cast:true});
  stair('metal',5.28,3.28,-17.0,4.09,.068,6.66);
  stair('pale',5.28,2.975,-17.0,3.88,.05,6.43);
  for(const x of [4.23,6.30])stair('lamp',x,2.933,-17.05,.09,.041,4.83,{receive:false});
  stair('black',5.26,2.78,-13.77,2.87,.30,.10);
  label(root,'공덕역  ·  1번 출구','⑤  ⑥',5.26,2.78,-13.71+stairShift,2.75,.275,0,'#384258');
  const alley=makeAlley({root,part,ground,make});

  const trunkGeometry=new T.CylinderGeometry(.5,.36,1,7);
  const barkInstances=[];
  function tree(x,z,seed,height) {
    const rng=rand(seed), leaf=[];
    
    function branch(a,b,r) {
      const d=new T.Vector3().subVectors(b,a), midpoint=new T.Vector3().addVectors(a,b).multiplyScalar(.5);
      dummy.position.copy(midpoint);
      dummy.scale.set(r*2,d.length(),r*2);
      dummy.quaternion.setFromUnitVectors(axisY,d.normalize());
      dummy.updateMatrix();
      barkInstances.push(dummy.matrix.clone());
    }
    const origin=new T.Vector3(x,0,z), main=new T.Vector3(x+.23,height*.58,z+.25);
    const crown=new T.Vector3(x-.10,height*.97,z+.52);
    branch(origin,main,height*.020);
    branch(main,crown,height*.010);
    for(let i=0;i<10;i++){
      const a=i*2.4+rng()*.3, spread=height*(.14+rng()*.13);
      const y=height*(.44+i*.038);
      const end=new T.Vector3(x+Math.cos(a)*spread,y+height*.20,z+Math.sin(a)*spread);
      branch(new T.Vector3(x+.13,y,z+.22),end,height*(.009-i*.00045));
      for(let j=0;j<3;j++){
        const twig=end.clone().add(new T.Vector3((rng()-.5)*1.13,.20+rng()*.55,(rng()-.5)*1.14));
        if(j===0)branch(end,twig,height*.0028);
        leaf.push(twig);
      }
    }
    leaf.push(crown);
    const positions=[],colors=[];
    for(const point of leaf){
      for(let j=0;j<(seed>20?33:57);j++){
        const a=rng()*Math.PI*2,t=rng()*2-1,r=.27+Math.cbrt(rng())*height*.078;
        const px=point.x+Math.cos(a)*r,pz=point.z+Math.sin(a)*r,py=point.y+t*r*.73;
        const rot=rng()*6.28,s=.052+rng()*(seed>20?.145:.205);
        const dx=Math.cos(rot)*s,dz=Math.sin(rot)*s;
        positions.push(px-dx,py,pz-dz,px+dz*.59,py+s*.87,pz-dx*.59,
          px+dx,py+s*.3,pz+dz,px-dx,py,pz-dz,
          px+dx,py+s*.3,pz+dz,px-dz*.59,py-s*.41,pz+dx*.59);
        const c=new T.Color(shadeColors[Math.floor(rng()*shadeColors.length)]);
        for(let n=0;n<6;n++)colors.push(c.r,c.g,c.b);
      }
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geometry.computeVertexNormals();
    const canopyMaterial=tree.material??=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
    const mesh=new T.Mesh(geometry,canopyMaterial);
    mesh.castShadow=z>-49;mesh.receiveShadow=false;root.add(mesh);
    const lowPositions=[],lowColors=[];
    for(let i=0;i<positions.length;i+=54) {
      lowPositions.push(...positions.slice(i,i+18));
      lowColors.push(...colors.slice(i,i+18));
    }
    const lightGeometry=new T.BufferGeometry();
    lightGeometry.setAttribute('position',new T.Float32BufferAttribute(lowPositions,3));
    lightGeometry.setAttribute('color',new T.Float32BufferAttribute(lowColors,3));
    lightGeometry.computeVertexNormals();
    const coarse=new T.Mesh(lightGeometry,canopyMaterial);
    coarse.visible=false;root.add(coarse);
    simplified.add({full:mesh,light:coarse});
    part('soil',x,.011,z,1.28,.025,1.32);
    if(seed<21)for(let i=0;i<12;i++){
      const lateral=(i-5.5)*.11;
      if(Math.abs(lateral)<.25){
        for(const side of [-1,1])part('black',x+lateral,.048,z+side*.50,.028,.015,.36);
      }else part('black',x+lateral,.048,z,.028,.015,1.28);
    }
    for(const side of [-1,1]){
      part('granite',x+side*.73,.047,z,.13,.094,1.58);
      part('granite',x,.047,z+side*.73,1.55,.094,.13);
    }
  }
  tree(2.60,-21.7,7,8.4);
  tree(-16.65,-5.4,10,8.4);
  tree(-17.80,-19.9,14,6.5);
  tree(-17.9,-35,24,6.1);
  tree(2.35,-44,28,6.0);
  tree(-17.6,-57,31,5.6);
  tree(2.45,-64,39,5.5);
  for(const [x,z] of [[-.35,-23],[-16.4,-7],[-16.5,-39],[-.35,-55]]){
    part('black',x,2.63,z,.105,5.28,.105,{cast:true});
    part('metal',x-.53,5.27,z,1.14,.088,.093);
    part('black',x-1.03,5.24,z,.39,.105,.22);
  }

  const wheel=new T.CylinderGeometry(.32,.32,.18,18);
  function car(x,z,color,dir=1,scale=1) {
    const group=new T.Group();
    group.position.set(x,-.145,z);group.rotation.y=dir===1?0:Math.PI;group.scale.setScalar(scale);
    root.add(group);
    function hull(mat,sections){
      const points=[],index=[];
      for(const [zz,w,low,high,taper] of sections)
        points.push(-w,low,zz,w,low,zz,w*taper,high,zz,-w*taper,high,zz);
      for(let i=0;i<sections.length-1;i++)for(let j=0;j<4;j++){
        const a=i*4+j,b=i*4+(j+1)%4,c=a+4,d=b+4;
        index.push(a,b,c,b,d,c);
      }
      index.push(0,3,2,0,2,1);
      const e=points.length/3-4;index.push(e,e+1,e+2,e,e+2,e+3);
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setIndex(index);g.computeVertexNormals();
      const m=new T.Mesh(g,mats[mat]);m.castShadow=true;group.add(m);
    }
    hull(color,[[-2.18,.82,.34,.66,.92],[-1.83,.905,.27,.87,.94],[-1.21,.92,.27,.93,.98],
      [1.22,.92,.27,.92,.99],[1.91,.90,.28,.81,.98],[2.18,.81,.32,.68,.92]]);
    hull('blueWindow',[[-1.18,.83,.86,.94,.97],[-.64,.78,.87,1.35,.85],
      [.62,.78,.87,1.37,.87],[1.30,.84,.87,.93,.98]]);
    hull(color,[[-.63,.67,1.335,1.375,.93],[.63,.68,1.35,1.40,.92]]);
    const box=(mat,x,y,z,w,h,d)=>{
      const m=new T.Mesh(unit,mats[mat]);m.position.set(x,y,z);m.scale.set(w,h,d);group.add(m);
    };
    for(const side of [-1,1]){
      for(const zz of [-1.32,1.36]){
        const tyre=new T.Mesh(wheel,mats.tyre);tyre.rotation.z=Math.PI/2;
        tyre.position.set(side*.83,.32,zz);tyre.castShadow=true;group.add(tyre);
      }
      box('red',side*.63,.632,2.191,.35,.110,.025);
      box('lamp',side*.62,.633,-2.194,.37,.094,.025);
      box('metal',side*.923,.81,.28,.027,.027,.16);
    }
    box('paint',0,.494,2.194,.56,.119,.02);
  }
  car(-4.42,-10.9,'carWhite');
  car(-10.70,-15,'carBlue',-1,.98);
  car(-7.2,-30.2,'carGray');
  car(-5.9,-45.5,'carWhite',1,.94);
  const trunks=new T.InstancedMesh(trunkGeometry,mats.bark,barkInstances.length);
  barkInstances.forEach((matrix,i)=>trunks.setMatrixAt(i,matrix));
  trunks.castShadow=true;trunks.receiveShadow=true;trunks.computeBoundingSphere();root.add(trunks);
  car(-13.1,-41.6,'carBlue',-1,.96);
  for(const {mat,cast,receive,matrices} of batches.values()){
    const m=new T.InstancedMesh(unit,mats[mat],matrices.length);
    for(let i=0;i<matrices.length;i++)m.setMatrixAt(i,matrices[i]);
    m.castShadow=cast;m.receiveShadow=receive;m.computeBoundingSphere();root.add(m);
  }

  function setDetail(high){
    for(const {full,light} of simplified) {
      full.visible=high;
      light.visible=!high;
    }
    for(const object of alley.small)object.visible=high;
    sun.shadow.needsUpdate=true;
  }
  return {root,sun,setDetail};
}

export const blockers=[
  {x0:3.54,x1:7.25,z0:-21.87+stairShift,z1:-13.70+stairShift},
  {x0:1.88,x1:3.30,z0:-22.45,z1:-20.98},
  {x0:1.66,x1:3.05,z0:-44.7,z1:-43.3},
  ...[10.5,20.4,27].map(x=>({x0:x-.14,x1:x+.14,z0:17.60,z1:17.99})),
  {x0:2.80,x1:3.22,z0:-13.77,z1:-13.25},
];

const alleyDomain={x0:8.35,x1:27.6,z0:12.0,z1:18.1};
export function inReviewArea(x,z,r=.29) {
  const boulevard=x>=.39&&x<=7.92&&z>=-56&&z<=19.2;
  const junction=x>=7.92&&x<=10.04&&z>=12.25&&z<=17.82;
  const residential=x>=8.35&&x<=27.31&&z>=12.25&&z<=17.82;
  return (boulevard||junction||residential)&&blockers.every(b=>
    x+r<=b.x0||x-r>=b.x1||z+r<=b.z0||z-r>=b.z1);
}
export function cameraWall(x,z){
  return x>8.28&&(z<alleyDomain.z0||z>alleyDomain.z1);
}

function makeAlley({root,part,make}) {
  const small=[];
  const material=make('골목 포장',0xa2a0a0,{map:surface('road'),roughness:1});
  material.map.repeat.set(4.7,2.3);
  const ground=new T.Mesh(new T.PlaneGeometry(21,6.1),material);
  ground.rotation.x=-Math.PI*.5;
  ground.position.set(18.8,-.006,15.05);ground.receiveShadow=true;root.add(ground);
  part('concrete',18.4,-.10,15.1,20.7,.18,7.25);
  part('granite',18.40,.025,12.39,20.0,.057,.75);
  part('granite',18.40,.025,17.71,20.0,.057,.75);
  for(let x=10.2;x<28;x+=2.0){
    part('yellow',x,.003,12.81,.88,.009,.075,{receive:false});
    part('yellow',x,.003,17.27,.88,.009,.075,{receive:false});
  }
  for(const [x,side,w,h,skin,trim] of [
    [10.8,1,5.25,8.3,'cream','gray'],[16.58,1,5.94,10.5,'gray','slate'],
    [23.8,1,7.80,7.85,'brick','cream'],[10.86,-1,4.91,10.9,'grayBlue','gray'],
    [16.17,-1,5.38,8.14,'brick','cream'],[23.56,-1,8.52,12.05,'pale','slate'],
  ]){
    const edge=side===1?18.12:11.91;
    const q=(mat,u,y,d,width,height,depth,opts)=>part(mat,x+u,y,edge+side*d,width,height,depth,opts);
    q(skin,0,h/2,2.07,w,h,3.23,{cast:true});
    q(trim,0,h+.06,1.99,w+.18,.24,3.51,{cast:true});
    const wDoor=1.13;
    q('dark',-.52,1.10,.26,wDoor,2.19,.05);
    q('black',-.52,1.09,.17,.91,2.01,.055);
    q('metal',-.11,1.00,.12,.056,.26,.08);
    for(const direction of [-1,1])q(trim,-.52+direction*.57,1.12,.08,.13,2.24,.26);
    q(trim,-.52,2.25,.08,1.27,.19,.27);
    q(trim,-.52,.031,.02,1.40,.06,.48);
    if(side===1)
      label(root,'공덕마루','공동 현관',x-.5,2.51,edge-.07,1.17,.30,Math.PI,'#525b54');
    for(let y=3.35;y<h-1.4;y+=2.5){
      const n=Math.floor(w/1.78);
      for(let i=0;i<n;i++){
        const u=(i-(n-1)/2)*w/n;
        q('blueWindow',u,y,.12,.91,1.28,.12,{receive:false});
        q(trim,u,y-.69,.028,1.04,.09,.27);
        q(trim,u-.51,y,.12,.091,1.40,.26);
        q(trim,u+.51,y,.12,.091,1.40,.26);
      }
    }
    q(skin,0,2.55,.17,w,.32,.43);
    q(skin,-w/2+.28,1.37,.18,.55,2.76,.44);
    q(skin,w/2-.28,1.37,.18,.55,2.76,.44);
    q('metal',w*.32,.75,.14,.61,.38,.32);
    q('black',w*.32,.75,-.04,.38,.22,.045);
    for (let i=0;i<4;i++)q('gray',w*.32,.68+i*.044,-.07,.36,.018,.021);
    q('gray',-w*.38,1.69,.05,.066,3.42,.083);
  }
  part('cream',28.03,2.92,15.10,.26,5.83,6.13,{cast:true});
  for(const z of [12.73,17.34])part('slate',27.88,1.22,z,.13,2.41,.62);
  const cord=new T.LineBasicMaterial({color:0x303a3a});
  for(const x of [10.5,20.4,27.0]){
    part('gray',x,2.8,17.79,.16,5.61,.16,{cast:true});
    part('metal',x,5.44,17.61,.27,.091,.57);
    part('metal',x,.95,17.75,.24,.29,.22);
  }
  for(const [a,b] of [[10.5,20.4],[20.4,27.0]])for(const z of [17.32,17.51,17.71]){
    const points=[];
    for(let i=0;i<=16;i++){
      const v=i/16;
      points.push(new T.Vector3(a+(b-a)*v,5.52-.42*Math.sin(v*Math.PI),z));
    }
    const m=new T.Line(new T.BufferGeometry().setFromPoints(points),cord);
    root.add(m);small.push(m);
  }
  return {small};
}
