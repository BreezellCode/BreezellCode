# Doc Writer

Breezell 채팅 모델로 문서 주석을 작성하고 코드를 설명합니다.

모델을 호출하는 Breezell 플러그인(`vscode.breezell.models.request`)의 공식 예제입니다. 소스: [`plugins/examples/doc-writer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/doc-writer).

## 사용법

코드를 선택하고 마우스 오른쪽 버튼을 누른 뒤:

- **Write Doc Comment**: 선택 영역 위에 해당 파일 언어의 주석 문법으로 문서 주석을 삽입합니다.
- **Explain Selection**: 코드 옆의 Markdown 문서에 설명을 실시간으로 표시합니다.

두 명령 모두 명령 팔레트의 "Doc Writer" 아래에도 있습니다. 설정 `docWriter.language`로 주석과 설명의 언어를 정합니다(기본값 영어).

## 권한과 비용

Doc Writer가 요청하는 권한은 `models.request` 하나입니다. 첫 요청 전에 Breezell이 먼저 묻고, **Breezell Console › 플러그인 › 설치됨**에서 언제든 취소할 수 있습니다. 요청은 현재 채팅 모델로 실행되며 내 채팅 요청과 똑같이 계산됩니다.

## 이 예제가 보여 주는 것

- `vscode.breezell` 확인(Breezell 밖에서는 undefined).
- 일반 요청(`writeDoc`)과 `onText`를 쓰는 스트리밍 요청(`explain`).
- 진행 알림의 취소 토큰으로 요청 취소.
- 오류 `name`별 처리: `BreezellNotSignedIn`, `BreezellPermissionDenied`, `BreezellNoModel`, `BreezellRateLimited`, `BreezellCancelled`.
- `"extensionKind": ["ui", "workspace"]`이므로 WSL과 SSH 창에서도 동작합니다.
