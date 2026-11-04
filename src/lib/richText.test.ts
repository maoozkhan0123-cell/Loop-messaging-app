import { describe, expect, it } from 'vitest'
import { htmlToMarkdown, markdownToHtml } from './richText'

const fromHtml = (html: string) => {
  const root = document.createElement('div')
  root.innerHTML = html
  return htmlToMarkdown(root)
}

describe('richText', () => {
  it('reads browser formatting as markdown', () => {
    expect(fromHtml('hello <b>bold</b> <i>it</i> <strike>gone</strike>')).toBe('hello **bold** _it_ ~~gone~~')
    expect(fromHtml('<b>bold </b>next')).toBe('**bold** next')
    expect(fromHtml('first<div>second</div><div><br></div><div>fourth</div>')).toBe('first\nsecond\n\nfourth')
    expect(fromHtml('<ul><li>one</li><li>two</li></ul><ol><li>a</li></ol>')).toBe('- one\n- two\n1. a')
    expect(fromHtml('<blockquote>quoted</blockquote><pre>const a = 1</pre>')).toBe('> quoted\n```\nconst a = 1\n```')
    expect(fromHtml('use <code>npm</code>​ now <a href="https://x.dev">site</a>')).toBe('use `npm` now [site](https://x.dev)')
  })

  it('round-trips stored markdown through the editor', () => {
    const markdown = '**bold** and _italic_\n- one\n- two\n> quote\n```\ncode\n```'
    expect(fromHtml(markdownToHtml(markdown))).toBe(markdown)
  })

  it('escapes html in drafts', () => {
    expect(markdownToHtml('<img src=x onerror=alert(1)>')).not.toContain('<img')
  })
})
