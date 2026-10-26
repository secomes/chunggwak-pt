# 충곽피티

사용자별 계정·서비스 연결을 분리하는 일정 관리 프로그램과 REST API입니다. Node.js 24 이상만 필요하며 외부 패키지를 설치하지 않습니다.

## 설치 파일

Windows x64용 단일 설치 프로그램은 GitHub Releases에서 받을 수 있습니다. 실행 파일과 AI 엔진이 포함되며 각 사용자가 자신의 ChatGPT·학교 서비스 계정으로 연결합니다. 개발자의 로그인·토큰·개인 일정은 포함하지 않습니다. 상세한 설치·업데이트·계정 분리는 [서비스 관리 안내](docs/OPERATIONS.md)를 참고하세요.

## AI로 서비스 만들기

**AI 개발실**에서 ChatGPT로 로그인한 뒤 만들 기능을 말합니다. 실제 코드 변경안을 생성하고 **변경 내용 보기 → 확인한 변경안 적용**으로 반영합니다. 사용자마다 별도 인증 저장소와 대화를 사용하며 다른 사람의 AI 계정은 자동으로 재사용하지 않습니다. 공용 프로그램의 변경은 로컬 운영자만 적용합니다. 각 ChatGPT 계정의 Codex 사용 가능 여부와 한도가 적용됩니다. API 키 입력은 필요하지 않습니다.

