# 충곽 뭐해

무료 학교용 과제·학습자료 관리 프로그램입니다. Windows에서는 일정 관리와 **AI 개발실**을 사용하고, Android에서는 **본인의 Teams·Classroom 계정 연결, 과제 확인, 마감 알림**에 집중합니다. 사용자 제공 주황색 체크 로고를 사용하며 학교 공식 운영 서비스는 아닙니다.

## Windows

`충곽 뭐해 실행.cmd`를 열면 백그라운드 프로그램과 일정표가 열립니다. 화면을 닫아도 프로그램은 유지되며 `충곽 뭐해 종료.cmd`로 종료합니다. 각 사용자 프로필의 일정, 서비스 연결, ChatGPT 로그인을 분리합니다.

**AI 개발실**에서 자신의 ChatGPT 계정으로 로그인하고 필요한 기능을 설명하면 실제 코드 변경안을 만들 수 있습니다. 내용을 검토한 후 로컬 운영자가 적용합니다. 다른 사용자의 ChatGPT 인증 정보는 사용하지 않습니다. **내 설정**에서는 프로필과 데이터 내보내기를 관리합니다. 사용자 화면에는 API 관리 기능이 없습니다.

기존 소유자의 학교 일정은 Notion/브라우저 자동 갱신 브리지와 연결되어 있습니다. 이 연결은 해당 소유자 프로필 전용이며 다른 사용자에게 복사되지 않습니다. Windows용 Google·Microsoft 공개 앱 식별자는 등록되어 있습니다. Teams 과제 권한은 학교 관리자의 동의가 필요합니다.

기존 배포본은 [GitHub Releases](https://github.com/secomes/chunggwak-pt/releases)에 있습니다. `v1.1.0`은 이전 이름의 Windows 버전입니다. 이 브랜치의 `2.0.0`은 Android의 실제 학교 연동을 검증하기 전까지 완성 출시본으로 표시하지 않습니다.

## Android

Android 앱은 자체 저장소, 주기적 동기화, 폰 알림을 사용합니다. Windows 프로그램이나 별도 서버에 연결할 필요가 없습니다. AI 채팅·개발실은 포함하지 않습니다.

- 사용자는 본인의 학교 이메일을 입력하고 Google·Microsoft 공식 화면에서 로그인합니다.
- 과제명, 원문, 한 문장 요약, 첨부파일 이름·링크, 기한, 원본 제출 상태를 확인합니다.
- 제출 완료·지난 기한은 진행 목록에서 숨기고 별도 보관합니다. 마감 없는 Classroom 항목은 학습자료로 분류합니다.
- 일주일 전·하루 전·당일 알림을 각각 설정하고 제출이 확인되면 알림을 취소합니다.
- 알림 직전에 제출 상태를 다시 확인하며, 오프라인일 때에는 저장된 상태라는 안내를 표시합니다.
- 계정 정보와 일정은 각자의 기기에 보관합니다. 배포자의 계정·토큰·일정이 APK에 포함되지 않습니다.

Google/Microsoft 앱 등록은 완료됐습니다. OAuth 로그인 시험에서 Google 앱 검토 요청과 학교 Teams 교육 과제 권한의 관리자 동의 요구가 확인됐습니다. [Android 구성](android/README.md)과 [배포 등록 상태](docs/ANDROID-PUBLISHING.md)를 참고하세요. 일반 사용자는 개발 콘솔을 설정하지 않습니다.

## 개발 및 검사

Windows 서비스는 Node.js 24 이상을 사용합니다.

```powershell
node --test tests/core.test.mjs tests/api.test.mjs tests/ai.test.mjs
node --check public/app.js
node --check android/app/src/main/assets/mobile.js
```

Android는 JDK 21, SDK 35를 사용합니다. `scripts/Build-Android.ps1`은 저장·알림 검사, Android Lint, 서명 APK 생성을 실행합니다. `scripts/Build-Installer.ps1`은 Windows 설치 파일을 만듭니다. 설치 산출물은 Git 추적에서 제외된 `dist/`에 생성됩니다. Android 검사에 사용하는 합성 과제는 실제 학교 데이터가 아닙니다.

## 운영

개인 일정, 토큰, 서명 키, 로그인 정보는 `data/`와 `.env`에 보관하며 Git 및 설치 파일에 포함하지 않습니다. 기존 Windows 설치의 데이터 경로와 설치 ID는 이름 변경 후에도 유지해 업데이트 시 개인 정보를 보존합니다. 학교 조직의 관리자 승인이나 제공자의 앱 검증을 우회하지 않습니다.

- [Windows 설치·운영](docs/OPERATIONS.md)
- [AI 개발실](docs/AI-QUICKSTART.md)
- [서비스 연결](docs/CONNECTIONS.md)
- [서비스 어댑터 개발](docs/EXTENSIONS.md)
