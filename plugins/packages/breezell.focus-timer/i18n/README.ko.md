# Focus Timer

자체 창에서 동작하는 뽀모도로 타이머로, 편집기를 열지 않고 바로 가기에서도 바로 열 수 있습니다.

Breezell 창 플러그인의 공식 예제입니다. 소스: [`plugins/examples/focus-timer`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-timer).

## 사용법

- Box 사이드바의 **플러그인**에서 열거나, Breezell Console › 플러그인에서 **열기**를 누르거나, 상태 표시줄의 **⌚ Timer**를 클릭합니다. 타이머가 도는 동안 상태 표시줄에 남은 시간이 표시됩니다.
- 편집기 없이: Breezell Console › 플러그인 › 설치됨에서 **시작 메뉴에 추가**(Windows), **애플리케이션 메뉴에 추가**(Linux) 또는 **응용 프로그램에 추가**(macOS)를 누르면 이 창만 여는 바로 가기가 추가됩니다. 다른 플러그인처럼 Breezell 로그인이 필요하며, 로그인하지 않았다면 평소처럼 Breezell이 열립니다.

집중과 휴식 시간, 단계가 끝날 때의 소리, 오늘의 세션 수는 창 자체 저장소에 보관됩니다. Breezell이 창을 연 경우에는 AI의 대화 턴도 창에 표시됩니다(권한 `chat.events`).

## 만든 방법

- `package.json` › `contributes.breezell.windows`에서 창을 선언합니다: 페이지, 크기, 단독으로 열 수 있게 하는 `"requiresEditor": false`. `contributes.breezell.launcher`로 플러그인 페이지와 사이드바에서 열 수 있습니다.
- `window/`가 페이지입니다. `/__breezell/api.js`를 불러와 `window.breezell`(`postMessage`, `onMessage`, `connected`)을 씁니다. 창은 샌드박스에서 실행되며 Node도 네트워크도 없고 플러그인 자신의 파일만 읽습니다.
- `src/extension.ts`는 `vscode.breezell.windows.open('timer')`로 창을 열고 대화 턴을 전달합니다.
- `"extensionKind": ["ui", "workspace"]`: 창을 열려면 플러그인이 이 컴퓨터에 있어야 합니다.
