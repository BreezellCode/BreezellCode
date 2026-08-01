import DefaultTheme from "vitepress/theme";
import { getScrollOffset } from "vitepress";
import "viewerjs/dist/viewer.css";
import type kanqitushili from "viewerjs";
import "./custom.css";

type shituguodu = {
  ready: Promise<void>;
};

type keqidongwenjian = Document & {
  startViewTransition?: (gengxin: () => void) => shituguodu;
};

type luyou = {
  onAfterRouteChanged?: (daoda: string) => Promise<void> | void;
};

type yingyongshangxiawen = {
  router?: luyou;
};

const mulugundongshichang = 900;
const mulubiaojizuixiaoshichang = 260;
const mulubiaojizuidashichang = 820;
const shoujimulugengxinjiange = 120;
let tupiankanqishili: kanqitushili | undefined;
let tupiankanqizhunbei: Promise<typeof import("viewerjs")> | undefined;
let tupiankanqirongqi: HTMLElement | undefined;

function qidongzhutiguodu() {
  if (typeof window === "undefined") {
    return;
  }

  const chuangkou = window as Window & {
    __breezell_zhutiguodu_yichushihua__?: boolean;
  };

  if (chuangkou.__breezell_zhutiguodu_yichushihua__) {
    return;
  }

  chuangkou.__breezell_zhutiguodu_yichushihua__ = true;

  let shifouqiehuanzhong = false;
  let shifouhulueyici = false;

  document.addEventListener(
    "click",
    (shijian) => {
      const mubiao = shijian.target;

      if (!(mubiao instanceof Element)) {
        return;
      }

      const anniu = mubiao.closest(".VPSwitchAppearance");
      const wenjian = document as keqidongwenjian;

      if (!(anniu instanceof HTMLButtonElement)) {
        return;
      }

      if (shifouhulueyici) {
        shifouhulueyici = false;
        return;
      }

      if (shifouqiehuanzhong) {
        return;
      }

      if (!wenjian.startViewTransition) {
        return;
      }

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      shijian.preventDefault();
      shijian.stopImmediatePropagation();

      const juzhen = anniu.getBoundingClientRect();
      const hengzuobiao = juzhen.left + juzhen.width / 2;
      const zongzuobiao = juzhen.top + juzhen.height / 2;
      const banjing = Math.hypot(
        Math.max(hengzuobiao, window.innerWidth - hengzuobiao),
        Math.max(zongzuobiao, window.innerHeight - zongzuobiao)
      );

      shifouqiehuanzhong = true;

      const guodu = wenjian.startViewTransition(() => {
        shifouhulueyici = true;
        anniu.click();
      });

      guodu.ready
        .then(() => {
          const kaishi = `circle(0px at ${hengzuobiao}px ${zongzuobiao}px)`;
          const jieshu = `circle(${banjing}px at ${hengzuobiao}px ${zongzuobiao}px)`;

          document.documentElement.animate(
            {
              clipPath: [kaishi, jieshu],
            },
            {
              duration: 1500,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              pseudoElement: "::view-transition-new(root)",
            }
          );
        })
        .finally(() => {
          shifouqiehuanzhong = false;
          shifouhulueyici = false;
        });
    },
    true
  );
}

function qidongsousuoxiaoguo() {
  if (typeof window === "undefined") {
    return;
  }

  const chuangkou = window as Window & {
    __breezell_sousuoxiaoguo_yichushihua__?: boolean;
  };

  if (chuangkou.__breezell_sousuoxiaoguo_yichushihua__) {
    return;
  }

  chuangkou.__breezell_sousuoxiaoguo_yichushihua__ = true;

  const gengxinzhuangtai = () => {
    const sousuokuang = document.querySelector(".VPLocalSearchBox");
    document.body.classList.toggle("sousuokaiqi", Boolean(sousuokuang));
  };

  new MutationObserver(gengxinzhuangtai).observe(document.body, {
    childList: true,
    subtree: true,
  });

  document.addEventListener("click", () => {
    window.requestAnimationFrame(gengxinzhuangtai);
  });

  document.addEventListener("keydown", () => {
    window.requestAnimationFrame(gengxinzhuangtai);
  });

  gengxinzhuangtai();
}

