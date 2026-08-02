---
title: 사용자 지정 API
description: 공식 할당량 대신 Breezell에서 직접 API 공급자를 구성하는 방법을 알아봅니다.
---

# 사용자 지정 API

Breezell의 공식 할당량을 사용하지 않거나 자신의 API 키를 사용하려는 경우 Breezell 설정 페이지에서 사용자 지정 API 공급자를 구성할 수 있습니다.

이를 통해 Breezell을 자신의 모델 공급자, 사용자 지정 게이트웨이, API 키 및 모델 이름에 연결할 수 있습니다.

## Breezell 설정 페이지 열기

시작하려면 편집기 오른쪽 상단 영역에서 설정 아이콘을 찾습니다.

설정 아이콘은 작은 톱니바퀴 모양이며 다른 도구 모음 아이콘 근처에 있습니다.

설정 아이콘을 클릭하여 설정 메뉴를 엽니다.

메뉴 상단에서 **Breezell Settings**를 클릭합니다.

**Breezell Settings**를 클릭하면 Breezell 설정 페이지가 열립니다.

![Breezell Settings가 선택된 Breezell 설정 메뉴](/custom-api/settings-menu.png)

## Models 페이지로 이동

Breezell 설정을 열면 일반적으로 기본적으로 **Models** 페이지로 이동합니다.

이 페이지가 표시되지 않으면 왼쪽 사이드바에서 **Models**를 클릭합니다.

**Models** 페이지에서 사용 가능한 모델, 공식 모델, 타사 공급자 및 사용자 지정 API 공급자를 관리할 수 있습니다.

이 페이지 상단에는 Claude, GPT, Gemini, Kimi 및 Grok 모델과 같이 활성화된 여러 모델이 표시됩니다.

모델 목록 아래에는 **Providers** 섹션이 표시됩니다.

![Providers 섹션이 있는 Breezell Models 페이지](/custom-api/models-page.png)

## 공급자 선택

Breezell은 다양한 모델 공급자를 지원합니다.

예를 들어 다음과 같은 공급자를 찾을 수 있습니다.

- OpenRouter
- Anthropic
- OpenAI
- OpenAI Codex
- Kimi Code
- GitHub Copilot
- DeepSeek
- Gemini
- Groq
- Mistral
- Qwen
- Google Vertex AI
- Microsoft Azure
- NVIDIA NIM
- Together AI
- Cohere
- Fireworks
- DeepInfra
- Cerebras
- Perplexity
- Moonshot AI
- ByteDance
- Hugging Face
- Baseten

공급자마다 구성 방법이 다를 수 있습니다.

예를 들어 **OpenAI Codex**를 사용하는 경우 공급자 목록에서 **OpenAI Codex**를 선택하고 ChatGPT 계정으로 직접 로그인할 수 있습니다.

로그인하면 Breezell이 공식 Codex 백엔드를 통해 Codex 요청을 라우팅할 수 있습니다. 이 옵션에는 별도의 API 키가 필요하지 않습니다.

![ChatGPT 계정 로그인과 Codex 사용량 세부 정보가 표시된 OpenAI Codex 공급자 페이지](/custom-api/openai-codex-provider.png)

## 사용자 지정 API에 OpenAI-Compatible 사용

타사 API 또는 자체 호스팅 API 게이트웨이를 사용하려면 **OpenAI-Compatible**을 선택합니다.

이것이 기본 사용자 지정 API 공급자입니다.

고정 공급자와 달리 **OpenAI-Compatible**에서는 자체 연결 정보를 수동으로 구성할 수 있습니다.

다음과 같은 정보를 설정할 수 있습니다.

- 공급자 별칭
- Base URL
- API key
- Protocol
- Endpoint preset
- Model name
- Custom headers

사용자 지정 게이트웨이, 타사 API 플랫폼, 프록시 서비스 또는 OpenAI 호환 모델 공급자에 적합합니다.

![Providers 섹션의 OpenAI-Compatible](/custom-api/providers-section.png)

## 사용자 지정 API 구성 패널 열기

