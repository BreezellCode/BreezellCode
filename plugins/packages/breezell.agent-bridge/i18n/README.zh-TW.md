# Agent Bridge

把你自己安裝、自己登入的 Claude Code 連接到 Breezell。

因為 Anthropic 的規定，其他應用程式不能替你登入 Claude 帳號，Breezell 也遵守這項規定，所以不會直接替你登入：請你自行安裝 Claude Code，在 Claude Code 中登入帳號，再由 Breezell 連接使用。

## 需要什麼

- 比 1.4.64 新的 Breezell。較舊的版本無法安裝。
- 這台電腦上的 Claude Code（Windows 上可以裝在 Windows 或 WSL 裡），用你自己的帳號或 API 金鑰登入。
- 登入的 Breezell 帳號，不需要付費方案。

## 如何連接

1. 在這台電腦上安裝 Claude Code。
2. 在終端機執行 `claude` 並登入帳號（如果沒有詢問，輸入 `/login`）。
3. 在 Breezell 中打開 Box › 模型 › 帳號登入，選擇 Claude Code 卡片。
4. 開啟「連接 Claude Code」，閱讀彈出的說明。同意即表示你會遵守 Anthropic 的相關規定，並同意 Breezell 使用 Claude Code 回報的連接狀態與帳號資訊。

會在哪裡找：macOS 和 Linux 上，會找原生安裝程式、Homebrew、npm 或系統套件放置 `claude` 的位置。Windows 上會先找 Windows，再找 WSL；在 WSL 中開啟的視窗，會優先使用該發行版裡的 Claude Code。頁面會顯示連接的是哪一個。

可以工作的資料夾：這台電腦的資料夾，以及 WSL 視窗中的資料夾（給該發行版裡的 Claude Code）。用 SSH 連回同一個 WSL 發行版的視窗（WSL 裡的 SSH 伺服器，經由 localhost 連線）也可以：插件會先確認該主機的機器識別碼和這個發行版的相同，Claude Code 才會在裡面工作。其他 SSH 主機和容器是別台機器，這台電腦上的 Claude Code 無法在那裡工作，對話中會說明。

之後頁面會顯示「已連接」與你的電子郵件、組織、訂閱等級、登入方式和 Claude Code 版本，並用進度條顯示每一項用量限制（目前工作階段與本週）以及重設時間（換算成你電腦的時間），或顯示未連接的原因。「重新檢查」會再詢問 Claude Code 一次；回到 Breezell 時也會自動重新檢查。

## 在 Breezell 中和 Claude Code 對話

Claude Code 連接後，它的模型會出現在對話的模型選單中，位於「帳號直登 › Claude Code」：就是 Claude Code 自己的模型選單提供的那些，並標出版本（Opus 5.5、Opus 4.8、Sonnet 4.6 等）。選一個就能像使用其他模型一樣對話：

