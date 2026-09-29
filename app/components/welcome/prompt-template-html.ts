// Builds the HTML rendered by PromptTemplate (via dangerouslySetInnerHTML).
// Every piece of text, both the template body and user inputs, is escaped so
// that only the highlight <span> produced here is interpreted as markup.
// Keep this file free of `@/` imports so it can be unit tested with node --test.

const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  '\'': '&#39;',
}

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, char => HTML_ESCAPES[char])

const HIGHLIGHT_CLASS = 'text-gray-800 font-bold'

const resolveInput = (inputs: Record<string, unknown> | undefined, key: string): string | undefined => {
  if (!inputs || !Object.prototype.hasOwnProperty.call(inputs, key)) { return undefined }
  const value = inputs[key]
  // Same as before: falsy values fall back to the {{placeholder}}.
  if (!value) { return undefined }
  return String(value)
}

export const buildPromptTemplateHtml = (
  template: string,
  inputs: Record<string, unknown> | undefined,
): string => {
  let html = ''
  let lastIndex = 0
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    const [placeholder, key] = match
    const index = match.index ?? 0
    html += escapeHtml(template.slice(lastIndex, index))
    const text = resolveInput(inputs, key) ?? placeholder
    html += `<span class='${HIGHLIGHT_CLASS}'>${escapeHtml(text)}</span>`
    lastIndex = index + placeholder.length
  }
  html += escapeHtml(template.slice(lastIndex))
  return html
}
