'use client'

import type { RichCardDefinition } from './catalog'

function notifyCardClick(card: RichCardDefinition) {
  const detail = { cardId: card.id, href: card.href }
  window.dispatchEvent(new CustomEvent('lantern-chatbot:card-click', { detail }))

  if (window.parent !== window) {
    window.parent.postMessage({ source: 'lantern-chatbot', type: 'card-click', ...detail }, '*')
  }
}

export default function ServiceCard({ card }: { card: RichCardDefinition }) {
  return (
    <a
      className="group block w-[238px] shrink-0 snap-start overflow-hidden rounded-2xl border border-[#E8DAC5] bg-white text-left no-underline shadow-[0_8px_24px_rgba(128,84,30,0.10)] transition hover:-translate-y-0.5 hover:border-[#D5B98F] hover:shadow-[0_12px_30px_rgba(128,84,30,0.16)]"
      href={card.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => notifyCardClick(card)}
    >
      <div className="aspect-[16/9] overflow-hidden bg-[#F4E7D4]">
        <img
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          src={card.image}
          alt={card.imageAlt}
          loading="lazy"
        />
      </div>
      <div className="p-3.5">
        <div className="mb-1 text-[10px] font-semibold tracking-[0.14em] text-[#A16D2F]">{card.eyebrow}</div>
        <div className="text-sm font-semibold leading-5 text-[#30281E]">{card.title}</div>
        <p className="mt-1.5 line-clamp-3 text-xs leading-[1.65] text-[#6F6252]">{card.description}</p>
        <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-[#8C5B20]">
          <span>{card.ctaLabel}</span>
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
        </div>
      </div>
    </a>
  )
}
