'use client';

import { useEffect } from 'react';
import { useLink, useTooltip } from '@/lib/shared';

// On touch devices, the 2-tap focus flow keeps the tooltip visible between
// taps (otherwise the first-tap info box would vanish on finger lift). That
// means a stray tap elsewhere on the page leaves the tooltip stuck.
//
// This component registers a document pointerdown listener while a pending
// tap exists and dismisses everything (tooltip + pending + cross-panel
// hover) when the tap lands outside any element marked with
// `data-tap-focus`. Panels mark their interactive dots/bars/cells with
// that attribute so their own taps still go through the 2-tap flow.
export default function TouchDismissHandler() {
  const { isTouch, pendingFocusId, setPendingFocusId, setHovered } = useLink();
  const { hide } = useTooltip();

  useEffect(() => {
    if (!isTouch || pendingFocusId == null) return;
    const onPointerDown = (e) => {
      if (e.target && e.target.closest && e.target.closest('[data-tap-focus]')) return;
      setPendingFocusId(null);
      setHovered(null);
      hide();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isTouch, pendingFocusId, setPendingFocusId, setHovered, hide]);

  return null;
}
