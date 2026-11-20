# 주말 개발 인수인계

기준일: 2026-11-20 (Asia/Seoul)

## 프로젝트와 현재 단계

대중교통 출근 게임은 공덕동에서 출발해 지하철 또는 7016번 버스를 타고 회사까지 이동하는 3인칭 웹게임입니다. 로그인·회원가입, 서버가 발급하는 플레이 ID, 검증·저장되는 공식 기록, 개인 기록·공동 순위, 관리자 감사 화면이 동작합니다. 현재는 대표 코스 두 개를 운영하는 제출용 Production 게임이며, 서울 24개 조합 전체나 완성된 실제 역 실측 재현은 구현 범위에 포함되지 않았습니다.

현재 게임 공개 주소: <https://seoul-commute-online.vercel.app/>
관리자 화면: <https://seoul-commute-online.vercel.app/administrator> (관리자 로그인 필요)

## 이 브랜치와 배포 소스

- 저장소: <https://github.com/hg18lee-source/seoul-commute-game>
- 개인 컴퓨터에서 사용할 브랜치: `handoff/weekend-continuation`
- 기준 공개 `main`: `1eac00e278c03b6d8f90105aefb44ba90a20fb8d`. 기존 GitHub Pages 사이트 루트와 `main`의 이력은 이 브랜치에서 변경하지 않았습니다.
- Production 소스 원래 작업 폴더: `seoul-commute-graphics`, 브랜치 `feature/production-graphics`, 커밋 `303e0679db21aa414cdb8fa52b5dcd29c53f9e66` (부모 `ef01ff1`). 실제 배포 식별자 `dpl_FWxGYyqwwdVeNAkmVdacPmWVL8Y3`, 프로젝트 `htsq/seoul-commute-online`.
- 위 Production 소스의 커밋 트리를 `online-game/`에 복사했습니다. 이번 인수인계 브랜치는 public `main`에서 시작해 해당 소스 스냅샷과 프로토타입 자료를 더하는 커밋입니다. Production 소스 저장소의 Git 이력을 새 공개 저장소 이력에 합치지는 않았으며, 원본 폴더와 브랜치를 그대로 보존했습니다.
- 프로토타입 원본 `seoul-commute-prototype`은 `main`의 `9ae67c6`에서 수정·신규 검토 파일이 미커밋 상태였습니다. `prototype/`에 현재 작업본을 보관하며 원본 저장소에서는 커밋·정리하지 않았습니다. 온라인 저장소 `seoul-commute-online`은 `feature/official-online`의 `28de9a1`에 미커밋 `ONLINE.md` 변경이 있었고, 해당 최신 문서를 `online-game/ONLINE.md`에 포함했습니다. Pages 저장소는 `main`의 `1eac00e`입니다. 사진 참고 폴더 `references/`, 사이트 연결 메타데이터, 생성된 `dist/server/`는 제외했습니다.
- `evidence/`에는 Production 확인 문서, 전후 비교 화면, 대표 경로 화면과 Preview QA 영상을 넣었습니다. 영상은 테스트 계정으로 진행한 Preview 촬영입니다.

## 구현과 실제 확인 범위

`online-game/`은 온라인 본편, API, PostgreSQL 마이그레이션, 테스트·빌드 스크립트, 최적화 GLB·텍스처·모션과 출처 크레딧을 포함합니다. Production 두 코스에서 실제 키 입력으로 완주하고 기록 HTTP 201 저장, 별도 브라우저 재로그인 후 기록 재조회, 랭킹, 관리자 권한·감사 로그, ALLOW/BLOCK/FAIL 집계, 비공개 파일 경로 거절을 확인했습니다. 상세 증거와 수치 한계는 `evidence/PRODUCTION-VERIFICATION.md`와 `online-game/ASSETS.md`를 보세요.

