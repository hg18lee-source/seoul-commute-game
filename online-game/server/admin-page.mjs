const pager = id => `<div class="admin-pages"><button id="${id}-previous" disabled>이전</button>
<span id="${id}-page"></span><button id="${id}-next" disabled>다음</button></div>`;
const feedback = id => `<p id="${id}-status" role="status"></p><button id="${id}-retry" hidden>다시 시도</button>`;

export const adminPage = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>출근 게임 관리자</title>
<link rel="stylesheet" href="/online.css"></head>
<body class="admin"><main><header><h1>출근 게임 관리자</h1><a href="/">게임 메인</a></header>
<nav class="admin-tabs" aria-label="관리자 메뉴">
<button type="button" data-panel="overview" aria-controls="overview" aria-current="true">운영 요약</button>
<button type="button" data-panel="usage" aria-controls="usage">API 사용 현황</button>
<button type="button" data-panel="history" aria-controls="history">요청 이력</button>
<button type="button" data-panel="basis" aria-controls="basis">집계 근거·실행 이력</button>
</nav>
<div id="overview">
<section aria-labelledby="completion-title">
<h2 id="completion-title">오늘의 공식 완주 현황</h2><p id="completion-date">서울 기준</p>
<dl class="admin-metrics">
<div><dt>오늘 공식 완주</dt><dd id="completion-count">조회 중…</dd></div>
<div><dt>지하철 최단 기록</dt><dd id="completion-train">조회 중…</dd></div>
<div><dt>버스 최단 기록</dt><dd id="completion-bus">조회 중…</dd></div>
<div><dt>마지막 성공 갱신 시각</dt><dd id="completion-updated">조회 중…</dd></div>
</dl>
${feedback('completion')}
<button type="button" data-panel="basis">집계 기준·근거 보기</button>
</section>
<section>
<h2>공식 완주 집계 자동화</h2>
<ol class="admin-flow"><li>공식 완주 기록 저장</li><li>오늘의 기록 자동 집계</li><li>관리자 현황 갱신</li></ol>
<p>공식 기록이 저장되면 서버가 자동으로 집계합니다.<br>이 화면은 5초마다 최신 결과를 확인합니다.</p>
<dl class="admin-facts">
<dt>마지막 실행 계기</dt><dd id="completion-cause">조회 중…</dd>
<dt>실행 결과</dt><dd id="completion-result">조회 중…</dd>
<dt>원본 반영 상태</dt><dd id="completion-sync">조회 중…</dd>
</dl>
<button id="completion-recalculate">지금 다시 집계</button><p id="recalculate-status" role="status"></p>
<h3>오늘의 최근 집계 실행</h3>
${feedback('recent')}<ul id="recent-runs"></ul>
</section>
<section><h2>API 요청 결과 요약</h2><p id="overview-audit" role="status"></p>
<button id="overview-audit-retry" hidden>다시 시도</button>
<button type="button" data-panel="usage">API 사용 현황 보기</button></section>
</div>
<section id="audit-controls" hidden>
<h2>API 조회 필터</h2>
<p>서울 기준으로 시작일과 종료일을 모두 포함합니다. 시작일이 비어 있으면 현재 시각부터 7일 전, 종료일이 비어 있으면 현재 시각까지 조회합니다.</p>
<form id="filters">
<label>시작일 (이날 00:00부터) <input name="from" type="date"></label>
<label>종료일 (이날 하루까지) <input name="to" type="date"></label>
<label>사용자 ID <input name="user" maxlength="36"></label>
<label>작업 <select name="action"><option value="">전체</option></select></label>
<label>결과 <select name="outcome"><option value="">전체</option><option value="ALLOW">허용</option><option value="BLOCK">차단</option><option value="FAIL">실패</option></select></label>
<button>조회</button>
</form>
<p id="audit-period"></p><button id="audit-refresh">현재 페이지 새로고침</button>
${feedback('audit')}
</section>
<section id="usage" hidden>
<h2>선택 기간의 API 사용 현황</h2><p id="usage-summary"></p><p id="transit-summary"></p>
<div class="admin-columns"><div><h3>API별 요청 수</h3><ul id="actions"></ul></div>
<div><h3>사용자별 요청 수</h3><ul id="users"></ul>${pager('users')}</div></div>
</section>
<section id="history" hidden>
<h2>선택 기간의 요청 이력</h2><p id="requests-empty"></p>
<div class="table-wrap" tabindex="0" aria-label="API 요청 이력"><table><thead><tr><th>시각 (KST)</th><th>사용자</th><th>작업</th><th>결과</th><th>상세</th></tr></thead>
<tbody id="requests"></tbody></table></div>${pager('requests')}
</section>
<section id="basis" hidden>
<h2 id="basis-title" tabindex="-1">집계 근거·실행 이력</h2>
<form id="basis-filter"><label>집계 대상일 (서울) <input name="date" type="date" required></label><button>조회</button></form>
<p id="basis-window"></p><p>해당 날짜에 저장된 공식 완주 중 코스별 현재 공식 버전과 일치하는 기록을 집계합니다.</p>
<section><h3>집계에 사용한 공식 완주</h3><ul id="evidence-versions"></ul>
${feedback('evidence')}<div class="table-wrap" tabindex="0" aria-label="공식 완주 원본"><table>
<thead><tr><th>완주 시각 (KST)</th><th>코스</th><th>공식 시간</th><th>원본 플레이 ID</th></tr></thead><tbody id="evidence-rows"></tbody></table></div>${pager('evidence')}</section>
<section><h3>집계 실행 이력</h3>${feedback('runs')}
<div class="table-wrap" tabindex="0" aria-label="집계 실행 이력"><table><thead><tr><th>종료 시각 (KST)</th><th>실행 계기</th><th>결과</th><th>연결 정보</th></tr></thead><tbody id="runs-rows"></tbody></table></div>${pager('runs')}</section>
</section>
<dialog id="detail" aria-labelledby="detail-title"><form method="dialog"><button>닫기</button></form>
<h2 id="detail-title">요청 상세</h2><p id="detail-status" role="status"></p><button id="detail-retry" hidden>다시 시도</button>
<div id="detail-content"></div></dialog>
</main><script type="module" src="/admin-ui.js"></script></body></html>`;
