type yuyanwenben = {
  mingcheng: string;
  yuyan: string;
  zhinan: string;
  guanyu: string;
  lianxi: string;
  gengxinrizhi: string;
  kaishi: string;
  yuyanshezhi: string;
  zidingyiapi: string;
  tishicishezhi: string;
  gongnengxuanxiang: string;
  gaojicaozuo: string;
  duihuakuang: string;
  moshi: string;
  yemian: string;
  shangyi: string;
  xiayi: string;
  qiehuanyuyan: string;
  fanhuadingbu: string;
};

const yuyanwenben: Record<string, yuyanwenben> = {
  root: {
    mingcheng: "English",
    yuyan: "en-US",
    zhinan: "Guide",
    guanyu: "About",
    lianxi: "Contact",
    gengxinrizhi: "Changelog",
    kaishi: "Get Started",
    yuyanshezhi: "Language Settings",
    zidingyiapi: "Custom API",
    tishicishezhi: "Prompt Settings",
    gongnengxuanxiang: "Feature Options Overview",
    gaojicaozuo: "Advanced Operations",
    duihuakuang: "Dialog Box Overview",
    moshi: "Mode Selection",
    yemian: "On this page",
    shangyi: "Previous page",
    xiayi: "Next page",
    qiehuanyuyan: "Change language",
    fanhuadingbu: "Return to top",
  },
  ja: {
    mingcheng: "日本語",
    yuyan: "ja-JP",
    zhinan: "ガイド",
    guanyu: "概要",
    lianxi: "お問い合わせ",
    gengxinrizhi: "更新履歴",
    kaishi: "はじめに",
    yuyanshezhi: "言語設定",
    zidingyiapi: "カスタム API",
    tishicishezhi: "プロンプト設定",
    gongnengxuanxiang: "機能オプションの概要",
    gaojicaozuo: "高度な操作",
    duihuakuang: "ダイアログボックスの概要",
    moshi: "モードの選択",
    yemian: "このページの内容",
    shangyi: "前のページ",
    xiayi: "次のページ",
    qiehuanyuyan: "言語を変更",
    fanhuadingbu: "ページの先頭へ戻る",
  },
  ko: {
    mingcheng: "한국어",
    yuyan: "ko-KR",
    zhinan: "가이드",
    guanyu: "소개",
    lianxi: "문의",
    gengxinrizhi: "변경 사항",
    kaishi: "시작하기",
    yuyanshezhi: "언어 설정",
    zidingyiapi: "사용자 지정 API",
    tishicishezhi: "프롬프트 설정",
    gongnengxuanxiang: "기능 옵션 개요",
    gaojicaozuo: "고급 작업",
    duihuakuang: "대화 상자 개요",
    moshi: "모드 선택",
    yemian: "이 페이지에서",
    shangyi: "이전 페이지",
    xiayi: "다음 페이지",
    qiehuanyuyan: "언어 변경",
    fanhuadingbu: "맨 위로 돌아가기",
  },
  es: {
    mingcheng: "Español",
    yuyan: "es-ES",
    zhinan: "Guía",
    guanyu: "Acerca de",
    lianxi: "Contacto",
    gengxinrizhi: "Registro de cambios",
    kaishi: "Primeros pasos",
    yuyanshezhi: "Configuración de idioma",
    zidingyiapi: "API personalizada",
    tishicishezhi: "Configuración de instrucciones",
    gongnengxuanxiang: "Resumen de opciones",
    gaojicaozuo: "Operaciones avanzadas",
    duihuakuang: "Resumen del cuadro de diálogo",
    moshi: "Selección de modo",
    yemian: "En esta página",
    shangyi: "Página anterior",
    xiayi: "Página siguiente",
    qiehuanyuyan: "Cambiar idioma",
    fanhuadingbu: "Volver al inicio",
  },
  "pt-br": {
    mingcheng: "Português (Brasil)",
    yuyan: "pt-BR",
    zhinan: "Guia",
    guanyu: "Sobre",
    lianxi: "Contato",
    gengxinrizhi: "Registro de alterações",
    kaishi: "Primeiros passos",
    yuyanshezhi: "Configurações de idioma",
    zidingyiapi: "API personalizada",
    tishicishezhi: "Configurações de prompt",
    gongnengxuanxiang: "Visão geral das opções",
    gaojicaozuo: "Operações avançadas",
    duihuakuang: "Visão geral da caixa de diálogo",
    moshi: "Seleção de modo",
    yemian: "Nesta página",
    shangyi: "Página anterior",
    xiayi: "Próxima página",
    qiehuanyuyan: "Alterar idioma",
    fanhuadingbu: "Voltar ao início",
  },
  ru: {
    mingcheng: "Русский",
    yuyan: "ru-RU",
    zhinan: "Руководство",
    guanyu: "О проекте",
    lianxi: "Контакты",
    gengxinrizhi: "Журнал изменений",
    kaishi: "Начало работы",
    yuyanshezhi: "Настройки языка",
    zidingyiapi: "Пользовательский API",
    tishicishezhi: "Настройки промпта",
    gongnengxuanxiang: "Обзор параметров",
    gaojicaozuo: "Расширенные операции",
    duihuakuang: "Обзор диалогового окна",
    moshi: "Выбор режима",
    yemian: "На этой странице",
    shangyi: "Предыдущая страница",
    xiayi: "Следующая страница",
    qiehuanyuyan: "Сменить язык",
    fanhuadingbu: "Вернуться наверх",
  },
  "zh-hans": {
    mingcheng: "简体中文",
    yuyan: "zh-CN",
    zhinan: "指南",
    guanyu: "关于",
    lianxi: "联系",
    gengxinrizhi: "更新日志",
    kaishi: "快速开始",
    yuyanshezhi: "语言设置",
    zidingyiapi: "自定义 API",
    tishicishezhi: "提示词设置",
    gongnengxuanxiang: "功能选项概览",
    gaojicaozuo: "高级操作",
    duihuakuang: "对话框概览",
    moshi: "模式选择",
    yemian: "本页内容",
    shangyi: "上一页",
    xiayi: "下一页",
    qiehuanyuyan: "切换语言",
    fanhuadingbu: "返回顶部",
  },
  "zh-hant": {
    mingcheng: "繁體中文",
    yuyan: "zh-TW",
    zhinan: "指南",
    guanyu: "關於",
    lianxi: "聯絡我們",
    gengxinrizhi: "更新日誌",
    kaishi: "快速開始",
    yuyanshezhi: "語言設定",
    zidingyiapi: "自訂 API",
    tishicishezhi: "提示詞設定",
    gongnengxuanxiang: "功能選項總覽",
    gaojicaozuo: "進階操作",
    duihuakuang: "對話方塊總覽",
    moshi: "模式選擇",
    yemian: "本頁內容",
    shangyi: "上一頁",
    xiayi: "下一頁",
    qiehuanyuyan: "切換語言",
    fanhuadingbu: "返回頁首",
  },
};

