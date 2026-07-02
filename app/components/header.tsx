import type { FC } from 'react'
import React from 'react'
import {
  Bars3Icon,
  PencilSquareIcon,
} from '@heroicons/react/24/solid'
import AppIcon from '@/app/components/base/app-icon'
export interface IHeaderProps {
  title: string
  isMobile?: boolean
  onShowSideBar?: () => void
  onCreateNewChat?: () => void
}
const Header: FC<IHeaderProps> = ({
  title,
  isMobile,
  onShowSideBar,
  onCreateNewChat,
}) => {
  return (
    <div className="shrink-0 flex items-center justify-between h-14 px-4" style={{ background: 'linear-gradient(135deg, #FFF6E9 0%, #FFFFFF 62%)', borderBottom: '1px solid #F1E7DA', boxShadow: '0 2px 8px rgba(180,120,40,0.06)' }}>
      <div></div>
      <div className='flex items-center space-x-3'>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'radial-gradient(circle at 50% 38%, #FFE7C4, #FFF6EA)', border: '1px solid rgba(232,98,10,0.16)', boxShadow: '0 4px 12px rgba(232,98,10,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="/lantern-mark.png" alt="" style={{ width: '18px', height: 'auto' }} />
        </div>
        <div>
          <div className="text-sm font-bold" style={{ fontFamily: "'Zen Kaku Gothic New', sans-serif", color: '#2A2118', lineHeight: '1.3' }}>{title}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '1px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#31A05B', boxShadow: '0 0 0 2px rgba(49,160,91,0.15)' }}></span>
            <span style={{ fontSize: '11px', color: '#8A7B6C' }}>オンライン</span>
          </div>
        </div>
      </div>
      <div></div>
    </div>
  )
}

export default React.memo(Header)