function qidongmulugundong() {
  if (typeof window === "undefined") {
    return;
  }

  const chuangkou = window as Window & {
    __breezell_mulugundong_yichushihua__?: boolean;
  };

  if (chuangkou.__breezell_mulugundong_yichushihua__) {
    return;
  }

  chuangkou.__breezell_mulugundong_yichushihua__ = true;

  let dingshiqi: number | undefined;

  const shezhimulubiaojidonghua = (lianjie: HTMLAnchorElement) => {
    const biaoji = document.querySelector(".VPDocAsideOutline .outline-marker");

    if (!(biaoji instanceof HTMLElement)) {
      return;
    }

    const dangqiandingbu = Number.parseFloat(
      biaoji.style.top || window.getComputedStyle(biaoji).top
    );
    const mubiaodingbu = lianjie.offsetTop + 39;
    const juli = Math.abs(mubiaodingbu - dangqiandingbu);
    const shichang = Math.min(
      mulubiaojizuidashichang,
      Math.max(mulubiaojizuixiaoshichang, juli * 2.5)
    );

    biaoji.style.setProperty("--mulubiaojishichang", `${shichang}ms`);
  };

  document.addEventListener(
    "click",
    (shijian) => {
      const mubiao = shijian.target;

      if (!(mubiao instanceof Element)) {
        return;
      }

      const lianjie = mubiao.closest(".outline-link");

      if (!(lianjie instanceof HTMLAnchorElement) || !lianjie.hash) {
        return;
      }

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      document.documentElement.classList.add("mulugundongzhong");
      shezhimulubiaojidonghua(lianjie);
      window.clearTimeout(dingshiqi);
      dingshiqi = window.setTimeout(() => {
        document.documentElement.classList.remove("mulugundongzhong");
      }, mulugundongshichang);
    },
    true
  );
}

function qidongshoujimuluzhuangtai() {
  if (typeof window === "undefined") {
    return;
  }

  const chuangkou = window as Window & {
    __breezell_shoujimuluzhuangtai_yichushihua__?: boolean;
  };

  if (chuangkou.__breezell_shoujimuluzhuangtai_yichushihua__) {
    return;
  }

  chuangkou.__breezell_shoujimuluzhuangtai_yichushihua__ = true;

  let zuihougengxin = 0;
  let donghuazhen = 0;

  const huoqubiaotiliebiao = () =>
    Array.from(
      document.querySelectorAll<HTMLElement>(".VPDoc :where(h1,h2,h3,h4,h5,h6)")
    ).filter((biaoti) => biaoti.id && biaoti.textContent?.trim());

  const huoqudangqianbiaoti = () => {
    const biaotiliebiao = huoqubiaotiliebiao();

    if (!biaotiliebiao.length) {
      return undefined;
    }

    const pianyi = getScrollOffset() + 4;
    const shifoudibu =
      Math.abs(window.scrollY + window.innerHeight - document.body.offsetHeight) < 1;

    if (shifoudibu) {
      return biaotiliebiao[biaotiliebiao.length - 1];
    }

    return biaotiliebiao.reduce<HTMLElement | undefined>((dangqian, biaoti) => {
      const dingbu = window.scrollY + biaoti.getBoundingClientRect().top;

      if (dingbu > window.scrollY + pianyi) {
        return dangqian;
      }

      return biaoti;
    }, undefined);
  };

  const gengxinanniu = (biaoti: HTMLElement | undefined) => {
    const anniu = document.querySelector(".VPLocalNavOutlineDropdown > button");

    if (!(anniu instanceof HTMLButtonElement)) {
      return;
    }

    const wenbenjiedian = Array.from(anniu.childNodes).find(
      (jiedian) => jiedian.nodeType === Node.TEXT_NODE
    );

    if (!wenbenjiedian) {
      return;
    }

    const morenwenben = anniu.dataset.morenwenben || wenbenjiedian.textContent?.trim() || "";
    anniu.dataset.morenwenben = morenwenben;
    wenbenjiedian.textContent = biaoti
      ? `${biaoti.textContent?.trim() || morenwenben} `
      : `${morenwenben} `;
    anniu.classList.toggle("youxianzai", Boolean(biaoti));
  };

  const gengxinlianjie = (biaoti: HTMLElement | undefined) => {
    const dangqianlianjie = biaoti ? `#${biaoti.id}` : "";

    document
      .querySelectorAll<HTMLAnchorElement>(".VPLocalNavOutlineDropdown .outline-link")
      .forEach((lianjie) => {
        const lianjiehashi = new URL(lianjie.href, window.location.href).hash;
        lianjie.classList.toggle(
          "shoujimuluxuanzhong",
          decodeURIComponent(lianjiehashi) === decodeURIComponent(dangqianlianjie)
        );
      });
  };

  const gengxin = () => {
    const dangqianbiaoti = huoqudangqianbiaoti();
    gengxinanniu(dangqianbiaoti);
    gengxinlianjie(dangqianbiaoti);
  };

  const anpaigengxin = () => {
    const xianzai = Date.now();

    if (xianzai - zuihougengxin < shoujimulugengxinjiange) {
      window.cancelAnimationFrame(donghuazhen);
    }

    donghuazhen = window.requestAnimationFrame(() => {
      zuihougengxin = Date.now();
      gengxin();
    });
  };

  window.addEventListener("scroll", anpaigengxin, { passive: true });
  window.addEventListener("resize", anpaigengxin);
  window.addEventListener("hashchange", anpaigengxin);

  document.addEventListener("click", (shijian) => {
    const mubiao = shijian.target;

    if (mubiao instanceof Element && mubiao.closest(".VPLocalNavOutlineDropdown")) {
      window.setTimeout(anpaigengxin, 0);
    }
  });

  new MutationObserver(anpaigengxin).observe(document.body, {
    childList: true,
    subtree: true,
  });

  anpaigengxin();
}

