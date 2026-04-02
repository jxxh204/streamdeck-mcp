---
description: 태스크 컨텍스트를 수집하고 Stream Deck에 세팅. GBIZ ID, Slack 링크, 자유 텍스트 모두 지원.
---

# Task Context Setup

입력에 따라 유연하게 컨텍스트를 수집하여 Stream Deck 태스크 폴더로 세팅합니다.

## 입력

`$ARGUMENTS` — 다음 중 하나:

1. **GBIZ ID** (예: `GBIZ-25425`) → Notion 중심 검색
2. **Slack 링크** (예: `https://herrencorp.slack.com/archives/...`) → 스레드에서 컨텍스트 추출
3. **자유 텍스트** (예: `PR 리뷰 정리`, `배포 확인`) → 잔업/메모 용도의 간단 버튼
4. **비어있음** → 현재 Git 브랜치에서 GBIZ ID 자동 추출

## 입력 타입 판별

- `GBIZ-\d+` 패턴 매칭 → **타입 1: Notion 검색**
- `slack.com` 또는 `slackMessage://` 포함 → **타입 2: Slack 스레드**
- 그 외 텍스트 → **타입 3: 자유 텍스트 (잔업)**
- 비어있음 → Git 브랜치에서 추출 후 타입 1로

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
- 스레드에서 URL 추출: github.com, figma.com, notion.so 링크
- 스레드 제목/첫 메시지에서 태스크 이름 추출

### 2. 추출된 링크들로 버튼 구성
- 스레드 URL 자체 → Slack 버튼
- 발견된 GitHub/Figma/Notion 링크 → 각 버튼

## 타입 3: 자유 텍스트 → 잔업 버튼

간단하게 이름만 있는 태스크 폴더를 만듭니다.
- 태스크 이름으로 아이콘 생성
- 연결 링크가 없으므로 빈 상세 페이지 (나중에 수동으로 채울 수 있음)

## Stream Deck 세팅 (모든 타입 공통)

### 구조: 폴더 방식

**메인 Task 페이지**의 Row 1에 태스크 폴더 버튼 추가 (key 0~3):
- 기존 태스크 폴더가 있으면 빈 슬롯에 추가
- 4개 초과 시 가장 오래된 것을 교체

**태스크 상세 페이지** 생성 (메인 Task 다음 페이지):
```
Row 1: [Notion] [PR] [Slack] [Figma/기타] [← Back]
Row 2~3: (비워둠)
```

### 메인 Task 페이지 찾기

`streamdeck_read_profiles`로 "공비서" 프로필 조회 → pages에서 `name === "Task"`인 페이지의 `directory_id`를 찾습니다.

### 태스크 폴더 버튼 (메인 페이지 Row 1)

`streamdeck_create_icon`으로 폴더 아이콘 생성:
- lucide: folder-open
- text: 태스크 ID 또는 이름 (짧게)
- subtitle: 태스크 제목 요약
- bg_color: linear-gradient(#3B82F6, #2563EB)
- font_size: 22
- filename: task-folder-{id}

폴더 버튼의 action_type: "next_page" → 상세 페이지로 이동

### 태스크 상세 페이지 (새 페이지)

`streamdeck_write_page`로 생성 (create_new: true):
- page_name: 태스크 ID 또는 이름

각 링크에 대해:
1. `streamdeck_create_icon` (font_size: 22 이상, show_title: false)
2. `streamdeck_create_action` (command: `open "{URL}"`, filename: task-open-{type}-{id})

**버튼 배치 (있는 것만, 없으면 건너뜀)**:
- key 0: Notion (lucide: folder-open, bg: linear-gradient(#2D2D2D, #191919))
- key 1: GitHub PR (lucide: git-pull-request, bg: linear-gradient(#238636, #1a7f37))
- key 2: Slack (lucide: message-square, bg: linear-gradient(#611f69, #4A154B))
- key 3: Figma (lucide: layout, bg: linear-gradient(#F24E1E, #A259FF))
- key 4: ← Back (lucide: home, bg: linear-gradient(#374151, #1F2937), action_type: previous_page)

### 아이콘 스타일 규칙

- 모든 아이콘: font_size 22 이상, show_title: false
- 모든 배경: linear-gradient 사용
- 없는 리소스는 버튼을 만들지 않음
- 파일명: task-{type}-{id} 형태

### 앱 리스타트

`streamdeck_restart_app`으로 Stream Deck 앱을 재시작합니다.

### 최종 출력

```
✅ Stream Deck 태스크 폴더 추가 완료: GBIZ-25425
   📄 Notion: "일 캘린더 새벽 예약 이슈"
   🔀 PR: #4101 (merged)
   💬 Slack: 관련 스레드 1개
   
   메인 Task 페이지에서 [📁 25425] 버튼을 누르면 상세 페이지로 이동합니다.
```
