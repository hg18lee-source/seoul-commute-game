# 대중교통 출근 게임 온라인 운영

## 앱과 데이터베이스

Vercel은 기존 dist/index.html과 Three.js 본편 자산에서 만든 public-online/을 정적으로 제공합니다. Node.js 22 함수 하나가 /api/*와 /administrator를 처리합니다. PostgreSQL에는 계정, 세션 해시, 플레이 상태와 이벤트, 공식 기록, 요청 감사, 교통 캐시를 저장합니다. pg.Pool은 인스턴스당 최대 4개 연결을 유지하고 Vercel Fluid 연결 정리를 적용합니다. Neon에서는 -pooler 호스트가 포함된 연결 문자열을 사용합니다. [Vercel Node.js](https://vercel.com/docs/functions/runtimes/node-js) · [Vercel 연결 풀 가이드](https://vercel.com/kb/guide/connection-pooling-with-functions)

작업 시작 시 실제 본편의 거리·인물 자산을 기준으로 했습니다. 별도 그래픽 검토 장면과 기존 Sites Worker는 배포 대상에서 제외했습니다. 기존 브라우저 시연 기록은 가져오지 않습니다. 현재 플레이 가능한 지하철·7016번을 각각 비교 조건이 고정된 공식 코스로 노출했습니다. 전체 24개 출발·도착 조합과 일일·랜덤·연습 모드는 이번 대표 코스 포팅 범위 밖입니다.

- 닉네임은 NFC 정규화 후 한글 완성형과 영문 1~10자이며 영문은 대소문자를 구분하지 않습니다. 숫자·기호·단독 자모 허용 여부가 미확정이어서 이 범위를 적용했습니다.
- PIN은 선행 0을 보존하는 4자리 문자열입니다. Argon2id와 서버 전용 pepper를 사용합니다. 4자리 PIN은 10,000가지뿐이며, 횟수 제한이나 잠금이 없는 정책에서는 온라인 추측에 취약합니다. PIN 복구와 로그인 실패 횟수 제한은 적용하지 않았습니다.
- 세션은 24시간이며 무작위 토큰의 해시를 DB에 저장합니다. Vercel 쿠키는 __Host- 접두어, HttpOnly, Secure, SameSite=Lax를 사용합니다. 상태 변경은 Origin과 세션 CSRF 헤더를 검사합니다. 가입·로그인은 같은 Origin의 JSON만 받습니다.
- 관리자 전용 로그인과 권한 검사로 관리자 페이지 및 API를 보호합니다. 정적 게임 자산은 브라우저에서 열리며, 공식 플레이를 발급받거나 기록을 저장하려면 유효한 서버 세션이 필요합니다.

## 로컬 실행과 관리자 생성

Node.js 22와 PostgreSQL을 설치합니다. .env.example을 .env.local로 복사한 다음 별도 로컬 DB 연결 값과 로컬 전용 pepper를 설정합니다. 비밀값은 채팅이나 Git에 올리지 않습니다.

    npm ci
    npm run migrate
    npm run build
    npm run dev

[게임](http://127.0.0.1:8010/) · [관리자 로그인](http://127.0.0.1:8010/?admin=1) · [관리자 페이지](http://127.0.0.1:8010/administrator)

마이그레이션은 마이그레이션 테이블과 전용 잠금으로 반복 실행할 수 있습니다. DIRECT_DATABASE_URL이 설정돼 있으면 마이그레이션과 관리자 생성에 우선 사용합니다.

    npm run admin:create -- 관리자닉

운영 터미널에서 종류가 다른 문자 8개 이상을 포함한 20~128자의 고유 관리자 암호를 두 번 숨김 입력합니다. 공개 관리자 가입과 기본 비밀번호는 없습니다. 동명 플레이어 계정을 승격하지 않습니다. 운영 pepper를 바꾸면 기존 비밀번호 검증과 CSRF 호환성이 깨집니다.

## 공식 기록 검증

플레이 ID는 서버가 발급하고 계정·서버 세션·고정 코스·규칙 버전에 연결합니다. 시퀀스와 DB 잠금으로 진행 및 완료를 직렬화합니다. 위치와 체력 샘플, 구간 이동, 승하차, 정차와 문 상태, 버스 벨, 정지·재개를 기록합니다. 최대 5.4m/s, 접점과 알려진 스폰 좌표, 차량의 인접 정차 순서와 최소 소요 시간, 환승·하차 조건, 체력 범위와 포털 반경을 검사합니다. 일시정지 중에는 신고한 위치·체력·차량 상태·플레이 시간이 그대로여야 합니다. 스마트폰 사용 중에는 시간이 흐릅니다.

공식 시간은 서버 발급에서 서버 완료 요청 처리까지의 시간에서 확인된 일시정지를 제외하고 0.1초로 반올림합니다. 한 요청에 묶인 일시정지 경계 시각은 수신 구간에 제한한 브라우저 단조 시계로 복원합니다. 클라이언트 활성 시간과 서버 기록은 ±3.2초 범위에서 대조합니다. 첫 완주에는 이번 기록만, 이후에는 같은 코스·규칙의 개인 최고를 함께 표시합니다. 공식 0.1초 값이 같으면 공동 순위입니다.

브라우저는 약 2.7초마다 진행 확인을 요청하고 창 전환 때 일시정지합니다. 서버 응답이 10초 동안 없으면 브라우저 플레이를 종료합니다. 서버는 마지막 유효 진행에서 10초가 지난 플레이를 거절합니다. 백그라운드 탭 동결 시 복귀 뒤에 종료가 표시될 수 있습니다. 저장 커밋 후에 응답만 유실되면 내 기록에서 확인하도록 안내합니다. 취소·무효·실패는 공식 기록에 포함되지 않습니다.

이 검증은 전체 서버 물리 재현 없이 주요 진행을 확인합니다. 클라이언트가 규칙에 맞는 위치·입력 시퀀스를 만들어 보내거나 샘플 사이에서 벽을 지나는 것, 세부 NPC 충돌·피해 누락까지 입증할 수 없습니다. 일시정지·네트워크 지연의 허용 오차가 남습니다.

## 감사 로그와 관리자

commute_audit는 요청당 하나의 UUID, 서버 UTC, 검증된 사용자 ID 또는 익명, 작업명, HTTP 메서드와 상태, 결과와 사유, 소요 시간, 해당 플레이 ID, 교통 캐시 적중 여부, 외부 호출 및 실패 수를 담습니다. commute_upstream에는 요청 ID에 연결된 제공처·작업·시각·응답 상태·결과·소요 시간을 저장합니다.

- ALLOW는 권한과 검증을 통과한 정상 요청입니다.
- BLOCK은 로그인·권한·요청 형식·중복·기록 검증 등 정책상 거절입니다.
- FAIL은 자격 증명 불일치, 외부 서비스 실패, DB 오류입니다.

감사 로그에 비밀번호·쿠키·Authorization·세션 토큰·접속 문자열·교통 키·원본 본문·인증 URL을 저장하지 않습니다. 진행 자료는 허용 필드를 별도 테이블에 투영합니다. DB 오류 시 트랜잭션을 롤백하고 실패 로그를 다시 시도합니다. DB 로그도 불가능하면 요청 ID와 고정 코드만 구조화 오류로 남깁니다. 관리 화면 열기·목록·상세는 직접 동작당 한 번 기록하며 자동 새로고침하지 않습니다.

관리자는 전체 사용자 수, KST 기간별 요청, 사용자별·API별 요청, 결과별, 교통 캐시·외부 호출을 조회할 수 있습니다. 로그인 또는 완료 API를 선택해 이력과 차단 사유를 조회합니다. 목록은 사용자 ID·날짜·API·결과를 필터링하며 한 페이지는 25개입니다. 교통 캐시는 PostgreSQL에서 성공 5분·실패 30초이고 캐시 미적중 동시 요청은 DB 잠금으로 합칩니다. 공급처 문서의 기존 HTTP 주소를 사용하므로 해당 구간의 전송 암호화는 공급처에 따릅니다. [서울시 역사마스터](https://data.seoul.go.kr/dataList/OA-21232/S/1/datasetView.do) · [서울시 버스 노선정보](https://www.data.go.kr/data/15000193/openapi.do)

감사 로그와 진행 이벤트 기본 보존 기간은 30일입니다. AUDIT_RETENTION_DAYS에서 1~365일을 지정할 수 있습니다. Production 일일 Cron이나 npm run audit:prune으로 정리합니다. 공식 기록은 이 정리에서 제외합니다.

## Vercel 배포

1. 온라인 작업 트리에서 vercel login을 실행합니다. 열리는 Vercel 로그인과 CLI 승인 화면에서 본인 계정으로 연결합니다. vercel link에서 팀과 기존 프로젝트를 선택합니다. 기존 프로젝트가 없다면 대시보드의 **Add New → Project** 또는 CLI 질문에서 별도 프로젝트를 만듭니다. CLI 연결 시 GitHub 저장소에 push할 필요가 없습니다.
2. 기존 적합한 PostgreSQL이 있다면 **Settings → Environment Variables**에서 pooled 연결을 지정합니다. 없다면 **Storage / Integrations → Browse Marketplace → Neon → Install**에서 Free를 선택하고 프로젝트에 연결합니다. 새 계정 생성·약관 승인은 계정 소유자가 처리합니다. Preview와 Production은 별도 DB나 Neon 브랜치를 사용합니다. 함수는 hnd1이며 가능한 가까운 DB 리전을 선택합니다. [Vercel Neon 통합](https://vercel.com/marketplace/neon/neon)
3. **Settings → Environment Variables**에서 Preview·Production에 DATABASE_URL과 PASSWORD_PEPPER를 입력합니다. Production Cron에는 CRON_SECRET을 지정합니다. 실 교통 조회에는 SEOUL_OPENAPI_KEY와 DATA_GO_KR_SERVICE_KEY가 필요합니다. 기존 Sites의 키 설정은 보존합니다. 직접 DB 접속 문자열은 마이그레이션을 수행하는 운영 터미널에만 넣을 수 있습니다.
4. 권한 있는 터미널에 Preview 전용 DB 접속 값과 pepper를 설정하고 npm run migrate, npm run admin:create -- 관리자닉을 실행합니다. vercel deploy --environment preview가 출력한 Preview 주소에서 게임과 /administrator, 세션 거절, 가입·로그인, 저장·랭킹·감사, 실제 교통 조회를 확인합니다.
5. Preview 검증 후 Production 환경과 DB에 별도로 마이그레이션하고 관리자를 만든 다음 vercel deploy --prod를 실행합니다. 기존 GitHub Pages 링크와 Sites 배포는 유지합니다. [Vercel CLI 배포](https://vercel.com/docs/projects/deploy-from-cli)

롤백은 Vercel 프로젝트의 **Deployments → 직전 정상 Production → Instant Rollback** 또는 vercel rollback 명령으로 수행합니다. Hobby는 직전 Production으로만 롤백할 수 있습니다. 앱 롤백은 DB를 되감지 않으므로 스키마 호환성과 별도 DB 백업을 확인합니다. [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)

## 공식 요금

- Vercel Hobby는 개인·비상업용 무료입니다. 월 함수 호출 100만, 활성 CPU 4시간, 프로비저닝 메모리 360 GB·시간을 포함합니다. Hobby Cron은 하루 한 번까지 실행할 수 있습니다. 약 2.7초마다 들어오는 진행 요청과 감사 로그가 사용량을 함께 늘립니다. [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Cron 제한](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)
- Neon Free 공식 발표는 100개 프로젝트, 프로젝트별 월 100 CU시간과 PostgreSQL 저장 1GB를 안내합니다. 기존 DB가 없을 때 Neon을 선택할 근거는 Vercel 기본 통합, 서버리스 pooled 접속과 Preview 브랜치입니다. 유료 선택은 하지 않았습니다. [Neon 요금](https://neon.com/pricing) · [Neon 무료 플랜 업데이트](https://neon.com/blog/neon-free-plan-1-gb-per-project)

## 통합 테스트

TEST_DATABASE_URL에 이름이 commute_test_로 시작하는 빈 분리 DB를 지정하고 npm test를 실행합니다. 테스트는 앱 테이블이 있는 DB를 거절합니다. PostgreSQL 실 DB에서 마이그레이션 반복 실행, 동시 닉네임 중복·NFC·선행 0 PIN, 인증 실패·CSRF·권한·만료·로그아웃, 타 계정과 세션의 플레이 ID 사용, 이동 변조·정지 중 진행·포털 미접촉·타임아웃·재제출 거절, 두 코스 전체 기록 이벤트·공동 순위·재접속, 요청 감사 분류와 모의 업스트림·캐시 집계를 확인했습니다.

격리 PostgreSQL에서 통합 테스트 7개를 통과했습니다. Edge에서 실제 키 입력으로 공덕역 진입·5호선 탑승·충정로 환승·2호선 탑승·시청 회사 포털까지 진행했고, 서버가 공식 기록 03:25.7을 저장했습니다. 브라우저 저장소를 비우고 새 로그인 세션으로 같은 기록을 다시 조회했습니다. 별도 시도에서 스마트폰 사용 중 시간 진행, 정지 화면의 타이머 멈춤, 10초 네트워크 단절 종료와 관리자 필터·요청 상세 화면을 확인했습니다.

아래 표에는 배포 환경에서 별도로 확인한 결과를 기록합니다.

## 배포 상태와 평가 환경 검증

2026-11-20에 Vercel Hobby의 HTSQ 팀에 연결했습니다. Production 고정 도메인은 [seoul-commute-online.vercel.app](https://seoul-commute-online.vercel.app/)이며, [관리자 화면](https://seoul-commute-online.vercel.app/administrator)과 [관리자 로그인](https://seoul-commute-online.vercel.app/?admin=1)은 게임의 관리자 인증을 사용합니다. Vercel의 Standard Protection 설정에서 비로그인 HTTPS 요청은 Production에서 200, Preview에서는 Vercel 로그인으로 리디렉션됐습니다. Production 첫 화면은 Vercel 세션이 없는 새 Chromium에서도 확인했습니다.

Production과 Preview에는 싱가포르 리전의 독립된 Neon Free 프로젝트를 사용합니다. 서로 다른 프로젝트 ID와 DB 호스트를 확인했고 각 DB에 트랜잭션 기반 마이그레이션을 적용했습니다. Preview 검증 계정과 운영 관리자는 분리했습니다. 관리자 비밀번호는 숨김 입력으로 초기화하고 운영 비밀번호는 접근 권한이 제한된 WSL 사용자 저장소에 보관했습니다.

Node.js 22 정적 빌드와 격리 PostgreSQL의 통합 테스트 7개를 다시 통과했습니다. 공개 산출물 16개에서 환경 변수 파일과 DB 접속 문자열·개인 키 패턴은 발견되지 않았습니다. Production HTTPS로 환경 파일, 내부 서버 모듈, 마이그레이션 경로가 404를 반환하는 것을 확인했습니다.

| 실제 배포 확인 항목 | Preview | Production |
| --- | --- | --- |
| 게임 계정 비로그인 첫 화면, 스크립트·GLB 모델, 3D 장면 | 통과, Vercel 검증 권한으로 확인 | 통과, Vercel 인증 없이 확인 |
| 가입 UI, 정상 로그인, 잘못된 비밀번호 거절 | 통과 | 통과 |
| 익명 게임 시작·기록 제출 차단, 로그아웃 후 보호 API 차단 | 통과 | 통과 |
| 로그인 후 3D 게임 시작·키 입력·서버 진행 확인 | 통과 | 통과 |
| 실제 완주, 공식 기록 저장과 별도 브라우저에서 기록 유지 | 실제 키 입력 완주, 서버 201 저장, 별도 브라우저 재로그인 후 기록 조회 통과 | 실제 키 입력 완주, 서버 201 저장, 별도 브라우저 재로그인 후 기록 조회 통과 |
| 코스별 랭킹과 0.1초 공동 순위 | 코스 분리 및 임시 동점 데이터의 공동 순위 통과 | 코스 선택 통과, 실제 동점 검증은 미수행 |
| 일반 계정의 관리자 화면·API 차단, 관리자 로그인·로그 조회 | 통과 | 통과 |
| ALLOW·BLOCK·FAIL 저장과 교통 요청·실제 외부 호출 집계 | 통과, 미설정 요청과 외부 호출 0건을 구분 | 통과, 미설정 요청과 외부 호출 0건을 구분 |
| Secure·HttpOnly·SameSite 쿠키와 CSRF 검사 | 통과 | 통과 |
| 승인된 키를 사용한 서울시·공공데이터포털 실제 교통 조회 | 미검증, 키 미설정 | 미검증, 키 미설정 |

독립 이미지 텍스처는 배포 자산에 없습니다. 표지판 등은 브라우저가 캔버스 텍스처로 그립니다. 두 환경에서 3D 진행을 확인했으며 개별 표지판 텍스처를 따로 검증하지는 않았습니다. 첫 배포는 Vercel이 자동으로 Production에 배정했습니다. 이후 Preview 환경을 명시해 별도 배포하고 인증·권한·감사 기능을 확인한 다음 Production을 명시적으로 다시 배포했습니다.

공식 게임의 코스와 운행 규칙은 코드에 포함되어 있으며, 별도 교통 조회가 실패해도 공식 플레이 경로는 교통 조회 응답에 의존하지 않습니다. 실교통 키는 기존 승인 설정의 사용 권한과 값을 확인할 수 있는 계정에서 서버 환경에 등록합니다. Preview와 Production에는 전용 테스트 계정을 사용합니다. 관리자 접속 정보는 평가에서 필요한 경우 별도 비공개 채널로 전달합니다.

## 배포 환경 변수와 운영 순서

| 변수 | 용도와 범위 |
| --- | --- |
| `DATABASE_URL` | 각 환경 전용 PostgreSQL pooled URI. Preview와 Production의 연결 대상 및 자격 증명을 분리합니다. |
| `DIRECT_DATABASE_URL` | 선택 사항. 해당 환경 마이그레이션과 최초 관리자 생성용 직접 URI를 운영 터미널에만 설정합니다. Neon 통합의 `DATABASE_URL_UNPOOLED` 값을 여기에 사용할 수 있습니다. 설정하지 않으면 pooled URI를 사용합니다. |
| `PASSWORD_PEPPER` | 각 환경별 독립 난수 비밀값. 비밀번호 해시와 CSRF 서명에 사용합니다. |
| `CRON_SECRET` | Production 감사 로그 정리 Cron 인증용 비밀값입니다. |
| `AUDIT_RETENTION_DAYS` | 선택 사항. 감사 로그와 진행 이벤트 보존 기간이며 기본값은 30일입니다. |
| `SEOUL_OPENAPI_KEY`, `DATA_GO_KR_SERVICE_KEY` | 서버의 실제 지하철·버스 API에 쓰는 승인된 자격 증명입니다. |

Preview와 Production의 비밀을 각각 Vercel **Settings → Environment Variables**에서 Secret으로 설정합니다. Secret 값을 다시 내려받는 데 의존하지 않고, 관리자 초기화에 필요한 DB 연결과 같은 환경의 pepper는 권한 있는 운영자가 보안 저장소에서 터미널로 전달합니다. 비밀값을 CLI 인수나 Git 파일에 기록하지 않습니다. 프로젝트에 시스템 환경 변수도 제공되는지 확인합니다. 앱은 Vercel의 `VERCEL` 값으로 HTTPS 쿠키를 활성화합니다. 배포 전 대상 DB와 복구 지점을 확인하고 `npm run migrate`를 실행한 뒤 `npm run admin:create -- 관리자닉`에서 비밀번호를 숨김 입력합니다. [Vercel 비밀 환경 변수](https://vercel.com/docs/environment-variables/sensitive-environment-variables)

Preview는 `vercel deploy --environment preview`로 만들고 위 검증표를 실행합니다. Production 배포와 재배포는 검증한 소스에서 `vercel deploy --prod`를 사용합니다. Vercel **Settings → Deployment Protection**에서 Vercel Authentication의 범위를 **Standard Protection**으로 두고, **Settings → Domains**의 Production 기본 도메인을 Vercel 세션이 없는 브라우저에서 확인합니다. 최근 배포의 고유 URL은 보호될 수 있습니다. Production에서 검증표를 다시 실행한 뒤 확인한 Production 도메인, 관리자 경로와 결과를 이 문서에 기록합니다. [Vercel 배포 보호](https://vercel.com/docs/deployment-protection)

Neon Free는 공식 요금표상 기간 제한이나 카드 등록 없이 사용할 수 있습니다. 프로젝트별 월 100 CU시간과 저장 1GB를 제공하며, 유휴 컴퓨트가 일시정지됐다가 요청 시 다시 시작되면 첫 DB 호출이 늦어질 수 있습니다. 할당량을 소진하면 DB를 쓰는 가입·로그인·기록 저장·관리 기능이 영향을 받을 수 있습니다. Vercel Hobby에서도 사용량 한도 소진 시 해당 기능 이용이 제한될 수 있습니다. 앱 롤백 가능 여부는 배포 보존 상태와 DB 스키마 호환성을 함께 확인합니다. [Neon Free](https://neon.com/pricing) · [Neon 유휴 컴퓨트](https://neon.com/blog/how-to-reduce-postgres-compute-costs-as-you-scale) · [Vercel Hobby](https://vercel.com/docs/plans/hobby)

## 충정로역 최종 하차 안내와 기록 규칙

5호선 공덕 → 충정로 코스에서 **충정로 최종 하차 후**에만 오른쪽 출구 안내가 나타납니다. 하차 지점의 전방은 월드의 −Z, 화면 오른쪽은 +X입니다. 현행 승강장 모델의 중앙 구조 기둥은 x=0이고 안전선은 x=±4.6입니다. 새 동선은 하차 지점 (0, 8)에서 (2.25, 5.5)로 옮겨 기둥열을 피한 뒤 (2.25, −24)의 출구로 이어집니다. 반경 1.25m는 안전선을 넘지 않으며 NPC 순찰 범위 밖입니다. 다른 역과 환승 통로에는 이 표시를 적용하지 않습니다.

출구까지 걷는 거리가 기록에 영향을 줄 수 있어, 새 안내를 지원하는 지하철 클라이언트의 플레이에는 `gongdeok-chungjeongno-walk-5`를 발급합니다. 이전 클라이언트와 이미 발급된 플레이는 기존 출구 판정을 사용합니다. 버스는 `gongdeok-chungjeongno-walk-4`를 유지합니다. 지하철 랭킹의 **출구 동선**에서 기존 기록을 선택할 수 있습니다. DB 마이그레이션과 기록 변환은 필요하지 않습니다.