function qidongtupiankanqi() {
  if (typeof window === "undefined") {
    return;
  }

  const chuangkou = window as Window & {
    __breezell_tupiankanqi_yichushihua__?: boolean;
  };

  if (chuangkou.__breezell_tupiankanqi_yichushihua__) {
    return;
  }

  chuangkou.__breezell_tupiankanqi_yichushihua__ = true;

  let donghuazhen = 0;
  let jiantingshili: MutationObserver | undefined;

  const zhunbeikanqilei = async () => {
    if (!tupiankanqizhunbei) {
      tupiankanqizhunbei = import("viewerjs");
    }

    return tupiankanqizhunbei;
  };

  const keyongtupian = (tupian: HTMLImageElement) =>
    Boolean(tupian.closest(".vp-doc")) &&
    !tupian.closest("a") &&
    !tupian.closest(".viewer-canvas, .viewer-navbar") &&
    Boolean(tupian.currentSrc || tupian.src);

  const chuangjiankanqi = async (rongqi: HTMLElement) => {
    const { default: kanqilei } = await zhunbeikanqilei();

    tupiankanqishili?.destroy();
    tupiankanqirongqi = rongqi;
    tupiankanqishili = new kanqilei(rongqi, {
      backdrop: true,
      button: true,
      className: "breezell-tupiankanqi",
      focus: true,
      initialCoverage: window.innerWidth < 768 ? 0.96 : 0.9,
      keyboard: true,
      loading: true,
      loop: true,
      maxZoomRatio: 6,
      minZoomRatio: 0.2,
      movable: true,
      navbar: 0,
      title: [
        2,
        (tupian: HTMLImageElement) => tupian.alt || "Image preview",
      ],
      toolbar: {
        zoomIn: 1,
        zoomOut: 1,
        oneToOne: 2,
        reset: 1,
        prev: 4,
        next: 4,
        rotateLeft: 4,
        rotateRight: 4,
        flipHorizontal: 4,
        flipVertical: 4,
      },
      tooltip: true,
      transition: true,
      zoomOnTouch: true,
      zoomOnWheel: true,
      zoomRatio: window.innerWidth < 768 ? 0.18 : 0.12,
      zoomable: true,
      toggleOnDblclick: true,
      filter(tupian: HTMLImageElement) {
        return keyongtupian(tupian);
      },
    });
  };

  const gengxin = async () => {
    const rongqi = document.querySelector<HTMLElement>(".VPContent");

    if (!rongqi) {
      tupiankanqishili?.destroy();
      tupiankanqishili = undefined;
      tupiankanqirongqi = undefined;
      return;
    }

    const tupianliebiao = Array.from(rongqi.querySelectorAll<HTMLImageElement>("img")).filter(
      keyongtupian
    );

    if (!tupianliebiao.length) {
      tupiankanqishili?.destroy();
      tupiankanqishili = undefined;
      tupiankanqirongqi = rongqi;
      return;
    }

    if (!tupiankanqishili || tupiankanqirongqi !== rongqi) {
      await chuangjiankanqi(rongqi);
      return;
    }

    tupiankanqishili.update();
  };

  const anpaigengxin = () => {
    window.cancelAnimationFrame(donghuazhen);
    donghuazhen = window.requestAnimationFrame(() => {
      void gengxin();
    });
  };

  let changshicishu = 0;
  const jiantingneirong = () => {
    const rongqi = document.querySelector(".VPContent");

    if (!rongqi && changshicishu < 30) {
      changshicishu += 1;
      window.setTimeout(jiantingneirong, 50);
      return;
    }

    jiantingshili?.disconnect();
    jiantingshili = new MutationObserver(anpaigengxin);
    jiantingshili.observe(rongqi || document.body, {
      childList: true,
      subtree: true,
    });

    anpaigengxin();
  };

  jiantingneirong();
}

