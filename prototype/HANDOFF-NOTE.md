# 프로토타입 보관 안내

이 폴더는 원래 `seoul-commute-prototype` 작업본을 복사한 검토·재생성 자료입니다. Production 본편은 저장소 루트의 `online-game/`입니다.

공개 권한이 확인되지 않은 사진 폴더 `references/`, Sites 연결 메타데이터 `.openai/`, 임시 서버 번들 `dist/server/`, Git 메타데이터와 인증 도구 설정은 복사하지 않았습니다. `worker/build.py`로 서버 번들을 다시 만들 수 있습니다. 검토 폴더의 코드·README는 보존했지만 원본/사진이 필요한 시안은 `ASSET_TRANSFER.md`를 확인하세요.

로컬 게임: `python3 -m http.server --directory dist 8000` 실행 후 `http://localhost:8000/` 접속. 이 정적 프로토타입은 온라인 로그인·서버 기록을 대체하지 않습니다.
