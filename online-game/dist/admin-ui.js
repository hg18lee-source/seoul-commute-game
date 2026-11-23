import { api, element, setAccount } from './online.js';
import { $, stamp, feedback, pager, startDailyCompletions } from './admin-completions.js';

const actions = {
  session:'로그인 상태 확인', signup:'회원가입', login:'게임 로그인', 'admin-login':'관리자 로그인',
  logout:'로그아웃', courses:'공식 코스 조회', records:'내 기록 조회', ranking:'랭킹 조회',
  'play-start':'게임 시작', 'play-progress':'게임 진행 기록', 'play-finish':'완주 기록 제출',
  'play-cancel':'게임 취소', transit:'교통 정보 조회', 'admin-page':'관리자 화면 열기',
  'admin-audit':'API 사용 현황·이력 조회', 'admin-detail':'요청 상세 조회', 'admin-completions':'오늘의 공식 완주 조회',
  'admin-completion-evidence':'집계 근거 조회', 'admin-completion-runs':'집계 실행 이력 조회',
  'admin-completion-recalculate':'관리자 재계산', 'audit-prune':'오래된 요청 이력 정리',
};
const outcomes = {ALLOW:'허용', BLOCK:'차단', FAIL:'실패'};
const reasons = {
  credentials:'로그인 정보 불일치', role_denied:'접근 권한 없음', login_required:'로그인 필요',
  service_error:'서버 처리 오류', aggregate_error:'집계 처리 오류', session_invalid:'세션 만료 또는 무효',
  account_input:'회원가입 정보 확인 필요', duplicate_id:'이미 등록된 아이디', filter:'조회 조건 확인 필요',
  method:'지원하지 않는 요청 방식', csrf:'요청 인증 확인 실패', origin:'요청 출처 불일치',
  ok:'정상 처리', admin_page:'관리자 화면 열기 완료', admin_view:'요청 이력 조회 완료',
  admin_detail:'요청 상세 조회 완료', unknown_api:'등록되지 않은 API',
};
const label = (map, code) => Object.hasOwn(map, code) ? map[code] : (code ?? '—');
const count = value => Number(value).toLocaleString('ko-KR')+'건';
const form = $('filters');
const groups = {
  usage:{page:0, next:false, pager:'users'},
  history:{page:0, next:false, pager:'requests', cursors:[]},
};
let filters = new URLSearchParams(new FormData(form));
let panel = 'overview', revision = 0, summary;
let retry;

function renderList(id, items) {
  $(id).replaceChildren(...(items.length ? items : ['요청 없음']).map(item => {
    const line = element('li');
    line.append(item);
    return line;
  }));
}

function summaryText(metrics) {
  return '전체 '+count(metrics.requests)+' · 허용 '+count(metrics.allowed)+' · 차단 '+count(metrics.blocked)+' · 실패 '+count(metrics.failed);
}

function renderSummary(data) {
  summary = data.metrics;
  $('overview-audit').textContent = $('audit-period').textContent+' · '+summaryText(summary);
  $('usage-summary').textContent = summaryText(summary)+' · 전체 등록 사용자 '+data.users+'명';
  $('transit-summary').textContent = '교통 조회 '+count(summary.transit_requests)+' · 캐시 응답 '+count(summary.cache_hits)+
    ' · 실제 외부 호출 '+count(summary.external_calls)+' (실패 '+count(summary.external_failures)+')';
  const select = form.elements.action;
  if (select.options.length === 1) {
    for (const action of data.actions) select.add(new Option(label(actions,action),action));
  }
}

function renderUsage(data) {
  renderList('actions', data.byAction.map(row => label(actions,row.action)+' · '+count(row.count)));
  renderList('users', data.byUser.map(row => {
    const text = (row.nickname ?? (row.user_id ? row.user_id : '익명'))+' · '+count(row.count);
    if (!row.user_id) return text;
    const button = element('button', text);
    button.onclick = () => {
      form.elements.user.value = row.user_id;
      applyFilters();
    };
    return button;
  }));
}

function renderHistory(data) {
  $('requests-empty').textContent = data.rows.length ? '' : '요청 없음';
  $('requests').replaceChildren(...data.rows.map(request => {
    const row = element('tr');
    const result = element('span', label(outcomes,request.outcome));
    result.className = 'admin-badge';
    const resultCell = element('td');
    resultCell.append(result, element('div',label(reasons,request.reason)));
    const detail = element('button','상세 보기');
    detail.onclick = () => openDetail(request.id);
    const detailCell = element('td');
    detailCell.append(detail);
    row.append(element('td',stamp(request.at)), element('td',request.nickname ?? '익명'),
      element('td',label(actions,request.action)),resultCell,detailCell);
    return row;
  }));
}

function updatePeriod() {
  const from = filters.get('from'), to = filters.get('to');
  $('audit-period').textContent = from || to
    ? (from || '현재 시각의 7일 전')+'부터 '+(to || '현재 시각')+'까지 (KST)'
    : '최근 7일 (KST)';
}