**OpenAI-Compatible** 섹션에서 기본 슬롯을 찾습니다.

**OpenAI-Compatible 1**로 표시될 수 있습니다.

슬롯 영역을 클릭하거나 오른쪽의 **Manage slots**를 클릭할 수 있습니다.

![기본 슬롯과 Manage slots 작업이 표시된 OpenAI-Compatible 슬롯 항목](/custom-api/open-slot-entry.png)

그러면 사용자 지정 API 구성 패널이 열립니다.

이 패널에서 사용자 지정 API 공급자의 연결, 인증, 프로토콜, 엔드포인트 및 사용 가능한 모델을 구성할 수 있습니다.

![연결 및 모델 설정이 표시된 OpenAI-Compatible 공급자 구성 패널](/custom-api/custom-api-panel-current.png)

## 공급자 슬롯 관리

**OpenAI-Compatible Providers** 패널의 왼쪽 상단에 **Available** 선택기가 표시됩니다.

이 선택기에는 사용 가능한 사용자 지정 API 슬롯이 표시됩니다.

Breezell은 최대 **50개의 OpenAI-Compatible 공급자 슬롯**을 지원합니다. 각 슬롯은 독립적인 사용자 지정 API 채널로 구성할 수 있습니다.

예를 들어 서로 다른 공급자, 게이트웨이, API 키 또는 모델 그룹에 서로 다른 슬롯을 사용할 수 있습니다.

**Available** 선택기를 클릭하여 슬롯 목록을 엽니다.

![1부터 50까지의 사용자 지정 API 슬롯을 표시하는 Available 선택기](/custom-api/provider-slots-current.png)

**1**부터 **50**까지 번호가 지정된 슬롯이 표시됩니다.

현재 **Slot 1**을 구성 중이라면 **Slot 2**를 선택하여 다른 사용자 지정 API 채널을 구성할 수 있습니다.

다른 슬롯을 선택하면 구성 패널이 해당 슬롯으로 전환됩니다. 새 채널에 다른 공급자 이름, Base URL, API key, protocol, endpoint 및 모델 목록을 입력할 수 있습니다.

## 연결 구성

기본 구성 패널로 돌아갑니다.

**Connection** 섹션에서 이 사용자 지정 API 공급자의 기본 연결 정보를 구성할 수 있습니다.

![별칭, Base URL, API key, 프로토콜 및 모델이 표시된 사용자 지정 API 공급자의 Connection 섹션](/custom-api/configure-connection-current.png)

다음을 설정할 수 있습니다.

- Nickname
- Base URL
- API Key
- Protocol
- Endpoint preset
- Custom headers
- Model names

**Nickname**은 이 사용자 지정 공급자를 식별하는 데 사용됩니다. 공급자 이름, 게이트웨이 이름 또는 이 채널을 쉽게 알아볼 수 있는 레이블을 입력할 수 있습니다.

**Base URL**은 API 게이트웨이 주소입니다.

Base URL은 다음 중 하나로 시작해야 합니다.

```text
http://
```

또는:

```text
https://
```

예:

```text
https://api.example.com/v1
```

또는:

```text
http://127.0.0.1
```

Base URL이 `http://` 또는 `https://`로 시작하지 않으면 요청이 실패할 수 있습니다.

## 최종 요청 URL 확인

Base URL을 입력하고 엔드포인트 프리셋을 선택한 후 프로토콜 섹션 아래에 표시되는 **Request URL**을 확인합니다.

이 영역에는 Breezell이 사용할 최종 요청 주소가 표시됩니다.

예를 들어 Base URL이 다음과 같고:

```text
http://127.0.0.1
```

엔드포인트 프리셋이 **OpenAI Generic**이면 Breezell은 다음을 생성할 수 있습니다.

```text
http://127.0.0.1/v1/chat/completions
```

최종 Request URL이 올바른지 주의 깊게 확인해야 합니다.

공급자마다 게이트웨이 URL을 정의하는 방식이 다를 수 있으므로 중요합니다.

