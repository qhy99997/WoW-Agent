import { Code2, FileText, Globe, Search, Sparkles, Table2 } from 'lucide-react'
import type { Workflow } from '@shared/types'

export const WORKFLOW_ICONS = {
  globe: Globe,
  code: Code2,
  search: Search,
  table: Table2,
  'file-text': FileText,
  sparkles: Sparkles
} satisfies Record<Workflow['icon'], typeof Globe>
