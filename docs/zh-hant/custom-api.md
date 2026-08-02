---
title: 自訂 API
description: 了解如何在 Breezell 中設定自己的 API 提供者，而不是使用官方額度。
---

# 自訂 API

如果你不想使用 Breezell 的官方額度，或想使用自己的 API 金鑰，可以在 Breezell 設定頁面中設定自訂 API 提供者。

這樣，你就可以將 Breezell 連線到自己的模型提供者、自訂閘道、API 金鑰和模型名稱。

## 開啟 Breezell 設定頁面

首先，在編輯器右上方區域找到設定圖示。

設定圖示看起來像一個小齒輪，位於其他工具列圖示附近。

點選設定圖示，開啟設定選單。

在選單頂部，點選 **Breezell Settings**。

點選 **Breezell Settings** 後，Breezell 設定頁面就會開啟。

![Breezell 設定選單中選取的 Breezell Settings](/custom-api/settings-menu.png)

## 前往 Models 頁面

開啟 Breezell 設定後，通常會預設進入 **Models** 頁面。

如果目前不在此頁面，請查看左側側欄並點選 **Models**。

**Models** 頁面可用來管理可用模型、官方模型、第三方提供者和自訂 API 提供者。

在頁面頂部，你會看到多個已啟用的模型，例如 Claude、GPT、Gemini、Kimi 和 Grok 模型。

在模型清單下方，你會看到 **Providers** 區域。

![Breezell Models 頁面中的 Providers 區域](/custom-api/models-page.png)

## 選擇提供者

Breezell 支援多種不同的模型提供者。

例如，你可以找到以下提供者：

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

每個提供者可能有不同的設定方式。

例如，如果你使用 **OpenAI Codex**，可以在提供者清單中選擇 **OpenAI Codex**，然後直接使用 ChatGPT 帳戶登入。

登入後，Breezell 可以透過官方 Codex 後端轉送 Codex 請求。此選項不需要額外的 API 金鑰。

![OpenAI Codex 提供者頁面中的 ChatGPT 帳戶登入和 Codex 用量詳細資料](/custom-api/openai-codex-provider.png)

## 使用 OpenAI-Compatible 設定自訂 API

如果你想使用第三方 API 或自託管 API 閘道，請選擇 **OpenAI-Compatible**。

這是預設的自訂 API 提供者。

與固定提供者不同，**OpenAI-Compatible** 允許你手動設定自己的連線資訊。

你可以設定以下資訊：

- 提供者暱稱
- Base URL
- API key
- Protocol
- Endpoint preset
- Model name
- Custom headers

這適用於自訂閘道、第三方 API 平台、Proxy 服務或相容 OpenAI 的模型提供者。

![Providers 區域中的 OpenAI-Compatible](/custom-api/providers-section.png)

## 開啟自訂 API 設定面板

在 **OpenAI-Compatible** 區域中，找到預設插槽。

它可能顯示為 **OpenAI-Compatible 1**。

你可以點選插槽區域，或點選右側的 **Manage slots**。

![包含預設插槽和 Manage slots 操作的 OpenAI-Compatible 插槽項目](/custom-api/open-slot-entry.png)

這會開啟自訂 API 設定面板。

在此面板中，你可以為自訂 API 提供者設定連線、驗證、通訊協定、端點和可用模型。

![包含連線和模型設定的 OpenAI-Compatible 提供者設定面板](/custom-api/custom-api-panel-current.png)

## 管理提供者插槽

在 **OpenAI-Compatible Providers** 面板的左上角，你會看到 **Available** 選取器。

此選取器會顯示可用的自訂 API 插槽。

Breezell 最多支援 **50 個 OpenAI-Compatible 提供者插槽**。每個插槽都可以設定為獨立的自訂 API 通道。

例如，你可以為不同的提供者、閘道、API 金鑰或模型群組使用不同的插槽。

點選 **Available** 選取器，開啟插槽清單。

![顯示 1 到 50 個自訂 API 插槽的 Available 選取器](/custom-api/provider-slots-current.png)

你會看到編號從 **1** 到 **50** 的插槽。

如果目前正在設定 **Slot 1**，可以選擇 **Slot 2** 來設定另一個自訂 API 通道。

選擇其他插槽後，設定面板會切換到該插槽。接著，你可以為新通道輸入不同的提供者名稱、Base URL、API key、Protocol、Endpoint 和模型清單。

