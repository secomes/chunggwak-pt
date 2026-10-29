# 계정별 공식 연결

이 문서는 **Windows 배포 담당자용**입니다. Android 사용자는 자신의 학교 계정으로 로그인하면 되며 개발자 설정을 입력하지 않습니다. Android 앱 등록은 [배포 준비](ANDROID-PUBLISHING.md)를 참고하세요.

충곽 뭐해 로그인은 서비스 계정과 독립적입니다. 사용자는 자기 프로그램 계정에 로그인한 후 자기 구글·학교 Microsoft·Notion 계정을 선택합니다. 전역 앱 Client ID는 공통으로 사용할 수 있지만 사용자 토큰은 별도 연결 레코드로 저장합니다.

## Google Classroom

Google Cloud에서 Classroom API를 사용 설정하고 Android 클라이언트(패키지와 배포 서명 지문) 및 Windows용 Desktop 클라이언트를 등록했습니다. Windows는 로컬 반환 주소와 PKCE를 사용합니다:

`http://127.0.0.1:4318/api/oauth/classroom/callback`

권한은 `openid email`, `classroom.courses.readonly`, `classroom.coursework.me.readonly`, `classroom.courseworkmaterials.readonly`입니다. Google 앱은 프로덕션으로 게시했지만 민감한 범위 검증 전에는 100명 한도와 미검증 앱 경고가 적용됩니다. 학교 계정의 사용 정책도 별도로 적용됩니다.

## Microsoft Teams

Entra에 다중 조직용 퍼블릭 클라이언트를 등록했습니다. Windows와 Android 반환 주소는 각각 다음과 같습니다:

`http://127.0.0.1:4318/api/oauth/teams/callback`

`kr.cbsh.mohae://oauth/teams`

위임 권한은 `openid email offline_access User.Read EduAssignments.ReadBasic`입니다. `EduAssignments.ReadBasic`은 학교 관리자 동의가 필요하며 현재 학교 테넌트에는 허용되지 않았습니다. 새 다중 테넌트 앱은 게시자 확인 전 다른 조직 사용자의 자기 동의도 제한됩니다. `/education/me/assignments`의 기본 목록에서는 지침·webUrl이 비어 있으므로 수업별 상세 조회를 추가합니다. 과제 리소스와 본인 제출 상태를 읽으며 제출·성적 변경 API는 호출하지 않습니다. 채널 공지 전체 수집은 추가 Graph 채널 권한 없이 제공하지 않습니다.

## Notion

다른 사용자가 각자 연결하려면 Notion의 Public connection을 만들고 아래 리디렉션 URI를 등록합니다.

`http://127.0.0.1:4318/api/oauth/notion/callback`

사용자는 연결 시 허용할 페이지를 직접 선택합니다. 개인 워크스페이스에서는 Internal connection 토큰을 그 사용자의 연결 화면에 넣어도 됩니다. 그 연결에 대상 페이지를 공유해야 합니다. 대상 data source ID를 입력하거나 연결 설정에서 부모 page ID로 새로운 충곽 뭐해 일정표를 만드세요. 기존 일정표를 쓰는 경우 과제명·할 일 요약 속성이 있어야 하며 선택한 data source에서만 저장합니다. 기본 API 버전은 `2025-09-03`입니다.

## 현재 브리지

`data/desktop-bridge.json`은 로컬 소유자 전용 수신 URL과 키를 담습니다. 기존 예약 작업은 Notion 기록에서 확인된 값만 이 URL의 `items`로 보내며, 다른 사용자는 별도의 수신 연결을 만들어야 합니다. 이 파일의 비밀 키를 화면 설명·실행 로그·소스 코드에 복사하지 마세요.
