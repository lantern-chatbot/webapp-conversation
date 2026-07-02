import type { FC } from 'react'
import React from 'react'
import AppIcon from '@/app/components/base/app-icon'
export interface IHeaderProps {
  title: string
  isMobile?: boolean
  onShowSideBar?: () => void
  onCreateNewChat?: () => void
}
const Header: FC<IHeaderProps> = ({
  title,
}) => {
  return (
    <div className="shrink-0 flex items-center justify-between h-12 px-3" style={{ background: 'linear-gradient(135deg, #FFF6E9 0%, #FFFFFF 62%)', borderBottom: '1px solid #F1E7DA' }}>
      <div></div>
      <div className='flex items-center space-x-2'>
        <AppIcon size='small' />
        <div className='text-sm font-bold' style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", color: '#2A2118' }}>{title}</div>
      </div>
      <div></div>
    </div>
  )
}

export default React.memo(Header)
