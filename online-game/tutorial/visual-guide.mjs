import * as THREE from '/assets/vendor/three.module.js';
import { entranceHeight } from '/assets/transit-scene.js';
import { indicatorPosition } from './guidance.mjs';

const outlines = {
  railBoard: [[6.39, 1.53, 0], [.12, 2.35, 1.35]],
  railExit: [[0, 1.16, -11.06], [1.5, 2.32, .1]],
  busBoard: [[11.05, 1.52, -38.5], [.16, 2.55, 1.35]],
  bell: [[1.4, 1.3, -5], [.48, .55, .36]],
  busExit: [[0, 1.17, -11.07], [1.55, 2.3, .12]],
};

export function createVisualGuide(world, marker, label, distance, arrow, guidePanel, chatPanel) {
  const viewPoint = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  let group, ring, fill, outline, stage;

  function clear() {
    if (group) {
      group.removeFromParent();
      group.traverse(object => {
        object.geometry?.dispose();
        object.material?.dispose();
      });
    }
    group = ring = fill = outline = stage = undefined;
    marker.hidden = true;
  }

  function show(next, guide) {
    if (!guide.point) { clear(); return; }
    if (stage === next) return;
    clear();
    stage = next;
    group = new THREE.Group();
    world.root.add(group);
    const [x, z] = guide.point;
    const ground = stage.startsWith('entrance') ? entranceHeight(x, z) :
      world.mode === 'platform' ? .3 : 0;
    group.position.set(x, ground + .045, z);
    const radius = guide.radius;
    ring = new THREE.Mesh(new THREE.RingGeometry(radius - .075, radius, 48),
      new THREE.MeshBasicMaterial({ color: '#b9f4ff', side: THREE.DoubleSide }));
    fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 48),
      new THREE.MeshBasicMaterial({ color: '#3dc3e0', transparent: true, opacity: .24, depthWrite: false }));
    for (const mesh of [ring, fill]) {
      mesh.rotation.x = -Math.PI / 2;
      group.add(mesh);
    }
    anchor.set(x, ground + 1.6, z);
    if (next === 'gate' || next === 'pass') {
      const gate = world.root.getObjectByName('개찰구');
      if (gate) {
        const box = new THREE.Box3().setFromObject(gate);
        outline = new THREE.Box3Helper(box, '#ffcf71');
        // Store the helper in world coordinates while owning its resources here.
        const holder = new THREE.Group();
        holder.position.copy(group.position).negate();
        holder.add(outline);
        group.add(holder);
      }
    } else if (outlines[next]) {
      const [center, size] = outlines[next];
      const box = new THREE.BoxGeometry(...size);
      const edges = new THREE.EdgesGeometry(box);
      box.dispose();
      outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: '#ffcf71' }));
      outline.position.set(...center).sub(group.position);
      group.add(outline);
    }
    label.textContent = guide.label;
  }

  function update(guide, emphasized) {
    if (!group) return;
    const view = viewPoint.copy(anchor).applyMatrix4(world.camera.matrixWorldInverse);
    const depth = Math.max(Math.abs(view.z), .1);
    const projection = world.camera.projectionMatrix.elements;
    const x = innerWidth * (.5 + view.x * projection[0] / depth * .5);
    const y = innerHeight * (.5 - view.y * projection[5] / depth * .5);
    const left = guidePanel.getBoundingClientRect();
    const right = chatPanel.getBoundingClientRect();
    const compact = innerWidth <= 740;
    const rect = compact
      ? { left: 76, right: innerWidth - 76, top: 68, bottom: Math.max(94, Math.min(left.top, right.top) - 30) }
      : { left: left.right + 72, right: right.left - 72, top: 75, bottom: innerHeight - 118 };
    if (rect.right <= rect.left || rect.bottom <= rect.top) {
      rect.left = 68;
      rect.right = innerWidth - 68;
      rect.bottom = Math.max(rect.top + 16, Math.min(left.top, right.top) - 27);
    }
    const coords = indicatorPosition(x, y, rect, { behind: view.z >= 0 });
    marker.hidden = false;
    marker.style.left = coords.x + 'px';
    marker.style.top = coords.y + 'px';
    marker.classList.toggle('ready', guide.ready);
    marker.classList.toggle('emphasis', emphasized);
    arrow.hidden = !coords.edge;
    arrow.style.transform = 'rotate(' + coords.angle + 'deg)';
    distance.textContent = Number.isFinite(guide.distance) ? (guide.ready ? '범위 안' : guide.distance.toFixed(1) + ' m') : '';
    ring.material.color.set(guide.ready ? '#ffe08a' : emphasized ? '#ffffff' : '#b9f4ff');
    fill.material.opacity = guide.ready ? .36 : .22;
    outline?.material.color.set(guide.ready ? '#fff2b0' : '#ffa860');
  }

  return { show, update, clear };
}
