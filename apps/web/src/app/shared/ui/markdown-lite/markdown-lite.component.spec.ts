import { TestBed } from '@angular/core/testing'
import { MarkdownLiteComponent } from './markdown-lite.component'

describe('MarkdownLiteComponent', () => {
  async function render(source: string): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(MarkdownLiteComponent)
    fixture.componentRef.setInput('source', source)
    await fixture.whenStable()
    return fixture.nativeElement as HTMLElement
  }

  it('test_paragraphs_and_strong_text_render_as_elements', async () => {
    const root = await render('Spending stayed **below income**.\n\nA second thought.')

    const paragraphs = [...root.querySelectorAll('p')].map((p) => p.textContent?.trim())
    expect(paragraphs).toEqual(['Spending stayed below income.', 'A second thought.'])
    expect(root.querySelector('strong')?.textContent).toBe('below income')
  })

  it('test_dash_lines_render_as_a_list', async () => {
    const root = await render('- one\n- **two**')

    const items = [...root.querySelectorAll('ul > li')].map((li) => li.textContent?.trim())
    expect(items).toEqual(['one', 'two'])
    expect(root.querySelector('li strong')?.textContent).toBe('two')
  })

  it('test_raw_html_is_shown_as_text_and_never_becomes_markup', async () => {
    const root = await render('<img src=x onerror="alert(1)"> <b>bold</b> <script>x()</script>')

    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('b')).toBeNull()
    expect(root.querySelector('script')).toBeNull()
    expect(root.textContent).toContain('<img src=x onerror="alert(1)"> <b>bold</b>')
  })
})
