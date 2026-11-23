import { STATION_ENTRANCE } from '../dist/journey.js';
import { describeTarget } from './guidance.mjs';

export const routes = Object.freeze({ rail: '지하철 5호선', bus: '260번 버스' });
const {entry,landing,turn,exit}=STATION_ENTRANCE;
export const steps = Object.freeze({
  walk: { title: '방향키로 이동', hint: '↑를 눌러 앞의 초록 표시까지 걸어가세요.', topic: 'move', point: [0, 5] },
  skills: { title: '대각선과 달리기', hint: '방향키 두 개로 대각선 이동하고, Shift와 방향키를 함께 눌러 달려보세요.', topic: 'run' },
  interact: { title: '표시에서 상호작용', hint: '표시 근처에서 E를 눌러 안내를 확인하세요.', topic: 'interact', point: [0, 1] },
  choose: { title: '연습 경로 확인', hint: '선택한 경로를 확인하고 이동하세요.' },
  entranceApproach: { title: '공덕역 계단 입구', hint: '입구 오른쪽 통로 표시로 이동하세요.', topic: 'rail', point: [entry.x, entry.z+1.19] },
  entrance: { title: '오른쪽 계단 내려가기', hint: '계단 아래 표시까지 내려가세요.', topic: 'rail', point: [landing.x, landing.z] },
  entranceTurn: { title: '대합실로 이동', hint: '바닥 화살표를 따라 우측 통로로 이동하세요.', topic: 'rail', point: [turn.x, turn.z] },
  entranceExit: { title: '대합실로 이동', hint: '모서리를 돌아 통로 안쪽 표시까지 걸으세요.', topic: 'rail', point: [exit.x, exit.z-.35] },
  gate: { title: '교통카드 찍기', hint: '개찰구 근처에서 E를 눌러 문을 여세요.', topic: 'interact', point: [0, 4.69] },
  pass: { title: '개찰구 통과', hint: '문이 열리면 중앙에서 ↑를 눌러 통과하세요.', topic: 'rail', point: [0, 1.6] },
  platform: { title: '승강장 방향 확인', hint: '오른쪽 애오개·충정로 방면을 선택하세요. 왼쪽은 마포 방면입니다.', topic: 'rail', point: [2.7, 1.5] },
  railBoard: { title: '열린 열차 문으로 탑승', hint: '열린 문 표시에서 →를 눌러 걸어 타세요.', topic: 'rail', point: [4.45, 0] },
  railRide: { title: '충정로역 정차 대기', hint: '정차 안내가 나올 때까지 잠시 기다리세요.' },
  railExit: { title: '열린 열차 문으로 하차', hint: '앞쪽 문 표시까지 ↑로 걸어 내려가세요.', topic: 'rail', point: [0, -10.9] },
  busStop: { title: '공덕역 정류장 확인', hint: '260번 표시 가까이에서 E를 눌러 노선을 확인하세요.', topic: 'bus', point: [7, -42] },
  busBoard: { title: '앞문에서 탑승', hint: '버스 앞쪽의 초록 표시로 이동해 E를 누르세요.', topic: 'bus', point: [8.5, -38.5] },
  bell: { title: '하차 벨 누르기', hint: 'STOP 표시 옆에서 E를 누르세요.', topic: 'bus', point: [1.1, -5] },
  busRide: { title: '정류장 도착 대기', hint: '충정로역 정차 안내가 나올 때까지 잠시 기다리세요.' },
  busExit: { title: '뒷문에서 하차', hint: '뒷문 표시 근처에서 E를 눌러 내리세요.', topic: 'bus', point: [0, -10.9] },
});

const sequence = {
  walk: 'skills', skills: 'interact', interact: 'choose',
  entranceApproach: 'entrance', entrance: 'entranceTurn', entranceTurn: 'entranceExit', entranceExit: 'gate', gate: 'pass', pass: 'platform', platform: 'railBoard',
  railBoard: 'railRide', railRide: 'railExit', railExit: 'complete',
  busStop: 'busBoard', busBoard: 'bell', bell: 'busRide',
  busRide: 'busExit', busExit: 'complete',
};
const topics = {
  move: '↑ ↓ ← →로 이동합니다. 방향키 두 개를 함께 누르면 대각선으로 이동합니다.',
  run: '방향키를 누른 채 Shift를 누르면 달립니다. 연습 중에는 체력이 줄지 않습니다.',
  interact: '목표 표시 가까이에서 E를 한 번 누르세요.',
  rail: '개찰구에서 E를 누르고 방향 표지를 확인하세요. 열차 문이 열리면 걸어서 승하차합니다.',
  bus: '260번 앞문에서 E로 타고, 벨에서 E를 누른 뒤 정차하면 뒷문에서 E로 내립니다.',
};

export const schemas = Object.freeze({
  show_controls: Object.freeze({ topic: Object.freeze(Object.keys(topics)) }),
  get_tutorial_status: {},
  get_current_guidance: {},
  locate_gate: {},
  select_tutorial_route: Object.freeze({ route: Object.freeze(Object.keys(routes)) }),
  start_tutorial: Object.freeze({ route: Object.freeze(Object.keys(routes)) }),
  restart_tutorial: {},
  exit_tutorial: {},
});

