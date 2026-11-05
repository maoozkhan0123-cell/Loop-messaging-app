import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatMessage } from './formatMessage'

const html = (body: string) => render(<div>{formatMessage(body)}</div>).container.innerHTML

describe('formatMessage', () => {
  it('renders inline formatting', () => {
    const out = html('**bold** _italic_ ~~gone~~ `code` [site](https://example.com)')
    expect(out).toContain('<strong class="font-bold">bold</strong>')
    expect(out).toContain('<em>italic</em>')
    expect(out).toContain('<s>gone</s>')
    expect(out).toContain('>code</code>')
    expect(out).toContain('href="https://example.com"')
  })

  it('renders lists, quotes and code blocks', () => {
    const out = html('- one\n- two\n1. first\n> quoted\n```\nconst a = 1\n```')
    expect(out).toContain('<li>one</li><li>two</li>')
    expect(out).toContain('<ol start="1"')
    expect(out).toContain('<blockquote')
    expect(out).toContain('const a = 1</pre>')
  })

  it('highlights @mentions, and mentions of the reader differently', () => {
    const out = render(<div>{formatMessage('Hi @Ali Khan and @Sara, mail a@Bytechsol.com', { me: 'Sara' })}</div>).container.innerHTML
    expect(out).toContain('text-[#1D6FD6]">@Ali Khan</span>')
    expect(out).toContain('bg-amber-100')
    expect(out).toContain('>@Sara</span>')
    expect(out).not.toContain('>@Bytechsol.com</span>')
  })

  it('does not turn unsafe links into hrefs', () => {
    expect(html('[x](javascript:alert(1))')).not.toContain('href="javascript')
  })
})
