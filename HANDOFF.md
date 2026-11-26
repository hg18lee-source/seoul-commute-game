# 서울 출근 게임 인수인계

본편 재개 브랜치는 `handoff/resume`이다. 본편 코드 기준은 관리자 대시보드 커밋 `0511ea82dbb969357766a28828c528517e04f219`이며, 이 문서는 그 위의 인수인계 커밋에 들어 있다. 정확한 인수인계 SHA는 체크아웃 후 `git rev-parse HEAD`로 확인한다.

## 보존 브랜치

| 브랜치 | 기준 또는 보존 커밋 | 내용 |
| --- | --- | --- |
| `codex/admin-dashboard-review` | `0511ea8` | 운영 요약, API·요청 이력, 집계 근거 UI |
| `codex/release-daily-completions` | `3125232` | 공식 완주 집계 마이그레이션과 배포 검증 |
| `codex/station-entrance-connection`, `codex/production-entrance-integration`, `codex/platform-exit-guide`, `codex/current-official-rankings` | `c2f7551` | 우측 승강장 출구 안내 및 기존 작업 포인터 |
| `codex/tutorial-public-release`, `codex/local-tutorial-integration`, `codex/ai-commute-tutorial`, `codex/vercel-build-fix` | `f824155`, `0bf4952`, `40c2931`, `73fa298` | 튜토리얼의 통합과 독립 시안, 빌드 수정 이력 |
| `feature/official-online`, `feature/production-graphics` | `28de9a1`, `303e067` | 인증·랭킹·관리자, 입구·장면 자산 |
| `handoff/platform-local` | `efd3e29` | 역 계단·통로, 이동 안내, 공식 판정과 테스트의 로컬 변형 |
| `handoff/tutorial-id-local` | `ad60bc4` | 가입 ID 규칙과 튜토리얼 UX·테스트의 로컬 변형 |
| `handoff/official-online-local` | `fa6dfb8` | 온라인 운영 문서 미커밋 변경 |
| `handoff/prototype-game` | `a697744` | 그래픽 검토용 시안, Worker와 플레이 코드, 배포 가능한 자산 |

기존 Pages `main`의 확인된 로컬 커밋은 `1eac00e`다. Sites 시안의 `main`은 별도 이력 `9ae67c6`이며 프로토타입 브랜치의 부모로 보존했다. 배포용 임시 clone의 스테이징은 기존 Pages 루트 파일 11개 삭제뿐이었으며 별도 로컬 패치로 보존했다.

## 현재 상태

- 본편에는 튜토리얼, ID 유효성 검사, 로그인과 공식 코스 랭킹, 공덕역 계단·통로와 출구 안내, 공식 완주 자동 집계, 관리자 필터 및 집계 근거·재계산 화면이 있다.
- 집계는 서울 날짜 및 현재 코스별 공식 규칙으로 저장된 `commute_records`를 조회한다. 튜토리얼·실패·무효·이전 규칙 플레이는 제외한다. 동일 플레이 재제출과 동시 완료, 원본 기록 대조는 격리 DB 통합 테스트 대상이다.
- 2026-11-23 보관된 Production 검증 기록은 `3125232` 번들 일치와 관리자 로그인, 집계·근거·실행 이력·재계산 검증을 기록한다. 당시 실제 신규 운영 완주에 따른 자동 갱신은 관측하지 않았다. `0511ea8`은 Preview 배포 기록이 있고 Production 승격은 미확인이다. 이번에 공개 호스트 DNS 조회에 실패해 현재 운영 버전을 실시간으로 확인하지 못했다.
- 플랫폼 로컬 스냅샷 변경 21개 파일 중 6개, 튜토리얼 로컬 스냅샷 13개 중 11개가 관리자 기준 트리와 다르다. 브랜치별 차이를 검토한 뒤 필요한 변경만 선택한다. 공식 집계와 브라우저 두 코스 완주 재현이 다음 확인 사항이다.

## 새 컴퓨터에서 실행

Linux 또는 WSL의 일반 사용자 환경에서 Git, Node.js 22.x와 npm, PostgreSQL 서버 도구(`pg_config`, `initdb`, `pg_ctl`, `createdb`), WebGL 2 브라우저가 필요하다. Ubuntu에서는 `sudo apt install postgresql libpq-dev`로 서버 도구를 설치할 수 있다. Node 22.23.5, npm 10.9.9, PostgreSQL 18.6 바이너리로 확인했다. 정적 시안·준비 스크립트에는 Python 3이 필요하다.

원격 브랜치가 확인된 뒤 실행한다.

```bash
git clone --branch handoff/resume https://github.com/hg18lee-source/seoul-commute-game.git
cd seoul-commute-game
git rev-parse HEAD
npm --prefix online-game ci --engine-strict
npm --prefix online-game run build
node --test tutorial/tests/*.test.mjs
bash tutorial/run-local.sh --test
bash tutorial/run-local.sh --admin 개발관리자
```

