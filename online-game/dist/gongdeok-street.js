import * as THREE from './vendor/three.module.js';
import { addShop, cladding } from './storefronts.js';
import { addTraffic, placeEntrance } from './transit-scene.js';
import { BUS_COURSE } from './journey.js';

const stone=0xc0b8a9, warm=0xcbbba5, concrete=0xacaaa1;
const ink=0x303d3c, metal=0x526561, wood=0x9a7654;
const pane=0x9bb5b7, skyPane=0xb6c9c9, road=0x555e61;
const materials=new Map(), signs=new Map();
let pavementTexture;
const facadeTiles=new Map();
const façades=[
  {name:'공덕마루',hint:'공동 현관',z:14,w:9.4,h:17.6,bays:3,wall:0xc5b9ab,trim:0x8a7a6a,kind:'home'},
  {name:'모퉁이 커피',hint:'커피 · 차',z:3,w:11.1,h:10.5,bays:3,wall:0xbca991,trim:0x67554b,kind:'cafe'},
  {name:'새참 편의점',hint:'생활용품 · 도시락',z:-8.2,w:10.6,h:13.6,bays:4,wall:0xb8b8ad,trim:0x456c61,kind:'store'},
  {name:'아침결 빵집',hint:'오늘 구운 빵',z:-17.5,w:7.1,h:9.3,bays:2,wall:0xc9af91,trim:0x896548,kind:'bakery'},
  {name:'공덕 새길빌딩',hint:'업무시설',z:-36,w:11.5,h:22.3,bays:4,wall:0xb0b7ae,trim:0x596c66,kind:'office'},
];

function material(name,color,options={}) {
  const key=name+':'+color;
  if (!materials.has(key)) {
    const surface=name==='masonry'?new THREE.MeshLambertMaterial({name,color}):
      new THREE.MeshStandardMaterial({name,color,roughness:.87,...options});
    materials.set(key,surface);
  }
  return materials.get(key);
}

function pavement() {
  if (pavementTexture) return pavementTexture;
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=256;
  const c=canvas.getContext('2d');
  c.fillStyle='#99948a';
  c.fillRect(0,0,256,256);
  for (let y=0;y<4;y++) for (let x=-1;x<4;x++) {
    const gray=177+((x*31+y*17+100)%13);
    c.fillStyle='rgb('+gray+','+(gray-5)+','+(gray-13)+')';
    c.fillRect(x*64+(y%2)*32+1,y*64+1,62,62);
    c.fillStyle='#ded6c5';
    c.fillRect(x*64+(y%2)*32+1,y*64+1,61,1);
  }
  pavementTexture=new THREE.CanvasTexture(canvas);
  pavementTexture.wrapS=pavementTexture.wrapT=THREE.RepeatWrapping;
  pavementTexture.repeat.set(20.5/3.2,105/3.2);
  pavementTexture.colorSpace=THREE.SRGBColorSpace;
  pavementTexture.anisotropy=4;
  return pavementTexture;
}

function signage(parent,title,sub,w,h,x,y,z,yaw,background) {
  const key=[title,sub,background].join('|');
  if (!signs.has(key)) {
    const canvas=document.createElement('canvas');
    canvas.width=640;
    canvas.height=sub?196:128;
    const c=canvas.getContext('2d');
    c.fillStyle=background;
    c.fillRect(0,0,canvas.width,canvas.height);
    c.fillStyle='#fff6e8';
    c.textAlign='center';
    c.textBaseline='middle';
    c.font='700 72px "Malgun Gothic", "Noto Sans KR", sans-serif';
    c.fillText(title,320,sub?75:66,596);
    if (sub) {
      c.font='500 34px "Malgun Gothic", sans-serif';
      c.fillStyle='#e6dbc3';
      c.fillText(sub,320,149,596);
    }
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    signs.set(key,new THREE.MeshBasicMaterial({name:title,map:texture}));
  }
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(w,h),signs.get(key));
  sign.position.set(x,y,z);
  sign.rotation.y=yaw;
  parent.add(sign);
}

