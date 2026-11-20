# 본편 그래픽과 자산 출처

## 적용 범위

Vercel은 온라인 저장소의 `dist/index.html → game.js → world.js`를 제공한다. 기존 `world.js`, `gongdeok-street.js`, 주인공 리그는 원본 프로젝트의 초기 통합본과 같았다. 검토 폴더는 Vercel 소스에서 제외됐고 5차 상점과 지하철 입구 검토 코드가 본편에서 import되지 않았다. 별도 검토 UI·비교 이미지·영상은 빌드 입력에 포함하지 않는다.

| 모델 또는 검토 결과 | 판정 및 게임 내 위치 | 라이선스와 최적화 |
| --- | --- | --- |
| `character-review`, `dist/hero` | 자체 제작 1.5차 주인공 리그와 기존 보행·달리기·회전 모션을 유지했다. 몸통·손발 자세와 색상·키가 다른 경량 NPC를 본편에서 사용한다. | 자체 제작. 주인공 GLB 한 개와 18개 뼈대. NPC들은 캡슐·구·상자 기하와 재질을 공유하며, 25m 밖에서 팔·다리 자세 갱신을 생략한다. |
| `street-review`, 3차 거리, 4차, 5차 | 초기에 통합한 거리의 공식 좌표와 인스턴싱을 기반으로, 5차의 분식점·안경점 인테리어, 석재·벽돌 맵과 간판을 포팅했다. 3·4·5차 검토 장면 전체의 이동·카메라를 가져오면 공식 동선이 달라진다. | 자체 제작. 되풀이되는 상점 부품을 배치별로 인스턴싱한다. 먼 안경테는 숨기고 외벽은 경량 색상 맵을 쓴다. 5차 전체의 조명·반사·잎을 가져오는 대신 측정 비용이 낮은 기존 거리 기반을 선택했다. |
| `subway-entrance-review`, 입구 원본 GLB | 게임의 공덕역 1번 출구. 원본 앞부분과 계단 비교 후 검토본의 19개 메시를 사용했다. 중심 난간과 측난간 경계를 적용하고 계단 출구를 대합실에 연결했다. | Alt, CC BY 4.0. 원본 8,535,404B → 검토본 1,971,884B → 배포본 915,008B. 삼각형 4,896개. 주변 지면·시설물을 제거하고 역명과 유리·지하 재질을 조정했다. |
| `animated_ticket_gate.glb` | 공덕·충정로 대합실. 1.307×1.047×1.9m, 메시 6개, 재질 1개, 내장 이미지 4개. 약 0.833초 원본 클립의 네 문짝 회전 트랙에서 열림·닫힘 자세를 얻어 동기화했다. | €r!c, CC BY 4.0. 550,368B → 536,548B. 좁은 통과 폭을 보정하고 E 입력, 문 개폐와 통과 경계를 연결했다. |
| `Bus_stop.obj` | 공개 제외. 9,743 정점, 9,948 면, 83 그룹·재질 배정. 자체 제작 금속·유리 정류장과 공덕역1번출구·7016 표기를 기존 승차 위치에 사용한다. | `Bus_stop.mtl`과 대응 파일 및 배포 권한을 확인하지 못했다. OBJ에 UV와 법선은 있으나 재질 이름만으로 텍스처를 복원할 수 없다. |
| `uploads_files_3750868_MB.W222.AMG.blend` | 공개 제외. Blender에서 9개 메시, 차체 1개와 분리 바퀴·브레이크 각 4개, 4K 내장 이미지 4개, 액션·리그 없음 확인. 대체 승용차 두 대가 차도에서 정해진 시간에 이동·정지하고 바퀴가 회전한다. | CGTrader Royalty Free (no AI). 현재 공개 정적 GLB 방식은 모델 단독 회수를 막을 수 없어 사용하지 않았다. 대체 승용차는 자체 제작이며 플레이 시간으로만 애니메이션을 계산한다. |
| `male_body_poses(1).zip` | 공개 제외. 두 달리기 OBJ에서 정적 실루엣을 비교했다. FBX는 5개 지오메트리, 디포머·애니메이션 스택·곡선 0개라 리타기팅할 모션이 없다. | 라이선스 문서 없음. OBJ·FBX·STL·ZTL 메시 및 포즈 데이터를 배포하지 않는다. 기존 자체 제작 절차형 모션을 사용한다. |
| `subway station/` | 공개 제외. Blender 모델 60개 메시, 85,448 정점, 21개 재질, 리그·액션 없음. RAR에서 43개 파일을 임시 폴더로 추출했고 외부 타일·금속·표지·광고 파일을 확인했다. 대합실·승강장은 자체 제작 벽체·노선 띠·조명·안내판으로 교체했다. | CGTrader Royalty Free (no AI). 정적 자산 회수 제한과 포함된 일부 광고·지도 텍스처의 권리 범위를 해결하지 못해 외부 메시·텍스처를 배포하지 않는다. |
| `references/`, `character-pose-review/` | 거리 사진은 보도·상점·출입구 구성 참고에 사용했다. 별도 `character-pose-review/` 폴더는 찾지 못했다. | 참고 사진은 빌드 대상 밖이다. |

