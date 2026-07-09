import { memo, useMemo, type MouseEvent, type ReactNode } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { preprocessWikilinks, WIKILINK_SCHEME } from '../utils/chatWikilinks'
import { preProcessMathMarkdown, renderMathToHtml } from '../utils/mathMarkdown'
import { supportsModernRegexFeatures } from '../utils/regexCapabilities'
import { openExternalUrl } from '../utils/url'
import { stripTolariaHiddenMarkdown } from '../utils/tolariaHiddenMarkdown'
import { SafeHtmlSpan } from './SafeMarkup'
import {
  BLOCK_CITATION_SCHEME,
  blockCitationFromHref,
  MALFORMED_BLOCK_CITATION_SCHEME,
  malformedBlockCitationFromHref,
  preprocessBlockCitations,
} from '../paper/blockCitations'
import {
  dispatchBlockCitationNavigation,
  type BlockCitationNavigationRequest,
} from '../paper/blockCitationNavigation'

const MODERN_REGEX_AVAILABLE = supportsModernRegexFeatures()
const REMARK_PLUGINS = MODERN_REGEX_AVAILABLE ? [remarkGfm] : []
const REHYPE_PLUGINS = MODERN_REGEX_AVAILABLE ? [rehypeHighlight] : []
const MATH_INLINE_SCHEME = 'sapientia-math-inline:'
const MATH_BLOCK_SCHEME = 'sapientia-math-block:'
const MATH_INLINE_TOKEN_RE = /@@TOLARIA_MATH_INLINE:([^@]+)@@/g
const MATH_BLOCK_TOKEN_RE = /^@@TOLARIA_MATH_BLOCK:([^@]+)@@$/gm

function durableSyntaxUrlTransform(url: string): string {
  if (url.startsWith(BLOCK_CITATION_SCHEME)) return url
  if (url.startsWith(MALFORMED_BLOCK_CITATION_SCHEME)) return url
  if (url.startsWith(WIKILINK_SCHEME)) return url
  if (url.startsWith(MATH_INLINE_SCHEME)) return url
  if (url.startsWith(MATH_BLOCK_SCHEME)) return url
  return defaultUrlTransform(url)
}

function isExplicitWebUrl(href?: string): href is string {
  const lowerHref = href?.trim().toLowerCase() ?? ''
  return lowerHref.startsWith('http://') || lowerHref.startsWith('https://')
}

function openExplicitWebUrl(event: MouseEvent<HTMLAnchorElement>, href: string) {
  event.preventDefault()
  void openExternalUrl(href).catch((error) => {
    console.warn('[ai] Failed to open external link:', error)
  })
}

function mathMarkdownLink(scheme: string, encodedLatex: string): string {
  return `[math](${scheme}${encodedLatex})`
}

function preprocessMathLinks(content: string): string {
  return preProcessMathMarkdown({ markdown: content })
    .replace(MATH_BLOCK_TOKEN_RE, (_token, encodedLatex: string) => mathMarkdownLink(MATH_BLOCK_SCHEME, encodedLatex))
    .replace(MATH_INLINE_TOKEN_RE, (_token, encodedLatex: string) => mathMarkdownLink(MATH_INLINE_SCHEME, encodedLatex))
}

function latexFromMathHref(href: string, scheme: string): string {
  try {
    return decodeURIComponent(href.slice(scheme.length))
  } catch {
    return href.slice(scheme.length)
  }
}

interface MarkdownContentProps {
  content: string
  onBlockCitationClick?: (target: BlockCitationNavigationRequest) => void
  onWikilinkClick?: (target: string) => void
}

export const MarkdownContent = memo(function MarkdownContent({
  content,
  onBlockCitationClick,
  onWikilinkClick,
}: MarkdownContentProps) {
  const processedContent = useMemo(() => {
    const displayContent = stripTolariaHiddenMarkdown(content)
    const withMathTokens = preprocessMathLinks(displayContent)
    const withBlockCitations = preprocessBlockCitations(withMathTokens)
    return onWikilinkClick ? preprocessWikilinks(withBlockCitations) : withBlockCitations
  }, [content, onWikilinkClick])

  const components = useMemo(() => {
    return {
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        if (href?.startsWith(MATH_INLINE_SCHEME) || href?.startsWith(MATH_BLOCK_SCHEME)) {
          const displayMode = href.startsWith(MATH_BLOCK_SCHEME)
          const scheme = displayMode ? MATH_BLOCK_SCHEME : MATH_INLINE_SCHEME
          const latex = latexFromMathHref(href, scheme)
          return (
            <SafeHtmlSpan
              aria-label={latex}
              className={displayMode ? 'math math--block' : 'math math--inline'}
              data-latex={latex}
              markup={renderMathToHtml({ latex, displayMode })}
            />
          )
        }
        if (href?.startsWith(BLOCK_CITATION_SCHEME)) {
          const target = blockCitationFromHref(href)
          if (!target) return <span className="block-citation block-citation--broken">{children}</span>
          return (
            <a
              ref={(node) => {
                node?.setAttribute('role', 'link')
                node?.setAttribute('tabindex', '0')
              }}
              href={href}
              className="block-citation break-words border-0 bg-transparent p-0 font-medium underline decoration-dotted underline-offset-2"
              data-block-citation-paper-id={target.paperId}
              data-block-citation-block-id={target.blockId}
              onClick={(event) => {
                event.preventDefault()
                const request = {
                  paperId: target.paperId,
                  blockId: target.blockId,
                  label: target.label,
                }
                if (onBlockCitationClick) {
                  onBlockCitationClick(request)
                } else {
                  dispatchBlockCitationNavigation(request)
                }
              }}
            >
              {children}
            </a>
          )
        }
        if (href?.startsWith(MALFORMED_BLOCK_CITATION_SCHEME)) {
          const malformed = malformedBlockCitationFromHref(href)
          return (
            <span
              className="block-citation block-citation--broken break-words rounded-sm border border-amber-500/70 px-1 font-medium text-amber-700 dark:text-amber-300"
              data-block-citation-state="malformed"
              data-block-citation-raw={malformed?.raw}
              data-block-citation-reason={malformed?.reason ?? undefined}
            >
              {children}
            </span>
          )
        }
        if (onWikilinkClick && href?.startsWith(WIKILINK_SCHEME)) {
          const target = decodeURIComponent(href.slice(WIKILINK_SCHEME.length))
          return (
            <a
              ref={(node) => {
                node?.setAttribute('role', 'link')
                node?.setAttribute('tabindex', '0')
              }}
              href={href}
              className="chat-wikilink break-words border-0 bg-transparent p-0"
              data-wikilink-target={target}
              onClick={(event) => {
                event.preventDefault()
                onWikilinkClick(target)
              }}
            >
              {children}
            </a>
          )
        }
        if (isExplicitWebUrl(href)) {
          return <a href={href} className="break-words" onClick={(event) => openExplicitWebUrl(event, href)}>{children}</a>
        }
        return <a href={href} className="break-words">{children}</a>
      },
    }
  }, [onBlockCitationClick, onWikilinkClick])

  return (
    <div className="ai-markdown min-w-0 max-w-full overflow-hidden">
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
        urlTransform={durableSyntaxUrlTransform}
      >
        {processedContent}
      </Markdown>
    </div>
  )
})
