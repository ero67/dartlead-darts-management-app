import React, { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const PULL_THRESHOLD_PX = 72;   // how far to drag before a release triggers a refresh
const MAX_PULL_PX = 110;        // indicator stops following the finger here

// Touch-only pull-to-refresh for pages that scroll with the window. Mouse users
// have the header Refresh button; on phones and tablets (and in the Capacitor
// shell, which has no reload button at all) dragging down from the top is the
// gesture everybody expects.
export function PullToRefresh({ onRefresh, children }) {
  const { t } = useLanguage();
  const startYRef = useRef(null);
  const [pullPx, setPullPx] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const atTop = () => (document.scrollingElement || document.documentElement).scrollTop <= 0;

  const handleTouchStart = (e) => {
    if (isRefreshing || e.touches.length !== 1 || !atTop()) return;
    startYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    if (startYRef.current === null || isRefreshing) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta <= 0 || !atTop()) {
      // Scrolling up, or the page moved: abandon this pull.
      startYRef.current = null;
      setPullPx(0);
      return;
    }
    // Rubber-band: the indicator lags the finger the further it is pulled.
    setPullPx(Math.min(MAX_PULL_PX, delta * 0.5));
  };

  const handleTouchEnd = async () => {
    if (startYRef.current === null) return;
    startYRef.current = null;
    if (pullPx < PULL_THRESHOLD_PX * 0.5) {
      setPullPx(0);
      return;
    }
    setIsRefreshing(true);
    setPullPx(PULL_THRESHOLD_PX * 0.5);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
      setPullPx(0);
    }
  };

  const armed = pullPx >= PULL_THRESHOLD_PX * 0.5;

  return (
    <div
      className="pull-to-refresh"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div
        className={`pull-to-refresh__indicator${pullPx > 0 ? ' pull-to-refresh__indicator--visible' : ''}`}
        style={{ height: pullPx }}
        aria-hidden={pullPx === 0}
      >
        <RefreshCw
          size={18}
          className={isRefreshing ? 'refresh-btn__icon--spinning' : ''}
          style={{ transform: isRefreshing ? undefined : `rotate(${pullPx * 3}deg)` }}
        />
        <span>{isRefreshing ? t('common.refreshing') : armed ? t('common.releaseToRefresh') : t('common.pullToRefresh')}</span>
      </div>
      {children}
    </div>
  );
}
