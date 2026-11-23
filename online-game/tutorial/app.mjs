import { World } from '/assets/world.js';
import { loadCommuter, movementSpeed } from '/assets/hero/motion.js';
import { STATION_ENTRANCE } from '/assets/journey.js';
import { loadTransit } from '/assets/transit-scene.js';
import { createTutorial, routes, steps } from './state.mjs';
import { createDialogue } from './dialogue.mjs';
import { createPracticeInput } from './input.mjs';
import { createVisualGuide } from './visual-guide.mjs';

const byId = id => document.getElementById(id);
const tutorial = createTutorial();
const dialogue = createDialogue(tutorial, undefined, readPosition);
const entranceTargetY = STATION_ENTRANCE.landing.y;
const integrated = Boolean(document.querySelector('meta[name="integrated-tutorial"][content="enabled"]'));
const listeners = new AbortController();
const inputKeys = createPracticeInput();
const editable = element => Boolean(element?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable=false])'));
let world;
let visualGuide;
let frameId;
let audio;
let completedUntil = 0;
let disposed = false;
let sceneKey;
let clock = 0;
let loaded = false;

function readPosition() {
  if (!world) return {};
  const { x, y, z } = world.hero.position;
  return { x, y, z, entranceTargetY, gateOpen: world.gate?.open };
}

function scene(mode, data, bounds) {
  visualGuide.clear();
  world.setStage(mode, data);
  if (bounds) world.bounds = bounds;
}

function loadScene(state) {
  if (!world) return;
  const stage = state.stage;
  let next;
  if (['entranceApproach', 'entrance', 'entranceTurn', 'entranceExit'].includes(stage)) next = 'entrance';
  else if (['gate', 'pass'].includes(stage)) next = 'hall';
  else if (['platform', 'railBoard'].includes(stage)) next = 'platform';
  else if (['railRide', 'railExit', 'bell', 'busRide', 'busExit'].includes(stage)) next = 'vehicle';
  else if (['busStop', 'busBoard'].includes(stage)) next = 'stop';
  else if (state.phase === 'complete') next = 'arrival';
  else next = 'street';
  if (sceneKey === next) return;
  sceneKey = next;
  switch (next) {
    case 'street': scene('street', { spawnZ: 9 }, { minX: -5, maxX: 5, minZ: -2, maxZ: 12 }); break;
    case 'entrance': scene('street', { connectedEntrance: true, spawnX: STATION_ENTRANCE.entry.x, spawnZ: -17 },
      { minX: STATION_ENTRANCE.opening.left, maxX: STATION_ENTRANCE.corridorRight, minZ: STATION_ENTRANCE.end, maxZ: -14 }); break;
    case 'hall':
      inputKeys.clear();
      scene('hall', { station: '공덕', line: '5', fromEntrance: true, spawnZ: 14 }, { minX: -3, maxX: 3, minZ: 1, maxZ: 19 });
      break;
    case 'platform': scene('platform', { line: '5', station: '공덕', neighbors: ['마포', '애오개·충정로'], spawnZ: 4 },
      { minX: -4.45, maxX: 4.45, minZ: -5, maxZ: 7 }); break;
    case 'stop': scene('street', { spawnX: 5, spawnZ: -36 }, { minX: 2, maxX: 9, minZ: -45, maxZ: -34 }); break;
    case 'vehicle': scene('vehicle', { type: state.route === 'bus' ? 'bus' : 'train', line: '5', next: '충정로역', spawnZ: 4 }); break;
    case 'arrival':
      if (state.route === 'rail') scene('platform', { line: '5', station: '충정로', neighbors: ['애오개', '서대문'], spawnZ: 4 });
      else scene('office', { busOnly: true, spawnZ: 10 });
      break;
  }
}

