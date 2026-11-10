import { useEffect, useState } from 'react'
import type { ThemeMode } from '@shared/types'

export function useSystemDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent): void => setDark(event.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])
  return dark
}

export function useResolvedTheme(theme?: ThemeMode): 'light' | 'dark' {
  const systemDark = useSystemDark()
  if (!theme || theme === 'system') return systemDark ? 'dark' : 'light'
  return theme
}
