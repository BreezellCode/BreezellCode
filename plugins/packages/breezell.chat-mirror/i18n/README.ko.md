# Chat Mirror

Breezell 대화를 별도 창에서: 대화를 골라 도구 호출과 불러온 메모리와 함께 읽고, 답장하고, 도구 호출을 승인하고, 채팅 모델을 바꿉니다.

대화를 읽고 대화에 참여하는 Breezell 플러그인의 공식 예제입니다. 소스: [`plugins/examples/chat-mirror`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/chat-mirror).

## 사용법

- Box 사이드바의 **플러그인**에서 열거나, Breezell Console › 플러그인에서 **열기**를 누릅니다.
- 왼쪽에 이 작업 영역의 대화가 최신순으로 표시됩니다. 진행 중인 대화에는 점이 붙습니다(노란색: 승인 대기).
- 대화를 고르면 읽을 수 있습니다: 내 메시지와 이를 위해 불러온 메모리, 답변과 추론, 그리고 각 도구 호출의 매개변수와 결과. 작성 중인 답변은 아래에 실시간으로 표시됩니다.
- 메시지를 쓰고 **Send**(Ctrl+Enter)로 답장하거나, **New conversation**으로 새 대화를 시작합니다. AI는 Breezell에서 직접 입력한 것처럼 답합니다.
- 도구 호출이 승인을 기다리면 여기서 **Approve**(승인) 또는 **Reject**(거부)할 수 있습니다.
- **Open in Breezell**은 Breezell 채팅에서 그 대화를 보여 줍니다.
- **Send** 옆의 **Model**로 Breezell 채팅 모델을 바꿉니다. Breezell 채팅의 모델 선택과 같은 설정이라 어느 쪽에서 바꿔도 다른 쪽에 반영됩니다(이 창은 포커스를 받을 때 갱신).

창 자체의 화면은 영어입니다.

## 권한

| 권한 | 용도 |
|---|---|
| `chat.read` | 대화 목록, 대화와 그 변화, Open in Breezell |
| `chat.send` | Send와 New conversation |
| `chat.approve` | Approve와 Reject |
| `models.select` | Model(모델 목록과 전환) |

Chat Mirror가 각 `chat.*` 권한을 처음 사용할 때 Breezell이 먼저 묻습니다. `models.select`는 위험이 없어 묻지 않으며, 끄지 않는 한 켜져 있습니다. 하나를 거부하면 Chat Mirror는 할 수 없는 일을 알려 주고 나머지는 그대로 동작합니다. Breezell Console › 플러그인 › 설치됨 › Chat Mirror에서 각각 또는 한꺼번에 켜고 끌 수 있습니다. 보낸 메시지는 내 메시지와 같은 방식으로 요금이 부과됩니다.

## 만든 방법

- `window/`는 페이지입니다. 표시만 담당하며, 모든 텍스트를 HTML이 아닌 `textContent`로 표시합니다: 메시지에는 무엇이든 들어 있을 수 있기 때문입니다.
- `src/extension.ts`는 창을 열고, 창과 `vscode.breezell.chat`(`listConversations`, `getConversation`, `onDidChangeConversation`, `send`, `approve`/`reject`, `show`) 사이를 중계합니다.
- Model은 `vscode.breezell.models`를 사용합니다. 창이 열리거나 포커스를 받을 때 `list`, 바꿀 때 `select`.
- 답변이 작성되는 동안 변화가 전달됩니다(많아야 1초에 몇 번). 한 단계가 끝나면 플러그인이 대화를 다시 읽습니다.
- 거부된 권한의 호출은 `BreezellPermissionDenied`로 실패하며, 페이지가 이를 문장으로 바꿔 보여 줍니다.