- Claude Code 會在這個對話的專案中工作：以專案資料夾為工作目錄，視窗中的其他資料夾也一併開放給它（`--add-dir`），並在同一個對話中接著上次繼續。沒有開啟資料夾的視窗中，它會在插件自己的一個空資料夾中工作。
- 思考強度可以在模型選單中依模型調整，選項就是該模型支援的等級；沒有調整時使用 Claude Code 自己的預設值。
- 它的回覆、思考，以及讀取或修改的每個檔案、執行的每個命令，都會即時顯示在對話中。
- Claude Code 改檔和執行指令，和 Breezell 自己的一樣要經過核准：由 Breezell 的核准卡片問你，或由你的設定決定（「自動核准編輯」「自動核准終端機」、命令卡片上的 Always allow）。它的其他工具，Claude Code 自己的設定已允許的，會像在終端機中一樣直接執行，其餘由 Breezell 的核准卡片詢問（「自動核准 MCP 工具」）。
- 在這些對話中，Claude Code 自己的 Bash、Monitor、Edit 和 Write 會關閉：它只透過 Breezell 執行指令和修改檔案。讀檔、搜尋、上網等其他工具仍是它自己的。
- Claude Code 的每個動作都以 Breezell 原生的方式顯示：讀檔、修改（含差異）、新檔、命令、搜尋、待辦清單。
- Claude Code 開的每個子代理，都會像 Breezell 的子代理一樣有自己的頁面：它的任務、做了什麼、它的報告。對話中的子代理列會顯示它目前的步驟，點名稱即可打開那一頁；在那裡按停止，只會停止這個子代理。
- 按「停止」會停止 Claude Code。
- 在其他模型回答過的對話中，或你修改了先前的訊息之後，Claude Code 會收到它還沒看過的內容。
- 對模型的請求中途失敗時（連線中斷、API 忙碌、被限流，或回覆 4 分鐘都沒有動靜），會照 Breezell 自己的方式處理：顯示重新連線的倒數，Claude Code 會在同一個工作階段從中斷處繼續，重試次數依 Box › 網路與對話 的設定。在錯誤上按「重試」也一樣。
- Breezell 的記憶會跟著你的訊息送出（訊息的記憶列會顯示是哪幾則），完成的回合也會像 Breezell 自己的回合一樣用來學習（超級記憶）。Claude Code 在工作時也能自己用 Breezell 的記憶查詢工具查詢記憶，每次查詢在對話中的顯示和 Breezell 自己的一樣。
- Claude Code 改的檔案都經過 Breezell 的編輯器：和 Breezell 自己的模型一樣，可以在編輯器裡保留或復原，也會列在程式碼審查和待審核檔案列。「自動核准編輯」「自動接受程式碼變更」「編輯時自動開啟檔案」都適用，修改後檔案的 lint 與型別錯誤會回報給 Claude Code（自動修復 lint 錯誤）。
- Claude Code 的指令在 Breezell 的終端裡執行，用的是這個視窗的預設 shell：卡片即時顯示輸出，可以開啟終端、停止或移到背景，哪些指令不必詢問由 Breezell 的核准規則決定。背景指令結束時，Claude Code 會收到通知。

Breezell 會詢問一次是否允許這個插件回答對話。

## 你的 Claude Code 對話也會出現在 Breezell

你在 Breezell 開啟的資料夾中的 Claude Code 對話，會以第一則訊息為名稱，出現在該專案的對話清單中。繼續其中一個對話時，Claude Code 會接著同一個工作階段。Claude Code 連接時以及之後每隔幾分鐘會同步一次，也可以按「同步對話」：

- 之後你在終端機中接著說的內容，也會加進 Breezell 中的同一個對話；不會重複出現，在 Breezell 中開始的對話也一樣。
- 你在 Breezell 中刪除的對話，不會再被同步回來。預設只刪除 Breezell 這邊；在插件頁面開啟「刪除對話時，一併刪除 Claude Code 中的對話」後，Claude Code 中的對話也會一起刪除（開啟前會先詢問，刪除後無法復原）。
- 每個資料夾會讀取最新的 200 個對話。
- 對話會同步到它所屬的專案：每個視窗同步的是它所開的專案，在 Agents 頁中也會顯示在該專案底下。沒有開啟專案的視窗不會同步，按「同步對話」時會提示。頁面和同步後的通知都會寫出同步的是哪個專案。

## 插件的頁面

Box › 插件 › Agent Bridge 會顯示和 Claude Code 卡片相同的頁面：連接狀態、帳號、用量、上次同步的結果，以及「同步對話」按鈕。

## 會讀取哪些資訊

只讀取 Claude Code 執行 `claude --version`、`claude auth status` 和它自己的 `/usage` 指令時印出的內容（以 `claude -p /usage --no-session-persistence` 執行：由 Claude Code 自己回答，不會詢問模型、不會消耗你的用量，也不會加入你的工作階段紀錄），和你在終端機看到的一樣。模型選單是向 Claude Code 詢問它提供哪些模型（和 Anthropic 的 Agent SDK 用的是同一個請求；不會送出訊息，所以不會使用任何模型）。為了同步對話，它會讀取 Breezell 中開啟的資料夾的 Claude Code 對話檔案（位於 `~/.claude/projects`），只讀這些。它不會讀取、儲存或轉交你的登入憑證。帳號與用量資訊不會傳送到任何地方，只留在這台電腦的這一頁上。你用 Claude Code 模型送出的內容會交給你的 Claude Code，由它像在終端機中一樣處理。開關關閉時，插件完全不會執行 Claude Code。
