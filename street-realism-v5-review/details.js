import * as T from '../dist/vendor/three.module.js';

function map(size,paint,space=T.SRGBColorSpace) {
  const c=document.createElement('canvas');c.width=c.height=size;
  paint(c.getContext('2d'),size);
  const texture=new T.CanvasTexture(c);
  texture.colorSpace=space;
  texture.anisotropy=4;
  return texture;
}
function random(seed) {
  return ()=>((seed=Math.imul(1664525,seed)+1013904223>>>0)/4294967296);
}

export function cladding(type) {
  const seam=type==='stone'?4:2;
  const color=map(256,(c,n)=>{
    const r=random(type==='stone'?91:43);
    c.fillStyle=type==='stone'?'#888780':'#775a4b';
    c.fillRect(0,0,n,n);
    const rows=type==='stone'?4:12, width=type==='stone'?128:64;
    for(let y=0;y<rows;y++)for(let x=-1;x<n/width;x++){
      const v=Math.round(172+r()*24), off=type==='stone'?0:y%2*width/2;
      c.fillStyle=type==='stone'?`rgb(${v},${v-3},${v-8})`:`rgb(${v},${v-38},${v-55})`;
      c.fillRect(x*width+off+seam,y*n/rows+seam,width-seam,n/rows-seam);
    }
    for(let i=0;i<4200;i++){
      c.fillStyle=i%2?'rgba(24,20,12,.12)':'rgba(252,245,231,.15)';
      c.fillRect(r()*n,r()*n,r()*1.9+.45,1+r()*2);
    }
    const wash=c.createLinearGradient(0,185,0,256);
    wash.addColorStop(0,'transparent');wash.addColorStop(1,'rgba(52,55,47,.14)');
    c.fillStyle=wash;c.fillRect(0,185,n,71);
  });
  const roughness=map(64,(c,n)=>{
    const r=random(363);c.fillStyle='#d4d4d4';c.fillRect(0,0,n,n);
    for(let i=0;i<240;i++){
      c.fillStyle=i%2?'#c1c1c1':'#dfdfdf';c.fillRect(r()*n,r()*n,1.5,2);
    }
  },T.NoColorSpace);
  const bump=map(128,(c,n)=>{
    const r=random(66),rows=type==='stone'?4:12,width=type==='stone'?64:32;
    c.fillStyle='#888';c.fillRect(0,0,n,n);
    c.fillStyle='#a5a5a5';
    for(let y=0;y<rows;y++)for(let x=-1;x<n/width;x++){
      const off=type==='stone'?0:y%2*width/2;
      c.fillRect(x*width+off+seam/2,y*n/rows+seam/2,width-seam/2,n/rows-seam/2);
    }
    for(let i=0;i<900;i++){
      c.fillStyle=i%2?'#acacac':'#989898';c.fillRect(r()*n,r()*n,.8,.8);
    }
  },T.NoColorSpace);
  for(const tex of [color,bump,roughness])tex.wrapS=tex.wrapT=T.RepeatWrapping;
  const material=new T.MeshStandardMaterial({map:color,bumpMap:bump,bumpScale:.018,roughnessMap:roughness,roughness:.94});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>', `
      #include <uv_vertex>
      #ifdef USE_INSTANCING
        vec3 pointForTile=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;
        vec2 tileUV=vec2(abs(normal.x)>.5?pointForTile.z:pointForTile.x,pointForTile.y)
          / ${type==='stone'?'2.25':'1.63'};
        vMapUv=tileUV;
        #ifdef USE_BUMPMAP
          vBumpMapUv=tileUV;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv=tileUV;
        #endif
      #endif
    `);
  };
  material.customProgramCacheKey=()=>type;
  const light=new T.MeshLambertMaterial({map:color});
  light.onBeforeCompile=material.onBeforeCompile;
  light.customProgramCacheKey=()=>type;
  material.userData.light=light;
  return material;
}

export function addShop({root,q,w,base,z,label,kind}) {
  const food=kind==='food', doorU=food?-w*.31:w*.25;
  const casing=food?'wood':'metal', wall=food?'warmWall':'opticWall';
  const roomDepth=3;
  q(wall,0,1.39,roomDepth,w-.29,2.79,.12);
  q(food?'warmFloor':'opticWall',0,.014,1.57,w-.28,.034,3.2);
  q('cream',0,2.72,1.53,w-.30,.08,3.15);
  for(const u of [-w/2+.18,w/2-.18]) {
    q(wall,u,1.36,1.60,.14,2.74,2.95);
    q(food?'brick':'opticWall',u,1.34,.10,.24,2.66,.53);
  }
  if(food){
    q('redTrim',0,3.20,-.20,w-.55,.66,.26,{cast:true});
    const awningW=w-.62;
    for(let i=0;i<17;i++){
      const u=(i-8)*awningW/17;
      const cloth=i%3===0?'canvasLight':'canvasRed';
      q(cloth,u,2.59,-.45,awningW/17+.004,.067,1.04,{roll:.24,cast:true});
      q(cloth,u,2.432,-.938,awningW/17+.004,.17,.065);
    }
    q('metal',0,2.48,-.94,awningW,.043,.041);

    for(const u of [-.80,1.65,3.91]){
      q('dinerWood',u,.78,1.07,1.06,.091,.72);
      for(const i of [-1,1])for(const j of [-1,1])
        q('steelDark',u+i*.42,.40,1.07+j*.25,.057,.71,.057);
      for(const side of [-1,1]){
        const c=u+side*.82;
        q('redTrim',c,.46,1.07,.46,.091,.46);
        q('redTrim',c+side*.19,.70,1.07,.07,.48,.45);
        for(const j of [-1,1])q('steelDark',c+j*.15,.25,1.07,.043,.42,.38);
      }
      q('warmWall',u+.22,.85,1.08,.26,.047,.24);
      q('lamp',u,2.57,1.38,.55,.055,.44,{receive:false});
    }
    q('opticWall',w*.31,.53,2.42,2.94,1.05,.72);
    q('dinerWood',w*.31,1.081,2.42,3.01,.091,.79);
    q('cream',-1.38,1.70,2.93,3.33,.68,.035);
    label(root,'김밥    떡볶이    어묵','따뜻한 국물 · 포장',base+2.90,1.70,z-1.38,3.26,.63,-Math.PI/2,'#8e3f27');
    label(root,'공덕 한끼','김밥 · 떡볶이',base-.338,3.20,z,5.15,.55,-Math.PI/2,'#9d3427');
    label(root,'포장 가능','',base+.11,1.12,z-1.97,.61,.29,-Math.PI/2,'#795039');
  }else{
    q('opticWall',0,3.17,-.13,w-.42,.62,.22,{cast:true});
    label(root,'연우안경','시력 검사 · 안경 수리',base-.248,3.17,z,5.20,.50,-Math.PI/2,'#244844');

    for(const u of [-2.27,.39]){
      q('opticCabinet',u,.49,1.12,1.92,.95,.71);
      q('opticWall',u,.981,1.12,1.98,.060,.76);
      q('clearFacade',u,1.11,.748,1.96,.24,.021,{receive:false});
    }
    for(const y of [.91,1.30,1.69,2.05]){
      q('opticCabinet',-1.08,y,2.47,5.95,.058,.38);
      q('lamp',-1.08,y+.078,2.64,5.78,.027,.078,{receive:false});
    }
    q('opticCabinet',3.29,.54,2.34,2.18,1.03,.76);
    q('opticWall',3.29,1.078,2.34,2.22,.05,.80);
    const ring=new T.TorusGeometry(.056,.007,3,11);
    const m=new T.MeshStandardMaterial({color:0x262628,metalness:.45,roughness:.33});
    const displays=[];
    for(const y of [1.055,1.445,1.835,2.195]) for(let i=0;i<10;i++)displays.push([-3.60+i*.54,y,2.305]);
    for(const u of [-2.27,.39])for(let i=0;i<4;i++)displays.push([u-.66+i*.44,1.066,.985]);
    const pairs=new T.InstancedMesh(ring,m,displays.length*2);
    const obj=new T.Object3D();
    obj.rotation.y=-Math.PI/2;
    displays.forEach(([u,y,d],i)=>{
      for(const side of [-1,1]){
        obj.position.set(base+d,y,z+u+side*.061);
        obj.updateMatrix();
        pairs.setMatrixAt(i*2+(side===1?1:0),obj.matrix);
      }
      q('steelDark',u,y+.012,d,.035,.014,.020);
    });
    pairs.computeBoundingSphere();
    const lod=new T.LOD();
    lod.position.set(base+1.52,1.33,z);
    pairs.position.copy(lod.position).multiplyScalar(-1);
    lod.addLevel(pairs,0);
    lod.addLevel(new T.Group(),13.3,.08);
    root.add(lod);
  }
  const edges=[-w/2+.24,doorU-.61,doorU+.61,w/2-.24].sort((a,b)=>a-b);
  for(let i=0;i<edges.length-1;i++){
    const lo=edges[i],hi=edges[i+1],center=(lo+hi)*.5;
    const door=Math.abs(center-doorU)<.01;
    const sill=door?.032:food?.68:.37;
    const top=food?2.57:2.73;
    const depth=door?.44:.20;
    q('clearFacade',center,(top+sill)*.5,depth,hi-lo-.043,top-sill-.026,.014,{receive:false});
    for(const u of [lo,hi])q(casing,u,(top+sill)*.5,depth,.069,top-sill,.16);
    for(const y of [sill,top])q(casing,center,y,depth,hi-lo,.065,.15);
    if(!door) {
      q(food?'redTrim':'opticWall',center,food?.35:.18,.21,hi-lo,food?.63:.33,.25);
      q('slate',center,.073,.035,hi-lo,.144,.078);
      if(food)q(casing,center,1.66,depth,hi-lo,.037,.075);
    }
    if(door){
      q('granite',center,.021,.22,1.26,.043,.66);
      q('metal',center+.40,1.08,depth-.073,.040,.34,.048);
    }
  }
}

export function foliageSheets(points,rng,high) {
  const positions=[],uv=[],colors=[];
  for(const point of points){
    const number=high?13:4;
    for(let j=0;j<number;j++){
      const a=rng()*Math.PI*2, rad=Math.sqrt(rng())*.67, tilt=(rng()-.5)*1.3;
      const x=point.x+Math.cos(a)*rad;
      const y=point.y+(rng()-.45)*1.09;
      const z=point.z+Math.sin(a)*rad;
      const w=(high?.34:.48)+rng()*.35,h=w*(.66+rng()*.43);
      const side=[Math.cos(a)*w,Math.sin(tilt)*w,Math.sin(a)*w];
      const up=[-Math.sin(a)*Math.sin(tilt)*h,Math.cos(tilt)*h,Math.cos(a)*Math.sin(tilt)*h];
      const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
      const tint=.72+rng()*.29;
      for(const k of [0,1,2,0,2,3]){
        const [u,v]=corners[k];
        positions.push(x+side[0]*u+up[0]*v,y+side[1]*u+up[1]*v,z+side[2]*u+up[2]*v);
        uv.push((u+1)/2,(v+1)/2);
        colors.push(tint,tint,tint*.91);
      }
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();
  return geo;
}

export function foliageMaterial(){
  const texture=map(256,(c,n)=>{
    const r=random(906);
    for(let i=0;i<53;i++){
      const theta=r()*6.283, distance=Math.sqrt(r())*.87, leaf=9+r()*17;
      const x=n/2+Math.cos(theta)*distance*108, y=n/2+Math.sin(theta)*distance*104;
      c.save();c.translate(x,y);c.rotate(theta+(r()-.5)*1.8);
      const v=55+Math.floor(r()*62);
      c.fillStyle=`rgb(${v-20},${v+22},${Math.floor(v*.42)})`;
      c.beginPath();c.moveTo(-leaf*.85,0);
      c.bezierCurveTo(-leaf*.40,-leaf*.69,leaf*.30,-leaf*.48,leaf,0);
      c.bezierCurveTo(leaf*.39,leaf*.47,-leaf*.32,leaf*.66,-leaf*.85,0);
      c.fill();
      c.strokeStyle='rgba(190,210,135,.30)';c.lineWidth=1;
      c.beginPath();c.moveTo(-leaf*.71,0);c.lineTo(leaf*.77,0);c.stroke();c.restore();
    }
  });
  return new T.MeshLambertMaterial({map:texture,alphaTest:.48,side:T.DoubleSide,vertexColors:true,
    color:0xffffff,emissive:0x101b08,emissiveIntensity:.40});
}

export function barkTexture(){
  const tex=map(128,(g,size)=>{
    const r=random(793);
    g.fillStyle='#9c8c71';g.fillRect(0,0,size,size);
    for(let i=0;i<155;i++){
      const x=r()*size,y=r()*size;
      g.strokeStyle=i%2?'rgba(61,47,35,.36)':'rgba(228,203,168,.40)';
      g.lineWidth=.55+r()*1.3;
      g.beginPath();g.moveTo(x,y);
      g.bezierCurveTo(x-1-r()*3,y+10,x+3,y+23,x-2+r()*5,y+31+r()*35);
      g.stroke();
    }
  });
  tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(2,2);
  return tex;
}