export function createTutorial() {
  let state = { phase: 'ready', route: null, stage: null, completed: [], skipped: [], diagonal: 0, running: 0, elapsed: 0, serial: 0, highlight: null };
  const snapshot = () => ({ ...state, completed: [...state.completed], skipped: [...state.skipped] });
  const reset = (phase, route) => {
    state = { phase, route, stage: phase === 'playing' ? 'walk' : null, completed: [], skipped: [], diagonal: 0, running: 0, elapsed: 0, serial: state.serial + 1, highlight: null };
  };
  const guide = (context = {}) => describeTarget(state.stage, steps[state.stage]?.point, context);
  function execute(name, args = {}, context = {}) {
    const respond = (outcome, message) => ({ outcome, message, state: snapshot() });
    if (!Object.hasOwn(schemas, name) || !args || Object.getPrototypeOf(args) !== Object.prototype)
      return respond('BLOCK', '허용되지 않는 기능 또는 입력입니다.');
    const schema = schemas[name];
    if (Object.keys(args).length !== Object.keys(schema).length ||
        !Object.entries(schema).every(([key, options]) => Object.hasOwn(args, key) && options.includes(args[key])))
      return respond('BLOCK', '필수값 또는 입력 범위가 올바르지 않습니다.');
    switch (name) {
      case 'show_controls':
        state.highlight = args.topic;
        return respond('ALLOW', topics[args.topic]);
      case 'locate_gate':
        if (!['gate', 'pass'].includes(state.stage)) {
          return respond('ALLOW', '개찰구는 공덕역 계단 아래 대합실에 있습니다. 지금 목표는 ' +
            (steps[state.stage]?.title ?? '연습 경로 선택') + '입니다.');
        }
        // The same highlighted approach that controls the interaction.
      case 'get_current_guidance': {
        const current = guide(context);
        if (!current.text) return respond('ALLOW', '먼저 연습을 시작하세요.');
        state.highlight = 'target';
        return respond('ALLOW', current.key + ' · ' + current.text);
      }
      case 'get_tutorial_status':
        return respond('ALLOW', state.phase === 'playing' ? steps[state.stage].hint :
          state.phase === 'complete' ? '연습을 마쳤습니다. 처음부터 하거나 나갈 수 있습니다.' :
          state.route ? routes[state.route] + ' 연습을 시작할 수 있습니다.' : '시작하려면 지하철 또는 버스를 선택하세요.');
      case 'select_tutorial_route':
      case 'start_tutorial':
        if (state.phase !== 'ready') {
          if (state.phase === 'playing' && name === 'start_tutorial' && state.route === args.route)
            return respond('ALLOW', '이미 같은 경로를 연습 중입니다.');
          return respond('BLOCK', '경로를 바꾸려면 연습에서 나간 뒤 다시 선택하세요.');
        }
        if (name === 'start_tutorial') reset('playing', args.route);
        else state.route = args.route;
        return respond('ALLOW', routes[args.route] + (name === 'start_tutorial' ? ' 연습을 시작했습니다.' : '를 선택했습니다.'));
      case 'restart_tutorial':
        if (state.phase === 'ready') return respond('BLOCK', '시작한 연습이 없습니다.');
        reset('playing', state.route);
        return respond('ALLOW', '같은 경로를 처음부터 연습합니다.');
      case 'exit_tutorial':
        reset('ready', null);
        return respond('ALLOW', '연습을 종료했습니다. 경로를 다시 선택할 수 있습니다.');
    }
  }
  function advance(skipped = false) {
    const current = state.stage;
    (skipped ? state.skipped : state.completed).push(current);
    state.stage = current === 'choose' ? (state.route === 'rail' ? 'entranceApproach' : 'busStop') : sequence[current];
    state.elapsed = 0;
    state.highlight = null;
    if (state.stage === 'complete') state.phase = 'complete';
  }
  function practice(input) {
    if (state.phase !== 'playing') return false;
    const before = state.stage;
    const target = guide(input);
    if (input.skip) advance(true);
    else switch (before) {
      case 'walk': if (target.ready) advance(); break;
      case 'skills':
        if (input.moved && input.diagonal) state.diagonal += input.dt;
        if (input.moved && input.running) state.running += input.dt;
        if (state.diagonal >= .25 && state.running >= .35) advance();
        break;
      case 'interact': case 'gate': case 'busStop': case 'busBoard': case 'bell': case 'busExit':
        if (input.interact && target.ready) advance();
        break;
      case 'choose': if (input.confirmRoute) advance(); break;
      case 'entranceApproach': case 'entrance': case 'entranceTurn': case 'entranceExit': if (target.ready) advance(); break;
      case 'pass': if (target.ready && input.z <= 2.05 && Math.abs(input.x) <= .44) advance(); break;
      case 'platform': if (target.ready) advance(); break;
      case 'railBoard': if (target.ready && input.right) advance(); break;
      case 'railExit': if (target.ready && input.forward) advance(); break;
      case 'railRide': case 'busRide':
        state.elapsed += input.dt ?? 0;
        if (state.elapsed >= 2.5) advance();
        break;
    }
    return before !== state.stage;
  }
  return { snapshot, execute, practice, guide };
}