function qidongshouyefanyi() {
  if (typeof window === "undefined") {
    return;
  }

  const chuangkou = window as Window & {
    __breezell_shouyefanyi_yichushihua__?: boolean;
  };

  if (chuangkou.__breezell_shouyefanyi_yichushihua__) {
    return;
  }

  chuangkou.__breezell_shouyefanyi_yichushihua__ = true;

  const xuanzeqi = [
    ".biaoqian", ".yingxiong h2", ".miaoshu", ".zhuanniu", ".cianniu",
    ".zhibiaoqu div:nth-child(1) span", ".zhibiaoqu div:nth-child(2) span", ".zhibiaoqu div:nth-child(3) span",
    ".gongzuobiaoti span", ".gongzuobiaoti b", ".renwuliebiao div:nth-child(1) p",
    ".renwuliebiao div:nth-child(2) p", ".renwuliebiao div:nth-child(3) p", ".zhuangtailan span",
    ".zhuangtailan b", ".moshiqu .xiaobiaoti", ".moshiqu h2", ".moshika:nth-child(1) p",
    ".moshika:nth-child(2) p", ".moshika:nth-child(3) p", ".moshika:nth-child(4) p",
    ".moshika:nth-child(5) p", ".moshika:nth-child(6) p",
  ];
  const fanyi: Record<string, string[]> = {
    "ja-JP": ["スイス生まれのエンジニアリング・ワークスペース", "散在するプロジェクトの文脈を、リリース可能な変更へ。", "Breezell はコード、意思決定、ツール、レビューの流れを一つのワークスペースに集約します。チームはコンテキストを切り替えずにプロジェクトを理解し、的確な変更から提供まで進められます。", "はじめる", "公式サイトを見る", "作業モード", "プロジェクトコンテキスト", "ワークスペース", "現在のタスク", "決済フローをリファクタリング", "コントローラー、サービス、スキーマの変更を確認します。", "最小かつ安全な層を修正し、インポートを整理します。", "作業を戻す前に診断結果を確認します。", "コンテキスト接続済み", "エージェント準備完了", "6 つの開発モード", "すべてのタスクに最適な AI ワークフローを選択。", "質問、コードの説明、アイデアのデバッグを対話の中で素早く行えます。", "AI にプロジェクトの確認、ファイル編集、ツール利用、コーディングタスクの完了を任せられます。", "ファイルを変更せずにレビューと診断を行えます。監査やアーキテクチャの確認に最適です。", "複雑なコードに手を加える前に、構造化された実装手順を作成します。", "因果推論とコンテキスト認識を用いて、より深いプロダクトとコードの判断を行います。", "複数の AI チームメイトを連携させ、大規模な機能と並列ワークフローに対応します。"],
    "ko-KR": ["스위스에서 만든 엔지니어링 워크스페이스", "흩어진 프로젝트 컨텍스트를 배포 가능한 변경으로 전환하세요.", "Breezell은 코드, 의사 결정, 도구 및 검토 흐름을 하나의 집중된 워크스페이스에 모읍니다. 팀은 컨텍스트 전환 없이 프로젝트를 이해하고, 정확한 변경을 거쳐 결과를 제공할 수 있습니다.", "시작하기", "웹사이트 방문", "작업 모드", "프로젝트 컨텍스트", "워크스페이스", "현재 작업", "결제 흐름 리팩터링", "컨트롤러, 서비스 및 스키마 변경 사항을 읽습니다.", "가장 작은 안전한 계층을 수정하고 가져오기를 정리합니다.", "작업을 넘기기 전에 진단 결과를 확인합니다.", "컨텍스트 연결됨", "에이전트 준비 완료", "6가지 개발 모드", "모든 작업에 맞는 AI 워크플로를 선택하세요.", "질문하고, 코드를 설명하고, 아이디어를 디버그하며 대화를 빠르게 진행하세요.", "AI가 프로젝트를 검사하고, 파일을 편집하고, 도구를 사용하며 코딩 작업을 완료하도록 하세요.", "파일을 변경하지 않고 검토와 진단을 수행합니다. 감사 및 아키텍처 점검에 적합합니다.", "복잡한 코드를 수정하기 전에 구조화된 구현 경로를 만듭니다.", "인과 추론과 컨텍스트 인식을 사용해 더 깊이 있는 제품 및 코드 결정을 내립니다.", "여러 AI 팀원을 조정하여 대규모 기능과 병렬 워크플로를 처리합니다."],
    "es-ES": ["Espacio de ingeniería creado en Suiza", "Convierte el contexto disperso del proyecto en cambios listos para publicar.", "Breezell reúne código, decisiones, herramientas y ciclos de revisión en un espacio de trabajo enfocado para que los equipos comprendan un proyecto, hagan cambios precisos y pasen de la investigación a la entrega sin cambiar de contexto.", "Comenzar", "Visitar el sitio web", "Modos de trabajo", "Contexto del proyecto", "Espacio de trabajo", "Tarea actual", "Refactorizar el flujo de pagos", "Lee los controladores, servicios y cambios de esquema.", "Corrige la capa segura más pequeña y limpia las importaciones.", "Comprueba los diagnósticos antes de devolver el trabajo.", "Contexto conectado", "Agente preparado", "Seis modos de desarrollo", "Elige el flujo de trabajo de IA adecuado para cada tarea.", "Haz preguntas, explica código, depura ideas y avanza rápidamente mediante la conversación.", "Deja que la IA inspeccione el proyecto, edite archivos, use herramientas y complete tareas de programación.", "Revisa y diagnostica sin cambiar archivos; es ideal para auditorías y revisiones de arquitectura.", "Crea una ruta de implementación estructurada antes de modificar código complejo.", "Usa razonamiento causal y conocimiento del contexto para tomar decisiones más profundas sobre producto y código.", "Coordina varios compañeros de IA para funciones grandes y flujos de trabajo en paralelo."],
    "pt-BR": ["Espaço de engenharia criado na Suíça", "Transforme o contexto disperso do projeto em mudanças prontas para entrega.", "O Breezell reúne código, decisões, ferramentas e ciclos de revisão em um espaço de trabalho focado, para que as equipes entendam um projeto, façam alterações precisas e avancem da investigação à entrega sem trocar de contexto.", "Começar", "Visitar o site", "Modos de trabalho", "Contexto do projeto", "Espaço de trabalho", "Tarefa atual", "Refatorar o fluxo de pagamentos", "Leia controladores, serviços e alterações de esquema.", "Corrija a menor camada segura e limpe as importações.", "Verifique os diagnósticos antes de devolver o trabalho.", "Contexto conectado", "Agente pronto", "Seis modos de desenvolvimento", "Escolha o fluxo de trabalho de IA certo para cada tarefa.", "Faça perguntas, explique código, depure ideias e avance rapidamente pela conversa.", "Deixe a IA inspecionar o projeto, editar arquivos, usar ferramentas e concluir tarefas de programação.", "Revise e diagnostique sem alterar arquivos; ideal para auditorias e verificações de arquitetura.", "Crie um caminho de implementação estruturado antes de alterar código complexo.", "Use raciocínio causal e consciência de contexto para decisões mais profundas de produto e código.", "Coordene vários colegas de IA para recursos grandes e fluxos de trabalho paralelos."],
    "ru-RU": ["Инженерное пространство, созданное в Швейцарии", "Превращайте разрозненный контекст проекта в готовые к выпуску изменения.", "Breezell объединяет код, решения, инструменты и циклы ревью в одном рабочем пространстве, чтобы команды понимали проект, вносили точные изменения и переходили от исследования к результату без переключения контекста.", "Начать", "Открыть сайт", "Режимы работы", "Контекст проекта", "Рабочее пространство", "Текущая задача", "Рефакторинг платёжного потока", "Проверьте контроллеры, сервисы и изменения схемы.", "Исправьте минимальный безопасный слой и очистите импорты.", "Проверьте диагностику перед передачей работы.", "Контекст подключён", "Агент готов", "Шесть режимов разработки", "Выберите подходящий рабочий процесс ИИ для каждой задачи.", "Задавайте вопросы, объясняйте код, отлаживайте идеи и быстро продвигайтесь в диалоге.", "Позвольте ИИ проверить проект, редактировать файлы, использовать инструменты и завершать задачи программирования.", "Проводите ревью и диагностику без изменения файлов — это подходит для аудитов и проверки архитектуры.", "Создайте структурированный путь реализации перед изменением сложного кода.", "Используйте причинное мышление и понимание контекста для более глубоких решений по продукту и коду.", "Координируйте нескольких ИИ-напарников для крупных функций и параллельных процессов."],
    "zh-CN": ["瑞士打造的工程工作空间", "将零散的项目上下文转化为可交付的变更。", "Breezell 将代码、决策、工具和评审流程集中在一个专注的工作空间中，让团队无需切换上下文即可理解项目、进行精准修改，并从调研推进到交付。", "开始使用", "访问网站", "工作模式", "项目上下文", "工作空间", "当前任务", "重构支付流程", "阅读控制器、服务和架构变更。", "修复最小且安全的层，并清理导入。", "交付工作前检查诊断结果。", "上下文已连接", "智能体已就绪", "六种开发模式", "为每项任务选择合适的 AI 工作流。", "提问、解释代码、调试想法，并通过对话快速推进。", "让 AI 检查项目、编辑文件、使用工具并完成编码任务。", "无需修改文件即可评审和诊断，适合审计和架构检查。", "在修改复杂代码前创建结构化的实现路径。", "使用因果推理和上下文感知，做出更深入的产品与代码决策。", "协调多个 AI 队友来处理大型功能和并行工作流。"],
    "zh-TW": ["瑞士打造的工程工作空間", "將零散的專案上下文轉化為可交付的變更。", "Breezell 將程式碼、決策、工具與審查流程集中在一個專注的工作空間中，讓團隊無須切換上下文即可理解專案、進行精準修改，並從研究推進至交付。", "開始使用", "造訪網站", "工作模式", "專案上下文", "工作空間", "目前任務", "重構付款流程", "閱讀控制器、服務與結構描述的變更。", "修正最小且安全的層級，並整理匯入項目。", "交付工作前檢查診斷結果。", "上下文已連線", "代理已就緒", "六種開發模式", "為每項任務選擇合適的 AI 工作流程。", "提問、解釋程式碼、偵錯想法，並透過對話快速推進。", "讓 AI 檢查專案、編輯檔案、使用工具並完成程式設計任務。", "無須修改檔案即可進行審查與診斷，適合稽核及架構檢查。", "在修改複雜程式碼前建立結構化的實作路徑。", "使用因果推理與上下文感知，做出更深入的產品與程式碼決策。", "協調多位 AI 隊友來處理大型功能與平行工作流程。"],
  };

  const gengxin = () => {
    const wenben = fanyi[document.documentElement.lang];

    if (!wenben) {
      return;
    }

    xuanzeqi.forEach((xuanzeqi, suoyin) => {
      const mubiao = document.querySelector(xuanzeqi);
      const yiyi = wenben[suoyin];

      if (mubiao && yiyi) {
        mubiao.textContent = yiyi;
      }
    });
  };

  new MutationObserver(() => {
    window.requestAnimationFrame(gengxin);
  }).observe(document.body, { childList: true, subtree: true });

  window.requestAnimationFrame(gengxin);
}

export default {
  ...DefaultTheme,
  enhanceApp(shangxiawen: unknown) {
    DefaultTheme.enhanceApp?.(shangxiawen as never);
    qidongzhutiguodu();
    qidongsousuoxiaoguo();
    qidongmulugundong();
    qidongshoujimuluzhuangtai();
    qidongtupiankanqi();
    qidongshouyefanyi();
  },
};
