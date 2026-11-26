import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indicatorPosition } from '../guidance.mjs';
import { localTutorialFile, serveTutorial } from '../local-http.mjs';
import { createPracticeInput } from '../input.mjs';
import { createDialogue } from '../dialogue.mjs';
import { createTutorial, steps } from '../state.mjs';
import { World } from '../../online-game/dist/world.js';
import { entranceBlocked, entranceHeight } from '../../online-game/dist/transit-scene.js';

function fixture() {
  const game = createTutorial();
  const chat = createDialogue(game);
  return { game, send: chat.send };
}

test('equivalent phrasing calls the same movement and start tools', () => {
  const { game, send } = fixture();
  for (const request of ['이동 방법 알려줘', '어떻게 걸어?']) {
    const call = send(request);
    assert.equal(call.name, 'show_controls');
    assert.deepEqual(call.args, { topic: 'move' });
    assert.equal(game.snapshot().highlight, 'move');
  }
  for (const request of ['연습 시작해줘', '튜토리얼 해볼래']) {
    assert.equal(send(request).outcome, 'WAIT');
    assert.equal(game.snapshot().phase, 'ready');
  }
  assert.equal(send('버스').state.route, 'bus');
  assert.equal(game.snapshot().phase, 'playing');
});

test('status does not start a session and unrelated requests discard pending starts', () => {
  const { game, send } = fixture();
  assert.equal(send('연습 시작해줘').outcome, 'WAIT');
  assert.equal(send('지금 시작할 수 있어?').name, 'get_tutorial_status');
  assert.equal(send('버스').state.phase, 'ready');
  assert.equal(send('연습 시작해줘').state.route, 'bus');
  game.execute('exit_tutorial');
  assert.equal(send('연습 시작해줘').outcome, 'WAIT');
  assert.equal(send('취소').outcome, 'BLOCK');
  assert.equal(send('지하철').state.phase, 'ready');
});

test('explicit route, duplicate start, route locking, restart and exit', () => {
  const { game, send } = fixture();
  const initial = send('지하철 연습 시작해줘').state;
  assert.equal(initial.route, 'rail');
  assert.equal(send('연습 시작해줘').state.serial, initial.serial);
  assert.equal(send('버스로 바꿔줘').outcome, 'BLOCK');
  assert.equal(send('버스 연습 시작해줘').outcome, 'BLOCK');
  game.practice({ skip: true });
  assert.equal(send('처음부터').state.stage, 'walk');
  assert.deepEqual(game.snapshot().skipped, []);
  assert.equal(send('나가기').state.phase, 'ready');
  assert.equal(game.snapshot().route, null);
});

test('unknown tools, routes and injected identity cannot pass validation', () => {
  const { game, send } = fixture();
  assert.equal(send('택시 연습 시작해줘').outcome, 'BLOCK');
  for (const [name, args] of [
    ['execute_code', { code: 'alert(1)' }],
    ['start_tutorial', { route: 'boat' }],
    ['start_tutorial', {}],
    ['start_tutorial', { route: 'bus', userId: 'admin' }],
    ['get_tutorial_status', { role: 'admin' }],
    ['show_controls', { topic: 'database' }],
    ['show_controls', null],
  ]) assert.equal(game.execute(name, args).outcome, 'BLOCK');
  assert.equal(game.snapshot().phase, 'ready');
  const provider = createDialogue(game, () => { throw new Error('backend error'); });
  assert.equal(provider.send('버스').outcome, 'FAIL');
});

function at(game, flags = {}) {
  const [x, z] = steps[game.snapshot().stage].point;
  const height = entranceHeight(x, z);
  return game.practice({ x, z, y: height, entranceTargetY: height, ...flags });
}

function common(game, route) {
  assert.equal(game.execute('start_tutorial', { route }).outcome, 'ALLOW');
  assert.equal(game.practice({ x: 4, z: 9 }), false);
  assert.equal(at(game), true);
  assert.equal(game.practice({ moved: false, running: true, diagonal: true, dt: 1 }), false);
  assert.equal(game.practice({ moved: true, diagonal: true, dt: .25 }), false);
  assert.equal(game.practice({ moved: true, running: true, dt: .35 }), true);
  assert.equal(game.practice({ interact: true, x: 5, z: 12 }), false);
  assert.equal(at(game, { interact: true }), true);
  assert.equal(game.practice({ confirmRoute: true }), true);
}

