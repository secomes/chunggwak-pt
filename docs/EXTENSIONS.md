# 서비스 호환성 인터페이스

## 1. 코드를 추가하지 않는 JSON 연결

서비스 추가 → 나만의 JSON 서비스에서 공개 HTTPS 주소, 배열 경로, 필요한 경우 API 토큰을 지정합니다. 기본 필드는 `id,title,course,courseId,description,summary,dueAt,status,kind,url,attachments`입니다.

```json
{"externalId":"assignment_id","title":"name","dueAt":"deadline","summary":"instruction"}
```

위처럼 필드 매핑을 입력하면 외부 시스템의 형식도 공통 일정이 됩니다. `status`는 `assigned`, `submitted`, `unknown`, `kind`는 `task`, `material`, `notice`를 씁니다. 날짜는 시간대가 있는 ISO 문자열 또는 `YYYY-MM-DD`를 사용합니다. 날짜만 있으면 한국 시간 해당 날짜의 끝까지 유효합니다. `externalId`는 반드시 안정적인 원본 ID여야 하며 제목은 식별자로 사용하지 않습니다.

## 2. 외부 프로그램에서 보내기

수신 API 연결을 만들고 표시되는 URL에 `Authorization: Bearer 전용수신키`와 JSON `{ "items": [...] }`를 POST합니다. 연결 소유자는 서버에서 결정하며 본문의 user_id는 쓰지 않습니다. 한 요청 최대 2,000건, 약 2MB이고 전체 입력을 검증한 후 한 번에 저장합니다. 같은 원본 ID·수업·서비스는 갱신합니다. 비어 있는 응답으로 기존 항목을 지우지 않습니다.

## 3. 새 서버 어댑터

검토한 어댑터만 `src/extensions.mjs`의 `extensions`에 등록하고 서버를 재시작합니다. manifest는 ‘서비스 추가’ 카드와 입력 필드를 만들고, pull은 사용자별 연결 설정을 받아 공통 일정 배열을 반환합니다.

```javascript
import { publicJson } from './network.mjs';
export const extensions = [{
  id: 'my-school',
  manifest: {
    name: '우리 학교 공지', icon: 'S', color: 'blue',
    description: '학교의 일정 JSON을 가져옵니다.',
    fields: [
      { key: 'feed', label: '일정 주소', required: true },
      { key: 'apiToken', label: 'API 토큰', secret: true }
    ]
  },
  async pull(connection, { store }) {
    const config = JSON.parse(connection.config);
    const secret = store.secretFor(connection);
    const result = await publicJson(config.feed, {
      headers: secret.apiToken ? { Authorization: `Bearer ${secret.apiToken}` } : {}
    });
    return result.items.map(item => ({
      externalId: item.id, title: item.title, dueAt: item.dueAt,
      courseId: item.courseId, course: item.course, status: 'unknown',
      description: item.description, attachments: item.attachments
    }));
  }
}];
```

새 어댑터는 다른 사용자 조회를 수행하지 말고 해당 connection과 주어진 자료만 사용하세요. 비밀 필드는 secret에 암호화되고 설정 API에서는 반환되지 않습니다. 플러그인은 서버 코드 권한으로 동작하므로 운영자가 검토해야 합니다. 웹의 일반 사용자는 임의 서버 코드를 설치할 수 없습니다. 외부 URL은 `publicJson`을 사용해 내부망 접근·리다이렉션·DNS 재결합을 차단하세요.

핵심 인터페이스: `normalizeTask`, `stableKey`, `createRegistry`, `createScheduler`. 인증된 사용자 범위, 원본 ID 기반 식별, 개인 메모 보존, 오류 시 기존 데이터 보존을 유지해야 합니다.