export function buildGongdeok(parent,entranceAsset,busOnly=false) {
  const group=new THREE.Group();
  group.name='Gongdeok exterior';
  parent.add(group);
  const batches=new Map(), dummy=new THREE.Object3D();
  function part(type,x,y,z,w,h,d,color,options={}) {
    const tile=options.tile;
    if(tile&&!facadeTiles.has(tile))facadeTiles.set(tile,cladding(tile).userData.light);
    const surface=tile?facadeTiles.get(tile):material(type,color,options.surface);
    // Smaller spatial batches let the camera and shadow pass cull distant sections.
    const sector=type==='masonry'&&d<18?Math.floor(z/22)+':'+(x<-10?'west':'east'):'all';
    const key=[tile,type,color,options.shape??'box',Boolean(options.cast),sector].join(':');
    if (!batches.has(key)) batches.set(key,{
      surface,shape:options.shape??'box',cast:options.cast,
      receive:type==='masonry'||type==='metal'||type==='wood',matrices:[],
    });
    dummy.position.set(x,y,z);
    dummy.scale.set(w,h,d);
    dummy.rotation.set(0,options.yaw??0,options.roll??0);
    dummy.updateMatrix();
    batches.get(key).matrices.push(dummy.matrix.clone());
  }
  const box=(x,y,z,w,h,d,c,cast=false)=>part('masonry',x,y,z,w,h,d,c,{cast});
  const frame=(x,y,z,w,h,d,c=metal)=>part('metal',x,y,z,w,h,d,c,{surface:{roughness:.48,metalness:.30}});
  const timber=(x,y,z,w,h,d)=>part('wood',x,y,z,w,h,d,wood,{surface:{roughness:.91}});
  const glass=(x,y,z,w,h,d,light=false)=>part('glass',x,y,z,w,h,d,light?skyPane:pane,{
    surface:{roughness:.31,metalness:.15,transparent:true,opacity:.55,depthWrite:false},
  });
  const bulb=(x,y,z,w,h,d)=>part('lamp',x,y,z,w,h,d,0xffe9be,{
    surface:{emissive:0x99774a,emissiveIntensity:.35},
  });
  const paving=(x,z,w,d)=>{
    const geometry=new THREE.PlaneGeometry(w,d);
    const uv=geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++) uv.setXY(i,uv.getX(i)*w/20.5+(x-w/2+10.25)/20.5,
      uv.getY(i)*d/105-(z+d/2-39.5)/105);
    const ground=new THREE.Mesh(geometry,material('pavers',0xffffff,{map:pavement(),roughness:1}));
    ground.rotation.x=-Math.PI/2;
    ground.position.set(x,0,z);
    ground.receiveShadow=true;
    group.add(ground);
  };
  if(entranceAsset&&!busOnly) {
    paving(-8.63,-13,3.24,105);
    paving(3.63,-13,13.24,105);
    paving(-5,8.65,4.02,61.7);
    paving(-5,-50.15,4.02,30.7);
    placeEntrance(entranceAsset,group);
  } else paving(0,-13,20.5,105);
  box(20,-.23,-14,60,.14,155,0xb0aba0);
  box(-31,-.97,-14,42,.14,155,0xb0aba0);
  box(18.4,-.20,-15,16.3,.15,153,road);
  box(30,-.22,-14,7,.42,148,0xa9a79f);
  box(10.3,-.055,-13,.22,.12,105,0xc0bbac);
  box(10.65,-.123,-13,.43,.055,105,0x888d8a);
  box(26.5,-.058,-13,.24,.12,105,0xbfb9ad);
  box(11.2,-.121,-13,.06,.01,105,0xd4b166);
  for (let z=-74;z<54;z+=8) {
    box(18.3,-.12,z,.12,.012,3.4,0xe4e0cc);
    box(22.9,-.12,z+2,.10,.012,3.05,0xe4e0cc);
  }
  // Marking and change of paving distinguish the shop apron, through-route and curb.
  box(-8.8,.004,-13,2.55,.007,105,0xb8ad9a);
  box(-7.49,.009,-13,.055,.01,105,0xcfc6b4);
  for (const z of [15,-3,-14,-31,-46]) box(-2.6,.002,z,9.3,.004,.19,0xbeb7a7);
  box(9.29,.004,-13,1.08,.007,105,0xadac9e);
  box(7.95,.009,-13,.43,.013,105,0xc8ab63);
  for (const x of [7.84,7.95,8.06]) box(x,.018,-13,.031,.014,105,0xd5ba74);
  if(!entranceAsset) box(.1,.008,-23.7,14.9,.013,.37,0xc9ab62);
  for (let x=-7.25;x<=7.65;x+=.23) {
    if(entranceAsset&&Math.abs(x+5)<2.07)continue;
    part('stud',x,.019,-23.7,.064,.012,.064,0xddbf72,{shape:'cylinder'});
  }
  for (let z=-64;z<38;z+=2.4) box(10.33,.007,z,.21,.01,.035,0x9a958b);

  function building(spec) {
    const {w,h,z,wall,trim,kind,bays}=spec;
    const front=-10.58;
    const shop=kind==='cafe'?'food':kind==='store'?'optics':null;
    const surfaceColors={wood:0x89654e,metal:0x57686a,warmWall:0xd1b69b,
      opticWall:0xc9d8cd,warmFloor:0x977f69,cream:0xe3d9c1,brick:0xaf7866,
      redTrim:0x843c31,canvasRed:0x933e31,canvasLight:0xce9e77,dinerWood:0xa37452,
      steelDark:0x4a4c47,lamp:0xffe6ab,opticCabinet:0x627676,clearFacade:0x8ca7a6,
      slate:0x758181,granite:0xa79e8b};
    const B=(u,y,depth,width,height,thickness,color,cast=false)=>{
      // Overlapping wall and window reveals share the shadow of the outer mass.
      const silhouette=thickness>.66 || (height>5 && width>.5);
      box(front+depth,y,z-u,thickness,height,width,color,cast&&silhouette);
    };
    const F=(u,y,depth,width,height,thickness,color=trim)=>
      frame(front+depth,y,z-u,thickness,height,width,color);
    const G=(u,y,depth,width,height,light)=>
      glass(front+depth,y,z-u,.028,height,width,light);
    function opening(u,y,width,height,display=false) {
      const top=y+height/2, bottom=y-height/2;
      B(u,y,-.53,width,height,.045,display?0x877c65:0x657a76);
      B(u,top-.11,-.42,width,.16,.18,display?0xd5c8a9:0x8e9c98);
      B(u,bottom+.16,-.41,width,.19,.21,display?0xa29278:0x82908a);
      if (display) {
        F(u,bottom+.49,-.43,width,.075,.27,0x8c704f);
        F(u,bottom+.99,-.43,width,.065,.27,0x8c704f);
        for (let i=0;i<5;i++) {
          const t=u+(i-2)*width*.145;
          B(t,bottom+.61,-.38,width*.09,.15,.10,[0xc2a273,0x8d9b75,0xc4b28b][i%3]);
        }
        B(u,top-.22,-.39,width*.22,.08,.14,0xf0d6a0);
      }
      G(u,y,-.26,width-.07,height-.07,display);
      for (const side of [-1,1]) {
        F(u+side*(width/2-.035),y,-.18,.075,height,.17);
        F(u,y+side*(height/2-.04),-.18,width,.08,.15);
      }
      if (width>1.4) F(u,y,-.225,.048,height,.075);
      B(u,bottom-.023,-.096,width+.1,.071,.32,0xd2cbbd);
    }
    const deck=kind==='office'?3.65:3.25;
    const inset=kind==='home'?.54:.37;
    if(shop) {
      B(0,(h+3.25)/2,-3.15,w,h-3.25,5.15,wall,true);
      B(0,1.64,-4.53,w,3.28,2.39,wall,true);
    } else B(0,h/2,-3.15,w,h,5.15,wall,true);
    B(0,h-.16,-.58,w+.16,.30,.98,trim,true);
    B(0,h+.15,-2.7,w+.23,.29,5.55,0xd1cabc,true);
    B(kind==='home'?1.15:-.8,h+.69,-2.5,w*.67,.82,3.75,wall,true);
    B(0,.11,-.21,w,.22,.41,trim,true);
    B(0,deck-.045,-.2,w+.08,.22,.51,trim,true);
    const floors=kind==='office'?5:Math.floor((h-deck)/2.84);
    for (let f=0;f<floors;f++) {
      const fy=deck+1.61+f*2.85;
      const spacing=(w-.46)/bays;
      const win=f%2&&kind==='home'?spacing*.48:spacing*(kind==='office'?.79:.66);
      const wh=kind==='office'?1.95:1.47;
      B(0,fy-wh/2-.38,-.274,w,.76,.55,wall,true);
      B(0,fy+wh/2+.30,-.279,w,.60,.55,wall,true);
      for (let i=0;i<bays;i++) {
        const u=(i-(bays-1)/2)*spacing;
        opening(u,fy,win,wh);
        const pier=(spacing-win)/2;
        for (const side of [-1,1]) B(u+side*(win/2+pier/2),fy,-.26,pier,wh,.50,wall,true);
        if (kind==='home' && (i+f)%3===1) {
          B(u,fy-.83,.013,win+.22,.12,.49,trim,true);
          F(u,fy-.48,.24,win,.064,.059);
          for (const side of [-1,1]) F(u+side*win*.46,fy-.66,.23,.047,.37,.067);
        }
      }
      B(0,fy-1.30,-.19,w,.084,.42,0xc2b8a9);
    }
    if(shop) {
      const decor=new THREE.Group();
      decor.position.set(front,0,z);
      decor.rotation.y=Math.PI;
      group.add(decor);
      addShop({root:decor,w,base:0,z:0,kind:shop,
        label:(parent,title,sub,x,y,z,w,h,yaw,color)=>signage(parent,title,sub,w,h,x,y,z,yaw,color),
        q:(name,u,y,d,width,height,depth,opts={})=>part('shop '+name,front-d,y,z-u,
          depth,height,width,surfaceColors[name],{...opts,tile:name==='brick'?'brick':name==='granite'?'stone':null,
            surface:name==='clearFacade'?{transparent:true,opacity:.23,depthWrite:false,roughness:.34}:
              name==='lamp'?{emissive:0xffdb9f,emissiveIntensity:.45}:undefined}),
      });
      return;
    }
    const number=kind==='home'?3:kind==='office'?3:bays;
    const spacing=(w-inset*2)/number;
    for (let i=0;i<number;i++) {
      const u=(i-(number-1)/2)*spacing;
      const isDoor=i===Math.floor(number/2);
      const openW=spacing-(isDoor?.61:.26);
      const height=isDoor?2.28:1.88;
      const y=isDoor?1.14:1.35;
      opening(u,y,openW,height,!isDoor && ['store','bakery','cafe'].includes(kind));
      if (isDoor) {
        F(u+.12,1.01,-.142,.058,.33,.067,0xd4bda0);
        B(u,.025,-.24,openW,.05,.47,0xb8b0a2);
      } else B(u,.25,-.26,spacing,.45,.49,wall,true);
      for (const side of [-1,1]) B(u+side*(spacing+openW)/4,1.49,-.26,(spacing-openW)/2,2.98,.52,wall,true);
    }
    for (const side of [-1,1]) {
      B(side*(w/2-inset/2),h/2,-.241,inset,h,.52,trim,true);
      B(side*(w/2-.055),h/2,-.515,.11,h,.37,concrete,true);
    }
    if (kind==='home'||kind==='bakery') {
      const course=kind==='home'?0xa89c8e:0xb2967b;
      for (const y of [.34,.67,.98,1.29,1.60,1.91,2.22]) for (const side of [-1,1]) {
        B(side*(w/2-inset/2),y,.025,inset*.84,.018,.023,course);
      }
    }
    const aw=kind==='cafe'||kind==='bakery'?w-.95:kind==='home'?4.7:w-.62;
    const shade=kind==='cafe'||kind==='bakery'?0x61796c:trim;
    B(0,2.45,.01,aw,.15,.60,shade,true);
    B(0,2.385,.286,aw,.11,.064,shade,true);
    const tagW=Math.min(5.35,w-.8);
    B(0,2.88,.0,tagW+.14,.55,.27,trim,true);
    signage(group,spec.name,spec.hint,tagW,.48,front+.146,2.88,z,Math.PI/2,
      kind==='bakery'?'#765740':kind==='cafe'?'#4c5147':kind==='store'?'#35655a':'#526158');
    if (kind==='store') {
      B(0,2.54,.048,w-.7,.073,.13,0x88a394);
      B(0,2.47,.059,w-.7,.05,.13,0xece2c8);
    }
    if (kind==='home') {
      B(0,2.36,.009,4.1,.17,.78,0x9c8d7a,true);
      B(0,1.14,-.03,.09,2.28,.11,0xd3c4ab);
    }
  }
  façades.forEach(building);

  // Layered street walls and roof silhouettes behind the walkable block.
  for (const [x,z,w,h,d,c] of [
    [-20,28,13,20,10,0xa5a59a],[-16,-51,11,16,9,0xa4ac9f],
    [-21,-64,13,19,14,0xb3ada1],[32,19,10,16,14,0xaeb6ad],[34,1,11,23,15,0xb9b4a9],
    [34,-17,12,21,14,0xa0b0af],[36,-37,13,30,16,0xa2adaa],[33,-56,11,17,12,0xbdb5a6],
    [47,-71,16,32,12,0xa5b3af],[10,-79,16,28,12,0xa5b4b5],
    [-2,-87,11,24,13,0xaeb8ad],[24,-93,14,39,16,0xa2afad],
  ]) {
    box(x,h/2,z,w,h,d,c,true);
    box(x,h+.13,z,w+.25,.26,d+.28,0xb6b8ae,true);
    box(x+.5,h+.73,z,w*.49,1.1,d*.52,0xa7a9a0,true);
    for (let level=2.7;level<h-1.2;level+=2.6) {
      box(x-w/2-.014,level,z,.037,.91,d*.79,0x788e8e);
      box(x,level,z+d/2+.016,w*.80,1.06,.036,0x7e9190);
      for (const side of [-.28,0,.28]) box(x+w*side,level,z+d/2+.042,.06,1.09,.045,c);
    }
  }

  function tree(x,z,s) {
    box(x,.026,z,1.3*s,.05,1.3*s,0x817d69);
    for (const side of [-1,1]) {
      frame(x+side*.61*s,.06,z,.10,.07,1.32*s,concrete);
      frame(x,.06,z+side*.61*s,1.32*s,.07,.10,concrete);
    }
    part('trunk',x,1.53*s,z,.24*s,3.1*s,.23*s,0x77654d,{shape:'cylinder',cast:true});
    part('trunk',x+.25*s,2.65*s,z,.12*s,1.13*s,.11*s,0x77654d,{shape:'cylinder',roll:-.55,cast:true});
    for (const [dx,dy,dz,r,c] of [
      [0,3.46,0,1.37,0x748947],[-.72,3.35,.26,.92,0x7d9050],[.64,3.76,.48,.88,0x839654],
      [.26,4.21,-.40,1.02,0x849655],[-.20,3.75,-.70,.81,0x6e854b],
    ]) part('foliage',x+dx*s,dy*s,z+dz*s,r*1.20*s,r*s,r*1.12*s,c,{shape:'leaf',cast:true});
  }
  for (const [x,z,s] of [[10.97,11,1.15],[11.02,-4,1],[10.98,-27,1.12],
    [11.03,-53,1.13],[29,6,1.04],[28,-18,1.16],[29,-47,.98]]) tree(x,z,s);
  for (const z of [17,-13,-31,-57]) {
    part('lamp pole',10.57,2.66,z,.11,5.3,.11,metal,{shape:'cylinder',cast:true});
    frame(10.57,.25,z,.18,.45,.18);
    frame(10.04,5.24,z,1.12,.102,.102);
    frame(9.55,5.21,z,.50,.115,.28);
    bulb(9.55,5.145,z,.40,.021,.21);
  }
  for (const z of [8,-9,-20,-46]) {
    box(-10.86,.23,z,.62,.46,1.95,stone,true);
    for (let i=0;i<4;i++) part('leaf',-10.79,.64,z+(i-1.5)*.41,.37,.31,.38,0x718650,{shape:'leaf',cast:true});
  }

  // Stair volume is behind the western movement bound. The station approach stays walkable.
  const st=-24;
  if(!entranceAsset&&!busOnly) {
  box(-14.87,1.34,st,.24,2.78,3.75,0x46544f,true);
  box(-13.3,-.87,st,3.6,.14,3.48,0x777f74,true);
  for (let i=0;i<7;i++) {
    box(-10.47-i*.31,-.055-i*.13,st,.33,.10,3.46,0xacaa9f,true);
    box(-10.33-i*.31,.003-i*.13,st,.047,.022,3.45,0xd2c2a1);
  }
  for (const z of [st-2.05,st+2.05]) {
    box(-11.9,.37,z,3.22,.66,.31,0xbab7ac,true);
    for (const x of [-13.63,-12.05,-10.46]) frame(x,1.33,z,.093,2.58,.108);
    frame(-11.97,.89,z,3.32,.068,.075,0x9c8f72);
    glass(-11.76,1.63,z,2.8,.74,.055,true);
  }
  box(-11.4,2.68,st,7.08,.31,5.02,0xb9b8ac,true);
  box(-11.4,2.50,st,6.94,.083,4.88,0x6c776e,true);
  for (const z of [st-1.08,st+1.08]) bulb(-11.36,2.446,z,4.12,.035,.12);
  box(-8.00,2.87,st,.24,.54,4.55,0x334442,true);
  box(-7.87,2.87,st+.0,.04,.46,4.38,0x534b6d);
  signage(group,'⑤ 공덕역','5호선 승강장',4.25,.466,-7.842,2.87,st,Math.PI/2,'#4f466c');
  signage(group,'⑤ 공덕역','지하철 입구',2.85,.66,-8.55,2.88,st+2.586,0,'#4f466c');
  box(-8.55,2.88,st+2.51,2.99,.69,.12,0x4f466c,true);

  } else if(entranceAsset&&!busOnly) {
    signage(group,'공덕역  1번 출구','5 · 6호선',3.75,.65,-5,2.68,-22.85,0,'#51436a');
    frame(-6.72,1.4,-22.9,.075,2.8,.085);
    frame(-3.28,1.4,-22.9,.075,2.8,.085);
  }
  // Curbside shelter cantilevers above, keeping the existing boarding point unobstructed.
  const bz=-42.4;
  for (const z of [bz-2.30,bz+.28,bz+2.34]) frame(10.65,1.28,z,.114,2.55,.125);
  glass(10.71,1.36,bz,.041,1.67,4.66,true);
  frame(10.71,.56,bz,.105,.065,4.77);
  frame(10.71,2.24,bz,.105,.076,4.77);
  box(9.53,2.63,bz,3.32,.19,5.10,0x61726d,true);
  box(9.53,2.72,bz,3.39,.075,5.16,0x89988a,true);
  frame(8.0,2.51,bz,.086,.076,5.03);
  bulb(9.27,2.49,bz,.117,.045,3.24);
  timber(10.55,.48,bz+.28,.34,.076,1.98);
  timber(10.68,.72,bz+.28,.062,.35,1.98);
  for (const z of [bz-.50,bz+1.07]) frame(10.57,.22,z,.22,.42,.065);
  box(10.66,1.27,bz+2.93,.28,2.54,.80,0x495f55,true);
  box(10.51,.80,bz+2.93,.042,.78,.65,0xc5c8b2);
  for (let i=0;i<4;i++) box(10.48,.55+i*.145,bz+2.94,.037,.036,.46,0x85948a);
  signage(group,BUS_COURSE.busNumber,BUS_COURSE.destinationLabel+' 방면',.77,.62,10.48,1.99,bz+2.93,-Math.PI/2,'#385a4c');
  signage(group,BUS_COURSE.busNumber,'공덕역 정류장',2.33,.56,9.21,2.97,bz+2.629,0,'#385a4c');
  box(9.21,2.97,bz+2.55,2.45,.62,.14,0x385a4c,true);
  box(8.76,.017,-42,1.06,.023,3.14,0xbbad83);
  for (const z of [-43.53,-40.47]) box(8.76,.032,z,1.06,.014,.045,0xe4d9b4);

  for (const {surface,shape,cast,receive,matrices} of batches.values()) {
    const geometry=shape==='cylinder'?new THREE.CylinderGeometry(.5,.5,1,8):
      shape==='leaf'?new THREE.IcosahedronGeometry(1,1):new THREE.BoxGeometry(1,1,1);
    const mesh=new THREE.InstancedMesh(geometry,surface,matrices.length);
    for (const [i,matrix] of matrices.entries()) mesh.setMatrixAt(i,matrix);
    mesh.castShadow=Boolean(cast);
    mesh.receiveShadow=receive;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return group;
}

export function populateGongdeok(world,{busOnly=Boolean(world.busOnly)}={}) {
  buildGongdeok(world.root,busOnly?null:world.transit.entrance,busOnly);
  world.traffic=addTraffic(world.root);
  world.streetBus=world.busModel(12.44,-42);
  if(!busOnly&&!world.transit.entrance) world.spot('station','역으로 들어가기',-5,-24);
  world.spot('bus',BUS_COURSE.busNumber+'번 버스 탑승',7,-42,{boarding:true,markerLabel:BUS_COURSE.busNumber+'번 탑승 위치'});
  world.bounds={minX:-10,maxX:10,minZ:-48,maxZ:32};
  world.people(14,{x:7,z:76,offset:-5,roamMultiplier:3});
}
