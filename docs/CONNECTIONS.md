# 계정별 공식 연결

충곽피티 로그인은 서비스 계정과 독립적입니다. 사용자는 자기 프로그램 계정에 로그인한 후 자기 구글·학교 Microsoft·Notion 계정을 선택합니다. 전역 앱 Client ID는 공통으로 사용할 수 있지만 사용자 토큰은 별도 연결 레코드로 저장합니다.

## Google Classroom

Google Cloud 프로젝트에서 Classroom API를 사용 설정하고 OAuth 동의 화면과 Web application 클라이언트를 만듭니다. 로컬 개발의 승인된 리디렉션 URI:

`http://127.0.0.1:4318/api/oauth/classroom/callback`

공개 배포 시 충곽피티의 HTTPS 도메인으로 바꿉니다. 권한은 `openid email`, `classroom.courses.readonly`, `classroom.coursework.me.readonly`, `classroom.courseworkmaterials.readonly`입니다. 테스트 모드에서는 사용할 계정을 테스트 사용자로 추가해야 하며 학교 정책에 따라 허용 또는 앱 검증이 필요할 수 있습니다. 외부 공개 전 Google 검증 요건을 확인하세요.

## Microsoft Teams

Entra에 Web application을 등록하고 사용할 조직 범위에 맞게 지원 계정을 선택합니다. 리디렉션 URI:

`http://127.0.0.1:4318/api/oauth/teams/callback`

위임 권한은 `openid email offline_access User.Read EduAssignments.ReadBasic`입니다. `EduAssignments.ReadBasic`은 관리자 동의가 필요합니다. `/education/me/assignments`의 기본 목록에서는 지침·webUrl이 비어 있으므로 수업별 상세 조회를 추가합니다. 과제 리소스와 본인 제출 상태를 읽으며 제출·성적 변경 API는 호출하지 않습니다. 채널 공지 전체 수집은 추가 Graph 채널 권한 없이 제공하지 않습니다. 현재 연결은 데스크톱 브리지로 이어갈 수 있습니다.

## Notion

다른 사용자가 각자 연결하려면 Notion의 Public connection을 만들고 아래 리디렉션 URI를 등록합니다.

`http://127.0.0.1:4318/api/oauth/notion/callback`

사용자는 연결 시 허용할 페이지를 직접 선택합니다. 개인 워크스페이스에서는 Internal connection 토큰을 그 사용자의 연결 화면에 넣어도 됩니다. 그 연결에 대상 페이지를 공유해야 합니다. 대상 data source ID를 입력하거나 연결 설정에서 부모 page ID로 새로운 충곽피티 일정표를 만드세요. 기존 일정표를 쓰는 경우 과제명·할 일 요약 속성이 있어야 하며 선택한 data source에서만 저장합니다. 기본 API 버전은 `2025-09-03`입니다.

## 현재 브리지

`data/desktop-bridge.json`은 로컬 소유자 전용 수신 URL과 키를 담습니다. 기존 예약 작업은 Notion 기록에서 확인된 값만 이 URL의 `items`로 보내며, 다른 사용자는 별도의 수신 연결을 만들어야 합니다. 이 파일의 비밀 키를 화면 설명·실행 로그·소스 코드에 복사하지 마세요.