async function load(number) {
  const target = panel;
  const group = groups[target];
  const token = ++revision;
  const params = new URLSearchParams(filters);
  params.set('page', number);
  if (target === 'history' && group.cursors[number]) params.set('before', group.cursors[number]);
  if (!summary) $('overview-audit').textContent = 'API 요청 결과 조회 중…';
  feedback('audit','조회 중…');
  group?.update(group.page, false, true);
  try {
    const data = await api('admin-audit?'+params);
    if (token !== revision) return;
    renderSummary(data);
    if (group) {
      if (target === 'usage') renderUsage(data);
      if (target === 'history') {
        renderHistory(data);
        group.cursors[number+1] = data.nextCursor;
      }
      group.page = data.page;
      group.next = target === 'usage'
        ? (data.nextUsers ?? data.next)
        : (data.nextRequests ?? data.next);
      group.update(group.page, group.next);
    }
    feedback('audit','');
    $('overview-audit-retry').hidden = true;
  } catch (error) {
    if (token !== revision) return;
    const message = [401,403].includes(error.status) ? '관리자 권한이 필요합니다.'
      : error.status === 400 ? '시작일·종료일과 사용자 ID를 확인하세요.' : 'API 요청 결과를 조회하지 못했습니다.';
    const text = message+(summary ? ' 이전 조회 결과를 표시합니다.' : '');
    if (target === 'overview') $('overview-audit').textContent = summary
      ? $('audit-period').textContent+' · '+summaryText(summary)+' · '+text : text;
    feedback('audit',text,true);
    $('overview-audit-retry').hidden = target !== 'overview';
    retry = () => load(number);
    group?.update(group.page, group.next);
  }
}

function applyFilters() {
  filters = new URLSearchParams(new FormData(form));
  summary = undefined;
  updatePeriod();
  for (const group of Object.values(groups)) {
    group.page = 0;
    group.next = false;
    if (group.cursors) group.cursors = [];
    group.update(0, false);
  }
  for (const id of ['requests','actions','users']) $(id).replaceChildren();
  for (const id of ['usage-summary','transit-summary','requests-empty']) $(id).textContent = '';
  load(1);
}

const dialog = $('detail');
let detailId, detailRevision = 0;
async function loadDetail() {
  const token = ++detailRevision;
  feedback('detail','조회 중…');
  $('detail-content').replaceChildren();
  try {
    const {request,external,play} = await api('admin-detail?'+new URLSearchParams({id:detailId}));
    if (!dialog.open || token !== detailRevision) return;
    const facts = element('dl');
    facts.className = 'admin-facts';
    const add = (key, value) => {
      const description = element('dd');
      description.append(value);
      facts.append(element('dt',key),description);
    };
    const id = element('code',request.id);
    const copy = element('button','요청 ID 복사');
    const idLine = element('div');
    idLine.className = 'admin-id';
    idLine.append(id,copy);
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(request.id);
        if (token === detailRevision) feedback('detail','요청 ID를 복사했습니다.');
      } catch {
        if (token === detailRevision) feedback('detail','복사에 실패했습니다. 표시된 ID를 선택해 복사하세요.');
      }
    };
    add('요청 ID',idLine);
    add('시각 (KST)', stamp(request.at));
    add('사용자',request.nickname ?? '익명');
    add('사용자 ID',request.user_id ?? '—');
    add('원래 API 이름',request.action);
    add('HTTP 메서드 · 상태 코드',request.method+' '+request.http_status);
    add('처리 시간',request.duration_ms+' ms');
    add('결과 코드',request.outcome+' · '+label(outcomes,request.outcome));
    add('사유 코드 · 설명',request.reason+' · '+label(reasons,request.reason));
    add('관련 플레이 ID',request.play_id ?? '—');
    if (play) {
      add('플레이 코스 · 규칙 버전',play.course+' · '+play.rules);
      add('플레이 상태 · 사유',play.status+' · '+(play.invalid_reason ?? '—'));
      add('플레이 시작 · 최근 확인 (KST)',stamp(play.started_at)+' / '+stamp(play.seen_at));
    }
    add('캐시 응답',request.cache_hit == null ? '—' : request.cache_hit ? '캐시 적중' : '캐시 미적중');
    add('외부 호출',count(request.external_calls)+' (실패 '+count(request.external_failures)+')');
    const callList = element('ol');
    for (const call of external) {
      callList.append(element('li',[stamp(call.at)+' KST',call.provider,call.operation,
        call.duration_ms+' ms',call.http_status ?? '—',call.result].join(' · ')));
    }
    $('detail-content').append(facts);
    if (external.length) $('detail-content').append(element('h3','외부 호출 내역'),callList);
    feedback('detail','');
  } catch {
    if (token === detailRevision) feedback('detail','요청 상세를 불러오지 못했습니다.',true);
  }
}

function openDetail(id) {
  detailId = id;
  dialog.showModal();
  loadDetail();
}
dialog.onclose = () => {detailRevision++;};
$('detail-retry').onclick = loadDetail;
$('audit-refresh').onclick = () => load(groups[panel]?.page || 1);
$('audit-retry').onclick = $('overview-audit-retry').onclick = () => retry?.();
form.onsubmit = event => {event.preventDefault(); applyFilters();};
for (const group of Object.values(groups)) {
  group.update = pager(group.pager, delta => load(group.page+delta));
}
const showCompletion = startDailyCompletions({api,element,setAccount});
for (const button of document.querySelectorAll('[data-panel]')) {
  button.onclick = () => {
    const target = button.dataset.panel;
    if (target === panel) return;
    const previous = groups[panel];
    previous?.update(previous.page, previous.next);
    panel = target;
    for (const item of document.querySelectorAll('.admin-tabs [data-panel]')) {
      const active = item.dataset.panel === target;
      $(item.dataset.panel).hidden = !active;
      if (active) item.setAttribute('aria-current','true');
      else item.removeAttribute('aria-current');
    }
    $('audit-controls').hidden = !groups[target];
    if (!button.closest('nav')) {
      document.querySelector('.admin-tabs [data-panel="'+target+'"]').focus();
    }
    showCompletion(panel);
    if (target === 'basis') revision++;
    else load(groups[target]?.page || 1);
  };
}
updatePeriod();
load(1);
