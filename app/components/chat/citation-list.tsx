import type { CitationItem } from './type'

const isSafeUrl = (value?: string) => {
  if (!value) { return false }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  }
  catch {
    return false
  }
}

export default function CitationList({ items }: { items?: CitationItem[] }) {
  if (!items?.length) { return null }

  const uniqueItems = items.filter((item, index, list) => {
    const key = item.document_id || item.document_name
    return list.findIndex(candidate => (candidate.document_id || candidate.document_name) === key) === index
  })

  return (
    <details className="mt-3 rounded-xl border border-[#E8DAC5] bg-white/70 px-3 py-2 text-xs text-[#6F6252]">
      <summary className="cursor-pointer select-none font-medium text-[#7A6549]">
        参照した情報 {uniqueItems.length}件
      </summary>
      <div className="mt-2 space-y-2">
        {uniqueItems.map((item, index) => (
          <div key={item.segment_id || item.document_id || index} className="rounded-lg bg-white px-2.5 py-2">
            {isSafeUrl(item.url)
              ? <a className="font-medium text-[#8C5B20] underline" href={item.url} target="_blank" rel="noopener noreferrer">{item.document_name || `参照情報 ${index + 1}`}</a>
              : <div className="font-medium text-[#4C4032]">{item.document_name || `参照情報 ${index + 1}`}</div>}
            {item.content && <p className="mt-1 line-clamp-3 leading-relaxed text-[#827463]">{item.content}</p>}
          </div>
        ))}
      </div>
    </details>
  )
}