function render(state = tutorial.snapshot()) {
  const playing = state.phase === 'playing';
  const ready = state.phase === 'ready';
  const complete = state.phase === 'complete';
  const current = steps[state.stage];
  loadScene(state);
  if (world) {
    visualGuide.show(state.stage, tutorial.guide(readPosition()));
    if (state.stage === 'pass') world.openGate(clock);
    if (world.mode === 'vehicle') world.setVehicleDestination(
      ['busExit', 'railExit'].includes(state.stage) ? '충정로역 정차 · 문 열림' : '다음 충정로역');
  }
  byId('action-bar').hidden = !playing;
  byId('progress').textContent = state.route ? routes[state.route] + ' · 연습' : 'AI 출근 튜토리얼';
  byId('heading').textContent = current?.title ?? (complete ? '출근 연습 완료' : '출근길을 연습하세요');
  byId('hint').textContent = current?.hint ?? (complete
    ? '완료한 목표를 확인하거나 같은 경로를 다시 연습할 수 있습니다.'
    : loaded ? '경로를 선택하고 시작하세요. 제한 시간과 체력 소진이 없습니다.' : '장면을 준비하는 중입니다.');
  byId('routes').hidden = !ready;
  for (const route of Object.keys(routes)) byId(route).setAttribute('aria-pressed', String(state.route === route));
  byId('start').hidden = !ready;
  byId('start').disabled = !loaded;
  byId('continue').hidden = state.stage !== 'choose';
  byId('finish').hidden = !complete;
  if (!complete) byId('connection').hidden = true;
  byId('skip').disabled = !playing;
  byId('restart').disabled = ready;
  byId('exit').disabled = ready && !integrated;
  byId('count').textContent = state.completed.length;
  byId('goals').replaceChildren(...[...state.completed.map(key => [key, '완료']), ...state.skipped.map(key => [key, '건너뜀'])]
    .map(([key, label]) => Object.assign(document.createElement('li'), { textContent: steps[key].title + ' · ' + label })));
  for (const badge of byId('controls').children) badge.classList.toggle('lit', state.highlight === badge.dataset.topic);
  const notice = {
    platform: '마포 ←  |  → 애오개·충정로',
    railBoard: '5호선 · 정차 · 문 열림',
    railRide: '5호선 · 이동 중',
    railExit: '충정로역 · 문 열림',
    busStop: '공덕역 정류장 · 260번',
    busBoard: '260번 · 정차 · 앞문 열림',
    busRide: '260번 · 하차 요청',
    busExit: '충정로역 · 뒷문 열림',
  }[state.stage];
  byId('transit').hidden = !notice;
  byId('transit').textContent = notice ?? '';
}

function updateAfter(result, before) {
  if (result.state?.serial !== undefined && result.state.serial !== before.serial) {
    inputKeys.clear();
    completedUntil = 0;
    byId('completion').hidden = true;
    sceneKey = undefined;
  }
  if (integrated && result.outcome === 'ALLOW' && result.state?.phase === 'ready' && (before.phase !== 'ready' || result.name === 'exit_tutorial')) {
    location.assign('/');
    return;
  }
  render();
}

function control(name, args) {
  dialogue.clear();
  const before = tutorial.snapshot();
  const result = tutorial.execute(name, args);
  byId('feedback').textContent = result.message;
  updateAfter(result, before);
}

function practice(input) {
  const previous = tutorial.snapshot().stage;
  if (!tutorial.practice(input)) return false;
  if (!input.skip) {
    completedUntil = performance.now() + 1300;
    byId('completion').textContent = '✓ 완료 · ' + steps[previous].title;
    byId('completion').hidden = false;
    chime();
  }
  dialogue.clear();
  byId('feedback').textContent = '';
  render();
  return true;
}

function interaction() {
  const position = readPosition();
  if (!practice({ interact: true, ...position })) {
    const guide = tutorial.guide(position);
    byId('feedback').textContent = guide.key + ' · ' + guide.text;
  }
}

for (const route of Object.keys(routes)) byId(route).onclick = () => control('select_tutorial_route', { route });
byId('start').onclick = () => {
  const { route } = tutorial.snapshot();
  if (route) control('start_tutorial', { route });
  else {
    byId('feedback').textContent = '지하철 또는 버스를 먼저 선택하세요.';
    byId('rail').focus();
  }
};
byId('continue').onclick = () => practice({ confirmRoute: true });
byId('skip').onclick = () => practice({ skip: true });
byId('restart').onclick = () => control('restart_tutorial');
byId('exit').onclick = () => {
  if (integrated && tutorial.snapshot().phase === 'ready') location.assign('/');
  else control('exit_tutorial');
};
byId('official').onclick = () => {
  if (integrated) location.assign('/?practice=' + tutorial.snapshot().route);
  else byId('connection').hidden = false;
};

function armAudio() {
  if (disposed) return;
  try {
    if (!audio && globalThis.AudioContext) audio = new AudioContext();
    audio?.resume().catch(() => {});
  } catch { /* An unavailable audio device must not interrupt practice. */ }
}

function chime() {
  if (audio?.state !== 'running') return;
  const tone = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;
  tone.frequency.setValueAtTime(580, now);
  tone.frequency.setValueAtTime(850, now + .07);
  gain.gain.setValueAtTime(.055, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + .15);
  tone.connect(gain).connect(audio.destination);
  tone.start(now);
  tone.stop(now + .16);
}

document.addEventListener('pointerdown', armAudio, { signal: listeners.signal, once: true });

function appendMessage(style, text) {
  const log = byId('conversation');
  const message = document.createElement('p');
  message.className = style;
  message.textContent = text;
  log.append(message);
  while (log.children.length > 30) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
}

