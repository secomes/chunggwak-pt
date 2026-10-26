# 배포용 Android 앱 식별 정보

학교의 앱 등록 담당자에게 전달할 수 있는 **공개 정보**입니다. 사용자 로그인 정보나 서명 비밀 키가 아닙니다.

| 항목 | 값 |
| --- | --- |
| 앱 이름 | 충곽 뭐해 |
| Android 패키지 | `kr.cbsh.mohae` |
| 버전 | `2.0.0` / versionCode `20000` |
| 최소 Android | 8.0 / API 26 |
| 서명 인증서 SHA-1 | `9A:8D:2B:2A:D6:54:9B:D8:5C:7B:B5:60:C1:23:97:5F:25:32:6A:F7` |
| 서명 인증서 SHA-256 | `48A95D6A7754E5C141B37741F5BF0241F738E75A03299CDB7B5E5FEA88940846` |
| Microsoft 반환 URI | `kr.cbsh.mohae://oauth/teams` |

Google Android 클라이언트는 위 패키지와 SHA-1을 사용합니다. 서명을 바꾸거나 Play App Signing을 적용하면 실제 배포 인증서를 별도로 등록해야 합니다. Microsoft는 native public-client 방식으로 등록하고 공개 client ID만 앱에 넣습니다. client secret을 만들거나 APK에 넣지 않습니다.

읽을 데이터: 본인의 수업·과제·마감·제출 상태·학습자료·첨부자료 이름 및 링크. 제출·성적·댓글을 변경하지 않습니다. 기기에서 직접 수집하고 기기에 보관하며, 개발자의 서버로 전송하지 않습니다.

배포자의 등록과 학교 승인 이후 사용자마다 자신의 계정으로 로그인합니다. 자세한 절차는 [배포 준비](ANDROID-PUBLISHING.md)를 참고하세요.