일부 공급자는 Base URL에 `/v1`을 포함해야 하지만 다른 공급자는 루트 도메인만 필요합니다.

예를 들어 한 공급자는 다음을 요구할 수 있습니다.

```text
https://api.example.com/v1
```

반면 다른 공급자는 다음을 요구할 수 있습니다.

```text
https://api.example.com
```

공급자가 표준이 아닌 게이트웨이 형식을 사용하면 자동 엔드포인트 완성이 올바르게 작동하지 않을 수 있습니다.

이로 인해 `/v1/chat/completions`와 같은 최종 요청 경로가 중복되거나 누락되거나 잘못 결합될 수 있습니다.

공급자를 저장하거나 사용하기 전에 항상 생성된 **Request URL**을 확인하고 공급자의 API 문서와 일치하는지 확인합니다.

![OpenAI-Compatible 공급자의 프로토콜 섹션 아래에 표시된 Request URL 미리 보기](/custom-api/request-url-current.png)

## 요청 프로토콜 선택

**Protocol** 섹션에서 공급자와 일치하는 요청 프로토콜을 선택합니다.

일반적인 옵션은 다음과 같습니다.

- OpenAI
- Responses
- Anthropic

대부분의 OpenAI 호환 타사 API에는 **OpenAI**를 선택합니다.

공급자가 OpenAI Responses API를 사용하는 경우 **Responses**를 선택합니다.

공급자 또는 게이트웨이가 Anthropic 호환 요청을 요구하는 경우 **Anthropic**을 선택합니다.

공급자가 요구하는 API 형식에 따라 프로토콜을 선택합니다. 프로토콜이 공급자와 일치하지 않으면 Base URL과 API 키가 정확해도 요청이 실패할 수 있습니다.

## 엔드포인트 프리셋 선택

프로토콜 선택은 모델을 올바르게 요청할 수 있는지를 결정하므로 매우 중요합니다.

공급자가 OpenAI API와 호환된다고 하더라도 실제 요청 경로는 공식 OpenAI API 사양과 다를 수 있습니다.

일부 공급자는 표준 엔드포인트 구조를 변경합니다. Breezell은 이러한 공급자별 변형을 여러 가지 적용했습니다.

엔드포인트 프리셋 드롭다운을 클릭하여 사용 가능한 프리셋을 확인합니다.

![공급자별 요청 경로 옵션을 표시하는 Endpoint preset 드롭다운](/custom-api/endpoint-preset-current.png)

다음과 같은 옵션이 표시될 수 있습니다.

- OpenAI Generic
- Zhipu GLM
- Volcengine Ark
- Volcengine Coding
- DashScope Qwen
- DeepSeek
- Images

각 프리셋은 서로 다른 요청 경로를 나타냅니다.

예를 들어 **OpenAI Generic**은 다음을 사용할 수 있습니다.

```text
/v1/chat/completions
```

다른 공급자는 다음과 같이 다른 엔드포인트 경로를 사용할 수 있습니다.

```text
/api/paas/v4/chat/completions
```

```text
/api/v3/chat/completions
```

```text
/compatible-mode/v1/chat/completions
```

```text
/chat/completions
```

공급자와 일치하는 엔드포인트 프리셋을 선택합니다.

어떤 프리셋을 사용해야 할지 확실하지 않다면 공급자의 API 문서를 확인하고 Breezell에 표시된 최종 **Request URL**과 비교합니다.

공급자가 Breezell에서 아직 적용하지 않은 형식을 사용하는 경우 해당 공급자 지원을 추가할 수 있도록 문의해 주세요.

## 사용자 지정 헤더 구성

**Custom Headers** 섹션은 선택 사항입니다.

공급자, 게이트웨이 또는 프록시 서비스에 추가 HTTP 헤더가 필요한 경우에만 이 섹션을 사용합니다.

사용자 지정 헤더는 현재 사용자 지정 API 슬롯을 통해 전송되는 모든 요청에 추가됩니다.

값은 유효한 JSON이어야 합니다.

![JSON 예시와 프리셋 바로 가기가 표시된 Custom Headers 필드](/custom-api/custom-headers-current.png)