test('rail completes only with the correct platform, opened gate and timed stop', () => {
  const game = createTutorial();
  common(game, 'rail');
  const [lane, landing] = steps.entrance.point;
  for (let z = -17; z >= landing; z -= .1) assert.equal(entranceBlocked(lane, z), false);
  assert.ok(entranceHeight(lane, landing) < -3);
  assert.ok(at(game)); // Stair entrance waypoint
  assert.ok(at(game)); // Landing
  assert.ok(at(game, { interact: true }));
  assert.equal(at(game, { gateOpen: false }), false);
  assert.ok(at(game, { gateOpen: true }));
  assert.equal(game.practice({ x: -4, z: 0 }), false);
  assert.ok(at(game));
  assert.equal(at(game, { right: false }), false);
  assert.ok(at(game, { right: true }));
  assert.equal(game.practice({ dt: 1, forward: true }), false);
  assert.ok(game.practice({ dt: 1.5 }));
  assert.ok(at(game, { forward: true }));
  assert.equal(game.snapshot().phase, 'complete');
  assert.equal(game.snapshot().completed.length, 12);
});

test('bus requires E at the sign, front door, bell, and rear door after the stop', () => {
  const game = createTutorial();
  common(game, 'bus');
  assert.equal(at(game), false);
  assert.ok(at(game, { interact: true }));
  assert.ok(at(game, { interact: true }));
  assert.ok(at(game, { interact: true }));
  assert.equal(game.practice({ interact: true, x: 0, z: -10.9 }), false);
  assert.ok(game.practice({ dt: 2.5 }));
  assert.equal(at(game), false);
  assert.ok(at(game, { interact: true }));
  assert.equal(game.snapshot().phase, 'complete');
  assert.equal(game.snapshot().completed.length, 9);
});

test('skip is marked separately and never advances an inactive session', () => {
  const game = createTutorial();
  assert.equal(game.practice({ skip: true }), false);
  game.execute('start_tutorial', { route: 'bus' });
  game.practice({ skip: true });
  assert.deepEqual(game.snapshot().completed, []);
  assert.deepEqual(game.snapshot().skipped, ['walk']);
});

test('game keys are ignored during text entry and held keys clear on focus loss', () => {
  const input = createPracticeInput();
  const playing = { playing: true };
  for (const key of ['ArrowUp', 'KeyE', 'ShiftLeft'])
    assert.equal(input.press(key, { ...playing, editing: true }), 'ignore');
  assert.deepEqual(input.motion(true), { dx: 0, dz: 0, running: false });
  for (const key of ['ArrowUp', 'ArrowRight', 'ShiftLeft']) input.press(key, playing);
  assert.deepEqual(input.motion(true), { dx: 1, dz: -1, running: true });
  input.motion(false);
  assert.deepEqual(input.motion(true), { dx: 0, dz: 0, running: false });
  assert.equal(input.press('KeyE', playing), 'interact');
  assert.equal(input.press('KeyE', { ...playing, repeat: true }), 'consume');
});

test('gate prompt, E eligibility, and dialogue use the same distance judgment', () => {
  const game = createTutorial();
  common(game, 'rail');
  assert.ok(at(game));
  assert.ok(at(game));
  assert.equal(game.snapshot().stage, 'gate');
  let position = { x: 0, z: 8 };
  const chat = createDialogue(game, undefined, () => position);
  assert.match(chat.send('개찰구가 어디야?').message, /^방향키.*개찰구/);
  assert.equal(game.guide(position).ready, false);
  assert.equal(game.practice({ ...position, interact: true }), false);
  position = { x: 0, z: 4.69 };
  for (const request of ['어디로 가?', '뭘 눌러?', '다시 알려줘']) {
    assert.equal(chat.send(request).message, 'E · 개찰구 열기');
    assert.equal(game.snapshot().stage, 'gate');
  }
  assert.equal(game.guide(position).ready, true);
  assert.ok(game.practice({ ...position, interact: true }));
  assert.match(game.guide({ x: 0, z: 1.6, gateOpen: false }).text, /열리는 중/);
  assert.doesNotMatch(game.guide({ x: 0, z: 1.6, gateOpen: true }).key, /E/);
});

test('edge projection handles all edges and a target directly behind the camera', () => {
  const rect = { left: 100, right: 300, top: 60, bottom: 260 };
  assert.deepEqual(indicatorPosition(130, 120, rect, {}), { x: 130, y: 120, edge: false, angle: 0 });
  for (const [x, y, expectedX, expectedY] of [
    [-1, 160, 100, 160], [401, 160, 300, 160], [200, -100, 200, 60], [200, 600, 200, 260],
  ]) {
    const position = indicatorPosition(x, y, rect, {});
    assert.equal(position.edge, true);
    assert.equal(Math.round(position.x), expectedX);
    assert.equal(Math.round(position.y), expectedY);
  }
  assert.equal(indicatorPosition(200, 160, rect, { behind: true }).y, 260);
});

