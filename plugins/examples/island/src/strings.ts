/*
 * What the island says, in Breezell's languages (vscode.breezell.language: en, zh-CN, zh-TW, ja,
 * ko, ru, es, pt-BR). A language Breezell adds later shows in English until it is added here.
 */

export interface IslandStrings {
	readonly thinking: string;
	readonly writing: string;
	readonly editing: string;
	readonly editingFiles: string;
	readonly reading: string;
	readonly readingFiles: string;
	readonly searching: string;
	readonly runningCommand: string;
	readonly usingTool: string;
	readonly waitingOnSubtasks: string;
	readonly condensing: string;
	readonly reconnecting: string;
	readonly awaiting: string;
	readonly awaitingMany: string;
	readonly view: string;
	readonly finished: string;
	readonly took: string;
	readonly failed: string;
	readonly taskRunning: string;
	readonly taskSucceeded: string;
	readonly taskFailed: string;
	readonly exitCode: string;
	/** What the island outside the window is, for screen readers: a click opens its panel. */
	readonly backToBreezell: string;
	readonly backToEditor: string;
	/** Goes to that editor window. */
	readonly goTo: string;
	/** How many conversations are running. */
	readonly running: string;
	/** A conversation at work (Breezell says no more than that). */
	readonly working: string;
	/** A conversation without a title yet. */
	readonly untitled: string;
	/** In the panel, without chat.read. */
	readonly readChatHint: string;
	/** Told once on a Linux desktop where the island cannot leave the window. */
	readonly waylandNote: string;
}