예:

```json
{
  "X-Custom-Header": "value"
}
```

다음과 같은 공급자별 요구 사항에 사용자 지정 헤더를 사용할 수 있습니다.

- 특수 라우팅 헤더
- 조직 또는 프로젝트 헤더
- 프록시 인증 헤더
- 베타 기능 헤더
- 긴 컨텍스트 기능 헤더

공급자에게 사용자 지정 헤더가 필요하지 않다면 이 섹션을 비워 두거나 빈 JSON 객체로 유지할 수 있습니다.

```json
{}
```

JSON 형식이 올바른지 확인합니다.

키와 값 모두 큰따옴표를 사용합니다. 주석, 후행 쉼표 또는 작은따옴표를 사용하지 않습니다.

올바른 예:

```json
{
  "X-Provider-Mode": "compatible"
}
```

잘못된 예:

```json
{
  'X-Provider-Mode': 'compatible',
}
```

사용자 지정 헤더 필드 아래에 Breezell이 프리셋 바로 가기를 제공할 수 있습니다.

예를 들어 **Claude 1M** 프리셋은 Claude 1M 컨텍스트 지원에 필요한 헤더를 자동으로 입력할 수 있습니다.

공급자 문서에 특정 헤더가 필요하다면 이 섹션에 해당 헤더를 복사하고 요청을 보내기 전에 유효한 JSON인지 확인합니다.

## 사용 가능한 모델 가져오기 및 추가

연결 정보 구성을 완료한 후 패널 오른쪽의 **Fetch Available Models**를 클릭합니다.

Breezell은 공급자에 요청하여 사용 가능한 모델 목록을 로드합니다.

요청이 성공하면 사용 가능한 모델이 모델 선택 목록에 표시됩니다.

![선택 목록에 사용 가능한 모델이 로드된 Fetch Available Models 버튼](/custom-api/fetch-available-models-current.png)

공급자 설정이 올바른지 확인한 후 이 버튼을 클릭하여 자신의 모델을 가져오고 선택할 수 있습니다.

사용하려는 모델을 선택한 다음 **Add 1 Model**을 클릭합니다.

예를 들어 다음과 같은 모델을 선택할 수 있습니다.

```text
gpt-5.5
```

그런 다음 **Add 1 Model**을 클릭하여 현재 사용자 지정 API 공급자에 추가합니다.

이 단계에서 왼쪽 영역이 여전히 비어 있다면 Breezell을 다시 시작한 후 다시 시도합니다.

![사용 가능한 모델을 가져온 후에도 왼쪽 영역이 비어 있는 모습](/custom-api/fetch-results-empty.png)

공급자를 구성하고 모델 로드를 시도한 후 **Check All**을 사용하여 게이트웨이 연결이 정상인지 테스트할 수도 있습니다.

![공급자와 게이트웨이 상태를 테스트하는 Check All 버튼](/custom-api/check-gateway-health-button.png)

검사가 성공하면 연결 카드에 **Healthy**와 같은 상태가 표시될 수 있습니다. 구성을 변경한 후 **Recheck**를 사용하여 게이트웨이를 다시 테스트할 수도 있습니다.

![검사 성공 후 정상 게이트웨이 상태를 표시하는 연결 카드](/custom-api/check-gateway-health-result.png)

## 모델 수동 추가

모델을 수동으로 추가할 수도 있습니다.

모델 입력 필드에 API 공급자가 제공한 모델 이름을 입력합니다.

그런 다음 **Add**를 클릭합니다.

공급자가 모델 목록 엔드포인트를 제공하지 않거나 사용하려는 모델이 **Fetch Available Models**에 반환되지 않을 때 유용합니다.

모델 이름이 공급자가 요구하는 모델 ID와 정확히 같은지 확인합니다.

![Add 버튼이 있는 수동 모델 입력 필드](/custom-api/manual-model-add-current.png)

## 모델 활성화, 비활성화 또는 삭제

모델을 추가하면 **Models** 목록에 표시됩니다.

