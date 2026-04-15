# Deferred Work

## From: log-visualization-dashboard (2026-04-15)

- **자정 걸친 로그 타임스탬프 날짜 절삭**: `parseCpuSummary`는 타임스탬프에서 시간부만 사용. 자정이 걸치는 세션에서는 X축 순서가 역전될 수 있음. 현재 용도(단기 중계 세션)에서는 비해당.
- **멀티 디스크 iostat 포맷**: `parseDiskLog`는 두 번째 디스크 컬럼을 묵시적으로 무시. 싱글 disk0 포맷만 지원 문서화 필요.
- **Chart.js null 반환 미체크**: `createLineChart`/`createBarChart`가 canvas 미발견 시 null 반환하나 호출부에서 미체크. index.html canvas ID가 고정이라 현재는 실발생 없음.
- **swapout 카운터 리셋 감지**: 세션 중 시스템 재시작으로 누적 swapout 카운터가 리셋되면 음수 delta가 0으로 클램프됨. 현재 Math.max(0, ...) 처리로 무해하나 감지 불가.
- **iostat 디스크 레이블에 시간 정보 없음**: X축이 S1~S8로만 표시. iostat 포맷에 타임스탬프 없어 구조적 한계.
