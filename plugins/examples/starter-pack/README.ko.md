# Starter Pack

코드 리뷰와 테스트 스킬, 짧은 팀 규칙, 생각을 돕는 MCP 서버, 차분한 다크 테마. 코드가 필요 없습니다.

Breezell 플러그인 팩의 공식 예제입니다. 모든 내용은 `package.json` › `contributes.breezell`(과 `contributes.themes`)에 선언되며, 팩 자체는 아무 코드도 컴파일하거나 실행하지 않습니다. 소스: [`plugins/examples/starter-pack`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/starter-pack).

## 추가되는 것

| | 위치 | Breezell에서 보이는 모습 |
|---|---|---|
| 스킬 `code-review`, `write-tests` | `skills/<이름>/SKILL.md` | 스킬 목록에 팩 이름과 함께 표시되며, 작업에 맞으면 에이전트가 불러옵니다 |
| 팀 규칙 | `rules/house-rules.md` | 팩이 켜져 있는 동안 AI 지시에 추가 |
| MCP 서버 `sequential-thinking` | `contributes.breezell.mcpServers` | MCP 목록에 팩 이름과 함께 표시. `npx -y @modelcontextprotocol/server-sequential-thinking` 실행(Node.js 필요) |
| 테마 "Breezell Calm Dark" | `themes/calm-dark.json` | 색 테마 선택기에 표시 |

**Breezell Console › 플러그인 › 설치됨**에서 팩을 끄거나 제거하면 이 모두가 사라집니다. 같은 이름의 내 스킬이나 MCP 서버가 팩의 것보다 우선합니다.

## 직접 만들기

**Pack** 템플릿으로 시작한 뒤(Breezell Console › 플러그인 › 개발, 또는 `node breezell-plugin.mjs init my-pack --id me.my-pack --template pack`) `npm run package:open`을 실행하세요.
