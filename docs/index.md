---
layout: home

head:
  - - meta
    - property: og:type
      content: website
  - - meta
    - property: og:title
      content: Breezell-Doc
  - - meta
    - property: og:description
      content: Breezell is an AI-powered VS Code-compatible editor with Chat, Agent, Analyze, Plan, Entanglement, and Teams modes.
  - - meta
    - property: og:image
      content: https://breezell.com/og-image.png
  - - meta
    - property: og:url
      content: https://breezell.com/
  - - meta
    - name: title
      content: Breezell-Doc
  - - meta
    - name: description
      content: AI-powered code editor IDE with agents, multi-model support, deep codebase understanding, and six powerful development modes.
  - - meta
    - name: twitter:card
      content: summary_large_image
  - - link
    - rel: icon
      type: image/png
      href: /logo-touming-caibian.png
---

<script setup>
import { onMounted } from 'vue'

const shouyewenben = {
  'ja-JP': {
    'Swiss-built engineering workspace': 'スイス生まれのエンジニアリング・ワークスペース',
    'Turn scattered project context into shippable changes.': '散在するプロジェクトの文脈を、リリース可能な変更へ。',
    'Breezell keeps code, decisions, tools, and review loops in one focused workspace, so teams can understand a project, make precise changes, and move from investigation to delivery without switching context.': 'Breezell はコード、意思決定、ツール、レビューの流れを一つのワークスペースに集約します。チームはコンテキストを切り替えずにプロジェクトを理解し、的確な変更から提供まで進められます。',
    'Get Started': 'はじめる',
    'Visit Website': '公式サイトを見る',
    'Work modes': '作業モード',
    'Project context': 'プロジェクトコンテキスト',
    'Workspace': 'ワークスペース',
    'Current task': '現在のタスク',
    'Refactor payment flow': '決済フローをリファクタリング',
    'Read controllers, services, and schema changes.': 'コントローラー、サービス、スキーマの変更を確認します。',
    'Patch the smallest safe layer and clean imports.': '最小かつ安全な層を修正し、インポートを整理します。',
    'Check diagnostics before handing work back.': '作業を戻す前に診断結果を確認します。',
    'Context connected': 'コンテキスト接続済み',
    'Agent ready': 'エージェント準備完了',
    'Six development modes': '6 つの開発モード',
    'Switch to the right AI workflow for every task.': 'すべてのタスクに最適な AI ワークフローを選択。',
    'Ask questions, explain code, debug ideas, and move quickly through conversation.': '質問、コードの説明、アイデアのデバッグを対話の中で素早く行えます。',
    'Let AI inspect the project, edit files, use tools, and complete coding tasks.': 'AI にプロジェクトの確認、ファイル編集、ツール利用、コーディングタスクの完了を任せられます。',
    'Review and diagnose without changing files, ideal for audits and architecture checks.': 'ファイルを変更せずにレビューと診断を行えます。監査やアーキテクチャの確認に最適です。',
    'Create a structured implementation path before touching complex code.': '複雑なコードに手を加える前に、構造化された実装手順を作成します。',
    'Use causal reasoning and context awareness for deeper product and code decisions.': '因果推論とコンテキスト認識を用いて、より深いプロダクトとコードの判断を行います。',
    'Coordinate multiple AI teammates for large features and parallel workflows.': '複数の AI チームメイトを連携させ、大規模な機能と並列ワークフローに対応します。',
  },
}

function fanyishouye() {
  const wenben = shouyewenben[document.documentElement.lang]
  const rongqi = document.querySelector('.shouye')

  if (!wenben || !rongqi) {
    return
  }

  const bianliqi = document.createTreeWalker(rongqi, NodeFilter.SHOW_TEXT)
  const jiedian = []
  let dangqian = bianliqi.nextNode()

  while (dangqian) {
    jiedian.push(dangqian)
    dangqian = bianliqi.nextNode()
  }

  jiedian.forEach((jiedian) => {
    const yuanwen = jiedian.textContent?.trim()
    const yiyi = yuanwen && wenben[yuanwen]

    if (yiyi) {
      jiedian.textContent = yiyi
    }
  })
}

onMounted(() => {
  fanyishouye()
  const yuansu = document.querySelectorAll('.gundongyujiazai')

  if (!('IntersectionObserver' in window)) {
    yuansu.forEach((danxiang) => danxiang.classList.add('yichuxian'))
    return
  }

  const guanchaqi = new IntersectionObserver(
    (xiangmu) => {
      xiangmu.forEach((danxiang) => {
        if (danxiang.isIntersecting) {
          danxiang.target.classList.add('yichuxian')
          guanchaqi.unobserve(danxiang.target)
        }
      })
    },
    { rootMargin: '0px 0px 120px 0px', threshold: 0.08 }
  )

  yuansu.forEach((danxiang) => guanchaqi.observe(danxiang))
})
</script>

