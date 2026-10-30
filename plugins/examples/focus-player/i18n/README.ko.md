# Focus Player

집중을 위한 환경음과 내 음악을 Breezell과 함께 재생합니다. AI가 한 턴을 마치면 알림음이 울립니다.

Breezell 패널 플러그인의 공식 예제입니다. 소스: [`plugins/examples/focus-player`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/focus-player).

## 기능

- **환경음**: 빗소리, 딥 포커스(브라운 노이즈와 낮은 드론), 부드러운 코드 패드. 모두 Web Audio로 실시간 합성하므로 플러그인에 오디오 파일이 없습니다.
- **내 음악**: 폴더(mp3, ogg, wav, flac, m4a, opus, webm)를 골라 순서대로 재생합니다.
- **Breezell과 함께**(권한 `chat.events`: 모드, 결과, 소요 시간만, 대화 내용은 없음):
  - 대화 턴이 끝나면 알림음이 울리고, 실패하거나 중지되면 다른 소리가 납니다.
  - 선택 사항: 에이전트가 작업하는 동안 재생하고 끝나면 일시 정지합니다.
  - 패널에 최근 활동을 표시합니다.

## 사용법

- Box 사이드바의 **플러그인**에서 열거나, Breezell Console › 플러그인에서 **열기**를 누릅니다.
- 상태 표시줄의 **▶ Focus**로 재생과 일시 정지를 합니다.
- 패널은 편집기 탭입니다. 끌어서 빼내거나 "Move Editor into New Window"를 실행하면 별도의 창이 됩니다.
- 설정: `focusPlayer.chimeWhenTurnFinishes`, `focusPlayer.playWhileAgentWorks`, `focusPlayer.musicFolder`.

다른 Breezell 플러그인과 마찬가지로 Breezell에 로그인한 동안에만 동작합니다.

## 개발

```bash
npm install
npm run typecheck
npm run package:open      # 오픈 소스 패키지
npm run package:closed    # 클로즈드 소스 패키지
```

이 폴더를 Breezell에서 열고 F5를 누르면 개발 창에서 실행됩니다.
