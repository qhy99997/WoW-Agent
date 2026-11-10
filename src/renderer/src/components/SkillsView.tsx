import { useMemo, useState } from 'react'
import { BookOpen, FolderOpen, Sparkles, X } from 'lucide-react'
import type { SkillInfo } from '@shared/types'
import { api } from '../lib/bridge'
import { useAppStore } from '../store/app'
import { CodeBlock } from './CodeBlock'
import { Markdown } from './Markdown'

const SCOPES = [
  { id: 'all', label: '全部' },
  { id: 'builtin', label: '内置' },
  { id: 'workspace', label: '工作区' },
  { id: 'user', label: '用户' }
] as const

const SCOPE_LABEL: Record<string, string> = {
  builtin: '内置',
  workspace: '工作区',
  user: '用户'
}

const SKILL_EXAMPLE = `---
name: weekly-report
description: 把仓库活动整理成简洁的状态更新。
whenToUse: 周五下午，或利益相关者询问进展时。
---

# 周报

1. 阅读最近七天的提交和已合并的 PR。
2. 按成果分组，而不是按活动分组。
3. 控制在一页以内。指出风险和下一步计划。
`

export function SkillsView() {
  const skills = useAppStore((state) => state.skills)
  const appInfo = useAppStore((state) => state.appInfo)
  const [scope, setScope] = useState<(typeof SCOPES)[number]['id']>('all')
  const [selected, setSelected] = useState<SkillInfo | null>(null)

  const filtered = useMemo(
    () => (scope === 'all' ? skills : skills.filter((skill) => skill.scope === scope)),
    [skills, scope]
  )

  const skillsDir = appInfo
    ? `${appInfo.dataDir}${appInfo.platform === 'win32' ? '\\' : '/'}skills`
    : ''

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">
            <Sparkles size={12} /> 扩展
          </div>
          <h1 className="page-title">技能</h1>
          <p className="page-sub">
            agent 可按需加载的 Markdown 指令包。项目技能位于
            <code className="inline-code"> .wow/skills</code>。
          </p>
        </div>
        <div className="page-actions">
          <div className="segmented">
            {SCOPES.map((entry) => (
              <button
                key={entry.id}
                className={scope === entry.id ? 'active' : ''}
                onClick={() => setScope(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <button
            className="btn"
            onClick={() => skillsDir && void api.app.openPath(skillsDir)}
            title="打开用户技能文件夹"
          >
            <FolderOpen size={14} /> 打开文件夹
          </button>
        </div>
      </header>

      <div className="page-scroll">
        <div className="skills-layout">
          <div className="skills-grid">
            {filtered.map((skill) => (
              <button
                key={skill.name}
                className="skill-card animate-rise"
                onClick={() => setSelected(skill)}
              >
                <div className="skill-card-top">
                  <span className="skill-icon">
                    <BookOpen size={15} />
                  </span>
                  <span className={`scope-badge ${skill.scope}`}>
                    {SCOPE_LABEL[skill.scope] ?? skill.scope}
                  </span>
                </div>
                <span className="skill-name">{skill.name}</span>
                <span className="skill-description">{skill.description}</span>
                {skill.whenToUse ? (
                  <span className="skill-when">适用场景：{skill.whenToUse}</span>
                ) : null}
              </button>
            ))}
          </div>

          <aside className="skill-guide">
            <div className="skill-guide-head">
              <Sparkles size={14} />
              <span>添加技能</span>
            </div>
            <p>
              在 <code className="inline-code">.wow/skills/</code> 下创建一个文件夹，并放入
              <code className="inline-code"> SKILL.md</code>。前置元数据会告诉 agent 何时使用它；
              正文只会在需要时加载。
            </p>
            <CodeBlock code={SKILL_EXAMPLE} language="markdown" filename="SKILL.md" />
            <button
              className="btn btn-sm"
              onClick={() => skillsDir && void api.app.openPath(skillsDir)}
            >
              <FolderOpen size={13} /> 用户技能文件夹
            </button>
          </aside>
        </div>
      </div>

      {selected ? (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <div className="modal skill-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <span className={`scope-badge ${selected.scope}`}>
                  {SCOPE_LABEL[selected.scope] ?? selected.scope}
                </span>
                <h2>{selected.name}</h2>
                <div className="modal-sub">{selected.description}</div>
              </div>
              <button className="icon-btn" onClick={() => setSelected(null)} title="关闭">
                <X size={16} />
              </button>
            </header>
            <div className="skill-modal-body">
              <Markdown>{selected.body}</Markdown>
            </div>
            <footer className="modal-foot">
              <span className="mono faint truncate">{selected.path}</span>
              <div className="spacer" />
              {selected.scope !== 'builtin' ? (
                <button
                  className="btn btn-sm"
                  onClick={() => void api.app.openPath(selected.path)}
                >
                  <FolderOpen size={13} /> 打开文件
                </button>
              ) : null}
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
