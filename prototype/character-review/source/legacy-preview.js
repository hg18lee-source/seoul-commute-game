import * as THREE from 'three';

// Rest-pose geometry copied from dist/world.js for a like-for-like static comparison.
export function legacyFigure() {
  const figure = new THREE.Group();
  const material = color => new THREE.MeshStandardMaterial({color, roughness:.88});
  function add(parent, geometry, color, x, y, z, shadow=false) {
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
  const cube = (p,w,h,d,c,x,y,z) => add(p,new THREE.BoxGeometry(w,h,d),c,x,y,z);
  cube(figure,.58,.7,.32,0x324858,0,1.11,0);
  cube(figure,.35,.45,.18,0x263b35,0,1.18,.23);
  add(figure,new THREE.IcosahedronGeometry(.23,1),0xd6b28b,0,1.7,0);
  add(figure,new THREE.SphereGeometry(.235,7,4,0,Math.PI*2,0,Math.PI*.6),0x313735,0,1.75,0);
  for (const side of [-1,1]) {
    const leg = new THREE.Group();
    leg.position.set(side*.16,.77,0);
    cube(leg,.21,.63,.23,0x686b63,0,-.31,0);
    cube(leg,.23,.13,.36,0x293b32,0,-.66,-.05);
    figure.add(leg);
    const arm = new THREE.Group();
    arm.position.set(side*.39,1.4,0);
    cube(arm,.16,.56,.19,0x324858,0,-.24,0);
    cube(arm,.14,.14,.15,0xd6b28b,0,-.56,0);
    figure.add(arm);
  }
  figure.traverse(node => { if (node.isMesh) node.castShadow = true; });
  return figure;
}