## 設定連線

返回主設定面板。

在 **Connection** 區域中，你可以設定此自訂 API 提供者的基本連線資訊。

![包含暱稱、Base URL、API key、Protocol 和模型的自訂 API 提供者 Connection 區域](/custom-api/configure-connection-current.png)

你可以設定：

- Nickname
- Base URL
- API Key
- Protocol
- Endpoint preset
- Custom headers
- Model names

**Nickname** 用於識別此自訂提供者。你可以輸入提供者名稱、閘道名稱或任何便於識別此通道的標籤。

**Base URL** 是 API 閘道位址。

Base URL 必須以下列其中一項開頭：

```text
http://
```

或：

```text
https://
```

例如：

```text
https://api.example.com/v1
```

或：

```text
http://127.0.0.1
```

如果 Base URL 不是以 `http://` 或 `https://` 開頭，請求可能會失敗。

## 檢查最終請求 URL

輸入 Base URL 並選擇端點預設值後，請檢查 Protocol 區域下方顯示的 **Request URL**。

這裡會顯示 Breezell 實際使用的最終請求位址。

例如，如果 Base URL 是：

```text
http://127.0.0.1
```

而端點預設值是 **OpenAI Generic**，Breezell 可能會產生：

```text
http://127.0.0.1/v1/chat/completions
```

你應仔細確認最終的 Request URL 是否正確。

這一點很重要，因為不同提供者可能以不同方式定義閘道 URL。

有些提供者要求 Base URL 包含 `/v1`，而另一些提供者只要求根網域。

例如，一個提供者可能要求：

```text
https://api.example.com/v1
```

而另一個提供者可能要求：

```text
https://api.example.com
```

如果提供者使用非標準閘道格式，自動補全端點可能無法正確運作。

這可能導致最終請求路徑（例如 `/v1/chat/completions`）重複、遺失或組合錯誤。

在儲存或使用提供者之前，請務必檢查產生的 **Request URL**，確保它與提供者的 API 文件一致。

![OpenAI-Compatible 提供者 Protocol 區域下方的 Request URL 預覽](/custom-api/request-url-current.png)

## 選擇請求通訊協定

在 **Protocol** 區域中，選擇與你的提供者相符的請求通訊協定。

常見選項包括：

- OpenAI
- Responses
- Anthropic

對於大多數相容 OpenAI 的第三方 API，請選擇 **OpenAI**。

如果你的提供者使用 OpenAI Responses API，請選擇 **Responses**。

如果你的提供者或閘道需要相容 Anthropic 的請求，請選擇 **Anthropic**。

請根據提供者要求的 API 格式選擇通訊協定。如果通訊協定與提供者不相符，即使 Base URL 和 API key 正確，請求也可能失敗。

## 選擇端點預設值

通訊協定選擇非常重要，因為它決定模型能否被正確請求。

即使提供者表示相容 OpenAI API，實際請求路徑也可能不同於官方 OpenAI API 規範。

有些提供者會修改標準端點結構。Breezell 已適配其中許多提供者特有的變體。

點選端點預設值下拉選單，查看可用預設值。

![顯示提供者特定請求路徑選項的 Endpoint preset 下拉選單](/custom-api/endpoint-preset-current.png)

你可能會看到以下選項：

- OpenAI Generic
- Zhipu GLM
- Volcengine Ark
- Volcengine Coding
- DashScope Qwen
- DeepSeek
- Images

每個預設值代表不同的請求路徑。

例如，**OpenAI Generic** 可能使用：

```text
/v1/chat/completions
```

其他提供者可能使用不同的端點路徑，例如：

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

請選擇與你的提供者相符的端點預設值。

如果不確定應使用哪個預設值，請查看提供者的 API 文件，並將其與 Breezell 中顯示的最終 **Request URL** 進行比較。

如果你的提供者使用 Breezell 尚未適配的格式，請聯絡我們，以便我們新增對該提供者的支援。

## 設定自訂標頭

**Custom Headers** 區域是選用的。

只有當你的提供者、閘道或 Proxy 服務需要額外的 HTTP 標頭時，才使用此區域。

自訂標頭會附加到透過目前自訂 API 插槽傳送的每個請求中。

該值必須是有效的 JSON。