본편에 적용된 그래픽은 개선한 주인공과 절차형 이동 모션, 공유 NPC, 5차 거리 상점·재질, 최적화된 역 입구와 실제 상호작용 개찰구, 자체 제작 역사 내부·차량·정류장입니다. 별도 시안 화면·캡처는 `prototype/*-review/`에 있으며, 해당 폴더가 Production에 복사된 것은 아닙니다. `online-game/dist/` 안의 모델만 실제 온라인 본편 자산입니다.

미완성·제한: 대표 경로 외 코스는 지원하지 않습니다. 역사 내부는 게임용 축소 구성입니다. 성능 비교는 Chromium 800×600 SwiftShader 소프트웨어 렌더링에서만 했고 하드웨어 GPU, 실제 VRAM, 전체 운행 프레임 비용은 미측정입니다. 발별 착지 프레임은 독립 검증하지 않았습니다. 교통 API 키가 없는 새 환경에서는 실제 교통 조회가 동작하지 않으며 모의 응답을 Production 상태로 오인하면 안 됩니다. 기존 사용자 계정·DB와 관리자 암호는 이 저장소에 포함하지 않았습니다.

## 도구와 빠른 실행

필요 도구: Git, Node.js `22.x`, npm, 브라우저(WebGL 2). 프로토타입·자산 준비 스크립트에는 Python 3가 추가로 필요합니다. PostgreSQL은 온라인 계정·기록 API와 통합 테스트에 필요합니다.

```bash
git clone --branch handoff/weekend-continuation https://github.com/hg18lee-source/seoul-commute-game.git
cd seoul-commute-game/online-game
npm ci
npm run build
npm run dev
```

브라우저에서 `http://127.0.0.1:8010/`을 엽니다. DB 환경 변수가 없는 상태에서는 정적 첫 화면은 열릴 수 있지만 회원가입·로그인·플레이 API를 검증할 수 없습니다. 계정 기능을 시험하려면 먼저 아래와 같이 별도 로컬 개발 DB를 설정하세요.

별도 프로토타입을 실행할 때는 새 터미널에서 다음을 실행하고 `http://127.0.0.1:8000/`을 엽니다.

```bash
cd seoul-commute-game/prototype
python3 -m http.server --directory dist 8000
```

`prototype/worker/build.py`는 포함된 Worker 소스에서 `prototype/dist/server/index.js`를 다시 생성합니다. 생성 파일은 인수인계에서 제외했습니다. Python 표준 라이브러리만 쓰며 외부 API 키가 필요한 조회 기능은 실제 키를 별도로 설정하기 전까지 확인할 수 없습니다.

## 로컬 DB와 환경 변수

`online-game/.env.example`에는 변수명과 용도만 있습니다. 로컬에서 복사해 `online-game/.env.local`을 만들고 **전용 로컬 PostgreSQL DB** 및 테스트 전용 비밀값을 채우세요. `.env.local`은 Git 제외 대상입니다.

| 변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | 앱 런타임 PostgreSQL 연결 (개발 DB만) |
| `DIRECT_DATABASE_URL` | 마이그레이션·관리자 초기 생성용 직접 연결 |
| `PASSWORD_PEPPER` | Argon2id 비밀번호·CSRF 보조 비밀값 |
| `CRON_SECRET` | 보존 기간 정리 Cron 인증 |
| `AUDIT_RETENTION_DAYS` | 감사·진행 이벤트 보관 일수 |
| `SEOUL_OPENAPI_KEY` | 서울시 지하철 정보 조회 키 |
| `DATA_GO_KR_SERVICE_KEY` | 공공데이터 버스 조회 키 |
| `PORT` | 로컬 개발 HTTP 포트 (기본 8010) |
| `COOKIE_SECURE` | HTTPS 로컬 시험 때만 Secure 쿠키 설정 |
| `TEST_DATABASE_URL` | 테스트 전용 빈 `commute_test_*` DB |

