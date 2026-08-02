---
title: 對話方塊總覽
description: Breezell 對話方塊總覽，包括提及、內容用量、模式選擇、模型控制和快速操作。
---

# 對話方塊總覽

Breezell 對話方塊是撰寫提示詞、選擇工作模式、選取模型、附加內容，以及控制 Agent 處理目前請求方式的主要位置。

本頁面介紹對話方塊截圖中顯示的可見控制項。

## 預設輸入狀態

預設輸入狀態是新訊息的正常起始狀態。它會保持提示詞欄位和必要控制項可見。

![預設輸入狀態](/dialog-box/input-default.png)

輸入請求，並在需要時選擇模式和模型，然後將訊息傳送給 Breezell。

## 模式選取器選單

指標突顯模式選取器選單。此選單列出可用的工作模式。

![模式選取器選單](/dialog-box/mode-selector.png)

可用模式包括：

- [**Chat**](/zh-hant/mode-selection#chat)，用於快速提問和回答
- [**Plan**](/zh-hant/mode-selection#plan)，用於編輯前制定實作計畫
- [**Analyze**](/zh-hant/mode-selection#analyze)，用於唯讀調查
- [**Entanglement**](/zh-hant/mode-selection#entanglement)，用於更深入的因果推理
- [**Agent**](/zh-hant/mode-selection#agent)，用於自主編輯檔案和使用工具
- [**Teams**](/zh-hant/mode-selection#teams)，用於複雜工作中的平行 AI 隊友

如需更多詳細資料，請參閱[模式選擇](/zh-hant/mode-selection)。選擇符合你所需自主程度和深度的模式。

## 模型選取器

指標突顯模型選取器。選取器會顯示目前模型，並讓你在傳送訊息前切換到其他可用模型。

![模型選取器](/dialog-box/input-compact-controls.png)

當你想選擇具有不同速度、推理能力或功能特徵的模型時，可以使用此控制項。

## 檔案上傳

指標突顯檔案上傳控制項。

![檔案上傳控制項](/dialog-box/input-model-controls.png)

點選此控制項，在將目前訊息傳送給 Breezell 前附加本機檔案。上傳的檔案會成為請求內容的一部分，因此 Breezell 可以在回答時檢查或參照它們。

## ~~進階探索~~

> **1.2.5 版本後已棄用。** 專用的進階探索控制項已不再提供。當請求需要更深入的研究時，Breezell 會自動呼叫相關功能，進行主動學習、更廣泛的調查和更徹底的探索。

![進階探索控制項](/dialog-box/input-tools-expanded.png)

## Breezell 瀏覽器

指標突顯 **Breezell Browser** 控制項。

![Breezell Browser 控制項](/dialog-box/input-agent-basic.png)

Breezell Browser 是 Breezell 內建的瀏覽器工具。你可以使用它開啟網頁、檢視線上內容、搜尋資訊，並協助 AI 在不離開對話方塊的情況下取得和分析網頁內容。

## 內容用量明細

指標突顯內容用量指示器。開啟後會顯示目前內容視窗使用情況的詳細明細。

![內容用量明細](/dialog-box/context-usage-breakdown.png)

明細會將用量分為系統提示詞、工具、規則、記憶、技能、MCP、子 Agent 和對話內容等類別。你可以利用它了解工作階段中哪些部分消耗了最多權杖。

## 手動壓縮內容

指標突顯內容面板中的 **Manual compress** 控制項。此操作會摘要較早的對話內容，使工作階段在降低內容用量的同時保留有用資訊。

![包含手動壓縮功能的內容面板](/dialog-box/context-manual-compress.png)

手動壓縮適用於長時間對話，尤其是內容視窗變大但你仍想繼續使用同一工作階段時。

## 提及選單

指標突顯用於開啟提及選單的快速內容區域。提及選單可讓你將檔案、資料夾、MCP 工具和技能加入目前訊息。

![Breezell 對話方塊中的提及選單](/dialog-box/mention-menu.png)

當請求依賴特定工作區內容或外部功能時，可以使用此功能。加入正確的內容有助於 Breezell 在回答前了解應檢查或使用哪些內容。

## 使用提示

- 當請求依賴特定專案內容時，加入檔案或資料夾內容。
- Agent 是預設模式，也是大多數工作的建議自動工作流程。
- 只有在需要特定工作流程（例如先規劃或只分析而不編輯）時才切換模式。
- 內容壓縮會自動執行。只有在偏好嚴格手動控制或有特殊要求時，才使用手動壓縮。
- 當準確性、速度或推理深度很重要時，請檢查所選模型。