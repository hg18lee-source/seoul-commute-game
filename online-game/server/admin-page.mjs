export const adminPage = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>출근 게임 관리자</title>
<link rel="stylesheet" href="/online.css"></head>
<body class="admin"><main><header><h1>출근 게임 관리자</h1><a href="/">게임 메인</a></header>
<form id="filters">
<label>시작일 <input name="from" type="date"></label>
<label>종료일 <input name="to" type="date"></label>
<label>사용자 ID <input name="user" maxlength="36"></label>
<label>API <select name="action"><option value="">전체</option></select></label>
<label>결과 <select name="outcome"><option value="">전체</option><option>ALLOW</option><option>BLOCK</option><option>FAIL</option></select></label>
<button>조회</button>
</form>
<p id="summary" role="status" aria-live="polite"></p>
<div class="admin-columns"><section><h2>API별 요청</h2><ul id="actions"></ul></section><section><h2>사용자별 요청</h2><ul id="users"></ul></section></div>
<section><h2>API 요청 이력 <small>KST</small></h2>
<p>API에서 로그인 또는 기록 제출을 선택하면 성공·거절·실패 이력을 조회할 수 있습니다.</p>
<div class="table-wrap"><table><thead><tr><th>시각</th><th>사용자</th><th>API</th><th>결과 · 사유</th><th>HTTP</th><th>처리 시간</th><th>캐시/외부</th><th>요청 ID</th></tr></thead>
<tbody id="requests"></tbody></table></div>
<div class="admin-pages"><button id="previous">이전</button><span id="page"></span><button id="next">다음</button></div>
</section><dialog id="detail"><button id="close-detail">닫기</button><h2>요청 상세</h2><pre id="detail-content"></pre></dialog>
</main><script type="module" src="/admin-ui.js"></script></body></html>`;
