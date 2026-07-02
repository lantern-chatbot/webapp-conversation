'use client'
import type { FC } from 'react'
import React from 'react'
import type { IChatItem } from '../type'
import s from '../style.module.css'

import StreamdownMarkdown from '@/app/components/base/streamdown-markdown'
import ImageGallery from '@/app/components/base/image-gallery'

type IQuestionProps = Pick<IChatItem, 'id' | 'content' | 'useCurrentUserAvatar'> & {
  imgSrcs?: string[]
}

const Question: FC<IQuestionProps> = ({ id, content, useCurrentUserAvatar, imgSrcs }) => {
  const userName = ''
  return (
    <div className='flex items-start justify-end' key={id}>
      <div>
        <div className={`${s.question} relative text-sm text-white`}>
          <div
            className={'py-3 px-4 rounded-2xl rounded-br-md shadow-[0_6px_16px_rgba(232,98,10,0.24)]'}
            style={{ background: 'linear-gradient(148deg, #F7911E 0%, #E8620A 100%)' }}
          >
            {imgSrcs && imgSrcs.length > 0 && (
              <ImageGallery srcs={imgSrcs} />
            )}
            <StreamdownMarkdown content={content} />
          </div>
        </div>
      </div>
      {useCurrentUserAvatar
        ? (
          <div className='w-10 h-10 shrink-0 leading-10 text-center mr-2 rounded-full bg-primary-600 text-white'>
            {userName?.[0].toLocaleUpperCase()}
          </div>
        )
        : null}
    </div>
  )
}

export default React.memo(Question)