터미널에 개발 관리자 비밀번호를 입력한다. 서로 다른 문자가 8개 이상인 20~128자를 사용한다. 본편은 `http://127.0.0.1:8034/`, 관리자 로그인은 `http://127.0.0.1:8034/?admin=1`, 대시보드는 `http://127.0.0.1:8034/administrator`에서 연다. 실행기가 별도 로컬 소켓의 임시 DB와 랜덤 pepper를 만든다. 종료 시 해당 DB와 개발용 기록을 정리한다.

지속형 개발이 필요하면 `online-game/.env.example`을 같은 폴더의 `.env.local`로 복사하고, **격리된 개발 DB**의 `DATABASE_URL`과 로컬용 `PASSWORD_PEPPER`를 설정한다. pepper는 `openssl rand -hex 32` 등으로 새로 생성하고 해당 개발 DB를 유지하는 동안 같은 값을 쓴다. 같은 폴더에서 `npm run migrate`, `npm run admin:create -- 개발관리자`, `npm run dev`를 순서대로 실행한다. 통합 테스트에는 폐기 가능한 별도 `TEST_DATABASE_URL`을 사용한다.

## 자산과 별도 설정

- GLB, 텍스처, Three.js 및 라이선스는 Git에서 내려받는다. 검사한 Git 객체 중 100 MiB 제한을 넘는 파일이 없어 LFS는 현재 실행에 필요하지 않다. 향후 LFS 자산이 추가된 브랜치는 Git LFS 설치 후 `git lfs install && git lfs pull`로 실파일을 받는다.
- DB 연결 문자열과 pepper는 각 환경의 보안 저장소에서 준비한다. 운영·Preview의 DB와 기존 계정용 pepper는 환경별로 관리한다. 교통 API를 쓸 때 `SEOUL_OPENAPI_KEY`, `DATA_GO_KR_SERVICE_KEY`를, 배포 환경의 주기 작업에는 `CRON_SECRET`을 해당 환경에서 설정한다. 관리자 비밀번호, 토큰, 쿠키, 키, 운영 덤프는 별도 보안 보관 대상이다.
- 출처·재배포 권리가 미확인인 시안 참조 이미지는 원본 컴퓨터의 프로토타입과 로컬 전용 스냅샷에 있다. 본편 실행에는 저장소의 최적화 자산을 사용한다. 원본이 필요한 검토 화면과 라이선스는 [ASSET_TRANSFER.md](ASSET_TRANSFER.md)를 확인한다.
- 로컬 실행은 이전 작업 폴더의 절대 경로나 `/tmp/commute-tools` 설치에 의존하지 않는다. 임시 PostgreSQL은 실행 때 생성한다. [scripts/release](scripts/release)의 스크립트는 이전 수동 릴리스 절차의 소스다. 향후 승인된 릴리스에서만 별도 Vercel CLI 로그인, 프로젝트 연결 JSON(`VERCEL_LINK_FILE`), 영수증 경로(`RELEASE_RECEIPT_DIR`), 격리 Preview 환경을 준비한다. 릴리스 스크립트의 Bash 구문만 확인했다.

## 검증 및 재개 순서

1. 새 clone에서 위 설치·빌드를 실행한다. 이번에는 로컬 저장소를 별도 임시 경로에 새 clone하고 npm 캐시로 lockfile 설치와 빌드, 여정·NPC·튜토리얼 테스트를 확인했다. 독립 검토에서는 관리자 대시보드 테스트도 통과했다. PostgreSQL 바이너리는 시작을 시도했으나 현재 샌드박스의 Unix 소켓 생성 제한으로 DB 통합 테스트와 브라우저 완주를 확인하지 못했다.
2. 관리자 개발 계정과 별개의 플레이어 계정을 만든다. 튜토리얼을 끝낸 뒤 버스 및 지하철을 각 한 번 완주한다. 관리자 집계의 건수·최단 시간·원본 플레이 ID를 격리 DB 기록과 대조하고 재계산 및 중복 제출을 확인한다.
3. `git diff handoff/resume...handoff/platform-local` 및 `git diff handoff/resume...handoff/tutorial-id-local`로 분기 이후 로컬 변경을 확인한다. 현재 기준과 파일을 직접 비교하려면 각 명령의 `...`을 공백으로 바꾼다. 별도 작업 브랜치에서 누락 변경을 선택하고 해당 여정·가입·랭킹 테스트를 다시 실행한다.
4. 환경별 공식 규칙 버전과 배포 커밋을 읽기 전용으로 대조한다. 새 배포와 운영 변경은 별도 작업이다.