![包含 JSON 範例和預設快捷方式的 Custom Headers 欄位](/custom-api/custom-headers-current.png)

例如：

```json
{
  "X-Custom-Header": "value"
}
```

你可以使用自訂標頭來滿足提供者特定的要求，例如：

- 特殊路由標頭
- 組織或專案標頭
- Proxy 驗證標頭
- Beta 功能標頭
- 長內容標頭

如果你的提供者不需要自訂標頭，可以將此區域留空，或保留為空的 JSON 物件。

```json
{}
```

請確保 JSON 格式有效。

鍵和值都必須使用雙引號。不要使用註解、尾隨逗號或單引號。

正確範例：

```json
{
  "X-Provider-Mode": "compatible"
}
```

錯誤範例：

```json
{
  'X-Provider-Mode': 'compatible',
}
```

在自訂標頭欄位下方，Breezell 可能會提供預設快捷方式。

例如，**Claude 1M** 預設值可以自動填入啟用 Claude 1M 內容支援所需的標頭。

如果提供者文件要求特定標頭，請將該標頭複製到此區域，並在傳送請求前確認它是有效的 JSON。

## 取得並新增可用模型

完成連線資訊設定後，點選面板右側的 **Fetch Available Models**。

Breezell 會嘗試請求提供者並載入可用模型清單。

如果請求成功，可用模型會出現在模型選取清單中。

![Fetch Available Models 按鈕及已載入選取清單的可用模型](/custom-api/fetch-available-models-current.png)

確認提供者設定正確後，可以點選此按鈕取得並選擇自己的模型。

接著選擇想要使用的模型，並點選 **Add 1 Model**。

例如，你可以選擇以下模型：

```text
gpt-5.5
```

然後點選 **Add 1 Model**，將它新增至目前的自訂 API 提供者。

如果此時左側區域仍然是空的，請重新啟動 Breezell 後再試一次。

![取得可用模型後左側區域仍為空白](/custom-api/fetch-results-empty.png)

設定提供者並嘗試載入模型後，你也可以使用 **Check All** 檢查閘道連線是否健康。

![用於測試提供者和閘道健康狀態的 Check All 按鈕](/custom-api/check-gateway-health-button.png)

如果檢查成功，連線卡片可能會顯示 **Healthy** 等狀態。變更設定後，也可以使用 **Recheck** 再次測試閘道。

![檢查成功後顯示健康閘道狀態的連線卡片](/custom-api/check-gateway-health-result.png)

## 手動新增模型

你也可以手動新增模型。

在模型輸入欄位中輸入 API 提供者提供的模型名稱。

然後點選 **Add**。

當提供者不提供模型清單端點，或想使用的模型沒有出現在 **Fetch Available Models** 的回傳結果中時，這個功能很有用。

請確保模型名稱與提供者要求的模型 ID 完全相同。

![包含 Add 按鈕的手動模型輸入欄位](/custom-api/manual-model-add-current.png)

## 啟用、停用或刪除模型

新增模型後，它們會出現在 **Models** 清單中。

每個模型項目都可以個別管理。

你可以使用模型項目右側的開關啟用或停用模型。

模型啟用後，Breezell 就可以使用它傳送請求。

模型停用後，Breezell 會保留設定，但不會使用該模型。

將滑鼠移到模型項目上，可以顯示更多操作。

點選刪除按鈕即可刪除模型。

當你不再希望模型出現在目前的提供者中時，可以使用此功能。

![包含啟用、停用、設定和刪除控制項的模型清單](/custom-api/model-management-current.png)

## 開啟進階模型設定

如果你想為模型設定更詳細的行為，請點選模型項目上的設定按鈕。

這會開啟 **Advanced Settings** 面板。

進階設定是選用的。除非你了解提供者要求的模型限制和請求格式，否則大多數使用者不需要修改這些設定。

## Advanced Settings

在進階設定面板中，你可以自訂模型層級的行為。

![自訂 API 模型的 Advanced Settings 面板](/custom-api/advanced-settings-original.png)

### 啟用自訂設定

**Enable custom settings** 開關控制此模型是否使用自己的進階設定。

如果此開關關閉，Breezell 會使用模型預設辨識出的設定。

如果此開關開啟，進階設定面板中的值會覆寫此模型的預設行為。

### Context Window

**Context Window** 定義模型支援的最大內容長度。

