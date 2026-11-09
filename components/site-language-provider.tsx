'use client'

import { Children, cloneElement, createContext, isValidElement, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { translateSiteText, type SiteLanguage } from '@/lib/site-translations'

type SiteLanguageContextValue = {
  language: SiteLanguage
  setLanguage: (language: SiteLanguage) => void
}

const SiteLanguageContext = createContext<SiteLanguageContextValue | null>(null)
const translatableAttributes = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-valuetext',
  'description',
  'errorText',
  'helperText',
  'label',
  'placeholder',
  'title',
])

function localizeNode(node: ReactNode, language: SiteLanguage): ReactNode {
  if (typeof node === 'string') return translateSiteText(node, language)
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'number') return node
  if (Array.isArray(node)) return Children.toArray(node).map((child) => localizeNode(child, language))
  if (!isValidElement(node)) return node
  if (node.type === 'script' || (typeof node.type === 'function' && node.type.name === 'Script')) return node

  const props = node.props as Record<string, unknown>
  const translatedProps: Record<string, unknown> = {}

  for (const [name, value] of Object.entries(props)) {
    if (name === 'children') {
      translatedProps.children = localizeNode(value as ReactNode, language)
    } else if (translatableAttributes.has(name) && typeof value === 'string') {
      translatedProps[name] = translateSiteText(value, language)
    }
  }

  return cloneElement(node as ReactElement<Record<string, unknown>>, translatedProps)
}

export function SiteLanguageProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: SiteLanguage
  children: ReactNode
}) {
  const [language, setLanguageState] = useState<SiteLanguage>(initialLanguage)

  const setLanguage = useCallback((nextLanguage: SiteLanguage) => {
    setLanguageState(nextLanguage)
    document.documentElement.lang = nextLanguage
    document.title = translateSiteText(document.title, nextLanguage)
    document.cookie = `pepecasa_language=${nextLanguage}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`
  }, [])

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage])

  return <SiteLanguageContext.Provider value={value}>{children}</SiteLanguageContext.Provider>
}

export function useSiteLanguage() {
  const context = useContext(SiteLanguageContext)
  if (!context) throw new Error('useSiteLanguage must be used inside SiteLanguageProvider')
  return context
}

export function LocalizedTree({ children }: { children: ReactNode }) {
  const { language } = useSiteLanguage()
  return <>{localizeNode(children, language)}</>
}
