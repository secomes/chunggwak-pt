# Android 배포 준비

## 배포자 등록 상태와 남은 외부 승인

2026-10-29에 Google Classroom API, Android/Windows OAuth 클라이언트, Microsoft 다중 조직용 퍼블릭 클라이언트와 두 플랫폼의 반환 주소를 등록했습니다. 공개 client ID만 앱에 포함합니다. Google OAuth 앱은 프로덕션 단계입니다. OAuth 로그인 시험에서 Google은 `access_not_configured`로 앱 검토를 요구했고, 학교 Microsoft 계정은 `AADSTS90094`로 관리자 동의 정책에 막혔습니다. Microsoft `EduAssignments.ReadBasic`은 학교 테넌트에 허용되지 않았습니다. 학교 밖 조직은 게시자 확인 및 각 조직의 앱 승인 정책이 적용됩니다.

## 배포 담당자가 준비할 항목

1. 합법적으로 앱 등록 권한을 가진 Google 프로젝트에서 Classroom API를 활성화합니다. Google Auth Platform에 앱 이름 `충곽 뭐해`와 개인정보 처리 안내를 등록합니다. 학교의 내부 앱으로 운영할 경우 학교 조직의 적절한 담당자가 등록해야 합니다.
2. Android OAuth 클라이언트에 패키지 `kr.cbsh.mohae`와 **배포 서명 인증서의 SHA-1**을 등록합니다. 계정마다 새로운 앱을 등록하는 것이 아닙니다. 테스트 사용자 제한 및 민감한 읽기 권한 검증 요건은 실제 배포 대상에 맞게 해결합니다.
3. Microsoft Entra에 학교 계정을 지원하는 native/public-client 앱을 등록합니다. 반환 주소는 `kr.cbsh.mohae://oauth/teams`, 인증 방식은 authorization code + PKCE입니다. **APK에 client secret을 넣지 않습니다.**
4. Microsoft 위임 권한은 `User.Read`, `EduAssignments.ReadBasic`, `offline_access`입니다. 학교 과제 권한에는 조직 관리자 승인이 필요합니다. 조직의 승인을 우회하지 않습니다.
5. Microsoft의 공개 client ID를 `android/oauth.properties`의 `microsoftClientId`에 설정합니다. Android용 Google SDK는 패키지·서명 조합으로 앱 등록을 확인합니다.

학교 계정 사용자에게 이 과정을 넘기지 않습니다. 최종 사용자는 자신의 계정으로 로그인하고 과제 읽기에 동의합니다.

## 배포 판정

코드 빌드 성공만으로 출시하지 않습니다. 다음 항목은 실제 동의받은 시험 계정과 Android 기기에서 확인해야 합니다.

- 처음 설치한 기기에서 Google·Teams 각각 로그인하고 본인의 계정임을 확인
- 수업 전체 목록의 진행 중 과제, 학습자료, 첨부파일 이름, 정확한 마감 시각 대조
- 원본에서 제출·제출 취소·마감 변경 후 갱신 및 알림 취소/재예약 확인
- 재시작·네트워크 단절·알림 권한 거부·계정 재로그인·연결 해제 확인
- 두 사용자/기기에서 서로 다른 데이터가 보이며 배포자 정보가 섞이지 않음 확인
- 일주일 전·하루 전·당일 알림을 실제 기기에서 수신하고 알림 선택 시 해당 과제 열기

현재 Android Teams 연결은 공식 과제 앱을 대상으로 합니다. 채널에만 올라온 일반 공지는 자동 수집하지 않습니다. 기존 Windows 브리지가 읽던 채널 공지가 Android에 자동으로 포함된다고 안내하면 안 됩니다.

## 등록할 때 확인할 정책

무료 학교용 서비스의 실제 운영 목적에 맞는 등록 계정과 절차를 사용합니다. 제공자 화면에서 상업적 이용 선언이나 본인인증을 요구하면 임의의 사실을 입력하지 않습니다. Google Workspace for Education의 연령별 서비스 제한, 학교의 외부 앱 승인 정책은 배포 담당자와 조직 관리자가 확인해야 합니다. 국가·나이·사용 목적을 거짓으로 바꾸거나 타사의 앱 ID를 재사용하지 않습니다.

학교 조직 관리자의 과제 읽기 동의와 실제 기기 시험이 남아 있습니다. 실제 운영자의 계정 정보나 로그인 화면은 이 공개 문서에 포함하지 않습니다.

## 보관

`data/android-release.jks`, `data/android-signing.properties`, 서명 암호는 공개 저장소/릴리스에 올리지 않습니다. 서명 키를 잃으면 같은 패키지의 정상 업데이트를 제공할 수 없으므로 암호화해 별도 백업해야 합니다. 제공자 앱 등록에 필요한 인증서 지문만 공유합니다.

## 공식 문서

- [Android Google authorization](https://developer.android.com/identity/authorization)
- [Google Classroom API 인증](https://developers.google.com/workspace/classroom/guides/auth)
- [Microsoft 학교 과제 읽기 권한](https://learn.microsoft.com/en-us/graph/permissions-reference#eduassignmentsreadbasic)
- [Android 알람](https://developer.android.com/develop/background-work/services/alarms)