byId('chat').onsubmit = event => {
  event.preventDefault();
  if (!loaded) return;
  const input = byId('message');
  const request = input.value.trim();
  if (!request) return;
  const before = tutorial.snapshot();
  const result = dialogue.send(request);
  const state = tutorial.snapshot();
  appendMessage('request', request);
  appendMessage('reply', result.message);
  const row = document.createElement('li');
  const title = document.createElement('strong');
  title.textContent = result.outcome === 'WAIT' ? '대기 · 실행 전' : result.outcome;
  row.append(title, document.createTextNode(
    ' · ' + request + ' · ' + (result.name ?? '호출 없음') +
    (result.args ? ' ' + JSON.stringify(result.args) : '') + ' · ' + result.message +
    ' · ' + (steps[state.stage]?.title ?? (state.phase === 'complete' ? '완료' : '시작 전')) +
    (state.route ? ' / ' + routes[state.route] : '')));
  const calls = byId('calls');
  calls.prepend(row);
  while (calls.children.length > 20) calls.lastElementChild.remove();
  input.value = '';
  updateAfter(result, before);
};

addEventListener('keydown', event => {
  if (event.key === 'Escape' && editable(document.activeElement)) {
    inputKeys.clear();
    document.activeElement.blur();
    return;
  }
  const action = inputKeys.press(event.code, {
    playing: tutorial.snapshot().phase === 'playing',
    editing: editable(event.target) || editable(document.activeElement),
    composing: event.isComposing,
    repeat: event.repeat,
  });
  if (action === 'ignore') return;
  if (!audio) armAudio();
  event.preventDefault();
  if (action === 'interact') interaction();
}, { signal: listeners.signal });
addEventListener('keyup', event => inputKeys.release(event.code), { signal: listeners.signal });
addEventListener('blur', inputKeys.clear, { signal: listeners.signal });
document.addEventListener('visibilitychange', inputKeys.clear, { signal: listeners.signal });
document.addEventListener('focusin', event => { if (editable(event.target)) inputKeys.clear(); }, { signal: listeners.signal });
addEventListener('pagehide', () => {
  disposed = true;
  listeners.abort();
  inputKeys.clear();
  cancelAnimationFrame(frameId);
  audio?.close().catch(() => {});
  visualGuide?.clear();
  if (!world) return;
  const materials = new Set();
  const geometries = new Set();
  const textures = new Set();
  const collect = object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const m of Array.isArray(object.material) ? object.material : [object.material])
      if (m) materials.add(m);
  };
  world.scene.traverse(collect);
  for (const loaded of Object.values(world.transit)) loaded.scene.traverse(collect);
  for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  world.clear();
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  world.renderer.dispose();
  world.renderer.forceContextLoss();
}, { once: true });
addEventListener('pageshow', event => { if (event.persisted && disposed) location.reload(); });

function frame(now) {
  const dt = Math.min(.05, Math.max(0, now / 1000 - clock));
  clock = now / 1000;
  const state = tutorial.snapshot();
  if (state.phase === 'playing') {
    const active = !editable(document.activeElement) && !document.hidden && document.hasFocus();
    const { dx, dz, running } = inputKeys.motion(active);
    const moved = world.move(dx, dz, dt, running ? movementSpeed.run : movementSpeed.walk);
    world.advanceHero(dt, { running });
    if (state.stage === 'pass') world.gateTick(clock);
    practice({ ...readPosition(), dt, moved, running, diagonal: Boolean(dx && dz), forward: dz < 0, right: dx > 0 });
  }
  const current = tutorial.snapshot();
  world.update(dt, clock, { rideMoving: ['railRide', 'busRide'].includes(current.stage) });
  if (current.phase === 'playing') {
    const guide = tutorial.guide(readPosition());
    if (byId('action-key').textContent !== guide.key) byId('action-key').textContent = guide.key;
    if (byId('action-text').textContent !== guide.text) byId('action-text').textContent = guide.text;
    byId('action-bar').classList.toggle('ready', guide.ready);
    visualGuide.update(guide, current.highlight === 'target' || (current.highlight && current.highlight === steps[current.stage]?.topic));
  }
  if (now >= completedUntil) byId('completion').hidden = true;
  frameId = requestAnimationFrame(frame);
}

async function initialize() {
  if (integrated) {
    const access = await fetch('/api/tutorial-access', { cache: 'no-store' });
    if (access.status === 403) {
      location.replace('/');
      return;
    }
    if (access.status !== 204) throw new Error('연습 시작 상태를 확인하지 못했습니다.');
  }
  const [hero, transit] = await Promise.all([loadCommuter(), loadTransit(() => {})]);
  if (transit.failures.length) throw new Error('불러오지 못한 모델 · ' + transit.failures.join(', '));
  if (!disposed) {
    world = new World(byId('world'), hero, { signal: listeners.signal });
    world.transit = transit.loaded;
    visualGuide = createVisualGuide(world, byId('target'), byId('target-name'), byId('target-distance'),
      byId('target-arrow'), document.querySelector('.guide'), document.querySelector('.assistant'));
    loaded = true;
    byId('chat').querySelector('button').disabled = false;
    render();
    frameId = requestAnimationFrame(frame);
  }
}

try { await initialize(); } catch (error) {
  byId('exit').disabled = !integrated;
  byId('hint').textContent = '3D 장면을 열 수 없습니다. WebGL 2 설정과 모델 파일을 확인하세요.';
  byId('feedback').textContent = error.message;
  console.error(error);
}
