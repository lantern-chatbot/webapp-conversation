import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildPromptTemplateHtml, escapeHtml } from '../../app/components/welcome/prompt-template-html.ts'

const highlight = text => `<span class='text-gray-800 font-bold'>${text}</span>`

describe('Prompt template HTML', () => {
  it('escapes the five HTML special characters', () => {
    assert.equal(escapeHtml('<b>"A" & \'B\'</b>'), '&lt;b&gt;&quot;A&quot; &amp; &#39;B&#39;&lt;/b&gt;')
    assert.equal(escapeHtml('ご相談ください'), 'ご相談ください')
  })

  it('highlights filled variables and keeps placeholders for empty ones', () => {
    assert.equal(
      buildPromptTemplateHtml('会社名は{{company}}、担当は{{person}}です', { company: 'ランタン', person: '' }),
      `会社名は${highlight('ランタン')}、担当は${highlight('{{person}}')}です`,
    )
    assert.equal(buildPromptTemplateHtml('{{a}}', undefined), highlight('{{a}}'))
    assert.equal(buildPromptTemplateHtml('変数なし', {}), '変数なし')
  })

  it('escapes user input inside the highlight', () => {
    const html = buildPromptTemplateHtml('名前: {{name}}', { name: '<img src=x>"q"&\'s\'' })
    assert.equal(html, `名前: ${highlight('&lt;img src=x&gt;&quot;q&quot;&amp;&#39;s&#39;')}`)
    assert.doesNotMatch(html, /<img/)
  })

  it('escapes the template body around variables', () => {
    const html = buildPromptTemplateHtml('<i>"x"</i> & \'y\' {{v}} <br>', { v: 'ok' })
    assert.equal(html, `&lt;i&gt;&quot;x&quot;&lt;/i&gt; &amp; &#39;y&#39; ${highlight('ok')} &lt;br&gt;`)
  })

  it('does not treat inherited properties as inputs', () => {
    assert.equal(buildPromptTemplateHtml('{{constructor}}', {}), highlight('{{constructor}}'))
  })

  it('produces only the highlight span as markup', () => {
    const html = buildPromptTemplateHtml('<p>{{a}}</p>{{b}}', { a: '<script>', b: '</span><span>' })
    const tags = html.match(/<[^>]*>/g)
    assert.deepEqual(tags, [
      '<span class=\'text-gray-800 font-bold\'>',
      '</span>',
      '<span class=\'text-gray-800 font-bold\'>',
      '</span>',
    ])
  })
})