const jiemianwenben = {
  root: { sousuo: "Search", caidan: "Menu", waiguan: "Appearance", qiehuanliang: "Switch to light theme", qiehuanan: "Switch to dark theme", zhaobudao: "PAGE NOT FOUND", shuoming: "The page you requested could not be found.", shouye: "Take me home" },
  ja: { sousuo: "検索", caidan: "メニュー", waiguan: "外観", qiehuanliang: "ライトテーマに切り替え", qiehuanan: "ダークテーマに切り替え", zhaobudao: "ページが見つかりません", shuoming: "要求されたページは見つかりませんでした。", shouye: "ホームに戻る" },
  ko: { sousuo: "검색", caidan: "메뉴", waiguan: "테마", qiehuanliang: "라이트 테마로 전환", qiehuanan: "다크 테마로 전환", zhaobudao: "페이지를 찾을 수 없습니다", shuoming: "요청한 페이지를 찾을 수 없습니다.", shouye: "홈으로 이동" },
  es: { sousuo: "Buscar", caidan: "Menú", waiguan: "Apariencia", qiehuanliang: "Cambiar al tema claro", qiehuanan: "Cambiar al tema oscuro", zhaobudao: "PÁGINA NO ENCONTRADA", shuoming: "No se encontró la página solicitada.", shouye: "Ir al inicio" },
  "pt-br": { sousuo: "Pesquisar", caidan: "Menu", waiguan: "Aparência", qiehuanliang: "Mudar para o tema claro", qiehuanan: "Mudar para o tema escuro", zhaobudao: "PÁGINA NÃO ENCONTRADA", shuoming: "A página solicitada não foi encontrada.", shouye: "Ir para a página inicial" },
  ru: { sousuo: "Поиск", caidan: "Меню", waiguan: "Оформление", qiehuanliang: "Переключиться на светлую тему", qiehuanan: "Переключиться на тёмную тему", zhaobudao: "СТРАНИЦА НЕ НАЙДЕНА", shuoming: "Запрошенная страница не найдена.", shouye: "На главную" },
  "zh-hans": { sousuo: "搜索", caidan: "菜单", waiguan: "外观", qiehuanliang: "切换到浅色主题", qiehuanan: "切换到深色主题", zhaobudao: "页面未找到", shuoming: "未找到你请求的页面。", shouye: "返回首页" },
  "zh-hant": { sousuo: "搜尋", caidan: "選單", waiguan: "外觀", qiehuanliang: "切換至淺色主題", qiehuanan: "切換至深色主題", zhaobudao: "找不到頁面", shuoming: "找不到你要求的頁面。", shouye: "返回首頁" },
};

