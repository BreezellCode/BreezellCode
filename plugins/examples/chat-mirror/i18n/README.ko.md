# Chat Mirror

Breezell 대화를 별도 창에서: 대화를 골라 도구 호출과 불러온 메모리와 함께 읽고, 답장하고, 도구 호출을 승인하고, 채팅 모델을 바꿉니다.

대화를 읽고 대화에 참여하는 Breezell 플러그인의 공식 예제입니다. 소스: [`plugins/examples/chat-mirror`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/chat-mirror).

## 사용법

- Box 사이드바의 **플러그인**에서 열거나, Breezell Console › 플러그인에서 **열기**를 누릅니다.
- 왼쪽에 이 작업 영역의 대화가 최신순으로 표시됩니다. 진행 중인 대화에는 점이 붙습니다(노란색: 승인 대기).
- 대화를 고르면 읽을 수 있습니다: 내 메시지와 이에 사용된 메모리(Breezell 채팅처럼 상주와 관련으로 나눠 셉니다), 답변과 추론, 그리고 각 도구 호출의 매개변수와 결과.
- Breezell이 답변을 만드는 동안 마지막 말풍선에 지금 하는 일(생각 중, 도구 실행 중, 승인 대기)과 경과 시간, 추론, 작성 중인 글이 표시됩니다.
- 메시지를 쓰고 **Send**(Ctrl+Enter)로 답장하거나, **New conversation**으로 새 대화를 시작합니다. AI는 Breezell에서 직접 입력한 것처럼 답합니다.
- 도구 호출이 승인을 기다리면 여기서 **Approve**(승인) 또는 **Reject**(거부)할 수 있습니다.
- **Open in Breezell**은 Breezell 채팅에서 그 대화를 보여 줍니다.
- **Send** 옆의 **Model**로 Breezell 채팅 모델을 바꿉니다. Breezell 채팅의 모델 선택과 같은 설정이라 어느 쪽에서 바꿔도 다른 쪽에 반영됩니다(이 창은 포커스를 받을 때 갱신).
- 대화 목록 아래의 **Pinned notes**(고정한 메모): Breezell의 Agent가 Chat Mirror의 `pin_note` 도구로 고정한 메모로, 최신 메모가 맨 위에 있습니다. **Unpin**으로 고정을 해제합니다.
- 플러그인의 도구 호출에는 플러그인 이름과 **Plugin tool** 표시가 붙습니다(Chat Mirror의 `pin_note`도 마찬가지). MCP 도구에는 서버 이름이 붙습니다.

창 자체의 화면은 영어입니다.

## Agent 도구

Chat Mirror는 Breezell의 Agent에 자체 도구 두 개를 제공합니다(`agent.tools`, "Agent 도구 등록"). 각 도구는 쓸 수 있는 모드를 지정하며, 다른 모드에서는 Agent가 그 도구를 보지도 호출하지도 못합니다.

| 도구 | 모드 | 하는 일 |
|---|---|---|
| `pin_note` | 채팅, 에이전트, 얽힘 | 이 창에 메모(제목과 내용)를 고정 |
| `list_notes` | 채팅, 에이전트, 얽힘, 분석, 팀 | 고정한 메모를 최신순으로 다시 읽기 |

채팅 모드에서 해 보세요: "Chat Mirror에 메모 고정해 줘: 월요일에 1.4.42 출시". 메모는 플러그인 데이터와 함께 이 컴퓨터에 저장되며, 창을 닫아도 남아 있습니다. 호출은 다른 MCP 도구처럼 **MCP 도구 자동 승인** 설정을 따릅니다.

## 권한

| 권한 | 용도 |
|---|---|
| `chat.read` | 대화 목록, 대화와 그 변화, Open in Breezell |
| `chat.send` | Send와 New conversation |
| `chat.approve` | Approve와 Reject |
| `models.select` | Model(모델 목록과 전환) |
| `agent.tools` | Agent용 `pin_note`와 `list_notes` 도구 |

Chat Mirror가 각 `chat.*` 권한을 처음 사용할 때 Breezell이 먼저 묻습니다. `models.select`는 위험이 없어 묻지 않으며, 끄지 않는 한 켜져 있습니다. 하나를 거부하면 Chat Mirror는 할 수 없는 일을 알려 주고 나머지는 그대로 동작합니다. Breezell Console › 플러그인 › 설치됨 › Chat Mirror에서 각각 또는 한꺼번에 켜고 끌 수 있습니다. 보낸 메시지는 내 메시지와 같은 방식으로 요금이 부과됩니다.

`agent.tools`는 한 번만 묻습니다: Chat Mirror가 처음 시작될 때입니다. 거부하면 이 권한을 켤 때까지 두 도구는 꺼진 채로 있고, 창은 그대로 쓸 수 있습니다.

## 만든 방법

- `window/`는 페이지입니다. 표시만 담당하며, 모든 텍스트를 HTML이 아닌 `textContent`로 표시합니다: 메시지에는 무엇이든 들어 있을 수 있기 때문입니다.
- `src/extension.ts`는 창을 열고, 창과 `vscode.breezell.chat`(`listConversations`, `getConversation`, `onDidChangeConversation`, `send`, `approve`/`reject`, `show`) 사이를 중계합니다.
- Model은 `vscode.breezell.models`를 사용합니다. 창이 열리거나 포커스를 받을 때 `list`, 바꿀 때 `select`.
- 답변이 작성되는 동안 변화가 전달됩니다(많아야 1초에 몇 번). Breezell이 하는 일(생각, 작성, 도구 호출, 완료)이 바뀔 때마다 플러그인이 대화를 다시 읽습니다. 메모리는 각 메시지의 `recalledMemories`와 `memoryUse`에서 가져옵니다.
- 거부된 권한의 호출은 `BreezellPermissionDenied`로 실패하며, 페이지가 이를 문장으로 바꿔 보여 줍니다.
- 도구는 `package.json`에 선언하고(`contributes.breezell.tools`: 이름, 설명, `inputSchema`, `modes`) `src/extension.ts`에서 `vscode.breezell.tools.register`로 실행합니다. 시작할 때(`onStartupFinished`) 등록되므로 창을 열기 전부터 Agent가 쓸 수 있습니다.
- `chat.read`로 읽은 대화에서 플러그인의 도구 호출에는 `plugin`(`{ id, name }`)이 붙습니다. 페이지는 `plugin:<id>` 서버 대신 그 이름을 보여 줍니다.