<div class="shouye">
<section class="yingxiong gundongyujiazai">
<div class="yingxiongneirong gundongyujiazai">
<p class="biaoqian">Swiss-built engineering workspace</p>
<h1>Breezell</h1>
<h2>Turn scattered project context into shippable changes.</h2>
<p class="miaoshu">Breezell keeps code, decisions, tools, and review loops in one focused workspace, so teams can understand a project, make precise changes, and move from investigation to delivery without switching context.</p>
<div class="caozuoqu">
<a class="anniu zhuanniu" href="/guide">Get Started</a>
<a class="anniu cianniu" href="https://breezell.com" target="_blank" rel="noopener noreferrer">Visit Website</a>
</div>
<div class="zhibiaoqu">
<div><strong>6</strong><span>Work modes</span></div>
<div><strong>Live</strong><span>Project context</span></div>
<div><strong>1</strong><span>Workspace</span></div>
</div>
</div>
<div class="yingxiongshijue gundongyujiazai">
<div class="chanpinchuangkou">
<div class="chuangkoulan"><span></span><span></span><span></span></div>
<div class="gongzuobiaoti"><span>Current task</span><b>Refactor payment flow</b></div>
<div class="renwuliebiao">
<div><span>01</span><p>Read controllers, services, and schema changes.</p></div>
<div><span>02</span><p>Patch the smallest safe layer and clean imports.</p></div>
<div><span>03</span><p>Check diagnostics before handing work back.</p></div>
</div>
<div class="zhuangtailan"><span>Context connected</span><b>Agent ready</b></div>
</div>
</div>
</section>
<section class="moshiqu">
<div class="qubiaoti gundongyujiazai">
<p class="xiaobiaoti">Six development modes</p>
<h2>Switch to the right AI workflow for every task.</h2>
</div>
<div class="kapianwangge">
<div class="moshika gundongyujiazai"><div class="tubiao">C</div><h3>Chat</h3><p>Ask questions, explain code, debug ideas, and move quickly through conversation.</p></div>
<div class="moshika gundongyujiazai"><div class="tubiao">A</div><h3>Agent</h3><p>Let AI inspect the project, edit files, use tools, and complete coding tasks.</p></div>
<div class="moshika gundongyujiazai"><div class="tubiao">R</div><h3>Analyze</h3><p>Review and diagnose without changing files, ideal for audits and architecture checks.</p></div>
<div class="moshika gundongyujiazai"><div class="tubiao">P</div><h3>Plan</h3><p>Create a structured implementation path before touching complex code.</p></div>
<div class="moshika gundongyujiazai"><div class="tubiao">E</div><h3>Entanglement</h3><p>Use causal reasoning and context awareness for deeper product and code decisions.</p></div>
<div class="moshika gundongyujiazai"><div class="tubiao">T</div><h3>Teams</h3><p>Coordinate multiple AI teammates for large features and parallel workflows.</p></div>
</div>
</section>
</div>

<style>
:deep(.VPHome) {
  padding-bottom: 0;
}

.shouye {
  position: relative;
  max-width: 1180px;
  margin: 0 auto;
  padding: 72px 24px 40px;
  overflow: hidden;
}

.gundongyujiazai {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 0.64s ease, transform 0.64s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: opacity, transform;
}

.gundongyujiazai.yichuxian {
  opacity: 1;
  transform: translateY(0);
}

.yingxiongneirong.gundongyujiazai {
  transition-delay: 0.08s;
}

.yingxiongshijue.gundongyujiazai {
  transition-delay: 0.18s;
}

.kapianwangge .gundongyujiazai:nth-child(2) {
  transition-delay: 0.06s;
}

.kapianwangge .gundongyujiazai:nth-child(3) {
  transition-delay: 0.12s;
}

.kapianwangge .gundongyujiazai:nth-child(4) {
  transition-delay: 0.18s;
}

.kapianwangge .gundongyujiazai:nth-child(5) {
  transition-delay: 0.24s;
}

.kapianwangge .gundongyujiazai:nth-child(6) {
  transition-delay: 0.3s;
}

@media (prefers-reduced-motion: reduce) {
  .gundongyujiazai {
    opacity: 1;
    transform: none;
    transition: none;
    will-change: auto;
  }
}

.yingxiong {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.04fr) minmax(360px, 0.96fr);
  gap: 52px;
  align-items: center;
  min-height: 560px;
  padding: 68px;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider), transparent 18%);
  border-radius: 16px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--vp-c-divider), transparent 72%) 1px, transparent 1px),
    linear-gradient(0deg, color-mix(in srgb, var(--vp-c-divider), transparent 78%) 1px, transparent 1px),
    var(--vp-c-bg-soft);
  background-size: 42px 42px, 42px 42px, auto;
  box-shadow: 0 22px 70px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.yingxiongneirong,
.yingxiongshijue {
  position: relative;
  z-index: 1;
}