test('local integration serves only tutorial paths and cannot handle official APIs', async () => {
  assert.equal(localTutorialFile('/api/play-start'), undefined);
  assert.equal(localTutorialFile('/tutorial/.env.local'), null);
  assert.equal(localTutorialFile('/assets/hero/../../server/app.mjs'), null);
  for (const path of ['/tutorial/', '/tutorial/visual-guide.mjs', '/assets/hero/commuter.glb']) {
    let status;
    const response = { writeHead: code => { status = code; return response; }, end: () => {} };
    assert.equal(await serveTutorial({ method: 'GET' }, response, path), true);
    assert.equal(status, 200);
  }
});

test('local menu exposes the guest link and preselects a server-listed course without starting it', async t => {
  const { accountInterface } = await import('../../online-game/dist/account-ui.js');
  const { setAccount } = await import('../../online-game/dist/online.js');
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.isConnected = true; }
    append(...items) { this.children.push(...items); }
    prepend(...items) { this.children.unshift(...items); }
    get lastChild() { return this.children.at(-1); }
    setAttribute(key, value) { this.attributes[key] = value; }
    focus() { this.focused = true; }
  }
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element('div'));
    return elements.get(id);
  };
  const original = { document: globalThis.document, location: globalThis.location, fetch: globalThis.fetch };
  t.after(() => { Object.assign(globalThis, original); setAccount(null); });
  let enabled = false;
  globalThis.document = { getElementById: get, createElement: tag => new Element(tag), querySelector: () => enabled };
  globalThis.location = { search: '?practice=bus' };
  let requests = 0;
  globalThis.fetch = async path => {
    assert.equal(path, '/api/courses');
    requests++;
    return { ok: true, json: async () => ({ courses: {
      demoRail: { transport: 'train', line: '5', label: '지하철' },
      demoBus: { transport: 'bus', busNumber: '260', label: '버스' },
    } }) };
  };
  const starts = [];
  const make = () => accountInterface({
    openDialog: () => {}, closeDialog: () => {},
    button: (text, onclick) => Object.assign(new Element('button'), { text, onclick }),
    start: id => starts.push(id),
  });
  make().renderMenu();
  assert.equal(get('menu-actions').children.some(child => child.href === '/tutorial/'), false);
  enabled = true;
  const menu = make();
  menu.renderMenu();
  assert.ok(get('menu-actions').children.some(child => child.href === '/tutorial/'));
  assert.equal(get('menu-actions').children.some(child => child.text === '게임 시작'), false);
  assert.equal(requests, 0);
  setAccount({ nickname: '연습', role: 'player' });
  get('menu-actions').children=[];
  menu.renderMenu();
  assert.equal(get('menu-actions').children.some(child => child.href === '/tutorial/'), false);
  await get('menu-actions').children.find(child => child.text === '게임 시작').onclick();
  const preferred = get('course-choices').children.find(child => 'data-practice-choice' in child.attributes);
  assert.ok(preferred.focused);
  assert.deepEqual(starts, []);
  preferred.onclick();
  assert.deepEqual(starts, ['demoBus']);
  setAccount(null);
  get('menu-actions').children=[];
  menu.renderMenu();
  assert.ok(get('menu-actions').children.some(child => child.href === '/tutorial/'));
});

test('the entrance waypoint accepts only the approach aligned with the right stair lane', () => {
  const game = createTutorial();
  common(game, 'rail');
  const [x, z] = steps.entranceApproach.point;
  assert.ok(x > -5 && z > -22.2);
  assert.equal(game.practice({ x: -6, z }), false);
  assert.equal(game.practice({ x: -5, z }), false);
  const right = game.guide({ x, z });
  assert.match(right.label, /오른쪽/);
  for (const offset of [-right.radius, 0, right.radius])
    assert.equal(entranceBlocked(x + offset, -23), false);
  assert.equal(game.practice({ x, z }), true);
});

test('real World.move can descend the right lane and the landing requires the lower elevation', () => {
  const game = createTutorial();
  common(game, 'rail');
  assert.ok(at(game));
  const [x, z] = steps.entrance.point;
  const entranceTargetY = entranceHeight(x, z);
  assert.ok(x > -5 && entranceTargetY < -3);
  assert.equal(game.practice({ x, z, y: 0, entranceTargetY }), false);
  const world = Object.assign(Object.create(World.prototype), {
    hero: { position: { x, z: -21, y: 0 } }, mode: 'street', transit: { entrance: true },
    moveOrigin: { set(x, y) { Object.assign(this, { x, y }); } }, bounds: { minX: -7, maxX: -3, minZ: -33, maxZ: -14 },
  });
  for (let frame = 0; frame < 250 && game.snapshot().stage === 'entrance'; frame++) {
    assert.ok(world.move(0, -1, .02, 3.6));
    game.practice({ ...world.hero.position, entranceTargetY });
  }
  assert.equal(game.snapshot().stage, 'gate');
  assert.ok(world.hero.position.y < -3);
});

