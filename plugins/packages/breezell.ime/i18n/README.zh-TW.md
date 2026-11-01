# Breezell 輸入法

懂你的程式碼和對話的輸入法：全拼、注音、雙拼、五筆 86、日文和韓文，可用於 Breezell 的編輯器和對話框；在 Windows 上，所有程式都能用。

## 功能

- **打整句。** 一口氣打完一個分句，語言模型會依上下文判讀，第一個候選字就是正確文字的機會，遠高於單靠字典。
- **分得清程式碼和註解。** 在程式碼中輸入英文。在註解、字串中，或同一行的 `///` 之後，不用切換就能輸入你自己的語言。
- **參考游標周圍的內容。** 你正在編輯的程式碼和對話框裡的對話都會幫忙選詞，`useState` 這類名稱也會照那裡的寫法成為候選字。
- **容許打錯。** 在拼音中，按鍵順序打錯、按到相鄰的鍵，或多按、少按一個鍵，都還是找得到詞（`jain` 能找到「簡」）。
- **可以夾雜英文。** 在拼音中打 `hello`，它就會出現在候選字中。
- **提供接下來的詞**，在你送出中文之後。
- **向你學習**，但不會讓一次偶然的選擇影響到其他地方。

## 開始使用

在 **Breezell Console › 插件** 按「**安裝**」，這樣就好了。它會自己設定完成：

- Windows 會詢問一次系統管理員權限，用來加入輸入法。
- 自動下載對應 Breezell 介面語言的語言包（介面是日文或韓文就下載該語言，其他都是中文）。
- 完成後自動開啟。它的頁面會顯示進度。

如果在 Windows 的詢問中按「否」，它仍可在 Breezell 的編輯器裡使用，之後可在頁面上按「**安裝到 Windows…**」再安裝一次。要加其他語言或換輸入法，請從側邊欄的「**插件**」開啟「**Breezell 輸入法**」：

| 語言 | 輸入法 | 下載大小 |
|---|---|---|
| 中文 | 全拼、注音、雙拼（小鶴、微軟、自然碼、搜狗、智能 ABC、紫光、拼音加加）、五筆 86 | 374 MB |
| 日文 | 羅馬字轉假名和漢字 | 189 MB |
| 韓文 | 두벌식韓文，提供詞語建議 | 128 MB |

語言來自這個插件的 GitHub release；連線中斷時，下載會從中斷處繼續。每個檔案在使用前都會比對 SHA-256。你使用的每種語言都會把模型留在記憶體中：中文約 400 MB。

## 按鍵

| 按鍵 | 作用 |
|---|---|
| **Ctrl+Alt+Space**（macOS：**Ctrl+Option+Shift+Space**） | 開啟或關閉 |
| **Ctrl+Alt+K** 或狀態列 | 選擇輸入法 |
| **Space** 或數字（注音：**Shift+數字**） | 選擇候選字 |
| 方向鍵、**Page Up**、**Page Down** | 在候選字間移動 |
| **Enter** | 照你打的內容送出 |
| **Esc** | 捨棄 |
| **Backspace** | 退回一個按鍵 |
| **Tab** | 選接下來提供的第一個詞 |
| 單獨按 **Shift**（使用 Windows 輸入法時） | 在你的語言和英文之間切換 |

## Windows 上的所有程式

第一次啟動時，它會把自己加入 Windows 輸入法，引擎和學到的詞都和 Breezell 裡相同。它會成為你的預設輸入法；按 **Win+Space** 可切換成其他輸入法。安裝時已經開著的程式，請按 **Win+Space** 切換過去。

它會在 `Program Files\BreezellIME` 安裝文字服務，在 `%LOCALAPPDATA%\BreezellIME` 安裝引擎主程式，全部來自這個插件的套件，不會下載任何程式碼。

**移除插件**時，會把它從輸入法清單拿掉、停止引擎、還原預設輸入法，並刪除預設資料夾裡的語言包；學到的詞會保留。文字服務的檔案會留在 Program Files 裡（不再使用）：要連這些一起移除，請先在頁面上按「**從 Windows 移除…**」。

