import type { Workflow } from './types'

/** Starter workflows. Selecting one primes the composer; it never auto-sends. */
export const WORKFLOWS: Workflow[] = [
  {
    id: 'website',
    name: '网站',
    tagline: '设计并交付响应式页面',
    description: '把需求说明和源文件变成一个可用的页面，并排预览效果。',
    prompt:
      '请根据下面的需求构建一个精致的响应式网站。先检查工作区，再列出结构，然后实现并在浏览器中验证。\n\n需求：\n',
    systemHint:
      'You are acting as a product-minded frontend engineer. Prefer clean semantic HTML, modern CSS, and minimal dependencies. Verify the result before finishing.',
    icon: 'globe',
    tint: 'moss'
  },
  {
    id: 'code-review',
    name: '代码审查',
    tagline: '发现真正的问题，而不是吹毛求疵',
    description: '从正确性、安全性和可维护性角度审查工作区改动。',
    prompt:
      '请审查当前工作区中的改动。先阅读 diff 和周边代码，再报告具体缺陷，并附上 file:line 引用，按严重程度排序。除非我要求，否则不要改写任何内容。\n\n重点关注：\n',
    systemHint:
      'Act as a senior reviewer. Evidence over opinion. Do not modify files. If you find no significant issues, say so plainly.',
    icon: 'code',
    tint: 'ocean'
  },
  {
    id: 'research',
    name: '研究简报',
    tagline: '广泛阅读，精确引用',
    description: '收集资料、交叉核对，产出简短的决策简报。',
    prompt:
      '请研究下面的问题。搜索网络、阅读一手资料，产出一份简洁的简报，并让每个论点都有引用支撑。不确定的地方要标注出来，不要猜测。\n\n问题：\n',
    systemHint:
      'You are a careful research analyst. Prefer primary sources. Include a Sources section with URLs. Distinguish fact from inference.',
    icon: 'search',
    tint: 'amber'
  },
  {
    id: 'data-clean',
    name: '数据清理',
    tagline: '让杂乱的数据变得可靠',
    description: '分析 CSV 或表格，修正不一致之处，并记录每一步转换。',
    prompt:
      '请检查工作区中的数据文件并清理它们。先分析数据概况，提出转换方案，然后用一个可复现的小脚本执行，并总结改动了什么。\n\n文件：\n',
    systemHint:
      'Be precise about data transformations. Never silently drop rows. Keep a written audit trail and show before/after counts.',
    icon: 'table',
    tint: 'plum'
  },
  {
    id: 'weekly-report',
    name: '周报',
    tagline: '把活动整理成清晰的进展',
    description: '从笔记和仓库中收集进展，起草一份简洁的状态更新。',
    prompt:
      '请根据下面的材料起草一份周报。按成果而不是活动分组，控制在一页以内，并指出风险和下一步计划。\n\n材料：\n',
    systemHint:
      'Write like a thoughtful teammate: plain language, concrete outcomes, no filler. Ask for missing facts rather than inventing them.',
    icon: 'file-text',
    tint: 'clay'
  },
  {
    id: 'plan',
    name: '规划功能',
    tagline: '先探索、再决策、后实现',
    description: '以计划模式开始：梳理代码库、权衡方案，产出实施计划。',
    prompt:
      '请先规划下面的功能，不要动代码。探索相关文件、识别约束、比较至少两种方案，最后给出分步实施计划。\n\n功能：\n',
    systemHint:
      'Work in read-only plan mode. Do not edit files. Your final answer must be an actionable plan with file references and risks.',
    icon: 'sparkles',
    tint: 'gold'
  }
]

export const getWorkflow = (id?: string): Workflow | undefined =>
  id ? WORKFLOWS.find((workflow) => workflow.id === id) : undefined
