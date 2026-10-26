# 포함된 자료와 실행 파일

- 현재 앱 로고: 사용자가 제공한 주황색 체크 이미지입니다. 이미지에 소프트웨어 소스 라이선스를 임의로 부여하지 않습니다.
- 이전 버전 호환용 학교 로고 파일: [충북과학고등학교 공식 홈페이지](https://school.cbe.go.kr/cbs-h/), 원본 `https://school.cbe.go.kr/hosts/cbs-h/M01/logo.png`. 현재 기본 브랜드로 사용하지 않으며 학교 공식 운영 서비스임을 의미하지 않습니다. 로고는 소프트웨어 라이선스 적용 대상에서 제외됩니다.
- Node.js 24.22.1: Node.js 공식 실행 파일. 설치본의 `runtime/LICENSE-Node.txt`를 참고하세요.
- OpenAI Codex 0.164.0: [공식 공개 배포](https://github.com/openai/codex/releases/tag/rust-v0.164.0), Apache-2.0. 설치본의 `runtime/LICENSE-Codex.txt`를 참고하세요. OpenAI의 공식 제품으로 표시하거나 개인 자격 증명을 재배포하지 않습니다.
- ripgrep: Codex 배포에 포함되는 검색 도구. 설치본의 `runtime/LICENSE-ripgrep.txt`를 참고하세요.
- 설치 프로그램은 Inno Setup으로 작성되었습니다. 컴파일러 자체는 설치본에 포함되지 않습니다.
- Android: Google Play services Auth 22.0.0은 Google의 SDK 이용 조건을 따릅니다. AndroidX WorkManager 2.10.1 및 관련 AndroidX 라이브러리는 Apache-2.0입니다. Gradle wrapper 8.9는 Apache-2.0입니다. JUnit 및 Robolectric은 빌드 검사 전용이며 APK에 넣지 않습니다.

ChatGPT 로그인은 Codex app-server의 공식 로그인 흐름을 사용합니다. [인증 문서](https://learn.chatgpt.com/docs/auth), [연결 프로토콜](https://learn.chatgpt.com/docs/app-server). 사용자의 계정 이용 조건과 Codex 한도가 적용됩니다.