這通常表示模型在一次請求中可以處理的最大權杖數，包括對話歷史、系統訊息、使用者訊息、工具結果和其他內容。

例如，以下值：

```text
400000
```

表示模型設定了 400k 的內容視窗。

此欄位支援自動轉換 `k` 後綴。

例如：

```text
128k
```

會被轉換為：

```text
128000
```

請使用模型提供者提供的值。如果模型實際上不支援這麼大的內容，將此值設定得過高可能會導致請求失敗。

### Output Token Space

**Output Token Space** 定義為模型回應預留的最大輸出權杖空間。

例如，以下值：

```text
128000
```

表示模型最多可以為輸出預留 128k 個權杖。

此欄位同樣支援自動轉換 `k` 後綴。

例如：

```text
8k
```

會被轉換為：

```text
8000
```

請使用與提供者實際輸出限制相符的值。

### System Message

**System Message** 控制 Breezell 如何向模型傳送系統層級指令。

有些模型要求系統訊息使用標準的 `system` 角色。

另一些模型可能要求不同的角色格式，例如 `developer` 角色。

如果提供者要求特定的系統訊息格式，請在此處選擇相符的選項。

如果不確定，請保留預設設定。

### Tool Format

**Tool Format** 控制工具如何描述並傳送給模型。

對於相容 OpenAI 的模型，請使用 **OpenAI Style**。

如果提供者要求不同的工具呼叫格式，請選擇與提供者文件相符的格式。

錯誤的工具格式設定可能會導致工具呼叫失敗。

### Supports Thinking

**Supports Thinking** 表示模型是否支援推理或思考模式。

只有在模型提供者支援此功能時才啟用它。

### Can Disable Thinking

**Can Disable Thinking** 表示 Breezell 是否可以為此模型停用思考模式。

這適用於同時支援推理模式和非推理模式的模型。

### Can Stream Reasoning

**Can Stream Reasoning** 表示模型是否可以在產生過程中串流傳送推理內容。

只有在提供者支援串流推理輸出時才啟用此選項。

如果提供者不支援此功能，啟用它可能會導致請求錯誤或回應不完整。

## 儲存進階設定

修改進階設定後，點選 **Save**。

如果不想套用變更，請點選 **Cancel** 或關閉面板。

只有在了解模型正確設定值的情況下，才應修改進階設定。錯誤的內容大小、輸出權杖限制、訊息格式、工具格式或思考設定可能導致模型行為異常或無法回應。

## 選擇自訂模型

新增並啟用自訂模型後，返回聊天介面。

點選輸入框附近的模型選取器。

在模型清單中，你會看到 Breezell 內建模型、Codex 模型和自訂 OpenAI-Compatible 模型。

自訂提供者會顯示在自己的提供者群組下。例如，如果提供者暱稱是 **TEST**，你在該提供者下新增的模型會顯示在 **TEST** 群組中。

選擇想要使用的模型。

如果新增了多個模型，請選擇與目前工作相符的模型。

![顯示內建模型和 TEST 自訂提供者群組的模型選取器](/custom-api/select-custom-model-original.png)

## 調整內容和推理選項

選擇模型後，可以開啟模型選項面板。

在此面板中，你可能會看到以下選項：

- Context size
- Reasoning mode
- Reasoning strength
- Fast mode

**Context** 選項控制模型可以使用多少對話歷史或輸入內容。

**Reasoning** 選項控制是否啟用推理模式。

如果啟用了推理，可以選擇推理強度，例如：

- Low
- Medium
- High
- Extra High

較高的推理強度可能適用於複雜的編碼、規劃、除錯或分析工作。

較低的推理強度可能更適合簡單問題或需要更快回應的情境。

如果模型支援 **Fast** 模式，可以啟用它來優先提高回應速度。

可用選項可能會根據所選模型和提供者而不同。

![包含內容和推理設定的模型選項面板](/custom-api/model-options-original.png)

## 開始對話

選擇模型並調整選項後，在輸入框中輸入訊息。

然後傳送訊息，開始對話。

例如，你可以輸入：

```text
Hello
```

如果自訂 API 設定正確，Breezell 會透過自訂提供者傳送請求，並在聊天中返回模型回應。

現在你已經完成自訂 API 設定。

![透過自訂模型傳送訊息後的聊天檢視](/custom-api/start-conversation-original.png)
