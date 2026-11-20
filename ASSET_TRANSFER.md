# 별도 자산 전달·재취득 안내

이 저장소는 공개 저장소입니다. 라이선스가 확인되지 않았거나 모델 단독 재배포가 제한된 파일은 포함하지 않았습니다. 이 목록은 자산을 자동으로 허가하지 않습니다. 원본 파일이 꼭 필요하면 본인 PC의 원본을 보존하거나 원 저작자 조건을 다시 확인하세요.

| 로컬 원본 경로 | 용도·상태 | 공개 저장소에 넣지 않은 이유 | 새 PC에서 필요한 위치 |
| --- | --- | --- | --- |
| `/mnt/c/Users/통신운용/Downloads/Bus_stop.obj` 및 같은 폴더의 MTL·텍스처가 있다면 함께 | 버스 정류장 외형 검토. 실제 본편은 자체 제작 정류장·노선 표기를 사용 | 대응 MTL·텍스처와 재배포 권한이 확인되지 않음. 본편 실행에 불필요 | 필요 시 `prototype/subway-entrance-review/`처럼 별도 비공개 검토 경로. 공개 빌드에 복사하지 않음 |
| `/mnt/c/Users/통신운용/Downloads/uploads_files_3750868_MB.W222.AMG.blend` | 차체·분리 바퀴·내장 텍스처 확인. 리그·액션은 없음. 게임에는 자체 제작 장식 차량 사용 | CGTrader Royalty Free 조건상 모델 단독 회수·재배포를 피함. 본편 실행에 불필요 | 필요하면 별도 비공개 Blender 검토 폴더. 원본 스크립트/자동 실행은 금지 |
| `/mnt/c/Users/통신운용/Downloads/male_body_poses(1).zip` | 정적 OBJ 실루엣·FBX 구조 조사. 실제 리타기팅 가능한 동작이 없음 | ZIP에 라이선스 문서가 없고 정적 자세만 확인됨 | 이동 불필요. 자체 제작 본편 리그·모션은 `online-game/dist/hero/`에 포함 |
| `/mnt/c/Users/통신운용/Downloads/animated_ticket_gate.glb` | CC BY 4.0 개찰구 원본. 최적화본은 `online-game/dist/transit-assets/ticket-gate.glb`에 있음 | 원본 중복 보관 방지. 게임 실행에는 최적화본만 필요 | 재최적화가 필요할 때만 해당 원본 경로로 복사. 원본 출처·저작자 표시는 `online-game/ASSETS.md` 참조 |
| `/mnt/c/Users/통신운용/Downloads/subway_entrance__street_assets_vol._01.glb` | CC BY 4.0 입구 원본. 출처·준비 스크립트·최적화본은 저장소에 포함 | 원본 중복을 줄이기 위해 생략. 검토용 경량 결과는 `prototype/subway-entrance-review/assets/entrance.glb`, 본편은 `online-game/dist/transit-assets/gongdeok-entrance.glb` | 재작업 시 `prototype/subway-entrance-review/assets/original.glb`에 복사. `prepare_model.py` 실행 전 별도 사본을 사용 |
| `/mnt/c/Users/통신운용/Downloads/subway station/` | 외부 역사·텍스처 묶음 검사 | CGTrader 자산 추출 제한과 텍스처 안 광고·지도 권리를 확인하지 못함. 본편은 자체 역사 내부를 씀 | 전달하지 않아도 현재 게임 빌드·실행 가능. 사용 재검토 시 원 출처 조건 확인 |
| 기존 prototype `references/`의 `commercial-street.png`, `residential-alley.png`, `sidewalk.png`, `station-entrance.png`, `storefront.png`, `street-main.png` | 시안의 거리 구성 참고 이미지 | 이미지별 원본 출처와 재배포 허가가 확인되지 않음 | 권리 확인 전 이동·공개 금지. `prototype/street-photoreal-review/reference/street.png`도 같은 사유로 제외했고 화면에는 안내 문구를 넣었습니다. 확인 후 필요하면 `prototype/references/`에만 보관 |

`online-game/ASSETS.md`의 크레딧과 라이선스 기록을 유지하세요. 참조 이미지를 새 저장소에 옮기지 않았으므로 Review HTML 중 일부는 사진/원본 GLB가 필요할 수 있습니다. 해당 검토 화면을 재생성하려면 필요한 소스 모델을 별도로 확보하고 라이선스를 먼저 확인하세요. 게임 본편의 실행 자산·상대 경로는 저장소 안에 포함되어 있습니다.