function qudelianjie(luyou: string, lujing: string) {
  return luyou === "root" ? lujing : `/${luyou}${lujing}`;
}

function qudebianlan(luyou: string, wenben: yuyanwenben) {
  const lianjie = (lujing: string) => qudelianjie(luyou, lujing);
  const zhinan = [
    { text: wenben.kaishi, link: lianjie("/introduction") },
    { text: wenben.yuyanshezhi, link: lianjie("/settings-page-language-settings") },
    { text: wenben.zidingyiapi, link: lianjie("/custom-api") },
    { text: wenben.tishicishezhi, link: lianjie("/prompt-settings") },
    { text: wenben.gongnengxuanxiang, link: lianjie("/feature-options-overview") },
  ];
  const gaoji = [
    { text: wenben.duihuakuang, link: lianjie("/dialog-box-overview") },
    { text: wenben.moshi, link: lianjie("/mode-selection") },
  ];

  return {
    [lianjie("/about")]: [
      { text: wenben.guanyu, items: [{ text: wenben.guanyu, link: lianjie("/about") }] },
      { text: wenben.kaishi, items: zhinan },
      { text: wenben.gaojicaozuo, items: gaoji },
    ],
    [lianjie("/contact")]: [
      { text: wenben.lianxi, items: [{ text: wenben.lianxi, link: lianjie("/contact") }] },
      { text: wenben.kaishi, items: zhinan },
      { text: wenben.gaojicaozuo, items: gaoji },
    ],
    [lianjie("/changelog")]: [
      { text: wenben.gengxinrizhi, items: [{ text: wenben.gengxinrizhi, link: lianjie("/changelog") }] },
      { text: wenben.kaishi, items: zhinan },
      { text: wenben.gaojicaozuo, items: gaoji },
    ],
    [lianjie("/")]: [
      { text: wenben.kaishi, items: zhinan },
      { text: wenben.gaojicaozuo, items: gaoji },
    ],
  };
}

export function qudezhutipeizhi(luyou: string) {
  const wenben = yuyanwenben[luyou];
  const jiemian = jiemianwenben[luyou as keyof typeof jiemianwenben];
  const lianjie = (lujing: string) => qudelianjie(luyou, lujing);
  const zhinanzhengze = luyou === "root"
    ? "^/(introduction|settings-page-language-settings|custom-api|prompt-settings|feature-options-overview|dialog-box-overview|mode-selection)(/|$)"
    : `^/${luyou}/(introduction|settings-page-language-settings|custom-api|prompt-settings|feature-options-overview|dialog-box-overview|mode-selection)(/|$)`;

  return {
    search: {
      provider: "local",
      options: {
        translations: {
          button: {
            buttonText: jiemian.sousuo,
            buttonAriaLabel: jiemian.sousuo,
          },
          modal: {
            displayDetails: jiemian.sousuo,
            resetButtonTitle: jiemian.sousuo,
            backButtonTitle: jiemian.caidan,
            noResultsText: jiemian.zhaobudao,
            footer: {
              selectText: "↵",
              selectKeyAriaLabel: "Enter",
              navigateText: "↑↓",
              navigateUpKeyAriaLabel: "↑",
              navigateDownKeyAriaLabel: "↓",
              closeText: "Esc",
              closeKeyAriaLabel: "Esc",
            },
          },
        },
      },
    },
    sidebarMenuLabel: jiemian.caidan,
    darkModeSwitchLabel: jiemian.waiguan,
    lightModeSwitchTitle: jiemian.qiehuanliang,
    darkModeSwitchTitle: jiemian.qiehuanan,
    notFound: {
      title: jiemian.zhaobudao,
      quote: jiemian.shuoming,
      linkLabel: jiemian.shouye,
      linkText: jiemian.shouye,
    },
    nav: [
      { text: wenben.zhinan, link: lianjie("/introduction"), activeMatch: zhinanzhengze },
      { text: wenben.guanyu, link: lianjie("/about") },
      { text: wenben.lianxi, link: lianjie("/contact") },
      { text: wenben.gengxinrizhi, link: lianjie("/changelog") },
    ],
    sidebar: qudebianlan(luyou, wenben),
    outline: { label: wenben.yemian },
    docFooter: { prev: wenben.shangyi, next: wenben.xiayi },
    langMenuLabel: wenben.qiehuanyuyan,
    returnToTopLabel: wenben.fanhuadingbu,
  };
}

export const duoyuyanpeizhi = Object.fromEntries(
  Object.entries(yuyanwenben)
    .filter(([luyou]) => luyou !== "root")
    .map(([luyou, wenben]) => [
      luyou,
      {
        label: wenben.mingcheng,
        lang: wenben.yuyan,
        link: `/${luyou}/`,
        themeConfig: qudezhutipeizhi(luyou),
      },
    ])
);