입구와 개찰구에 대한 출처와 수정사항은 게임의 [자산 출처](/credits.html)에 표시한다. Sketchfab 모델 API와 GLB 메타데이터에서 라이선스가 일치했다. [Alt 모델 메타데이터](https://api.sketchfab.com/v3/models/35c02eee93ea4a2f80af8acb84351d8c) · [€r!c 모델 메타데이터](https://api.sketchfab.com/v3/models/19a605237de941edbd9fe829ca0cfedf) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

[차량 원본](https://www.cgtrader.com/free-3d-models/car/luxury-car/mercedes-benz-s65-amg-w222) · [역사 원본](https://www.cgtrader.com/free-3d-models/architectural/other/subway-station-9e560e81-fa9a-4ee9-98b6-da3ed087c230) · [CGTrader Royalty Free 조건](https://help.cgtrader.com/hc/en-us/articles/360015124437-Royalty-Free-License) · [Three.js MIT](dist/vendor/THREE-LICENSE.txt)

Blender 사본은 `--background --factory-startup --disable-autoexec`로 열었다. 다운로드 원본은 그대로 두고 사본과 텍스처 추출은 비공개 임시 작업 경로에서 수행했다. 출근 동선에서 사용할 최적화 GLB 두 개만 Git과 공개 빌드에 포함한다. 역사 내부는 실제 역을 참조한 게임용 구성이다.

## 재빌드와 운영

- Node.js 22에서 `npm ci` 후 `npm run build`를 실행한다. `scripts/build.mjs`의 파일 목록이 공개 입력을 정한다. HTML은 해시가 붙은 `/game-assets/` 하위 경로의 엔트리를 참조한다. 해시에 모듈, CSS, 모델 바이트를 포함하므로 변경 시 브라우저가 새 URL로 로드한다.
- 두 모델은 이미 빌드 가능한 형태로 저장돼 있다. 다시 최적화하려면 별도 비공개 폴더에 Sharp를 설치하고 `node scripts/optimize-gltf-textures.mjs INPUT.glb OUTPUT.glb /absolute/tool/package.json`을 실행한다. 입구 입력은 원본 프로젝트 `subway-entrance-review/prepare_model.py`로 얻은 최적화 중간본, 개찰구 입력은 다운로드 GLB다. 최대 512px로 내장 맵을 축소하며 원본 포맷과 glTF 색 공간 용도를 유지한다.
- 기존 프로젝트 `htsq/seoul-commute-online`에 연결하고 `vercel deploy --environment preview`, 검증 후 `vercel deploy --prod`를 사용한다. Preview와 Production의 DB 연결 및 비밀 환경 변수는 [ONLINE.md](ONLINE.md)를 따른다. 이번 릴리스에는 스키마 마이그레이션이 없다. 이전 Production 배포로 돌아가야 하면 Vercel Instant Rollback을 사용한다. 이전 앱은 이전 랭킹을 표시하며 새 버전의 DB 행은 보존된다.
- 새 실행 및 기본 랭킹은 `gongdeok-transit-graphics-2`다. 계단·개찰구 진입 판정이 변경되어 기존 경기와 분리한다. 플레이어는 랭킹에서 이전 규칙을 선택할 수 있으며 개인 기록에는 두 버전이 표시된다. 서버는 이전 실행 중 발급된 플레이 ID의 이전 진입 규칙도 인식한다. 이동 속도, 체력비용과 배차 시각은 그대로다.
