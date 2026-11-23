import { schemas as schemasForDisplay } from './state.mjs';

// The interpreter can be replaced by a provider. It has no access to the executor.
export function interpret(request) {
  const text = request.normalize('NFC').trim().toLowerCase();
  const rail = /지하철|전철|^rail$/.test(text);
  const bus = /버스|^bus$/.test(text);
  const route = rail === bus ? null : rail ? 'rail' : 'bus';
  if (/취소|그만둘래/.test(text)) return { cancel: true };
  if (/시작.*(수 있|가능|돼\?|나요)|상태|어디까지|현재 단계/.test(text)) return { name: 'get_tutorial_status' };
  if (/개찰구.*어디/.test(text)) return { name: 'locate_gate' };
  if (/어디로|어디 가|뭘 눌러|무엇을 눌러|어떤 키|다시 알려/.test(text)) return { name: 'get_current_guidance' };
  if (/다시 시작|처음부터|초기화/.test(text)) return { name: 'restart_tutorial' };
  if (/나가|종료/.test(text)) return { name: 'exit_tutorial' };
  if (!route && /택시|자가용|자전거|기차|비행기/.test(text) && /시작|선택|연습/.test(text))
    return { name: 'select_tutorial_route', route: 'unsupported' };
  if (/시작|해\s*볼래|해\s*보고 싶/.test(text)) return { name: 'start_tutorial', route };
  if (route && (/선택|변경|바꿔|연습할래/.test(text) || /^(지하철|전철|버스|rail|bus)[.!]?$/.test(text)))
    return { name: 'select_tutorial_route', route };
  if (/대각선|달리|뛰|shift/.test(text)) return { name: 'show_controls', topic: 'run' };
  if (/상호작용|^e\b/.test(text)) return { name: 'show_controls', topic: 'interact' };
  if (/이동|걸|방향키/.test(text)) return { name: 'show_controls', topic: 'move' };
  if (route && /방법|알려|어떻게|타는|타요|내려/.test(text)) return { name: 'show_controls', topic: route };
  return {};
}

export function createDialogue(tutorial, interpretRequest = interpret, readPosition = () => ({})) {
  let pending = false;
  const clear = () => { pending = false; };
  function send(request) {
    const wasPending = pending;
    clear();
    let call;
    try {
      call = interpretRequest(request);
      if (wasPending && call.name === 'select_tutorial_route' && /^(지하철|전철|버스|rail|bus)[.!]?$/i.test(request.trim()))
        call = { name: 'start_tutorial', route: call.route };
      if (call.cancel) return { outcome: 'BLOCK', message: '대기 중인 요청을 취소했습니다. 연습 상태는 그대로입니다.' };
      if (!call.name) return { outcome: 'BLOCK', message: '이 요청에 해당하는 연습 기능을 찾지 못했어요.' };
      if (call.name === 'start_tutorial' && call.route == null) {
        call.route = tutorial.snapshot().route;
        if (!call.route) {
          pending = true;
          return { name: call.name, args: {}, outcome: 'WAIT', message: '지하철과 버스 중 어떤 경로를 연습할까요?' };
        }
      }
      const args = Object.fromEntries(Object.entries(call).filter(([key]) => key !== 'name'));
      const safeArgs = Object.fromEntries(Object.entries(args).filter(([key, value]) =>
        ['route', 'topic'].includes(key) && ['rail','bus','move','run','interact'].includes(value)));
      return { name: Object.hasOwn(schemasForDisplay, call.name) ? call.name : '허용되지 않은 도구',
        args: safeArgs, ...tutorial.execute(call.name, args, readPosition()) };
    } catch {
      return { outcome: 'FAIL', message: '요청을 처리할 수 없습니다. 다시 시도하세요.' };
    }
  }
  return { send, clear };
}