.biaoqian,
.xiaobiaoti {
  display: inline-flex;
  margin: 0 0 18px;
  padding: 8px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: color-mix(in srgb, var(--vp-c-bg), transparent 8%);
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.yingxiong h1 {
  margin: 0 0 12px;
  color: var(--vp-c-text-1);
  font-size: clamp(56px, 8vw, 96px);
  line-height: 0.92;
  font-weight: 900;
  letter-spacing: -0.08em;
  text-wrap: balance;
}

.yingxiong h2 {
  max-width: 690px;
  margin: 0 0 22px;
  color: var(--vp-c-text-1);
  font-size: clamp(34px, 4.8vw, 60px);
  line-height: 1.04;
  font-weight: 900;
  letter-spacing: -0.06em;
  text-wrap: balance;
}

.miaoshu {
  max-width: 620px;
  margin: 0 0 32px;
  color: var(--vp-c-text-2);
  font-size: 18px;
  line-height: 1.85;
}

.caozuoqu {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 34px;
}

.anniu {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  min-width: 132px;
  min-height: 46px;
  padding: 0 24px;
  border-radius: 16px;
  font-size: 15px;
  font-weight: 900;
  text-decoration: none !important;
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
}

.zhuanniu {
  border: 1px solid var(--vp-c-brand-1) !important;
  background: var(--vp-c-brand-1) !important;
  color: #ffffff !important;
  box-shadow: 0 12px 28px rgba(77, 103, 255, 0.22);
}

.cianniu {
  border: 1px solid var(--vp-c-divider) !important;
  background: var(--vp-c-bg) !important;
  color: var(--vp-c-text-1) !important;
}

.anniu:hover {
  transform: translateY(-2px);
  text-decoration: none !important;
}

.zhibiaoqu {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  max-width: 540px;
}

.zhibiaoqu div {
  padding: 16px 18px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg);
}

.zhibiaoqu strong {
  display: block;
  color: var(--vp-c-text-1);
  font-size: 27px;
  line-height: 1;
  font-weight: 900;
}

.zhibiaoqu span {
  display: block;
  margin-top: 8px;
  color: var(--vp-c-text-2);
  font-size: 13px;
  font-weight: 700;
}

.yingxiongshijue {
  display: flex;
  justify-content: center;
}

.chanpinchuangkou {
  width: min(100%, 440px);
  padding: 18px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: color-mix(in srgb, var(--vp-c-bg), transparent 2%);
  box-shadow: 0 22px 60px rgba(15, 23, 42, 0.12);
}

.chuangkoulan {
  display: flex;
  gap: 8px;
  margin-bottom: 22px;
}

.chuangkoulan span {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #ff7340;
}

.chuangkoulan span:nth-child(2) {
  background: #ffd166;
}

.chuangkoulan span:nth-child(3) {
  background: #8ce99a;
}

.gongzuobiaoti {
  padding: 18px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg-soft);
}

.gongzuobiaoti span,
.zhuangtailan span {
  display: block;
  margin-bottom: 7px;
  color: var(--vp-c-text-3);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.gongzuobiaoti b {
  display: block;
  color: var(--vp-c-text-1);
  font-size: 24px;
  line-height: 1.12;
}

.renwuliebiao {
  display: grid;
  gap: 10px;
  margin: 14px 0;
}

.renwuliebiao div {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider), transparent 20%);
  border-radius: 16px;
  background: var(--vp-c-bg);
}

.renwuliebiao span {
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 900;
}

.renwuliebiao p {
  margin: 0;
  color: var(--vp-c-text-2);
  line-height: 1.55;
}

.zhuangtailan {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 16px;
  background: color-mix(in srgb, var(--vp-c-brand-1), transparent 91%);
}

.zhuangtailan span {
  margin: 0;
}

.zhuangtailan b {
  color: var(--vp-c-text-1);
  white-space: nowrap;
}

.moshiqu {
  padding-top: 86px;
}

.moshiqu h2 {
  max-width: 720px;
  margin: 0 0 34px;
  color: var(--vp-c-text-1);
  font-size: clamp(30px, 4vw, 46px);
  line-height: 1.12;
  font-weight: 900;
  letter-spacing: -0.05em;
}

.kapianwangge {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.moshika {
  min-height: 214px;
  padding: 28px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 26px;
  background: var(--vp-c-bg-soft);
  transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
}

.moshika:hover {
  transform: translateY(-4px);
  border-color: rgba(154, 167, 255, 0.55);
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.14);
}

.tubiao {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin-bottom: 22px;
  border-radius: 16px;
  background: rgba(154, 167, 255, 0.14);
  color: #8797ff;
  font-size: 20px;
  font-weight: 900;
}

.moshika h3 {
  margin: 0 0 10px;
  color: var(--vp-c-text-1);
  font-size: 23px;
  line-height: 1.2;
  font-weight: 900;
}

.moshika p {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 15px;
  line-height: 1.75;
}

@media (max-width: 960px) {
  .shouye {
    padding-top: 42px;
  }

  .yingxiong {
    grid-template-columns: 1fr;
    padding: 46px;
  }

  .yingxiongshijue {
    justify-content: flex-start;
  }

  .kapianwangge {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .shouye {
    padding: 28px 18px 78px;
  }

  .yingxiong {
    min-height: auto;
    padding: 30px 22px;
    border-radius: 28px;
  }

  .miaoshu {
    font-size: 16px;
  }

  .caozuoqu,
  .zhibiaoqu {
    grid-template-columns: 1fr;
  }

  .anniu {
    width: 100%;
  }

  .kapianwangge {
    grid-template-columns: 1fr;
  }
}
</style>