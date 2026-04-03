---
description: 태스크 컨텍스트를 수집하고 Stream Deck 폴더에 세팅. GBIZ ID, Slack 링크, 자유 텍스트 모두 지원.
---

# Task Context Setup

입력에 따라 유연하게 컨텍스트를 수집하여 Stream Deck 태스크 폴더에 세팅합니다.

## 입력

`$ARGUMENTS` — 다음 중 하나:

1. **GBIZ ID** (예: `GBIZ-25425`) → Notion 중심 검색
2. **Slack 링크** (예: `https://herrencorp.slack.com/archives/...`) → 스레드에서 컨텍스트 추출
3. **자유 텍스트** (예: `PR 리뷰 정리`, `배포 확인`) → 잔업/메모 용도의 간단 버튼
4. **`clear`** 또는 **`clear 1`** → 폴더 비우기 (번호 없으면 전체, 있으면 해당 슬롯만)
5. **비어있음** → 현재 Git 브랜치에서 GBIZ ID 자동 추출

## 입력 타입 판별

- `clear` (또는 `clear N`) → **타입 0: 폴더 비우기**
- `GBIZ-\d+` 패턴 매칭 → **타입 1: Notion 검색**
- `slack.com` 또는 `slackMessage://` 포함 → **타입 2: Slack 스레드**
- 그 외 텍스트 → **타입 3: 자유 텍스트 (잔업)**
- 비어있음 → Git 브랜치에서 추출 후 타입 1로

## 타입 0: clear → 폴더 비우기

`/task clear` → 4개 폴더 전체 비우기
`/task clear 1` → 슬롯 1번만 비우기 (1~4)

비우는 방법:
1. 해당 자식 페이지의 버튼들을 삭제 (key 1~14, key 0의 backtoparent은 유지)
   - `streamdeck_write_page`로 directory_id 지정, clear_existing: true로 하되 backtoparent 버튼만 다시 넣기
   - backtoparent 버튼: `{"key": 0, "plugin_uuid": "com.elgato.streamdeck.profile.backtoparent", "action_uuid": "com.elgato.streamdeck.profile.backtoparent", "plugin_name": "Profiles", "action_name": "상위 폴더"}`
2. 메인 페이지의 폴더 아이콘을 기본 폴더 아이콘으로 교체
   - `streamdeck_create_icon({ lucide: "folder", text: "Empty", bg_color: "linear-gradient(#374151, #1F2937)", font_size: 22, filename: "task-folder-empty" })`
3. `streamdeck_restart_app`

## 타입 1: GBIZ ID → Notion 중심 검색

### 1. Notion 검색
`notion-search` MCP 도구로 태스크 ID 검색:
- query: "{태스크ID}", filters: {}, page_size: 3, max_highlight_length: 100

첫 번째 결과의 ID로 `notion-fetch`를 호출하여 문서 전체 내용을 읽습니다.

### 2. 문서에서 링크 추출
- **Slack**: `slackMessage://` 또는 `slack.com` URL
- **GitHub PR**: properties의 `"GitHub PR"` 배열 또는 문서 내 `github.com/pull/` URL
- **Figma**: 문서 내 `figma.com` URL
- **Notion URL**: 문서 자체 URL
- **상태**: properties의 `"상태"` 값

### 3. GitHub 보완 검색
Notion에서 PR을 못 찾으면:
```bash
cd /Users/gimjaehwan/project/gongbiz/gongbiz-crm-b2b-web && gh pr list --search "{태스크ID}" --state all --limit 3 --json number,title,url,state,headRefName
```

## 타입 2: Slack 링크 → 스레드 컨텍스트

### 1. Slack 스레드 읽기
`slack_read_thread` MCP 도구로 스레드 내용을 읽습니다.
- URL에서 channel_id와 message_ts 추출 (p 뒤 숫자를 timestamp로: p1234567890123456 → 1234567890.123456)
- 스레드에서 URL 추출: github.com, figma.com, notion.so, docs.google.com 링크
- 스레드 제목/첫 메시지에서 태스크 이름 추출

### 2. 추출된 링크들로 버튼 구성

## 타입 3: 자유 텍스트 → 잔업 버튼

간단하게 이름만 있는 아이콘을 폴더에 넣습니다.

## Stream Deck 세팅 — 폴더 방식

### 중요: 폴더는 Elgato 앱에서만 생성 가능

프로그래밍으로 폴더를 생성할 수 없습니다. 사용자가 Elgato 앱에서 미리 빈 폴더를 만들어두어야 합니다.
"공비서" 프로필 Task 페이지(directory_id: E64B5106-42EA-4289-839C-656EB00FE325)의 Row 1에 4개 폴더 슬롯이 있습니다.

### 폴더 슬롯 매핑 (고정)