주황색 화면과 [학교 공식 홈페이지](https://school.cbe.go.kr/cbs-h/)의 로고를 사용합니다. 이 프로그램은 학교 공식 운영 서비스가 아닙니다.

## 사용하기

Windows에서 **충곽피티 실행.cmd**를 열면 서버가 백그라운드에서 시작되고 내 로컬 프로필의 일정표가 열립니다. 화면을 닫아도 서버는 실행됩니다. 기본 주소는 http://127.0.0.1:4318 입니다. **충곽피티 종료.cmd**는 이 실행기가 시작한 서버만 종료합니다.

개인 데이터가 있는 기존 개발 환경의 일정은 로컬 소유자 프로필에만 유지됩니다. 배포 설치본은 빈 일정표로 시작합니다. 다른 사람은 로그아웃 후 새 계정을 만들어 자신의 서비스에 연결합니다. 새 계정은 빈 일정표로 시작합니다. 로컬 소유자는 파일 접근 권한으로 인증하는 실행 바로가기를 사용하며, API · 설정에서 이메일과 비밀번호를 지정하면 일반 로그인도 가능합니다. 이메일은 프로그램의 로그인 ID이고 자체 이메일 인증·비밀번호 복구 메일은 아직 제공하지 않습니다.

Windows 로그인 때 자동 실행하려면 `scripts/Install-Autostart.ps1`, 해제하려면 `scripts/Remove-Autostart.ps1`을 실행합니다. 이는 사용자 계정의 시작 프로그램 바로가기이며 관리자 권한은 필요하지 않습니다. Node 실행 경로와 기본 포트 4318을 사용하는 Windows 로컬 실행기입니다. 포트를 바꾸는 운영 환경에서는 아래 명령으로 서버를 직접 실행하고 시작 명령을 배포 환경에 맞게 등록하세요.

```powershell
node src/server.mjs
node --test tests/core.test.mjs tests/api.test.mjs
```

## 지금 작동하는 것과 최초 연결에 필요한 것

- 내 일정·자료·달력·진행 메모, 사용자별 로그인, 연결별 갱신 간격, 자동 숨김, 원본 ID 기반 갱신, JSON 내보내기, 개인 API 키, 갱신 기록이 동작합니다.
- 기존 브라우저 기반 Teams·Classroom 수집은 **데스크톱 브리지** 수신 API로 연결합니다. 기존 Codex 예약 작업이 새 데이터를 보냅니다. 이 경로는 컴퓨터와 Codex 앱, 학교 계정 로그인이 유지되어야 합니다.
- **독립적인 Google·Microsoft·Notion OAuth** 코드는 구현되어 있지만, 운영자가 제공자 콘솔에서 충곽피티 앱을 등록하고 Client ID·Secret을 입력해야 실계정 연결이 됩니다. 기존 ChatGPT 플러그인의 토큰이나 브라우저 쿠키를 가져오지 않습니다.
- 공식 API 연결을 끝내면 충곽피티 서버가 직접 수집합니다. 그때는 Codex 앱 없이 서버만 실행하면 됩니다. 계정당 연결된 서비스의 기본 주기는 720분이며 설정에서 5~10,080분 사이로 조절합니다. 서버가 꺼진 동안에는 수집되지 않고, 재시작 후 예정 시각이 지난 연결부터 재시도합니다.
- Microsoft의 학교 과제 읽기 권한은 학교 관리자 승인이 필요합니다. 이 프로그램이 그 제한을 우회하지 않습니다. Teams 직접 연결은 과제 앱을 수집하며 채널 공지는 기존 브리지 또는 수신 API가 담당합니다.
- 요약은 기존에 확인한 한 문장 요약을 가져오며, 새 공식 API 항목의 기본 자동 요약은 원문에서 핵심 문장을 추출합니다. 별도 유료 AI API는 호출하지 않습니다.

## 서비스 추가와 호환성

화면의 **계정 연결**에서 Google Classroom, Microsoft Teams, Notion, HTTPS JSON 서비스, 수신 API, 직접 추가를 선택할 수 있습니다. JSON 필드 매핑으로 다른 프로그램의 제목·날짜·ID 이름을 맞춥니다. 프로그램 기능 자체는 **AI 개발실**에서 대화로 코드 변경안을 생성하고 검토 후 적용합니다. 서비스 어댑터의 추가 개발 규약은 [확장 안내](docs/EXTENSIONS.md)를 참고하세요.

API 문서는 실행 후 `/api/openapi.json`, 주요 사용 예시는 **API · 설정**에서 확인합니다. 개인 API 키는 사용자별 읽기·쓰기·갱신 권한을 나눕니다. 수신 API 키는 해당 연결에만 쓰기 권한이 있습니다.

```json
{
  "items": [{
    "externalId": "assignment-42", "courseId": "math-1",
    "title": "수학 보고서", "summary": "지정 양식으로 탐구 보고서를 작성해 제출하기.",
    "dueAt": "2026-11-02T21:00:00+09:00", "status": "assigned",
    "attachments": [{"name": "보고서 양식.hwp", "url": "https://example.com/form.hwp"}]
  }]
}
```

## 운영·백업·공개 배포

설정은 `.env.example`을 참고해 `.env`에 기록하거나 운영자의 **API · 설정 → 서비스 앱 등록**에 입력합니다. 화면에서 입력한 앱 비밀 키와 사용자 토큰은 AES-256-GCM으로 암호화합니다. 비밀번호는 salt를 둔 scrypt로 저장합니다. 사용자 ID는 요청 본문에서 받지 않고 로그인·API 키의 소유자로 결정합니다.

`data/`는 비공개 운영 데이터이며 Git에서 제외합니다. SQLite와 `master.key`를 **함께** 백업해야 연결을 복구할 수 있습니다. 서버를 종료한 상태에서 폴더 전체를 복사하세요. `local-owner.key`, `local-launch.json`, `desktop-bridge.json`에는 비밀 실행·수신 키가 있으므로 다른 사람에게 공유하지 마세요. 공개 배포 시에는 이 파일을 배포하지 않습니다.

기본 바인딩은 `127.0.0.1`입니다. 다중 기기용 공개 서비스는 아직 배포하지 않았습니다. 배포할 때는 로컬 소유자의 비밀번호를 먼저 설정하고, HTTPS 인증서가 있는 서버에서 `HOST=0.0.0.0`, `PUBLIC_URL=https://실제도메인`을 지정합니다. 프록시는 원래 Host를 전달해야 합니다. 외부 공개 모드에서는 로컬 실행 키 로그인이 차단되고 Secure 쿠키를 사용합니다. 제공자 등록 콜백 주소도 해당 HTTPS 도메인으로 맞춰야 합니다.

사용자 공개 전 추가 운영 항목: 도메인·HTTPS, 앱 검증/학교 승인, 계정 복구·이메일 인증, 개인정보 처리 방침, 백업·모니터링, 동시 부하 검증. 현재는 로컬에서 실행·검증한 첫 버전이며 대규모 서비스 검증을 마친 상태는 아닙니다.

공식 설정 근거: [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Classroom 읽기](https://developers.google.com/workspace/classroom/guides/manage-coursework), [Microsoft 학교 과제](https://learn.microsoft.com/en-us/graph/api/educationuser-list-assignments?view=graph-rest-1.0), [Microsoft 권한](https://learn.microsoft.com/en-us/graph/permissions-reference#eduassignmentsreadbasic), [Notion OAuth](https://developers.notion.com/guides/get-started/authorization).
