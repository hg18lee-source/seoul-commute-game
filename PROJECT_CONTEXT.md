# 프로젝트 맥락

온라인 본편은 `online-game/`에 있다. Node.js API가 계정과 공식 플레이를 검증하고 PostgreSQL에 저장한다. 빌드는 Three.js 게임, 튜토리얼, 관리자 화면의 정적 자산을 `online-game/public-online/`에 생성한다. 관리자 UI의 로컬 작업 기준은 `codex/release-daily-completions`의 `3125232`다. 당시 이 저장소의 작업 트리는 깨끗했고 다른 체크아웃의 미커밋 변경도 보존했다. 현재 Production 소스 대조는 [검증 기록](report.md)을 참고한다.

## 오늘의 공식 완주 현황

- 원본은 플레이별 기본 키가 있는 `commute_records`다. 공식 코스별 규칙은 `server/rules.mjs`의 `officialRules`에서 가져온다. 지하철은 `gongdeok-chungjeongno-walk-6`, 버스는 `gongdeok-chungjeongno-walk-4`를 사용한다. 실패·무효·취소·튜토리얼 플레이는 이 테이블에 들어가지 않으며 이전 규칙의 행은 조회 조건에서 제외한다.
- 기준일은 Asia/Seoul 자정 이상 다음 날 자정 미만이다. 시각 저장에는 기존 UTC 기준 `timestamptz`를 사용한다. 자동 실행의 기준일은 저장된 완주 시각에서, 관리자 다시 계산의 기준일은 서버의 요청 시각에서 정한다.
- `play-finish`가 공식 기록과 요청 감사를 커밋한 뒤 `server/daily-completions.mjs`를 백그라운드에서 실행한다. 로컬 서버는 Node 작업을 이어가고, Vercel 함수는 `waitUntil`로 작업 수명을 유지한다. 날짜별 락으로 집계와 성공 이력 기록을 직렬화한다. 실패 시 해당 집계만 롤백하고 별도 실패 상태를 기록한다. 다음 자동 실행이나 관리자 재계산이 원본 전체에서 복구한다.
- 관리자의 조회는 원본에서 현재 값을 계산한다. `commute_daily_completion_runs`에는 마지막 성공 시각과 변경 전후 요약, 요청 ID와 플레이 ID가 남는다. 자동 집계가 실패해도 정상 완주 응답과 원본은 유지된다. DB 장애로 이력도 쓰지 못하면 민감 정보 없는 서버 진단 로그만 남길 수 있다.
- `GET /api/admin-completions`, `GET /api/admin-completion-evidence`, `GET /api/admin-completion-runs`, `POST /api/admin-completion-recalculate`는 관리자 전용이다. 관리자 HTML과 UI는 `server/admin-page.mjs`, `dist/admin-completions.js`에 있다. `migrations/002_daily_completions.sql`이 원본 조회 인덱스와 실행 이력을 추가한다.
- 운영 요약은 보이는 동안 5초마다 공식 완주 현황을 조회한다. 요약 API는 원본과 마지막 성공 스냅샷의 일치 여부, 가장 최근 실행의 계기·결과, 마지막 성공 시각을 반환한다. 조회는 집계 실행 이력을 생성하지 않는다. 근거와 집계 이력은 선택 날짜의 마지막 행을 기준으로 20건씩 조회한다.
- API 사용 현황과 요청 이력은 공통 필터로 조회한다. 요청 이력은 정렬 키인 시각·요청 ID를 포함한 커서로 25건씩 가져온다. 이전 API 호출자의 페이지 번호도 지원한다. 사용자별 요청 수는 집계 순위 페이지를 사용한다. API 통계는 탭 진입, 필터 제출, 페이지 이동, 명시적 새로고침 때 조회한다.
- 요청 상세의 원래 API·결과·사유 코드와 플레이 ID는 기존 관리자 API가 반환한 필드에서 표시한다. 화면에 추가된 DB 조회는 기존 관리자 권한 검사 뒤 수행한다.

검증 상태와 남은 작업은 [report.md](report.md), 실행 순서는 [README.md](README.md)를 참고한다.