| Key | ProfileUUID | 용도 |
|-----|-------------|------|
| 0 | 83ee7aaa-4d27-43d0-94e3-4c1e74ab90d0 | 태스크 1 |
| 1 | 1406ffdf-325f-4e9e-a07b-ea2f60df1aa9 | 태스크 2 |
| 2 | c5f74bc2-b3a7-48de-8403-11da3d70f050 | 태스크 3 |
| 3 | 37b1bca3-5024-45c6-8b76-c1540de7d75e | 태스크 4 |

각 폴더의 자식 페이지 directory_id는 ProfileUUID를 대문자로 변환한 것입니다.

### 폴더 아이콘 세팅 (메인 페이지)

`streamdeck_write_page`로 메인 Task 페이지의 폴더 버튼 아이콘을 업데이트합니다:
- directory_id: E64B5106-42EA-4289-839C-656EB00FE325
- clear_existing: false (다른 버튼 유지)
- 해당 key에 icon_path 세팅
- 기존 openchild 액션을 유지하기 위해 plugin_uuid, action_uuid, action_id, settings를 원래 값 그대로 전달

폴더 버튼 아이콘 생성:
```
streamdeck_create_icon({
  lucide: "folder-open",
  text: 태스크 ID 또는 이름 (짧게),
  subtitle: 태스크 제목 요약,
  bg_color: "linear-gradient(#3B82F6, #2563EB)",
  font_size: 22,
  filename: "task-folder-{id}"
})
```

### 폴더 내부 세팅 (자식 페이지)

`streamdeck_write_page`로 자식 페이지에 링크 버튼들을 채웁니다:
- directory_id: ProfileUUID를 대문자로 (예: 83EE7AAA-4D27-43D0-94E3-4C1E74AB90D0)
- clear_existing: true (기존 내용 교체)
- key 0에 backtoparent 버튼 다시 넣기

각 링크에 대해:
1. `streamdeck_create_icon` (font_size: 18~22, show_title: false)
2. `streamdeck_create_action` (command: `open "{URL}"`, filename: task-open-{type}-{id})

### 폴더 내부 레이아웃 — 이슈별 Row 구분

**여러 이슈가 하나의 폴더에 들어갈 때 (정기배포 등), 각 이슈를 Row로 구분합니다.**

5x3 그리드 (15키):
- key 0: ← Back (backtoparent)
- Row 1 (key 1~4): 이슈 1 — [이슈이름] [Slack] [Notion] [Figma/기타]
- Row 2 (key 5~9): 이슈 2 — [빈칸] [이슈이름] [Slack] [Notion] [Figma/기타]
- Row 3 (key 10~14): 이슈 3 — [빈칸] [이슈이름] [Slack] [기타]

**이슈 이름 버튼 (프리픽스)**: 각 Row의 첫 번째에 이슈 이름 아이콘을 배치합니다.
- 이슈 이름 아이콘은 해당 Slack 스레드로 링크
- 이슈별로 다른 배경색 사용:
  - 버그/긴급: linear-gradient(#EF4444, #DC2626) (빨강)
  - 기능개발: linear-gradient(#3B82F6, #2563EB) (파랑)
  - 디자인: linear-gradient(#F59E0B, #D97706) (주황)
  - 리팩토링: linear-gradient(#8B5CF6, #7C3AED) (보라)
  - 기타: linear-gradient(#6B7280, #4B5563) (회색)

**링크 버튼 (이슈 이름 옆에 배치)**:
- Slack: lucide: message-square, bg: linear-gradient(#611f69, #4A154B)
- Notion: lucide: folder-open, bg: linear-gradient(#2D2D2D, #191919)
- GitHub PR: lucide: git-pull-request, bg: linear-gradient(#238636, #1a7f37)
- Figma: lucide: layout, bg: linear-gradient(#F24E1E, #A259FF)
- Google Sheets/Docs: lucide: external-link, bg: linear-gradient(#16A34A, #15803D)

**단일 이슈 폴더 (GBIZ ID, 단일 Slack 링크 등)**:
Row 1만 사용:
- key 0: ← Back
- key 1: 이슈이름 (프리픽스)
- key 2~4: 관련 링크들 (Notion, PR, Slack, Figma 등)

### 아이콘 스타일 규칙

- 모든 아이콘: font_size 22 이상, show_title: false
- 모든 배경: linear-gradient 사용
- 없는 리소스는 버튼을 만들지 않음
- 파일명: task-{type}-{id} 형태

### 앱 리스타트

`streamdeck_restart_app`으로 Stream Deck 앱을 재시작합니다.

### 최종 출력

```
✅ Stream Deck 태스크 폴더 세팅 완료: GBIZ-25425
   📄 Notion: "일 캘린더 새벽 예약 이슈"
   🔀 PR: #4101 (merged)
   💬 Slack: 관련 스레드 1개
   
   메인 Task 페이지의 폴더 1을 눌러서 확인하세요.
```
