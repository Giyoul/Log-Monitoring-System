---
title: '오디오 중계 모니터링 로그 시각화 대시보드'
type: 'feature'
created: '2026-04-14'
status: 'done'
baseline_commit: 'NO_VCS'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 오디오 중계 세션에서 수집된 macOS 시스템 로그(top/iostat/powermetrics)가 텍스트로만 존재해, CPU 과부하·메모리 압박·디스크 불안정·서멀 스로틀링을 한눈에 파악하기 어렵다.

**Approach:** 3개 로그 파일을 브라우저에서 직접 파싱해 Chart.js 기반 멀티 섹션 대시보드로 렌더링한다. 위험 임계값 초과 시 시각적 경고를 표시하며, 빌드 과정 없이 GitHub Pages에 배포 가능한 순수 HTML/CSS/JS로 구성한다.

## Boundaries & Constraints

**Always:**
- 빌드 도구 없음 — `<script src="...">` CDN 로드만 사용 (Chart.js 4.x)
- 로그 파일은 `data/` 폴더에 번들, `fetch()`로 로드
- 위험 임계값: PhysMem unused < 500MB → 주황, swapouts delta > 0 → 빨강, thermal pressure ≠ Nominal → 빨강
- 파일 3개 모두 파싱 실패해도 나머지 섹션은 정상 렌더

**Ask First:**
- 차트 색상 테마 변경이 요청된 경우
- 임계값 수치 변경이 요청된 경우

**Never:**
- Node.js / 번들러 / 빌드 스크립트 도입
- 외부 API 호출
- 프로세스별 CPU 테이블 (top의 개별 프로세스 행은 현재 로그에 없음)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 정상 로드 | 3개 로그 파일 존재 | 3개 섹션 차트 렌더 | N/A |
| 파일 누락 | fetch 404 | 해당 섹션에 "데이터 없음" 메시지 표시 | 다른 섹션 영향 없음 |
| swapouts 발생 | swapouts delta > 0인 샘플 | 해당 포인트 빨간 점 + 상단 경고 배지 | N/A |
| Thermal 압박 | pressure ≠ Nominal | Thermal 섹션 배지 빨강 표시 | N/A |
| 파싱 오류 | 형식 불일치 줄 | 해당 줄 건너뜀, 유효 데이터만 사용 | 콘솔 warn |

</frozen-after-approval>

## Code Map

- `index.html` -- 진입점, CDN 로드, 3개 섹션 레이아웃
- `css/style.css` -- 다크 테마, 경고 배지, 카드 레이아웃
- `js/parsers.js` -- 로그별 파서 3개 (parseCpuSummary / parseDiskLog / parseHwLog)
- `js/charts.js` -- Chart.js 래퍼, 차트 생성 함수
- `js/main.js` -- fetch → parse → render 오케스트레이션, 경고 배지 로직
- `data/relay_cpu_summary.txt` -- top 로그 원본
- `data/relay_disk_log.txt` -- iostat 로그 원본
- `data/relay_hw_log.txt` -- powermetrics 로그 원본

## Tasks & Acceptance

**Execution:**
- [x] `data/` -- 로그 3개 파일 복사 -- fetch 경로 일치
- [x] `js/parsers.js` -- parseCpuSummary: 타임스탬프·CPU%·LoadAvg·PhysMem unused·swapouts 추출; parseDiskLog: MB/s·CPU us/sy/id·LoadAvg 추출; parseHwLog: 스냅샷별 E/P-Cluster residency·CPU/GPU Power·GPU residency·Thermal 추출 -- 파싱이 렌더와 분리되어야 테스트 가능
- [x] `js/charts.js` -- createLineChart(canvasId, labels, datasets, options) 공통 함수; 위험 임계값 초과 포인트에 pointBackgroundColor 빨강 적용 -- Chart.js 4.x API
- [x] `js/main.js` -- 3개 파일 병렬 fetch → 파서 호출 → 차트 렌더; 경고 배지(swapouts·PhysMem·Thermal) DOM 업데이트 -- Promise.allSettled 사용
- [x] `css/style.css` -- 다크 배경(#1a1a2e), 카드 그리드, 경고 배지(주황/빨강), 반응형 -- 오디오 엔지니어 장시간 사용 고려
- [x] `index.html` -- Chart.js CDN, 3개 섹션(CPU/Disk/Hardware), canvas 요소, 경고 배지 컨테이너 -- GitHub Pages 루트에서 바로 열 수 있게

**Acceptance Criteria:**
- Given 3개 로그 파일이 `data/`에 존재, when `index.html`을 브라우저에서 열면, then 3개 섹션 차트가 모두 렌더된다
- Given swapouts delta > 0인 샘플이 존재, when 페이지 로드, then 해당 포인트 빨간 점 + 상단에 "⚠ Swapout 발생" 배지가 표시된다
- Given PhysMem unused < 500MB인 샘플, when 페이지 로드, then 해당 포인트 주황 + "⚠ 메모리 부족" 배지
- Given relay_hw_log.txt에 thermal pressure 값 존재, when 렌더, then Nominal이면 초록 배지, 아니면 빨간 배지
- Given 파일 하나가 404, when 페이지 로드, then 해당 섹션만 "데이터 없음" 표시, 나머지 정상 동작

## Design Notes

**파서 설계:**
```js
// parseCpuSummary 반환 형태
{ timestamps, userPct, sysPct, idlePct, loadAvg1m, loadAvg5m, loadAvg15m,
  physMemUnusedMB, swapoutsDelta }

// parseHwLog 반환 형태 (스냅샷 배열)
{ timestamps, eClusterResidency, pClusterResidency,
  cpuPowerMW, gpuPowerMW, anePowerMW, gpuResidency, thermalLevels }
```

**swapouts delta:** 누적값이므로 인접 샘플 차이(diff)로 계산.

**GitHub Pages 배포:** git repo 초기화 후 `gh-pages` 브랜치 또는 main 브랜치 루트에 푸시하면 됨 (현재 디렉토리는 git repo가 아님 — 배포 전 `git init` 필요).

## Suggested Review Order

**파서 (데이터 진입점)**

- CRLF 정규화, swapDelta null 처리, 각 로그 형식 파싱
  [`parsers.js:1`](../../js/parsers.js#L1)

**차트 렌더링**

- createLineChart/createBarChart, pointColorsFromThreshold
  [`charts.js:1`](../../js/charts.js#L1)

**오케스트레이션 · 배지 로직**

- Promise.allSettled, 경고 배지 조건 (swapout null 제외, thermal 통합)
  [`main.js:1`](../../js/main.js#L1)

**레이아웃 · 스타일**

- 다크 테마, badge--danger 펄스 애니메이션
  [`style.css:1`](../../css/style.css#L1)

**진입점**

- CDN 로드, 3개 섹션 canvas 구조
  [`index.html:1`](../../index.html#L1)

## Verification

**Manual checks (브라우저에서 확인):**
- `python3 -m http.server 8080` 후 `http://localhost:8080` 접속 → 3개 섹션 차트 확인
- 콘솔 오류 없음
- swapouts delta 샘플(16:53:57 스냅샷: swapins +4) → 빨간 포인트 확인
- PhysMem unused 17MB 샘플(16:53:57) → 주황 배지 확인
