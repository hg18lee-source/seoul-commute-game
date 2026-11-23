export const $ = id => document.getElementById(id);

export const seoulDay = (date = new Date()) => dayFormat.format(date);
const dayFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
});
const timeFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export function stamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  return seoulDay(date) + ' ' + timeFormat.format(date);
}

export function officialTime(tenths) {
  const pad = value => String(value).padStart(2, '0');
  return pad(Math.floor(tenths / 600)) + ':' + pad(Math.floor(tenths / 10) % 60) + '.' + tenths % 10;
}

const known = (labels, code) => Object.hasOwn(labels, code) ? labels[code] : code;
export const cause = code => known({record_saved:'기록 저장으로 자동 실행', admin_recalculate:'관리자가 재계산'}, code);
export const runResult = code => known({success:'성공', unchanged:'변경 없음', failed:'실패'}, code);

export function syncLabel(data) {
  if (data.matchesLastRun) return '원본과 마지막 성공 집계 일치';
  if (data.count || data.lastSuccessAt) return data.latestRun?.status === 'failed'
    ? '원본과 마지막 성공 집계 불일치' : '최신 기록 반영 확인 중';
  return '비교할 성공 집계 없음';
}

export function feedback(id, message, retry = false) {
  $(id+'-status').textContent = message;
  $(id+'-retry').hidden = !retry;
}

export function pager(id, load) {
  $(id+'-previous').onclick = () => load(-1);
  $(id+'-next').onclick = () => load(1);
  return (page, next, busy = false) => {
    $(id+'-page').textContent = page ? page+'쪽' : '';
    $(id+'-previous').disabled = busy || page <= 1;
    $(id+'-next').disabled = busy || !next;
  };
}

