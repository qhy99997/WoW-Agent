import { createTwoFilesPatch } from 'diff'
import type {
  AgentCardItem,
  AppEvent,
  AppSettings,
  Attachment,
  BackgroundTask,
  FileChange,
  FileNode,
  FilePreview,
  LibraryItem,
  SessionDetail,
  SessionSummary,
  SkillInfo,
  TimelineItem,
  TodoItem,
  ToolItem,
  WowApi
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import { BUILTIN_SKILLS } from '@shared/builtin-skills'

const WORKSPACE = 'C:\\Users\\you\\Documents\\atlas-site'
const uid = (): string => crypto.randomUUID().replace(/-/g, '').slice(0, 16)
const minutes = (value: number): number => Date.now() - value * 60_000
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function summary(session: SessionDetail): SessionSummary {
  const { history, timeline, todos, changes, allowedTools, turnId, ...rest } = session
  void history
  void todos
  void changes
  void allowedTools
  void turnId
  const lastAssistant = [...timeline]
    .reverse()
    .find(
      (item) => item.kind === 'message' && item.role === 'assistant' && item.content.trim()
    )
  const lastUser = [...timeline].reverse().find((item) => item.kind === 'message' && item.role === 'user')
  const preview =
    (lastAssistant?.kind === 'message'
      ? lastAssistant.content
      : lastUser?.kind === 'message'
        ? lastUser.content
        : '') ?? ''
  return {
    ...rest,
    preview: preview.replace(/\s+/g, ' ').trim().slice(0, 140)
  }
}

const TODOS: TodoItem[] = [
  { id: 't1', content: '梳理需求说明和现有资源', status: 'completed', priority: 'high' },
  { id: 't2', content: '构建响应式落地页', status: 'completed', priority: 'high' },
  { id: 't3', content: '接通候补名单表单', status: 'in_progress', priority: 'medium' },
  { id: 't4', content: '在 360 / 768 / 1280 宽度下验证', status: 'pending', priority: 'medium' }
]

const BEFORE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Atlas</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main>
      <h1>Atlas</h1>
      <p>Field notes, everywhere.</p>
    </main>
  </body>
</html>`

const AFTER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Atlas — Field notes, everywhere</title>
    <meta name="description" content="Atlas is a quiet place for the notes you take away from the desk." />
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <header class="nav">
      <a class="brand" href="/">Atlas</a>
      <nav>
        <a href="#why">Why Atlas</a>
        <a href="#waitlist">Early access</a>
      </nav>
    </header>

    <main>
      <section class="hero">
        <p class="eyebrow">A field notebook for the rest of the day</p>
        <h1>Notes that keep up with the world.</h1>
        <p class="lede">
          Capture a thought on a ridge, in a market, or on the train home. Atlas keeps
          the page simple and the details findable.
        </p>
        <form id="waitlist" class="waitlist">
          <label class="sr-only" for="email">Email</label>
          <input id="email" name="email" type="email" placeholder="you@example.com" required />
          <button type="submit">Join the waitlist</button>
        </form>
        <p class="fineprint">No noise. One note when the first build is ready.</p>
      </section>

      <section id="why" class="features">
        <article>
          <span>01</span>
          <h2>Offline first</h2>
          <p>Write on a plane, in a canyon, or in a basement. Sync when you surface.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Built for finding</h2>
          <p>Places, people, and weather attach themselves to every entry.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Yours, quietly</h2>
          <p>No feed, no streak, no growth loop. Just the notebook.</p>
        </article>
      </section>
    </main>

    <footer>
      <span>Atlas</span>
      <span>Field notes, everywhere.</span>
    </footer>
  </body>
</html>`

const BEFORE_CSS = `:root { font-family: system-ui; }
body { margin: 0; background: #f4f1ea; color: #222; }
main { padding: 4rem; }`

const AFTER_CSS = `:root {
  --paper: #f3efe5;
  --ink: #1f1e19;
  --muted: #6c665a;
  --line: rgba(31, 30, 25, 0.14);
  --accent: #c2542f;
  font-family: "Segoe UI", system-ui, sans-serif;
  color-scheme: light;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); }

.nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.5rem clamp(1.25rem, 5vw, 4rem);
  border-bottom: 1px solid var(--line);
}
.brand { font-family: Georgia, serif; font-size: 1.35rem; letter-spacing: -0.02em; }
.nav nav { display: flex; gap: 1.5rem; font-size: 0.82rem; }
.nav a { color: var(--muted); text-decoration: none; }

.hero {
  max-width: 62rem;
  padding: clamp(4rem, 10vw, 8rem) clamp(1.25rem, 5vw, 4rem) 4rem;
}
.eyebrow {
  font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--accent); margin: 0 0 1.2rem;
}
h1 {
  font-family: Georgia, serif; font-weight: 400;
  font-size: clamp(2.8rem, 7vw, 5.6rem); line-height: 1.02;
  letter-spacing: -0.035em; margin: 0 0 1.4rem; max-width: 12ch;
}
.lede { max-width: 34rem; color: var(--muted); font-size: 1.05rem; line-height: 1.7; }

.waitlist { display: flex; gap: 0.6rem; margin-top: 2.2rem; max-width: 30rem; }
.waitlist input {
  flex: 1; min-width: 0; padding: 0.8rem 1rem;
  border: 1px solid var(--line); border-radius: 6px; background: transparent;
  font: inherit; color: var(--ink);
}
.waitlist input:focus { outline: 2px solid var(--accent); outline-offset: 2px; }
.waitlist button {
  padding: 0.8rem 1.1rem; border: 0; border-radius: 6px;
  background: var(--ink); color: var(--paper); font: inherit; cursor: pointer;
}
.fineprint { color: var(--muted); font-size: 0.78rem; margin-top: 0.8rem; }

.features {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px;
  background: var(--line); border-top: 1px solid var(--line);
}
.features article { background: var(--paper); padding: 2rem clamp(1.25rem, 5vw, 4rem); }
.features span { font-size: 0.72rem; color: var(--accent); letter-spacing: 0.1em; }
.features h2 { font-family: Georgia, serif; font-weight: 400; font-size: 1.5rem; margin: 1.4rem 0 0.6rem; }
.features p { color: var(--muted); line-height: 1.65; margin: 0; }

footer {
  display: flex; justify-content: space-between;
  padding: 1.4rem clamp(1.25rem, 5vw, 4rem);
  border-top: 1px solid var(--line); color: var(--muted); font-size: 0.78rem;
}

@media (max-width: 720px) {
  .features { grid-template-columns: 1fr; }
  .waitlist { flex-direction: column; }
  .nav nav { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto !important; }
}`

const BRIEF = `# Atlas 发布简报

## 目标人群
记录田野笔记的人：徒步者、摄影师、城市速写者、研究者。

## 调性
平静、编辑感、略带手作气息。纸张、墨色、一个强调色。

## 必须做到
- 一个明确的操作：加入候补名单。
- 首屏用一句话说明承诺。
- 三个辅助卖点，不要更多。
- 在户外的手机上也能正常使用。

## 避免
- 库存图片。
- 轮播图。
- 增长黑客式措辞（“让你的笔记提升 10 倍”）。
`

const README = `# Atlas site

A small, static launch page for Atlas.

## Run

\`\`\`bash
npm install
npm run dev
\`\`\`

## Structure

- \`index.html\` — the page
- \`styles.css\` — all styling
- \`brief.md\` — the launch brief
`

const APP_TSX = `import { Hero } from './components/Hero'
import { Waitlist } from './components/Waitlist'

export function App() {
  return (
    <main className="shell">
      <Hero />
      <Waitlist />
    </main>
  )
}
`

const PACKAGE_JSON = `{
  "name": "atlas-site",
  "private": true,
  "version": "0.3.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "devDependencies": {
    "vite": "^8.0.0"
  }
}
`

function diff(path: string, before: string, after: string): string {
  return createTwoFilesPatch(path, path, before, after, 'before', 'after', { context: 3 })
}

function changesFor(turnId: string): FileChange[] {
  return [
    {
      id: 'change_html',
      sessionId: 'ses_atlas',
      turnId,
      path: 'index.html',
      kind: 'modify',
      additions: 64,
      deletions: 7,
      before: BEFORE_HTML,
      after: AFTER_HTML,
      truncated: false,
      createdAt: minutes(6)
    },
    {
      id: 'change_css',
      sessionId: 'ses_atlas',
      turnId,
      path: 'styles.css',
      kind: 'modify',
      additions: 78,
      deletions: 2,
      before: BEFORE_CSS,
      after: AFTER_CSS,
      truncated: false,
      createdAt: minutes(5)
    }
  ]
}

function baseSession(overrides: Partial<SessionDetail> & { id: string; title: string }): SessionDetail {
  return {
    workspace: WORKSPACE,
    createdAt: minutes(180),
    updatedAt: minutes(4),
    model: { providerId: 'moonshot', model: 'kimi-latest' },
    permissionMode: 'ask',
    status: 'idle',
    preview: '',
    usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
    contextTokens: 0,
    history: [],
    timeline: [],
    todos: [],
    changes: [],
    allowedTools: [],
    turnId: 'turn_demo',
    ...overrides
  }
}

function createSampleSessions(): SessionDetail[] {
  const turnId = 'turn_demo'
  const changes = changesFor(turnId)
  const exploreCard: AgentCardItem = {
    id: 'agent_card_1',
    kind: 'agent',
    runId: 'agent_explore_1',
    agentType: 'explore',
    description: '梳理现有网站结构',
    status: 'done',
    model: 'kimi-latest',
    toolCount: 2,
    summary:
      '网站是一个静态单页：index.html、styles.css 和 brief.md。没有构建步骤。现有字体是 system-ui；简报要求使用编辑风格的衬线展示字体。',
    createdAt: minutes(14),
    endedAt: minutes(13)
  }
  const timeline: TimelineItem[] = [
    {
      id: 'msg_user_1',
      kind: 'message',
      role: 'user',
      content:
        '为我们的田野笔记应用 Atlas 构建一个发布页。使用 brief.md 中的简报，并保持现有的静态结构。',
      createdAt: minutes(18)
    },
    {
      id: 'msg_assistant_1',
      kind: 'message',
      role: 'assistant',
      model: 'kimi-latest',
      durationMs: 6200,
      content: `我阅读了 \`brief.md\`，并梳理了现有网站。简报要求一个平静、编辑风格的页面，只有一个明确的操作：**加入候补名单**。

计划如下：

1. 保持静态结构，为首屏添加衬线展示字体。
2. 构建双栏首屏，在 720px 以下干净地折叠。
3. 添加三个辅助卖点——离线优先、为查找而生、安静地属于你。
4. 接通候补名单表单，并在 360、768 和 1280 宽度下验证。`,
      createdAt: minutes(18)
    },
    {
      id: 'todo_demo',
      kind: 'todo',
      todos: TODOS,
      createdAt: minutes(17)
    },
    {
      id: 'tool_read_brief',
      kind: 'tool',
      toolCallId: 'call_1',
      name: 'read_file',
      title: '读取 brief.md',
      input: { path: 'brief.md' },
      status: 'success',
      output: `brief.md · 18 行 · 612 B\n\n1→# Atlas 发布简报\n2→\n3→## 目标人群\n...`,
      detail: { path: 'brief.md', preview: BRIEF },
      createdAt: minutes(17),
      startedAt: minutes(17),
      endedAt: minutes(17)
    },
    exploreCard,
    {
      id: 'tool_agent_glob',
      kind: 'tool',
      toolCallId: 'call_2',
      name: 'glob',
      title: '找到 6 个文件',
      input: { pattern: '**/*.{html,css,md}' },
      status: 'success',
      output: 'index.html\nstyles.css\nbrief.md\nREADME.md\npackage.json\nsrc/App.tsx',
      agentId: 'agent_explore_1',
      agentName: '梳理现有网站结构',
      createdAt: minutes(14),
      startedAt: minutes(14),
      endedAt: minutes(14)
    },
    {
      id: 'tool_agent_grep',
      kind: 'tool',
      toolCallId: 'call_3',
      name: 'grep',
      title: '1 处匹配 · waitlist',
      input: { pattern: 'waitlist' },
      status: 'success',
      output: 'brief.md\n  11: - 一个明确的操作：加入候补名单。',
      agentId: 'agent_explore_1',
      agentName: '梳理现有网站结构',
      createdAt: minutes(13),
      startedAt: minutes(13),
      endedAt: minutes(13)
    },
    {
      id: 'tool_write_html',
      kind: 'tool',
      toolCallId: 'call_4',
      name: 'write_file',
      title: '已更新 index.html',
      input: { path: 'index.html' },
      status: 'success',
      output: '已更新 index.html（58 行，2.6 KB；+64 −7）',
      detail: {
        path: 'index.html',
        diff: diff('index.html', BEFORE_HTML, AFTER_HTML),
        additions: 64,
        deletions: 7
      },
      createdAt: minutes(8),
      startedAt: minutes(8),
      endedAt: minutes(8)
    },
    {
      id: 'tool_write_css',
      kind: 'tool',
      toolCallId: 'call_5',
      name: 'write_file',
      title: '已更新 styles.css',
      input: { path: 'styles.css' },
      status: 'success',
      output: '已更新 styles.css（84 行，3.1 KB；+78 −2）',
      detail: {
        path: 'styles.css',
        diff: diff('styles.css', BEFORE_CSS, AFTER_CSS),
        additions: 78,
        deletions: 2
      },
      createdAt: minutes(7),
      startedAt: minutes(7),
      endedAt: minutes(7)
    },
    {
      id: `changes-${turnId}`,
      kind: 'changes',
      turnId,
      files: changes.map((change) => ({
        id: change.id,
        path: change.path,
        kind: change.kind,
        additions: change.additions,
        deletions: change.deletions
      })),
      createdAt: minutes(7)
    },
    {
      id: 'msg_assistant_2',
      kind: 'message',
      role: 'assistant',
      model: 'kimi-latest',
      durationMs: 3400,
      content: `第一版已经出现在画布中。改动了两个文件：

- **index.html** — 新的首屏、候补名单区块和元数据。
- **styles.css** — 编辑风格布局、流式字号、减少动效支持。

我把表单 action 保留为 \`/api/waitlist\`；确认这是正确的端点后，我会接着接通成功状态。`,
      createdAt: minutes(6)
    }
  ]

  const atlas = baseSession({
    id: 'ses_atlas',
    title: '为 Atlas 构建发布页',
    workflowId: 'website',
    updatedAt: minutes(4),
    preview: '第一版已经出现在画布中。改动了两个文件…',
    usage: { inputTokens: 48_210, outputTokens: 7_840, cachedTokens: 21_000 },
    contextTokens: 18_420,
    timeline,
    todos: TODOS,
    changes,
    allowedTools: ['read_file', 'glob', 'grep'],
    turnId
  })

  const auth = baseSession({
    id: 'ses_auth',
    title: '审查认证中间件',
    workflowId: 'code-review',
    createdAt: minutes(1_500),
    updatedAt: minutes(1_440),
    model: { providerId: 'anthropic', model: 'claude-sonnet-4-5' },
    preview: '一个高危问题：刷新令牌没有被轮换…',
    usage: { inputTokens: 21_400, outputTokens: 2_100, cachedTokens: 0 },
    contextTokens: 9_800,
    timeline: [
      {
        id: 'msg_auth_1',
        kind: 'message',
        role: 'user',
        content: '审查 src/auth/session.ts 的安全问题。请以只读方式进行。',
        createdAt: minutes(1_500)
      },
      {
        id: 'msg_auth_2',
        kind: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5',
        durationMs: 9100,
        content: `我阅读了中间件及其调用方。发现一个真实问题，两个次要问题。

**高危 — 刷新令牌在整个生命周期内都可重复使用。**
\`rotateSession()\` 写入了新令牌，却从未让旧令牌失效。被盗的刷新令牌在 30 天内仍然有效。修复方式：在同一事务中撤销旧令牌。

**中危 — cookie 缺少 \`SameSite=Lax\`。**
目前依赖浏览器默认值，不同客户端行为不一致。

**低危 — 错误路径记录了原始令牌。**
应移除 catch 块中的 \`logger.warn({ token })\`。

我没有修改任何文件。`,
        createdAt: minutes(1_440)
      }
    ]
  })

  const metrics = baseSession({
    id: 'ses_metrics',
    title: '清理 Q3 指标数据',
    workflowId: 'data-clean',
    createdAt: minutes(4_300),
    updatedAt: minutes(2_900),
    model: { providerId: 'deepseek', model: 'deepseek-chat' },
    preview: '已规范化 1,284 行；删除 12 条重复记录并记录…',
    usage: { inputTokens: 64_000, outputTokens: 4_200, cachedTokens: 12_000 },
    contextTokens: 24_100,
    timeline: [
      {
        id: 'msg_metrics_1',
        kind: 'message',
        role: 'user',
        content: '清理 q3_metrics.csv，并告诉我改动了什么。',
        createdAt: minutes(4_300)
      },
      {
        id: 'msg_metrics_2',
        kind: 'message',
        role: 'assistant',
        model: 'deepseek-chat',
        content: `完成。清理后的文件是 \`q3_metrics.clean.csv\`。

- 将 1,284 个日期值规范化为 ISO 8601。
- 删除了 12 条完全重复的行。
- 从账户表补全了 34 个缺失地区，另有 6 个标记为 \`unknown\`。
- 审计记录已写入 \`q3_metrics.changes.md\`。`,
        createdAt: minutes(2_900)
      }
    ]
  })

  return [atlas, auth, metrics]
}

const SAMPLE_TREE: FileNode[] = [
  { name: 'src', path: `${WORKSPACE}\\src`, type: 'dir', children: [
    { name: 'components', path: `${WORKSPACE}\\src\\components`, type: 'dir', children: [
      { name: 'Hero.tsx', path: `${WORKSPACE}\\src\\components\\Hero.tsx`, type: 'file', size: 1800 },
      { name: 'Waitlist.tsx', path: `${WORKSPACE}\\src\\components\\Waitlist.tsx`, type: 'file', size: 2200 }
    ] },
    { name: 'App.tsx', path: `${WORKSPACE}\\src\\App.tsx`, type: 'file', size: 420 },
    { name: 'main.tsx', path: `${WORKSPACE}\\src\\main.tsx`, type: 'file', size: 310 }
  ] },
  { name: 'brief.md', path: `${WORKSPACE}\\brief.md`, type: 'file', size: 612 },
  { name: 'index.html', path: `${WORKSPACE}\\index.html`, type: 'file', size: 2640 },
  { name: 'package.json', path: `${WORKSPACE}\\package.json`, type: 'file', size: 190 },
  { name: 'README.md', path: `${WORKSPACE}\\README.md`, type: 'file', size: 280 },
  { name: 'styles.css', path: `${WORKSPACE}\\styles.css`, type: 'file', size: 3100 }
]

const PREVIEWS: Record<string, { content: string; kind: FilePreview['kind']; language: string }> = {
  'brief.md': { content: BRIEF, kind: 'markdown', language: 'markdown' },
  'README.md': { content: README, kind: 'markdown', language: 'markdown' },
  'index.html': { content: AFTER_HTML, kind: 'html', language: 'html' },
  'styles.css': { content: AFTER_CSS, kind: 'text', language: 'css' },
  'package.json': { content: PACKAGE_JSON, kind: 'text', language: 'json' },
  'App.tsx': { content: APP_TSX, kind: 'text', language: 'tsx' },
  'main.tsx': {
    content: `import React from 'react'\nimport { createRoot } from 'react-dom/client'\nimport { App } from './App'\n\ncreateRoot(document.getElementById('root')!).render(<App />)\n`,
    kind: 'text',
    language: 'tsx'
  },
  'Hero.tsx': {
    content: `export function Hero() {\n  return (\n    <section className="hero">\n      <p className="eyebrow">A field notebook</p>\n      <h1>Notes that keep up with the world.</h1>\n    </section>\n  )\n}\n`,
    kind: 'text',
    language: 'tsx'
  },
  'Waitlist.tsx': {
    content: `export function Waitlist() {\n  return (\n    <form action="/api/waitlist" method="post">\n      <input type="email" name="email" required />\n      <button>Join the waitlist</button>\n    </form>\n  )\n}\n`,
    kind: 'text',
    language: 'tsx'
  }
}

const LIBRARY_SEED: LibraryItem[] = [
  {
    id: 'lib_brief',
    title: 'Atlas 发布简报',
    kind: 'note',
    tags: ['atlas', '简报'],
    excerpt: '记录田野笔记的人：徒步者、摄影师、城市速写者、研究者。',
    content: BRIEF,
    sourcePath: `${WORKSPACE}\\brief.md`,
    sourceSessionId: 'ses_atlas',
    createdAt: minutes(30),
    updatedAt: minutes(30)
  },
  {
    id: 'lib_tokens',
    title: 'Atlas 设计令牌',
    kind: 'artifact',
    tags: ['设计', '令牌'],
    excerpt: '纸张、墨色、一个强调色。流式字号从 0.72rem 到 5.6rem。',
    content: `# 设计令牌\n\n\`\`\`css\n--paper: #f3efe5;\n--ink: #1f1e19;\n--muted: #6c665a;\n--accent: #c2542f;\n\`\`\`\n\n页面应该像一本印刷的田野指南：温暖的纸张、充裕的留白、单一衬线展示字体。`,
    sourceSessionId: 'ses_atlas',
    createdAt: minutes(120),
    updatedAt: minutes(60)
  },
  {
    id: 'lib_weekly',
    title: '周报 · 第 45 周',
    kind: 'note',
    tags: ['周报', '团队'],
    excerpt: '交付了 Atlas 发布页初稿。正在等待候补名单端点和文案润色。',
    content: `# 第 45 周\n\n## 已交付\n- Atlas 发布页初稿。\n- 认证审查，发现一个高危问题。\n\n## 下一步\n- 接通候补名单端点。\n- 首屏文案润色。\n\n## 风险\n- 候补名单后端负责人周四前不在。`,
    createdAt: minutes(1_500),
    updatedAt: minutes(1_200)
  }
]

const TASKS_SEED: BackgroundTask[] = [
  {
    id: 'task_build',
    sessionId: 'ses_atlas',
    kind: 'shell',
    label: 'npm run build',
    command: 'npm run build',
    cwd: WORKSPACE,
    status: 'done',
    startedAt: minutes(9),
    endedAt: minutes(8),
    exitCode: 0,
    output: `\n> atlas-site@0.3.0 build\n> vite build\n\nvite v8.0.0 building for production...\n✓ 14 modules transformed.\ndist/index.html                  1.42 kB │ gzip:  0.71 kB\ndist/assets/index-C3j2k1.css     3.10 kB │ gzip:  1.22 kB\n✓ built in 412ms\n`,
    outputPath: 'C:\\Users\\you\\AppData\\Roaming\\WoW Agent\\tasks\\task_build.log'
  },
  {
    id: 'task_test',
    sessionId: 'ses_auth',
    kind: 'shell',
    label: 'npm test -- session',
    command: 'npm test -- session',
    cwd: WORKSPACE,
    status: 'error',
    startedAt: minutes(1_460),
    endedAt: minutes(1_459),
    exitCode: 1,
    output: `\n> atlas-site@0.3.0 test\n> vitest run session\n\n ❯ src/auth/session.test.ts (4 tests | 1 failed)\n   × rotates the refresh token\n     → expected old token to be revoked\n\n Test Files  1 failed (1)\n      Tests  1 failed | 3 passed (4)\n`
  },
  {
    id: 'task_dev',
    sessionId: 'ses_atlas',
    kind: 'shell',
    label: 'npm run dev',
    command: 'npm run dev',
    cwd: WORKSPACE,
    status: 'stopped',
    startedAt: minutes(40),
    endedAt: minutes(20),
    exitCode: -1,
    output: `\n> atlas-site@0.3.0 dev\n> vite\n\n  VITE v8.0.0  ready in 184 ms\n\n  ➜  Local:   http://localhost:5173/\n  ➜  Network: use --host to expose\n\n[cancelled]\n`
  }
]

const CUSTOM_SKILL: SkillInfo = {
  name: 'atlas-brand',
  description: 'Atlas 发布材料的语气和视觉规则。',
  whenToUse: '撰写或设计任何以 Atlas 名义发布的内容时。',
  scope: 'workspace',
  path: `${WORKSPACE}\\.wow\\skills\\atlas-brand\\SKILL.md`,
  body: `# Atlas 品牌\n\n## 语气\n平实、善于观察、从容。短句。不要增长黑客式措辞。\n\n## 视觉\n温暖的纸张、深色墨迹、一个强调色。衬线展示字体，无衬线正文。充裕的留白。\n\n## 绝不\n库存图片、轮播图、感叹号、“10x”。`
}

export function createMockBridge(): WowApi {
  let settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    theme: 'dark',
    defaultWorkspace: WORKSPACE,
    recentWorkspaces: [WORKSPACE, 'C:\\Users\\you\\Documents\\northwind'],
    defaultModel: { providerId: 'moonshot', model: 'kimi-latest' },
    onboarded: true,
    providers: DEFAULT_SETTINGS.providers.map((provider) => {
      if (provider.id === 'moonshot') return { ...provider, enabled: true, apiKeySet: true }
      if (provider.id === 'anthropic') return { ...provider, enabled: true, apiKeySet: true }
      if (provider.id === 'demo') return { ...provider, enabled: true }
      return provider
    })
  }
  let sessions = createSampleSessions()
  let library = [...LIBRARY_SEED]
  let tasks = [...TASKS_SEED]
  const listeners = new Set<(event: AppEvent) => void>()
  const pendingApprovals = new Map<string, (decision: 'allow' | 'allow_always' | 'deny') => void>()
  let activeRun: { sessionId: string; cancelled: boolean } | null = null

  const emit = (event: AppEvent): void => {
    for (const listener of listeners) listener(event)
  }
  const emitSession = (session: SessionDetail): void => {
    session.updatedAt = Date.now()
    emit({ type: 'session:update', session: summary(session) })
  }
  const addItem = (session: SessionDetail, item: TimelineItem): void => {
    session.timeline.push(item)
    emit({ type: 'timeline:add', sessionId: session.id, item })
  }
  const updateItem = (session: SessionDetail, item: TimelineItem): void => {
    emit({ type: 'timeline:update', sessionId: session.id, item })
  }
  const stream = async (
    session: SessionDetail,
    itemId: string,
    text: string,
    active: { cancelled: boolean },
    speed = 14
  ): Promise<void> => {
    const chunks = text.match(/.{1,10}/gs) ?? [text]
    for (const chunk of chunks) {
      if (active.cancelled) return
      await sleep(speed)
      const target = session.timeline.find((item) => item.id === itemId)
      if (target && (target.kind === 'message' || target.kind === 'reasoning')) {
        target.content += chunk
      }
      emit({
        type: 'stream',
        sessionId: session.id,
        id: itemId,
        field: 'content',
        delta: chunk
      })
    }
  }
  const findSession = (id: string): SessionDetail => {
    const session = sessions.find((entry) => entry.id === id)
    if (!session) throw new Error('找不到会话')
    return session
  }

  const simulate = async (
    session: SessionDetail,
    text: string,
    active: { sessionId: string; cancelled: boolean }
  ): Promise<void> => {
    const assistantId = uid()
    try {
      await sleep(320)
      if (active.cancelled) return
      const assistant: TimelineItem = {
        id: assistantId,
        kind: 'message',
        role: 'assistant',
        content: '',
        model: session.model.model,
        createdAt: Date.now()
      }
      addItem(session, assistant)
      await stream(
        session,
        assistantId,
        `收到。我会先检查工作区，然后做满足请求的最小改动。\n\n**计划**\n1. 阅读相关文件。\n2. 起草改动。\n3. 写入并展示 diff。`,
        active
      )
      if (active.cancelled) return

      await sleep(350)
      const todos: TodoItem[] = [
        { id: 'd1', content: '检查工作区', status: 'completed', priority: 'high' },
        { id: 'd2', content: '起草改动', status: 'in_progress', priority: 'high' },
        { id: 'd3', content: '写入文件并验证', status: 'pending', priority: 'medium' }
      ]
      session.todos = todos
      addItem(session, { id: uid(), kind: 'todo', todos, createdAt: Date.now() })
      emitSession(session)

      await sleep(400)
      const readTool: ToolItem = {
        id: uid(),
        kind: 'tool',
        toolCallId: uid(),
        name: 'read_file',
        title: '读取 README.md',
        input: { path: 'README.md' },
        status: 'running',
        createdAt: Date.now(),
        startedAt: Date.now()
      }
      addItem(session, readTool)
      await sleep(650)
      readTool.status = 'success'
      readTool.output = README
      readTool.detail = { path: 'README.md', preview: README }
      readTool.endedAt = Date.now()
      updateItem(session, readTool)

      await sleep(350)
      const writeTool: ToolItem = {
        id: uid(),
        kind: 'tool',
        toolCallId: uid(),
        name: 'write_file',
        title: '写入 index.html',
        input: { path: 'index.html' },
        status: 'running',
        createdAt: Date.now(),
        startedAt: Date.now()
      }
      addItem(session, writeTool)
      await sleep(500)

      const approvalId = uid()
      const approval: TimelineItem = {
        id: uid(),
        kind: 'approval',
        approvalId,
        toolCallId: writeTool.toolCallId,
        toolName: 'write_file',
        input: { path: 'index.html' },
        risk: 'write',
        reason: '此工具可以创建或修改工作区中的文件。',
        status: 'pending',
        createdAt: Date.now()
      }
      addItem(session, approval)
      writeTool.status = 'awaiting_approval'
      updateItem(session, writeTool)

      const decision = await new Promise<'allow' | 'allow_always' | 'deny'>((resolve) => {
        pendingApprovals.set(approvalId, resolve)
      })
      pendingApprovals.delete(approvalId)
      approval.status = decision === 'deny' ? 'denied' : 'allowed'
      approval.decision = decision
      updateItem(session, approval)

      if (active.cancelled) return
      if (decision === 'deny') {
        writeTool.status = 'denied'
        writeTool.output = '用户拒绝了这个工具调用的权限。'
        writeTool.endedAt = Date.now()
        updateItem(session, writeTool)
        const item: TimelineItem = {
          id: uid(),
          kind: 'message',
          role: 'assistant',
          content: '明白 — 我没有改动文件。告诉我你想改什么，我会换个方式尝试。',
          model: session.model.model,
          createdAt: Date.now()
        }
        addItem(session, item)
        return
      }

      writeTool.status = 'success'
      writeTool.output = '已更新 index.html（58 行，2.6 KB；+64 −7）'
      writeTool.detail = {
        path: 'index.html',
        diff: diff('index.html', BEFORE_HTML, AFTER_HTML),
        additions: 64,
        deletions: 7
      }
      writeTool.endedAt = Date.now()
      updateItem(session, writeTool)

      const turnId = uid()
      const change: FileChange = {
        id: uid(),
        sessionId: session.id,
        turnId,
        path: 'index.html',
        kind: 'modify',
        additions: 64,
        deletions: 7,
        before: BEFORE_HTML,
        after: AFTER_HTML,
        truncated: false,
        createdAt: Date.now()
      }
      session.changes.push(change)
      session.turnId = turnId
      addItem(session, {
        id: `changes-${turnId}`,
        kind: 'changes',
        turnId,
        files: [
          { id: change.id, path: change.path, kind: change.kind, additions: 64, deletions: 7 }
        ],
        createdAt: Date.now()
      })
      session.todos = session.todos.map((todo) =>
        todo.status === 'in_progress' ? { ...todo, status: 'completed' } : todo
      )
      const todoCard = session.timeline.find((item) => item.kind === 'todo')
      if (todoCard?.kind === 'todo') {
        todoCard.todos = session.todos
        updateItem(session, todoCard)
      }
      emitSession(session)

      await sleep(300)
      const finalId = uid()
      addItem(session, {
        id: finalId,
        kind: 'message',
        role: 'assistant',
        content: '',
        model: session.model.model,
        createdAt: Date.now()
      })
      await stream(
        session,
        finalId,
        `完成。我已按请求更新了 **index.html**，并在画布中留下了可审查的 diff。\n\n打开 **变更** 查看，或说“继续”，我会接着往下做。`,
        active,
        12
      )
      if (active.cancelled) return
      const final = session.timeline.find((item) => item.id === finalId)
      if (final?.kind === 'message' && final.role === 'assistant') {
        final.durationMs = 2800
        updateItem(session, final)
      }
    } catch {
      // The mock run can be interrupted at any await.
    } finally {
      if (!active.cancelled) {
        session.status = 'idle'
        emitSession(session)
        emit({ type: 'run:state', sessionId: session.id, running: false })
      }
      if (activeRun === active) activeRun = null
    }
  }

  return {
    app: {
      info: async () => ({
        version: '0.1.0 · 浏览器预览',
        electron: 'n/a',
        chrome: 'n/a',
        node: 'n/a',
        platform: 'win32',
        dataDir: 'C:\\Users\\you\\AppData\\Roaming\\WoW Agent'
      }),
      minimize: () => undefined,
      toggleMaximize: () => undefined,
      close: () => undefined,
      openExternal: async (url) => {
        window.open(url, '_blank', 'noopener,noreferrer')
      },
      showItemInFolder: () => undefined,
      pickDirectory: async () => WORKSPACE,
      pickFiles: async () => [],
      openPath: async () => ''
    },
    settings: {
      get: async () => structuredClone(settings),
      update: async (patch) => {
        settings = { ...settings, ...patch }
        emit({ type: 'settings:update', settings: structuredClone(settings) })
        return structuredClone(settings)
      },
      updateProvider: async (patch) => {
        settings.providers = settings.providers.map((provider) =>
          provider.id === patch.id
            ? {
                ...provider,
                ...patch,
                apiKeySet: patch.apiKey ? true : provider.apiKeySet,
                apiKey: undefined
              }
            : provider
        )
        emit({ type: 'settings:update', settings: structuredClone(settings) })
        return structuredClone(settings)
      },
      removeProvider: async (id) => {
        settings.providers = settings.providers.filter((provider) => provider.id !== id)
        emit({ type: 'settings:update', settings: structuredClone(settings) })
        return structuredClone(settings)
      },
      testProvider: async () => ({
        ok: true,
        message: '连接成功。有 3 个可用模型。（浏览器预览）',
        latencyMs: 220,
        models: ['kimi-latest', 'kimi-k2-turbo-preview', 'kimi-k2-0905-preview']
      })
    },
    sessions: {
      list: async () => sessions.map(summary).sort((a, b) => b.updatedAt - a.updatedAt),
      create: async (input) => {
        const created = baseSession({
          id: uid(),
          title: input?.title ?? '新任务',
          workspace: input?.workspace ?? WORKSPACE,
          model: input?.model ?? settings.defaultModel ?? { providerId: 'demo', model: 'wow-demo' },
          permissionMode: input?.permissionMode ?? settings.defaultPermissionMode,
          workflowId: input?.workflowId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        })
        sessions = [created, ...sessions]
        emitSession(created)
        return structuredClone(created)
      },
      get: async (id) => structuredClone(findSession(id)),
      rename: async (id, title) => {
        const session = findSession(id)
        session.title = title
        emitSession(session)
        return summary(session)
      },
      remove: async (id) => {
        sessions = sessions.filter((session) => session.id !== id)
        emit({ type: 'session:removed', sessionId: id })
      },
      setModel: async (id, model) => {
        const session = findSession(id)
        session.model = model
        emitSession(session)
        return summary(session)
      },
      setMode: async (id, mode) => {
        const session = findSession(id)
        session.permissionMode = mode
        emitSession(session)
        return summary(session)
      }
    },
    chat: {
      send: async (input) => {
        const session = findSession(input.sessionId)
        if (activeRun) throw new Error('此会话正在运行中。')
        if (input.workflowId !== undefined) session.workflowId = input.workflowId
        const active = { sessionId: session.id, cancelled: false }
        activeRun = active
        session.status = 'running'
        session.turnId = uid()
        emitSession(session)
        emit({ type: 'run:state', sessionId: session.id, running: true })
        addItem(session, {
          id: uid(),
          kind: 'message',
          role: 'user',
          content: input.text,
          attachments: (input.attachments ?? []).map((attachment: Attachment) => ({
            id: attachment.id,
            name: attachment.name,
            mime: attachment.mime,
            size: attachment.size,
            kind: attachment.kind
          })),
          createdAt: Date.now()
        })
        if (session.title === '新任务' && input.text) {
          session.title = input.text.replace(/\s+/g, ' ').slice(0, 64)
        }
        emitSession(session)
        void simulate(session, input.text, active)
      },
      stop: async (sessionId) => {
        if (activeRun?.sessionId === sessionId) {
          activeRun.cancelled = true
          for (const resolve of pendingApprovals.values()) resolve('deny')
          pendingApprovals.clear()
          const session = findSession(sessionId)
          session.status = 'idle'
          emitSession(session)
          emit({ type: 'run:state', sessionId, running: false })
        }
      },
      respondApproval: async (_sessionId, approvalId, decision) => {
        const resolve = pendingApprovals.get(approvalId)
        if (resolve) resolve(decision.type)
      },
      answerQuestion: async () => undefined,
      compact: async (sessionId) => {
        const session = findSession(sessionId)
        addItem(session, {
          id: uid(),
          kind: 'compaction',
          beforeTokens: 24_800,
          afterTokens: 8_100,
          summary: '已压缩早期探索轮次；保留了简报、决策和文件改动。',
          createdAt: Date.now()
        })
      },
      revertTurn: async (sessionId, turnId) => {
        const session = findSession(sessionId)
        let count = 0
        for (const change of session.changes) {
          if (change.turnId === turnId && !change.reverted) {
            change.reverted = true
            count += 1
          }
        }
        emitSession(session)
        return count
      }
    },
    workspace: {
      tree: async (root) =>
        root.toLowerCase().includes('atlas') ? structuredClone(SAMPLE_TREE) : [],
      preview: async (file) => {
        const name = file.split(/[\\/]/).pop() ?? file
        const entry = PREVIEWS[name]
        return {
          path: file,
          name,
          kind: entry?.kind ?? 'text',
          content: entry?.content ?? `// ${name}\n\n此文件不在浏览器预览示例中。`,
          language: entry?.language ?? 'plaintext',
          size: entry?.content.length ?? 0,
          modifiedAt: Date.now() - 300_000,
          truncated: false
        }
      },
      gitChanges: async () => [
        { id: 'g1', path: 'index.html', kind: 'modify', additions: 64, deletions: 7 },
        { id: 'g2', path: 'styles.css', kind: 'modify', additions: 78, deletions: 2 }
      ]
    },
    library: {
      list: async () => structuredClone(library),
      add: async (input) => {
        const item: LibraryItem = {
          id: uid(),
          title: input.title,
          kind: input.kind,
          tags: input.tags ?? [],
          excerpt: input.content.replace(/\s+/g, ' ').slice(0, 240),
          content: input.content,
          sourcePath: input.sourcePath,
          sourceSessionId: input.sourceSessionId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        library = [item, ...library]
        emit({ type: 'library:update', items: structuredClone(library) })
        return structuredClone(item)
      },
      remove: async (id) => {
        library = library.filter((item) => item.id !== id)
        emit({ type: 'library:update', items: structuredClone(library) })
      }
    },
    skills: {
      list: async () => structuredClone([CUSTOM_SKILL, ...BUILTIN_SKILLS]),
      open: async () => undefined
    },
    tasks: {
      list: async () => structuredClone(tasks),
      stop: async (id) => {
        tasks = tasks.map((task) =>
          task.id === id ? { ...task, status: 'stopped', endedAt: Date.now() } : task
        )
        emit({ type: 'tasks:update', tasks: structuredClone(tasks) })
      }
    },
    changes: {
      list: async (sessionId) => structuredClone(findSession(sessionId).changes)
    },
    onEvent: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
