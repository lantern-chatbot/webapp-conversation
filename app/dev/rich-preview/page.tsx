import { notFound } from 'next/navigation'
import CitationList from '@/app/components/chat/citation-list'
import RichAnswer from '@/app/components/chat/rich-content'

export default function RichPreviewPage() {
  if (process.env.NODE_ENV !== 'development') { notFound() }

  return (
    <main className="min-h-screen bg-[#F7F1E8] px-4 py-10 text-[#30281E]">
      <div className="mx-auto max-w-md rounded-3xl border border-[#E8DAC5] bg-[#FFFDF9] p-5 shadow-xl">
        <div className="mb-4 text-xs font-semibold tracking-[0.16em] text-[#A16D2F]">LANTERN RICH ANSWER PREVIEW</div>
        <RichAnswer content={'LANTERNでは、事業や組織の課題に合わせて複数の領域を横断して支援しています。\n\n[サービス一覧を見る](https://lantern-inc.jp/service)\n\n[[LANTERN_CARD:services]]'} />
        <CitationList items={[{
          content: 'LANTERNのサービス概要を参照しました。',
          data_source_type: 'upload_file',
          dataset_id: 'preview-dataset',
          dataset_name: 'LANTERN公式サイト',
          document_id: 'preview-document',
          document_name: 'LANTERN サービス情報',
          hit_count: 1,
          index_node_hash: 'preview-index',
          score: 1,
          segment_id: 'preview-segment',
          segment_position: 1,
          url: 'https://lantern-inc.jp/service',
          word_count: 20,
        }]} />
      </div>
    </main>
  )
}
