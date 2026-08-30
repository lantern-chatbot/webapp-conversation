import StreamdownMarkdown from '@/app/components/base/streamdown-markdown'
import { extractRichCards } from './catalog'
import ServiceCard from './service-card'

export default function RichAnswer({ content }: { content: string }) {
  const { markdown, cards } = extractRichCards(content)

  return (
    <>
      {markdown && <StreamdownMarkdown content={markdown} />}
      {cards.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 text-[11px] font-medium tracking-wide text-[#8A7A67]">関連情報</div>
          <div className="flex snap-x gap-3 overflow-x-auto pb-2 pr-2 [scrollbar-width:thin]">
            {cards.map(card => <ServiceCard key={card.id} card={card} />)}
          </div>
        </div>
      )}
    </>
  )
}