각 모델 항목을 개별적으로 관리할 수 있습니다.

모델 항목 오른쪽의 스위치를 사용하여 모델을 활성화하거나 비활성화할 수 있습니다.

모델이 활성화되면 Breezell이 요청에 사용할 수 있습니다.

모델이 비활성화되면 Breezell은 구성을 유지하지만 해당 모델을 사용하지 않습니다.

모델 항목 위에 마우스를 올리면 추가 작업이 표시됩니다.

삭제 버튼을 클릭하여 모델을 삭제할 수 있습니다.

현재 공급자에 해당 모델을 더 이상 표시하고 싶지 않을 때 사용합니다.

![활성화, 비활성화, 설정 및 삭제 컨트롤이 있는 모델 목록](/custom-api/model-management-current.png)

## 고급 모델 설정 열기

모델의 세부 동작을 구성하려면 모델 항목의 설정 버튼을 클릭합니다.

그러면 **Advanced Settings** 패널이 열립니다.

고급 설정은 선택 사항입니다. 공급자가 요구하는 모델 제한과 요청 형식을 이해하는 경우가 아니라면 대부분의 사용자는 변경할 필요가 없습니다.

## Advanced Settings

고급 설정 패널에서 모델 수준의 동작을 사용자 지정할 수 있습니다.

![사용자 지정 API 모델의 Advanced Settings 패널](/custom-api/advanced-settings-original.png)

### 사용자 지정 설정 활성화

**Enable custom settings** 스위치는 이 모델이 자체 고급 구성을 사용하는지 제어합니다.

이 스위치가 비활성화되면 Breezell은 모델에 대해 기본으로 인식된 설정을 사용합니다.

이 스위치가 활성화되면 고급 설정 패널의 값이 이 모델의 기본 동작을 재정의합니다.

### Context Window

**Context Window**는 모델이 지원하는 최대 컨텍스트 길이를 정의합니다.

일반적으로 대화 기록, 시스템 메시지, 사용자 메시지, 도구 결과 및 기타 컨텍스트를 포함하여 모델이 한 요청에서 처리할 수 있는 최대 토큰 수를 의미합니다.

예를 들어 다음 값은:

```text
400000
```

모델이 400k 컨텍스트 윈도우로 구성되었음을 의미합니다.

이 필드는 `k` 접미사의 자동 변환을 지원합니다.

예:

```text
128k
```

다음으로 변환됩니다.

```text
128000
```

모델 공급자가 제공한 값을 사용합니다. 모델이 실제로 지원하지 않는 경우 값을 너무 높게 설정하면 요청이 실패할 수 있습니다.

### Output Token Space

**Output Token Space**는 모델 응답을 위해 예약되는 최대 출력 토큰 공간을 정의합니다.

예를 들어 다음 값은:

```text
128000
```

모델이 출력에 최대 128k 토큰을 예약할 수 있음을 의미합니다.

이 설정도 `k` 접미사의 자동 변환을 지원합니다.

예:

```text
8k
```

다음으로 변환됩니다.

```text
8000
```

공급자의 실제 출력 제한에 맞는 값을 사용합니다.

### System Message

**System Message**는 Breezell이 모델에 시스템 수준 지침을 보내는 방식을 제어합니다.

일부 모델은 시스템 메시지에 표준 `system` 역할을 사용하기를 기대합니다.

다른 모델은 `developer` 역할과 같은 다른 역할 형식을 기대할 수 있습니다.

공급자에게 특정 시스템 메시지 형식이 필요한 경우 여기에서 일치하는 옵션을 선택합니다.

확실하지 않다면 기본 설정을 유지합니다.

### Tool Format

**Tool Format**은 도구를 설명하고 모델에 보내는 방식을 제어합니다.

OpenAI 호환 모델에는 **OpenAI Style**을 사용합니다.

공급자에게 다른 도구 호출 형식이 필요한 경우 공급자 문서와 일치하는 형식을 선택합니다.

도구 형식 설정이 잘못되면 도구 호출이 실패할 수 있습니다.

### Supports Thinking

