import type { FC } from 'react'
import React from 'react'

export interface IHeaderProps {
  title: string
  isMobile?: boolean
  onShowSideBar?: () => void
  onCreateNewChat?: () => void
  onQuickAction?: (message: string) => void
}

const quickActions = [
  {
    label: 'サービス案内',
    message: 'サービスについて教えてください',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C28A3A" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </svg>
    ),
  },
  {
    label: 'インターン',
    message: 'インターンについて教えてください',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C28A3A" strokeWidth="2" strokeLinecap="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: 'お問い合わせ',
    message: 'お問い合わせしたいです',
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C28A3A" strokeWidth="2" strokeLinecap="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
]

const Header: FC<IHeaderProps> = ({
  title,
  isMobile,
  onShowSideBar,
  onCreateNewChat,
  onQuickAction,
}) => {
  return (
    <div className="shrink-0">
      {/* Primary header — orange gradient */}
      <div
        style={{
          padding: '14px 20px',
          background: 'linear-gradient(145deg, #FBB040 0%, #F5871F 50%, #E8620A 100%)',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Logo */}
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1.5px solid rgba(255,255,255,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <img
              src="/lantern-mark.png"
              alt=""
              style={{
                width: '20px',
                height: 'auto',
                filter: 'brightness(0) invert(1) drop-shadow(0 1px 3px rgba(0,0,0,0.15))',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: "'Zen Kaku Gothic New', sans-serif",
                fontWeight: 700,
                fontSize: '15px',
                color: '#fff',
                lineHeight: '1.3',
                textShadow: '0 1px 2px rgba(0,0,0,0.1)',
              }}
            >
              {title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#A7F3D0',
                  boxShadow: '0 0 6px rgba(167,243,208,0.6)',
                }}
              />
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.8)' }}>オンライン</span>
            </div>
          </div>
          {/* New chat button */}
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            onClick={onCreateNewChat}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
        </div>
      </div>

      {/* Sub-header — quick action buttons */}
      <div
        style={{
          padding: '10px 16px',
          background: 'linear-gradient(180deg, #FFF8EE, #FFFBF5)',
          borderBottom: '1px solid #F0E3D0',
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
        }}
      >
        {quickActions.map((action, i) => (
          <button
            key={i}
            onClick={() => onQuickAction?.(action.message)}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              background: '#fff',
              border: '1px solid #EEDDC6',
              borderRadius: '20px',
              fontSize: '12px',
              color: '#8A6030',
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(180,120,40,0.06)',
              fontFamily: 'inherit',
              lineHeight: '1.4',
              transition: 'background 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = '#FFF8EE';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(180,120,40,0.12)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = '#fff';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(180,120,40,0.06)';
            }}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default React.memo(Header)