在 Linux 和 macOS 上可於 Breezell 的編輯器裡使用；系統輸入法尚未提供。

## 搭配舊版 Breezell

編輯器中的候選字面板和在對話框中打字，都需要較新版的 Breezell。在舊版中，候選字會以文字顯示在編輯器的游標之後，對話框則使用你系統的輸入法。

## 你的資料

- **你輸入的任何內容都不會離開你的電腦。** 組字、游標周圍的上下文和它學到的內容都留在電腦上。插件只有在下載你選擇的語言時才會連線。
- **權限：** 它不要求任何 Breezell 插件權限。作為輸入法，它會收到你在 Breezell 對話框中按的鍵和最近的對話，用來選詞；Breezell 只把這些交給這個插件。
- 它學到的內容在 `%APPDATA%\BreezellIME`（Windows）、`~/Library/Application Support/BreezellIME`（macOS）或 `~/.config/breezell-ime`（Linux）。頁面上的「**清除學到的詞**」會讓它全部忘記。
- 和所有 Breezell 插件一樣，它需要你登入。Windows 輸入法安裝後，登出也能繼續使用，所以你不會遇到無法打字的情況。

## 準確率

第一個候選字完全正確的分句比例，每組 1,000 個未用於訓練的分句，學習功能關閉。參數是用另外的句子調整的；這幾組是最後才執行的。

| 輸入法 | 文本 | Breezell 輸入法 | 其他 |
|---|---|---|---|
| 全拼 | 維基百科 | 66.4 | Rime 33.1, CyIME 38.2 |
| 全拼 | 字幕 | 85.1 | Rime 62.6, CyIME 65.1 |
| 全拼 | 技術文件 | 78.3 | Rime 49.7, CyIME 61.3 |
| 注音 | 台灣字幕 | 82.4 | Rime 62.0, CyIME 54.6 |
| 注音 | Python 文件 | 81.2 | Rime 61.4, CyIME 37.8 |
| 五筆 86，智慧排序：不用選字 | 維基百科 | 81.4 | Rime 70.2 |
| 五筆 86，智慧排序：不用選字 | 字幕 | 87.6 | Rime 85.0 |
| 五筆 86，智慧排序：不用選字 | 技術文件 | 91.9 | Rime 88.8 |
| 日文 | ITA 語料庫 | 66.5 | Mozc 58.9, CyIME 24.8 |
| 日文 | 維基百科 | 79.0 | Mozc 59.5, CyIME 33.1 |
| 日文 | 字幕 | 83.8 | Mozc 74.3, CyIME 35.1 |

技術組所依據的 Vue 和 Python 文件從未用於訓練。Rime 在拼音使用 rime-ice，在注音使用它官方的 bopomofo 方案。CyIME 的數字來自原版 librime 1.16.1，搭配它的方案和權重，再加上萬象語法模型；它自己修改過的 librime 和重排序器沒有執行，結果可能更好。日文維基百科和字幕的讀音是用 Mozc 的字典產生的，所以讀音由人標註的 ITA 是這三者中最公平的。

## 從原始碼建置

原始碼在 [`plugins/examples/ime`](https://github.com/BreezellCode/BreezellCode/tree/main/plugins/examples/ime)：`src`（插件）、`engine`（輸入法引擎）、`system`（Windows 文字服務和主程式）和 `tools`（建置模型的工具）。

```bash
npm install
npm test                 # 邏輯測試
npm run package:open     # .vsix，含原始碼和 source map
```

文字服務的 DLL 在 Windows 上用 `system/windows/build.bat` 建置。

## 授權

GPL-3.0-or-later。字典和模型來自 [THIRD_PARTY_NOTICES.md](https://github.com/BreezellCode/BreezellCode/blob/main/plugins/examples/ime/THIRD_PARTY_NOTICES.md) 列出的專案。