**Supports Thinking**은 모델이 추론 또는 사고 모드를 지원하는지 나타냅니다.

모델 공급자가 이 기능을 지원하는 경우에만 활성화합니다.

### Can Disable Thinking

**Can Disable Thinking**은 Breezell이 이 모델의 사고 모드를 비활성화할 수 있는지 나타냅니다.

추론 모드와 비추론 모드를 모두 지원하는 모델에 유용합니다.

### Can Stream Reasoning

**Can Stream Reasoning**은 모델이 생성 중 추론 콘텐츠를 스트리밍할 수 있는지 나타냅니다.

공급자가 스트리밍 추론 출력을 지원하는 경우에만 활성화합니다.

공급자가 지원하지 않는 경우 이 옵션을 활성화하면 요청 오류나 불완전한 응답이 발생할 수 있습니다.

## 고급 설정 저장

고급 설정을 변경한 후 **Save**를 클릭합니다.

변경 사항을 적용하지 않으려면 **Cancel**을 클릭하거나 패널을 닫습니다.

모델에 올바른 값을 알고 있을 때만 고급 설정을 변경합니다. 컨텍스트 크기, 출력 토큰 제한, 메시지 형식, 도구 형식 또는 사고 설정이 잘못되면 모델이 잘못 작동하거나 응답하지 않을 수 있습니다.

## 사용자 지정 모델 선택

사용자 지정 모델을 추가하고 활성화한 후 채팅 인터페이스로 돌아갑니다.

입력 상자 근처의 모델 선택기를 클릭합니다.

모델 목록에서 기본 제공 Breezell 모델, Codex 모델 및 사용자 지정 OpenAI-Compatible 모델을 볼 수 있습니다.

사용자 지정 공급자는 자체 공급자 그룹 아래에 표시됩니다. 예를 들어 공급자 별칭이 **TEST**라면 해당 공급자에 추가한 모델은 **TEST** 그룹에 표시됩니다.

사용할 모델을 선택합니다.

여러 모델을 추가했다면 현재 작업에 맞는 모델을 선택합니다.

![기본 제공 모델과 TEST 사용자 지정 공급자 그룹을 표시하는 모델 선택기](/custom-api/select-custom-model-original.png)

## 컨텍스트 및 추론 옵션 조정

모델을 선택한 후 모델 옵션 패널을 열 수 있습니다.

이 패널에는 다음과 같은 옵션이 표시될 수 있습니다.

- Context size
- Reasoning mode
- Reasoning strength
- Fast mode

**Context** 옵션은 모델이 사용할 수 있는 대화 기록 또는 입력 컨텍스트의 양을 제어합니다.

**Reasoning** 옵션은 추론 모드의 활성화 여부를 제어합니다.

추론이 활성화된 경우 다음과 같이 추론 강도를 선택할 수 있습니다.

- Low
- Medium
- High
- Extra High

더 높은 추론 강도는 복잡한 코딩, 계획, 디버깅 또는 분석 작업에 유용할 수 있습니다.

더 낮은 추론 강도는 간단한 질문이나 빠른 응답에 적합할 수 있습니다.

모델이 **Fast** 모드를 지원하는 경우 활성화하여 빠른 응답 속도를 우선할 수 있습니다.

사용 가능한 옵션은 선택한 모델과 공급자에 따라 다를 수 있습니다.

![컨텍스트 및 추론 설정이 표시된 모델 옵션 패널](/custom-api/model-options-original.png)

## 대화 시작

모델을 선택하고 옵션을 조정한 후 입력 상자에 메시지를 입력합니다.

그런 다음 메시지를 보내 대화를 시작합니다.

예를 들어 다음을 입력할 수 있습니다.

```text
Hello
```

사용자 지정 API가 올바르게 구성되었다면 Breezell은 사용자 지정 공급자를 통해 요청을 보내고 채팅에 모델 응답을 반환합니다.

이제 사용자 지정 API 설정을 완료했습니다.

![사용자 지정 모델로 메시지를 보낸 후의 채팅 화면](/custom-api/start-conversation-original.png)