export function startDailyCompletions({api, element, setAccount}) {
  let overview, refreshing = false, refreshAgain = false;
  const course = code => overview?.courses[code]?.label ?? code;
  const basis = $('basis-filter');
  const overviewFields = ['count', 'train', 'bus', 'updated', 'cause', 'result', 'sync'];
  let recentRevision = 0, recentDate, recentRun;

  async function recent(date, latestId) {
    const revision = ++recentRevision;
    if (recentDate !== date) feedback('recent', '조회 중…');
    try {
      const data = await api('admin-completion-runs?' + new URLSearchParams({date}));
      if (revision !== recentRevision) return;
      $('recent-runs').replaceChildren(...data.rows.slice(0, 3).map(row =>
        element('li', stamp(row.ended_at)+' · '+cause(row.cause)+' · '+runResult(row.status))));
      recentDate = date;
      recentRun = latestId;
      feedback('recent', data.rows.length ? '' : '실행 이력 없음');
    } catch {
      if (revision === recentRevision) feedback('recent', recentDate === date
        ? '갱신 실패 · 마지막 조회 결과입니다.' : '실행 이력을 조회하지 못했습니다.', true);
    }
  }

  async function refresh(force = false) {
    if (refreshing) {
      refreshAgain ||= force;
      return;
    }
    refreshing = true;
    if (!overview && !$('completion-retry').hidden) {
      for (const field of overviewFields) $('completion-'+field).textContent = '조회 중…';
      feedback('completion', '');
    }
    try {
      const data = await api('admin-completions');
      if (overview?.date !== data.date) $('recent-runs').replaceChildren();
      overview = data;
      $('completion-date').textContent = data.date+' (서울)';
      $('completion-count').textContent = data.count+'건';
      for (const transport of ['train','bus']) {
        const row = data.byCourse.find(item => data.courses[item.course]?.transport === transport);
        $('completion-'+transport).textContent = row ? row.fastest ? officialTime(row.fastest.tenths) : '기록 없음' : '조회 불가';
      }
      $('completion-updated').textContent = data.lastSuccessAt ? stamp(data.lastSuccessAt)+' KST' : '성공 이력 없음';
      $('completion-cause').textContent = data.latestRun ? cause(data.latestRun.cause) : '실행 이력 없음';
      $('completion-result').textContent = data.latestRun ? runResult(data.latestRun.status) : '실행 이력 없음';
      $('completion-sync').textContent = syncLabel(data);
      feedback('completion', '');
      const latestId = data.latestRun?.id;
      if (!$('overview').hidden && (recentDate !== data.date || recentRun !== latestId)) {
        await recent(data.date, latestId);
      }
    } catch {
      for (const field of overviewFields) if (!overview) $('completion-'+field).textContent = '조회 실패';
      feedback('completion', overview ? '갱신 실패 · '+overview.date+' 마지막 조회 값입니다.' : '공식 완주 현황을 조회하지 못했습니다.', true);
    } finally {
      refreshing = false;
      if (refreshAgain) {
        refreshAgain = false;
        refresh();
      }
    }
  }

  function describe(summary) {
    if (!summary) return '—';
    return [summary.count+'건', ...summary.byCourse.map(row =>
      course(row.course)+' '+(row.fastest ? officialTime(row.fastest.tenths) : '기록 없음'))].join(' · ');
  }

  function runDetails(row) {
    const details = element('details');
    details.append(element('summary', 'ID·집계 내용 보기'));
    const facts = element('dl');
    facts.className = 'admin-facts';
    for (const [key, value] of [
      ['실행 ID',row.id], ['요청 ID',row.request_id], ['원본 플레이 ID',row.play_id ?? '—'],
      ['시작 시각 (KST)',stamp(row.started_at)], ['변경 전',describe(row.previous)],
      ['변경 후',describe(row.summary)], ['실패 코드',row.reason ?? '—'],
    ]) facts.append(element('dt',key), element('dd',value));
    details.append(facts);
    return details;
  }

  let targetDate;
  function cursorList(id, values) {
    let page = 0, cursors = [], revision = 0, requested = 1;
    const updatePager = pager(id, delta => load(page+delta));
    async function load(number) {
      requested = number;
      const token = ++revision;
      updatePager(page, false, true);
      feedback(id, '조회 중…');
      const params = new URLSearchParams({date:targetDate});
      if (cursors[number]) params.set('before', cursors[number]);
      try {
        const data = await api('admin-completion-'+id+'?'+params);
        if (token !== revision) return;
        if (data.versions) $('evidence-versions').replaceChildren(...data.versions.map(row =>
          element('li',course(row.course)+' · '+row.rules)));
        $(id+'-rows').replaceChildren(...data.rows.map(item => {
          const row = element('tr');
          for (const value of values(item)) {
            const cell = element('td');
            cell.append(value);
            row.append(cell);
          }
          return row;
        }));
        feedback(id, data.rows.length ? '' : id === 'evidence' ? '공식 완주 기록 없음' : '실행 이력 없음');
        page = number;
        cursors[number+1] = data.nextCursor;
        updatePager(page, data.nextCursor);
      } catch {
        if (token !== revision) return;
        feedback(id, '조회 실패'+(page ? ' · 이전 조회 결과를 표시합니다.' : ''), true);
        updatePager(page, cursors[page+1]);
      }
    }
    $(id+'-retry').onclick = () => load(requested);
    return () => {
      page = 0;
      cursors = [];
      $(id+'-rows').replaceChildren();
      load(1);
    };
  }

  const evidence = cursorList('evidence', row => [stamp(row.finished_at),course(row.course),
    officialTime(row.tenths)+(row.fastest ? ' · 최단 기록' : ''),row.play_id]);
  const runs = cursorList('runs', row => [stamp(row.ended_at),cause(row.cause),runResult(row.status),runDetails(row)]);
  function selectDate(date) {
    targetDate = date;
    $('basis-window').textContent = date+' 00:00 이상, 다음 날 00:00 미만 (KST)';
    $('evidence-versions').replaceChildren();
    evidence();
    runs();
  }
  basis.onsubmit = event => {
    event.preventDefault();
    selectDate(basis.elements.date.value);
  };
  $('completion-retry').onclick = () => refresh(true);
  $('recent-retry').onclick = () => overview && recent(overview.date, overview.latestRun?.id);
  $('completion-recalculate').onclick = async () => {
    const button = $('completion-recalculate');
    if (button.disabled) return;
    button.disabled = true;
    $('recalculate-status').textContent = '집계 중…';
    try {
      setAccount((await api('session')).user);
      const result = await api('admin-completion-recalculate', {});
      $('recalculate-status').textContent = '집계 결과 · '+runResult(result.status);
    } catch (error) {
      $('recalculate-status').textContent = error.message === 'aggregate_error'
        ? '집계 결과 · 실패 (집계 처리 오류)' : '집계 요청 실패 · 집계 실행 이력을 확인하세요.';
    } finally {
      button.disabled = false;
      refresh(true);
    }
  };
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  return panel => {
    if (panel === 'basis' && !targetDate) {
      basis.elements.date.value = seoulDay();
      selectDate(basis.elements.date.value);
    }
    if (panel === 'overview') refresh();
  };
}