test('a valid session redirects every direct tutorial page entry to the main menu', async () => {
  for (const path of ['/tutorial', '/tutorial/', '/tutorial/index.html']) {
    let result;
    const response = { writeHead: (status, headers) => { result = { status, headers }; return response; }, end() {} };
    assert.ok(await serveTutorial({ method: 'GET' }, response, path, async () => true));
    assert.equal(result.status, 302);
    assert.equal(result.headers.Location, '/');
  }
});

test('signup field messages follow the existing nickname and PIN rules', async () => {
  const { validateSignup, signupFailure } = await import('../../online-game/dist/account-rules.js');
  assert.deepEqual(validateSignup('', '').errors, {
    nickname: '닉네임을 입력해주세요.', password: '비밀번호를 입력해주세요.',
  });
  const pin = ['0', '1', '2', '3'].join('');
  for (const nickname of ['가나다라마바사아자차', 'Abcdefghij', '첫출근']) {
    const result = validateSignup(nickname, pin);
    assert.deepEqual(result.errors, {});
    assert.equal(result.password, pin);
  }
  assert.match(validateSignup('Abcdefghijk', pin).errors.nickname, /10자/);
  assert.match(validateSignup('공 백', pin).errors.nickname, /공백/);
  for (const nickname of ['닉1', '닉!', 'ㄱ']) assert.match(validateSignup(nickname, pin).errors.nickname, /완성형과 영문만/);
  for (const password of ['012', '01234', '0A23']) assert.match(validateSignup('출근', password).errors.password, /숫자 4자리/);
  assert.equal(signupFailure({ status: 409, message: 'duplicate_id' }).field, 'nickname');
  const network = signupFailure(new TypeError('network unavailable'));
  assert.equal(network.field, undefined);
  assert.match(network.message, /연결/);
  assert.doesNotMatch(signupFailure({ status: 500, message: 'duplicate_id' }).message, /이미 사용/);
});

test('signup exposes both field errors before fetch and preserves entries on server failure', async t => {
  const { accountInterface } = await import('../../online-game/dist/account-ui.js');
  const original = { document: globalThis.document, fetch: globalThis.fetch, FormData: globalThis.FormData };
  t.after(() => Object.assign(globalThis, original));
  let focused, markup, pendingReject, requests = 0;
  const field = name => ({
    value: '', addEventListener() {}, setAttribute() {}, removeAttribute() {}, focus() { focused = name; },
  });
  const nickname = field('nickname'), password = field('password'), submit = {};
  const form = { elements: { nickname, password }, querySelector: () => submit };
  const elements = { 'account-form': form, 'account-exit': {}, 'account-status': {}, 'nickname-error': {}, 'password-error': {} };
  globalThis.document = { querySelector: () => null, getElementById: id => elements[id] };
  globalThis.FormData = class { get(name) { return form.elements[name].value; } };
  globalThis.fetch = async () => {
    requests++;
    return new Promise((_, reject) => { pendingReject = reject; });
  };
  accountInterface({ openDialog: html => { markup = html; }, closeDialog() {} }).accountForm('signup');
  assert.match(markup, /novalidate/);
  assert.match(markup, /nickname-rule nickname-error/);
  assert.match(markup, /type="password" inputmode="numeric"/);
  const event = { preventDefault() {} };
  await form.onsubmit(event);
  assert.match(elements['nickname-error'].textContent, /입력해주세요/);
  assert.match(elements['password-error'].textContent, /입력해주세요/);
  assert.equal(focused, 'nickname');
  assert.equal(requests, 0);
  nickname.value = '출근연습';
  password.value = ['0', '1', '2', '3'].join('');
  const submission = form.onsubmit(event);
  await form.onsubmit(event);
  assert.equal(requests, 1);
  pendingReject(new TypeError('network'));
  await submission;
  assert.match(elements['account-status'].textContent, /연결/);
  assert.equal(elements['nickname-error'].textContent, '');
  assert.equal(nickname.value, '출근연습');
  assert.equal(password.value.length, 4);
  assert.equal(submit.disabled, false);
});