로컬 DB와 키는 직접 준비하고, Production DB를 복제하거나 연결하지 마세요. 개발 DB에서 스키마를 적용하려면 `cd online-game && npm run migrate`를 실행합니다. 마이그레이션은 존재하는 migration만 순서대로 적용하며 DB 초기화 명령은 없습니다. 개발 관리자 계정은 `npm run admin:create -- 관리자닉`으로 만들며 암호를 터미널에서 두 번 숨김 입력합니다. 테스트는 분리된 빈 `commute_test_*` PostgreSQL에서만 실행합니다: `TEST_DATABASE_URL=... npm test`. 앱 테이블이 이미 있는 DB는 테스트가 거절합니다.

## 로컬·Preview·Production 구분

- **로컬:** 별도 로컬 DB·전용 pepper·별도 테스트 계정. `.env.local`에 운영 값을 붙여 넣지 마세요.
- **Preview:** Vercel 계정 소유자가 개발용 DB 브랜치와 Preview 전용 비밀 변수를 연결한 경우에만 배포·검증합니다. Production DB 값은 Preview에 설정하지 마세요.
- **Production:** 기존 프로젝트 `htsq/seoul-commute-online`, 운영 환경 변수와 DB는 이미 배포된 서비스 소유자만 다룹니다. 이번 GitHub 인수인계 push는 그 프로젝트의 배포 소스 연결을 바꾸거나 운영 마이그레이션을 실행하지 않습니다. 새 컴퓨터에서 `vercel --prod`, `npm run migrate` 또는 운영 DB 연결을 하지 마세요.

Vercel CLI에서 기존 프로젝트를 조회했으며 Git Repository는 연결되지 않은 상태라 이번 GitHub push가 Vercel Preview/Production 배포를 자동 실행하지 않습니다. Production은 수동 CLI 배포로 관리합니다. 프로젝트 설정은 현재 Node.js 26.x로 보고됐지만 `online-game/package.json`은 Node.js 22.x를 요구하므로, 새 컴퓨터에서 재배포하기 전 Vercel Node 설정과 엔진 범위를 맞추세요.

새 PC에서 계정 연결이 필요하면 본인 브라우저에서 GitHub/Vercel/Neon 로그인과 권한 승인을 직접 진행합니다. CLI 토큰·DB 문자열·관리자 암호를 문서나 채팅에 붙이지 않습니다. 이 저장소의 GitHub push 자체는 Pages의 `main`을 변경하지 않습니다. 단, GitHub/Vercel 프로젝트 설정은 계정 소유자가 별도로 확인하고, 새 브랜치 Preview 자동 빌드가 설정되어 있으면 Preview만 생성될 수 있습니다. Production 배포 브랜치 `main`은 건드리지 않았습니다.

## 자산·라이선스와 제외

`online-game/ASSETS.md`에 자산별 허가·크레딧·최적화와 미사용 사유가 있습니다. CC BY 4.0 출입구·개찰구와 최적화된 실행 GLB, 자체 제작 모델·코드·Three.js 라이선스 파일은 포함합니다. 공개 권한이 불명확하거나 원본 추출 제한이 있는 버스 OBJ, 차량 BLEND, 포즈 ZIP, CGTrader 역사 모델과 참고 사진은 포함하지 않았습니다. 대용량 중복 원본·ZIP·고해상도 텍스처도 없습니다. 자세한 원본 경로와 재취득 조건은 `ASSET_TRANSFER.md`를 확인하세요.

## 바로 다음 할 일

1. 새 PC에서 이 브랜치를 clone하고 `online-game/`과 `prototype/`의 구조를 확인합니다.
2. 게임 규칙·그래픽 수정은 우선 `online-game/`의 Production 소스와 `GAME_SPEC.md`를 함께 검토합니다. prototype 시안은 본편과 분리해 개발합니다.
3. 실제 계정·기록을 사용하는 외부 시험이 필요하면 새 개발 DB를 따로 준비하고, 먼저 Preview DB 분리를 확인합니다.
4. 미지원 출발·도착 코스를 추가하기 전 서버 검증·공정성 규칙 버전과 실경로를 함께 설계합니다.
5. 새 커밋은 `handoff/weekend-continuation` 또는 여기서 만든 작업 브랜치에 push합니다. Production 배포는 별도 요청과 검증 뒤 진행합니다.
