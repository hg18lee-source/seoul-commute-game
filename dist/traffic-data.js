const element = (tag, value) => {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  return node;
};

const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  dateStyle:'medium', timeStyle:'medium', timeZone:'Asia/Seoul',
});

function summary(title, result) {
  const section = element('section');
  const status = result.ok ? '성공' : '실패';
  const time = result.checkedAt ? timeFormat.format(new Date(result.checkedAt)) + ' KST' : '조회 시각 없음';
  section.append(element('h3', title), element('p', status + ' · ' + time));
  return section;
}

function list(rows) {
  const items = element('ol');
  for (const row of rows) items.append(element('li', row));
  return items;
}

function showData(container, payload) {
  const stations = summary('서울시 역사마스터', payload.stations);
  if (payload.stations.ok) {
    const records = payload.stations.data;
    const search = element('input');
    search.type = 'search';
    search.placeholder = '역명 또는 호선 검색';
    search.setAttribute('aria-label', search.placeholder);
    const matches = element('div');
    const render = () => {
      const term = search.value.trim().toLocaleLowerCase();
      const filtered = records.filter(row => (row.name + ' ' + row.line).toLocaleLowerCase().includes(term));
      matches.replaceChildren(element('p', filtered.length + '건'), list(filtered.map(row => row.name + ' · ' + row.line)));
    };
    search.addEventListener('input', render);
    stations.append(search, matches);
    render();
  }

  const buses = summary('7016번 버스', payload.bus);
  if (payload.bus.ok) {
    const {from, to, stops} = payload.bus.data;
    buses.append(element('p', from + ' ↔ ' + to + ' · ' + stops.length + '개 정류장'));
    buses.append(list(stops.map(stop => stop.name + (stop.stopNumber ? ' · ' + stop.stopNumber : ''))));
  }
  container.replaceChildren(element('p', payload.cached ? '서버 캐시 자료 · 아래 시각은 실제 조회 시각입니다.' : '서버 조회 결과'), stations, buses);
}

export async function showTraffic(openDialog, closeDialog) {
  openDialog('<h2 id="traffic-title">교통 데이터 확인</h2><p>조회 결과는 현재 게임 코스에 반영되지 않습니다.</p><div id="traffic-result" class="traffic-results" aria-live="polite">서버에서 교통 데이터를 조회 중입니다.</div><div class="button-row"><button class="btn" id="traffic-close">닫기</button></div>');
  const container = document.getElementById('traffic-result');
  const close = document.getElementById('traffic-close');
  close.onclick = closeDialog;
  close.focus();
  try {
    const response = await fetch('./api/transit', {signal:AbortSignal.timeout(24000)});
    if (!response.ok) throw new Error('response');
    showData(container, await response.json());
  } catch {
    container.textContent = '조회 실패 · 서버에 연결할 수 없습니다. 게임은 계속 이용할 수 있습니다.';
  }
}
