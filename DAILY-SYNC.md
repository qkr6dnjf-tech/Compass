# 나라장터 일일 갱신

한국시간 매일 오전 10시, 이 Site에 연결된 예약 작업이 공식 공개 화면에서 전북·전주·군산·익산 참가제한 조경식재·시설물 공사를 수집합니다. 월말·공휴일도 같은 일정입니다. 수정·취소 및 개찰 반영을 위해 최근 30일 게시분을 다시 조회합니다. 장기간 중단된 경우 직전 성공 시점보다 7일 앞서 조회합니다.

## 예약 실행 절차

1. Sites `get_site`로 현재 프로젝트를 확인하고 `create_source_repository_write_credential` 및 Sites 소스 열기 절차로 최신 소스를 임시 체크아웃합니다. 배포는 필요하지 않습니다.
2. Node 22 이상과 Playwright Chromium이 필요합니다. 설치된 Playwright를 `PLAYWRIGHT_MODULE`로 지정하거나, 임시 작업 환경에서 `npm install --no-save --package-lock=false playwright`와 `npx playwright install chromium`을 실행합니다. Linux에서 브라우저 시스템 의존성이 필요하면 `npx playwright install --with-deps chromium`을 사용합니다. Edge가 있는 Windows에서는 `PLAYWRIGHT_CHANNEL=msedge`를 사용할 수 있습니다.
3. 체크아웃 루트에서 `node scripts/daily/run.mjs`를 실행하고 숨김 stdin 준비 메시지 후 Site 관리 응답의 `siwc_bypass_bearer_token`을 `{"token":"…"}` 한 줄로 전달합니다. 도구 응답에서 해당 값만 메모리로 읽어 stdin으로 전달하세요. 화면·로그·파일·명령줄에 인증정보를 남기지 마세요. 쓰기 권한은 사이트별 검증값과 대조합니다.
4. 종료 코드 0 및 `/api/daily-status`의 최신 성공 시각·조회 기간·개수를 확인합니다. 실패하면 원인을 기록하고 재시도합니다. 검색 누락·인증 실패를 성공으로 보고하지 마세요. 세부 자료가 확인된 공고만 반영하며 신규 공고의 미검토 가격조건은 비어 있습니다. 누적 자료와 개인별 모델·투찰 기록은 유지됩니다.