export const ISLAND_STRINGS: Readonly<Record<string, IslandStrings>> = {
	en: {
		thinking: 'Thinking', writing: 'Writing', editing: 'Editing {0}', editingFiles: 'Editing files', reading: 'Reading {0}', readingFiles: 'Reading files',
		searching: 'Searching the code', runningCommand: 'Running a command', usingTool: 'Using a tool', waitingOnSubtasks: 'Waiting on subtasks', condensing: 'Condensing context', reconnecting: 'Reconnecting',
		awaiting: 'Waiting for you', awaitingMany: '{0} chats waiting for you', view: 'View', finished: 'Done', took: 'took {0}', failed: 'Something went wrong',
		taskRunning: 'Running {0}', taskSucceeded: '{0} succeeded', taskFailed: '{0} failed', exitCode: 'exit code {0}',
		backToBreezell: 'Back to Breezell',
		waylandNote: 'Activity Island stays in the title bar on this desktop: a Wayland session does not let apps keep a window above others. Under X11 it floats at the top of the screen when you leave Breezell.',
		backToEditor: "Back to editor", goTo: "Go", running: "{0} running", working: "Working", untitled: "New chat",
		readChatHint: "Allow \"Read your conversations\" for Activity Island in Plugins to see replies here.",
	},
	'zh-CN': {
		thinking: '正在思考', writing: '正在回复', editing: '正在编辑 {0}', editingFiles: '正在修改文件', reading: '正在读取 {0}', readingFiles: '正在读取文件',
		searching: '正在搜索代码', runningCommand: '正在运行命令', usingTool: '正在调用工具', waitingOnSubtasks: '等待子任务', condensing: '正在压缩上下文', reconnecting: '正在重新连接',
		awaiting: '等你确认', awaitingMany: '{0} 个对话等你确认', view: '查看', finished: '已完成', took: '用时 {0}', failed: '出错了',
		taskRunning: '正在运行 {0}', taskSucceeded: '{0} 已完成', taskFailed: '{0} 失败', exitCode: '退出码 {0}',
		backToBreezell: '回到 Breezell',
		waylandNote: '活动岛在这个桌面上会留在标题栏：Wayland 会话不允许应用让窗口浮在其他窗口之上。在 X11 下，离开 Breezell 时它会浮到屏幕顶部。',
		backToEditor: "回到编辑器", goTo: "前往", running: "{0} 个对话进行中", working: "正在工作", untitled: "新对话",
		readChatHint: "在插件中允许活动岛“读取你的对话”，即可在这里看到回复。",
	},
	'zh-TW': {
		thinking: '正在思考', writing: '正在回覆', editing: '正在編輯 {0}', editingFiles: '正在修改檔案', reading: '正在讀取 {0}', readingFiles: '正在讀取檔案',
		searching: '正在搜尋程式碼', runningCommand: '正在執行命令', usingTool: '正在呼叫工具', waitingOnSubtasks: '等待子任務', condensing: '正在壓縮上下文', reconnecting: '正在重新連線',
		awaiting: '等你確認', awaitingMany: '{0} 個對話等你確認', view: '查看', finished: '已完成', took: '用時 {0}', failed: '出錯了',
		taskRunning: '正在執行 {0}', taskSucceeded: '{0} 已完成', taskFailed: '{0} 失敗', exitCode: '結束代碼 {0}',
		backToBreezell: '回到 Breezell',
		waylandNote: '活動島在這個桌面上會留在標題列：Wayland 工作階段不讓應用程式把視窗浮在其他視窗之上。在 X11 下，離開 Breezell 時它會浮到螢幕頂端。',
		backToEditor: "回到編輯器", goTo: "前往", running: "{0} 個對話進行中", working: "正在工作", untitled: "新對話",
		readChatHint: "在插件中允許活動島「讀取你的對話」，即可在這裡看到回覆。",
	},
	ko: {
		thinking: '생각 중', writing: '답변 작성 중', editing: '{0} 편집 중', editingFiles: '파일 편집 중', reading: '{0} 읽는 중', readingFiles: '파일 읽는 중',
		searching: '코드 검색 중', runningCommand: '명령 실행 중', usingTool: '도구 사용 중', waitingOnSubtasks: '하위 작업 대기 중', condensing: '컨텍스트 압축 중', reconnecting: '다시 연결 중',
		awaiting: '확인을 기다리는 중', awaitingMany: '대화 {0}개가 확인을 기다리는 중', view: '보기', finished: '완료', took: '{0} 소요', failed: '오류가 발생했습니다',
		taskRunning: '{0} 실행 중', taskSucceeded: '{0} 완료', taskFailed: '{0} 실패', exitCode: '종료 코드 {0}',
		backToBreezell: 'Breezell로 돌아가기',
		waylandNote: '이 데스크톱에서는 활동 아일랜드가 제목 표시줄에 머뭅니다. Wayland 세션은 앱이 창을 다른 창 위에 띄우도록 허용하지 않습니다. X11에서는 Breezell을 벗어나면 화면 상단에 떠 있습니다.',
		backToEditor: "편집기로 돌아가기", goTo: "이동", running: "대화 {0}개 진행 중", working: "작업 중", untitled: "새 채팅",
		readChatHint: "플러그인에서 활동 아일랜드의 '대화 읽기'를 허용하면 여기에서 답변을 볼 수 있습니다.",
	},
	ru: {
		thinking: 'Думает', writing: 'Пишет ответ', editing: 'Редактирует {0}', editingFiles: 'Редактирует файлы', reading: 'Читает {0}', readingFiles: 'Читает файлы',
		searching: 'Ищет в коде', runningCommand: 'Выполняет команду', usingTool: 'Использует инструмент', waitingOnSubtasks: 'Ждёт подзадачи', condensing: 'Сжимает контекст', reconnecting: 'Переподключается',
		awaiting: 'Ждёт вашего решения', awaitingMany: 'Чатов ждут вашего решения: {0}', view: 'Открыть', finished: 'Готово', took: 'за {0}', failed: 'Произошла ошибка',
		taskRunning: 'Выполняется {0}', taskSucceeded: '{0}: готово', taskFailed: '{0}: ошибка', exitCode: 'код выхода {0}',
		backToBreezell: 'Вернуться в Breezell',
		waylandNote: 'На этом рабочем столе остров активности остаётся в заголовке окна: сеанс Wayland не позволяет приложениям держать окно поверх других. В X11 он всплывает вверху экрана, когда вы уходите из Breezell.',
		backToEditor: "Вернуться в редактор", goTo: "Перейти", running: "Идёт разговоров: {0}", working: "Работает", untitled: "Новый чат",
		readChatHint: "Разрешите острову активности «Читать ваши разговоры» в разделе плагинов, чтобы видеть здесь ответы.",
	},
	ja: {
		thinking: '考え中', writing: '回答を作成中', editing: '{0} を編集中', editingFiles: 'ファイルを編集中', reading: '{0} を読み込み中', readingFiles: 'ファイルを読み込み中',
		searching: 'コードを検索中', runningCommand: 'コマンドを実行中', usingTool: 'ツールを使用中', waitingOnSubtasks: 'サブタスクを待機中', condensing: 'コンテキストを圧縮中', reconnecting: '再接続中',
		awaiting: '確認待ち', awaitingMany: '{0} 件の会話が確認待ち', view: '表示', finished: '完了', took: '所要 {0}', failed: 'エラーが発生しました',
		taskRunning: '{0} を実行中', taskSucceeded: '{0} 完了', taskFailed: '{0} 失敗', exitCode: '終了コード {0}',
		backToBreezell: 'Breezell に戻る',
		waylandNote: 'このデスクトップではアクティビティアイランドはタイトルバーに留まります。Wayland セッションではアプリが他のウィンドウの上にウィンドウを保てません。X11 では Breezell を離れると画面上部に浮かびます。',
		backToEditor: "エディターに戻る", goTo: "移動", running: "{0} 件の会話が進行中", working: "作業中", untitled: "新しいチャット",
		readChatHint: "プラグインでアクティビティアイランドに「会話を読み取る」を許可すると、ここに返信が表示されます。",
	},
	es: {
		thinking: 'Pensando', writing: 'Escribiendo', editing: 'Editando {0}', editingFiles: 'Editando archivos', reading: 'Leyendo {0}', readingFiles: 'Leyendo archivos',
		searching: 'Buscando en el código', runningCommand: 'Ejecutando un comando', usingTool: 'Usando una herramienta', waitingOnSubtasks: 'Esperando subtareas', condensing: 'Condensando el contexto', reconnecting: 'Reconectando',
		awaiting: 'Esperando tu respuesta', awaitingMany: '{0} chats esperan tu respuesta', view: 'Ver', finished: 'Listo', took: 'en {0}', failed: 'Algo salió mal',
		taskRunning: 'Ejecutando {0}', taskSucceeded: '{0} terminó', taskFailed: '{0} falló', exitCode: 'código de salida {0}',
		backToBreezell: 'Volver a Breezell',
		waylandNote: 'En este escritorio, la isla de actividad se queda en la barra de título: una sesión de Wayland no deja que las apps mantengan una ventana sobre las demás. Con X11 flota en la parte superior de la pantalla cuando sales de Breezell.',
		backToEditor: "Volver al editor", goTo: "Ir", running: "{0} en curso", working: "Trabajando", untitled: "Chat nuevo",
		readChatHint: "Permite «Leer tus conversaciones» a la Isla de actividad en Plugins para ver aquí las respuestas.",
	},
	'pt-BR': {
		thinking: 'Pensando', writing: 'Escrevendo', editing: 'Editando {0}', editingFiles: 'Editando arquivos', reading: 'Lendo {0}', readingFiles: 'Lendo arquivos',
		searching: 'Pesquisando no código', runningCommand: 'Executando um comando', usingTool: 'Usando uma ferramenta', waitingOnSubtasks: 'Aguardando subtarefas', condensing: 'Condensando o contexto', reconnecting: 'Reconectando',
		awaiting: 'Aguardando você', awaitingMany: '{0} conversas aguardando você', view: 'Ver', finished: 'Concluído', took: 'em {0}', failed: 'Algo deu errado',
		taskRunning: 'Executando {0}', taskSucceeded: '{0} concluída', taskFailed: '{0} falhou', exitCode: 'código de saída {0}',
		backToBreezell: 'Voltar ao Breezell',
		waylandNote: 'Neste desktop, a ilha de atividade fica na barra de título: uma sessão Wayland não deixa os apps manterem uma janela acima das outras. No X11 ela flutua no topo da tela quando você sai do Breezell.',
		backToEditor: "Voltar ao editor", goTo: "Ir", running: "{0} em andamento", working: "Trabalhando", untitled: "Novo chat",
		readChatHint: "Permita “Ler suas conversas” para a Ilha de atividade em Plugins para ver as respostas aqui.",
	},
};

export const islandStrings = (language: string | undefined): IslandStrings => ISLAND_STRINGS[language ?? 'en'] ?? ISLAND_STRINGS.en;
