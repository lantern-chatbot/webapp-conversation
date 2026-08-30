export interface RichCardDefinition {
  id: string
  eyebrow: string
  title: string
  description: string
  href: string
  ctaLabel: string
  image: string
  imageAlt: string
}

export const richCardCatalog: Record<string, RichCardDefinition> = {
  'branding': {
    id: 'branding',
    eyebrow: 'BRANDING',
    title: 'ブランド開発・アイデンティティ策定',
    description: '経営の意志を言語化し、企業の核となる思想をかたちにします。',
    href: 'https://lantern-inc.jp/service/branding',
    ctaLabel: 'ブランド開発を見る',
    image: '/rich-cards/branding.svg',
    imageAlt: 'ブランドの核を表現した抽象イラスト',
  },
  'design': {
    id: 'design',
    eyebrow: 'DESIGN',
    title: 'Web・グラフィックデザイン',
    description: 'ブランドを、美しく機能的なWebやグラフィックとして実装します。',
    href: 'https://lantern-inc.jp/service/design',
    ctaLabel: 'デザイン支援を見る',
    image: '/rich-cards/design.svg',
    imageAlt: 'Webとグラフィックデザインを表現した抽象イラスト',
  },
  'e-commerce': {
    id: 'e-commerce',
    eyebrow: 'E-COMMERCE',
    title: 'EC構築・運用支援',
    description: 'Shopifyを中心に、成長を支えるEC事業基盤を構築・運用します。',
    href: 'https://lantern-inc.jp/service/e-commerce',
    ctaLabel: 'EC支援を見る',
    image: '/rich-cards/e-commerce.svg',
    imageAlt: 'オンラインストアを表現した抽象イラスト',
  },
  'marketing': {
    id: 'marketing',
    eyebrow: 'DIGITAL MARKETING',
    title: 'デジタルマーケティング支援',
    description: 'Web・SNSを活用し、戦略設計から集客施策の実行まで支援します。',
    href: 'https://lantern-inc.jp/service/marketing',
    ctaLabel: 'マーケティング支援を見る',
    image: '/rich-cards/marketing.svg',
    imageAlt: 'デジタルマーケティングの成長を表現した抽象イラスト',
  },
  'ai-consulting': {
    id: 'ai-consulting',
    eyebrow: 'AI CONSULTING',
    title: 'AI導入支援',
    description: '生成AIを実務へ組み込み、業務自動化と生産性向上を支援します。',
    href: 'https://lantern-inc.jp/service/ai-consulting',
    ctaLabel: 'AI導入支援を見る',
    image: '/rich-cards/ai-consulting.svg',
    imageAlt: '人とAIの協働を表現した抽象イラスト',
  },
  'training-dx': {
    id: 'training-dx',
    eyebrow: 'TRAINING DX',
    title: 'DX人材育成研修支援',
    description: 'AIとデジタルを使いこなす、自走できる人材とチームを育てます。',
    href: 'https://lantern-inc.jp/service/training-dx',
    ctaLabel: 'DX研修を見る',
    image: '/rich-cards/training-dx.svg',
    imageAlt: '学びとチームの成長を表現した抽象イラスト',
  },
  'casestudy': {
    id: 'casestudy',
    eyebrow: 'CASE STUDY',
    title: '事例と取り組み',
    description: 'LANTERNが伴走したプロジェクトと、具体的な取り組みをご紹介します。',
    href: 'https://lantern-inc.jp/casestudy',
    ctaLabel: '事例を見る',
    image: '/rich-cards/casestudy.svg',
    imageAlt: 'プロジェクト事例を表現した抽象イラスト',
  },
  'company': {
    id: 'company',
    eyebrow: 'WHO WE ARE',
    title: '会社と人',
    description: '札幌を拠点に活動する株式会社LANTERNの会社概要とメンバーです。',
    href: 'https://lantern-inc.jp/company',
    ctaLabel: '会社情報を見る',
    image: '/rich-cards/company.svg',
    imageAlt: 'LANTERNのチームを表現した抽象イラスト',
  },
  'intern': {
    id: 'intern',
    eyebrow: 'INTERNSHIP',
    title: '長期学生インターン',
    description: 'AI・マーケティング・デザインを実務で学ぶ長期インターンです。',
    href: 'https://lantern-inc.jp/intern',
    ctaLabel: '募集要項・応募を見る',
    image: '/rich-cards/intern.svg',
    imageAlt: '学生の学びと挑戦を表現した抽象イラスト',
  },
  'contact': {
    id: 'contact',
    eyebrow: 'CONTACT',
    title: '相談・お問い合わせ',
    description: '具体的な課題が決まっていない段階でも、気軽にご相談いただけます。',
    href: 'https://lantern-inc.jp/contact',
    ctaLabel: '問い合わせフォームを開く',
    image: '/rich-cards/contact.svg',
    imageAlt: '相談から始まる対話を表現した抽象イラスト',
  },
}

const serviceCardIds = ['branding', 'design', 'e-commerce', 'marketing', 'ai-consulting', 'training-dx']
const cardTokenPattern = /\[\[LANTERN_CARD:([a-z0-9-]+)\]\]/gi
const partialCardTokenPattern = /\n?\[\[LANTERN_CARD:[a-z0-9-]*\]?$/i

export function extractRichCards(content: string) {
  const requestedIds: string[] = []
  const markdown = content.replace(cardTokenPattern, (_token, rawId: string) => {
    const id = rawId.toLowerCase()
    requestedIds.push(...(id === 'services' ? serviceCardIds : [id]))
    return ''
  })
    // Dify streams text in chunks. Hide an unfinished control token instead of
    // briefly showing it as plain text while the final characters are arriving.
    .replace(partialCardTokenPattern, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const cards = [...new Set(requestedIds)]
    .map(id => richCardCatalog[id])
    .filter((card): card is RichCardDefinition => !!card)

  return { markdown, cards }
}
