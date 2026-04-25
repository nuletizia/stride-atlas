'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// Interactive zoom + pan for SVG scatter panels.
//
// Wheel: shift+wheel or trackpad pinch (ctrlKey / metaKey set by browser)
// zooms around the cursor. Plain wheel is a no-op when not zoomed (so it
// doesn't hijack page scroll), and zooms when already zoomed in (so the user
// stays in zoom mode once committed).
//
// Touch: pinch-zoom around the midpoint between two fingers. Single-finger
// drag pans only when isZoomed — otherwise it falls through to dot taps.
//
// Bounds are always clamped to outerBounds: the view never shows space
// beyond where the data actually lives.
export function useScatterZoom({ outerBounds, plotW, plotH, M }) {
  const [view, setView] = useState(outerBounds);
  const [isPanning, setIsPanning] = useState(false);

  // Reset view when outer bounds change (filter/data change). Compare by
  // value so a re-rendered-but-equal outerBounds doesn't trigger a reset.
  const outerKey = `${outerBounds.xMin}|${outerBounds.xMax}|${outerBounds.yMin}|${outerBounds.yMax}`;
  useEffect(() => {
    setView(outerBounds);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outerKey]);

  const xFor = useCallback(
    (x) => M.l + ((x - view.xMin) / (view.xMax - view.xMin || 1)) * plotW,
    [view, M.l, plotW]
  );
  const yFor = useCallback(
    (y) => M.t + ((y - view.yMin) / (view.yMax - view.yMin || 1)) * plotH,
    [view, M.t, plotH]
  );

  const isZoomed =
    view.xMin !== outerBounds.xMin ||
    view.xMax !== outerBounds.xMax ||
    view.yMin !== outerBounds.yMin ||
    view.yMax !== outerBounds.yMax;

  const reset = useCallback(() => setView(outerBounds), [outerKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const pointersRef = useRef(new Map());
  const dragStateRef = useRef(null);
  const pinchStateRef = useRef(null);

  // SVG-coord helper: convert browser event coords to viewBox coords,
  // accounting for any responsive scaling the SVG container applies.
  const getSvgCoords = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scaleX = vb.width / rect.width;
    const scaleY = vb.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const inPlot = (x, y) =>
    x >= M.l && x <= M.l + plotW && y >= M.t && y <= M.t + plotH;

  // factor < 1 zooms in (smaller view); > 1 zooms out. Anchor is the data
  // point that should remain under the cursor before/after the zoom.
  const applyZoom = useCallback(
    (factor, anchorData) => {
      setView((prev) => {
        const xSpan = (prev.xMax - prev.xMin) * factor;
        const ySpan = (prev.yMax - prev.yMin) * factor;
        const fx = (anchorData.x - prev.xMin) / (prev.xMax - prev.xMin || 1);
        const fy = (anchorData.y - prev.yMin) / (prev.yMax - prev.yMin || 1);
        let xMin = anchorData.x - xSpan * fx;
        let xMax = xMin + xSpan;
        let yMin = anchorData.y - ySpan * fy;
        let yMax = yMin + ySpan;

        const oxSpan = outerBounds.xMax - outerBounds.xMin;
        const oySpan = outerBounds.yMax - outerBounds.yMin;
        if (xSpan >= oxSpan) {
          xMin = outerBounds.xMin;
          xMax = outerBounds.xMax;
        } else {
          if (xMin < outerBounds.xMin) {
            xMax += outerBounds.xMin - xMin;
            xMin = outerBounds.xMin;
          }
          if (xMax > outerBounds.xMax) {
            xMin -= xMax - outerBounds.xMax;
            xMax = outerBounds.xMax;
          }
        }
        if (ySpan >= oySpan) {
          yMin = outerBounds.yMin;
          yMax = outerBounds.yMax;
        } else {
          if (yMin < outerBounds.yMin) {
            yMax += outerBounds.yMin - yMin;
            yMin = outerBounds.yMin;
          }
          if (yMax > outerBounds.yMax) {
            yMin -= yMax - outerBounds.yMax;
            yMax = outerBounds.yMax;
          }
        }
        return { xMin, xMax, yMin, yMax };
      });
    },
    [outerBounds]
  );

  const pixelToData = (px, py, v) => ({
    x: v.xMin + ((px - M.l) / plotW) * (v.xMax - v.xMin),
    y: v.yMin + ((py - M.t) / plotH) * (v.yMax - v.yMin),
  });

  const onWheel = (e) => {
    // Trackpad pinch sets ctrlKey on the wheel event; explicit shift+wheel
    // is the keyboard alternative. Plain wheel zooms only when already
    // zoomed in, so we don't fight page-scroll on the default view.
    const wantsZoom = e.ctrlKey || e.metaKey || e.shiftKey || isZoomed;
    if (!wantsZoom) return;
    const { x, y } = getSvgCoords(e);
    if (!inPlot(x, y)) return;
    e.preventDefault();
    const data = pixelToData(x, y, view);
    const factor = e.deltaY > 0 ? 1.18 : 1 / 1.18;
    applyZoom(factor, data);
  };

  const onPointerDown = (e) => {
    const svg = e.currentTarget;
    const { x, y } = getSvgCoords(e);
    pointersRef.current.set(e.pointerId, {
      x,
      y,
      clientX: e.clientX,
      clientY: e.clientY,
    });

    if (pointersRef.current.size === 1) {
      dragStateRef.current = {
        startX: x,
        startY: y,
        clientStartX: e.clientX,
        clientStartY: e.clientY,
        startView: view,
        moved: false,
        pointerId: e.pointerId,
      };
    } else if (pointersRef.current.size === 2) {
      // Two-finger gesture: cancel any pending pan, switch to pinch.
      dragStateRef.current = null;
      setIsPanning(false);
      const ps = Array.from(pointersRef.current.values());
      const dx = ps[0].x - ps[1].x;
      const dy = ps[0].y - ps[1].y;
      pinchStateRef.current = {
        lastDist: Math.hypot(dx, dy),
      };
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        /* ignore — some browsers reject capture */
      }
    }
  };

  const onPointerMove = (e) => {
    const svg = e.currentTarget;
    if (!pointersRef.current.has(e.pointerId)) return;
    const { x, y } = getSvgCoords(e);
    pointersRef.current.set(e.pointerId, {
      x,
      y,
      clientX: e.clientX,
      clientY: e.clientY,
    });

    if (pointersRef.current.size === 2 && pinchStateRef.current) {
      const ps = Array.from(pointersRef.current.values());
      const dx = ps[0].x - ps[1].x;
      const dy = ps[0].y - ps[1].y;
      const newDist = Math.hypot(dx, dy);
      if (newDist > 0 && pinchStateRef.current.lastDist > 0) {
        const newMidX = (ps[0].x + ps[1].x) / 2;
        const newMidY = (ps[0].y + ps[1].y) / 2;
        const factor = pinchStateRef.current.lastDist / newDist;
        const data = pixelToData(newMidX, newMidY, view);
        applyZoom(factor, data);
        pinchStateRef.current.lastDist = newDist;
      }
      e.preventDefault();
      return;
    }

    const ds = dragStateRef.current;
    if (!ds || pointersRef.current.size !== 1) return;
    const movePx = Math.hypot(e.clientX - ds.clientStartX, e.clientY - ds.clientStartY);
    if (!ds.moved && movePx > 5) {
      // Pan only makes sense when zoomed; otherwise let the gesture fall
      // through (e.g. tap-to-focus on dots, page scroll on touch).
      if (!isZoomed) {
        dragStateRef.current = null;
        return;
      }
      ds.moved = true;
      setIsPanning(true);
      try {
        svg.setPointerCapture(ds.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (ds.moved) {
      e.preventDefault();
      const dxData = ((x - ds.startX) / plotW) * (ds.startView.xMax - ds.startView.xMin);
      const dyData = ((y - ds.startY) / plotH) * (ds.startView.yMax - ds.startView.yMin);
      let xMin = ds.startView.xMin - dxData;
      let xMax = ds.startView.xMax - dxData;
      let yMin = ds.startView.yMin - dyData;
      let yMax = ds.startView.yMax - dyData;
      if (xMin < outerBounds.xMin) {
        const adj = outerBounds.xMin - xMin;
        xMin += adj;
        xMax += adj;
      }
      if (xMax > outerBounds.xMax) {
        const adj = xMax - outerBounds.xMax;
        xMin -= adj;
        xMax -= adj;
      }
      if (yMin < outerBounds.yMin) {
        const adj = outerBounds.yMin - yMin;
        yMin += adj;
        yMax += adj;
      }
      if (yMax > outerBounds.yMax) {
        const adj = yMax - outerBounds.yMax;
        yMin -= adj;
        yMax -= adj;
      }
      setView({ xMin, xMax, yMin, yMax });
    }
  };

  const finishPointer = (e) => {
    const wasDrag = dragStateRef.current?.pointerId === e.pointerId && dragStateRef.current?.moved;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchStateRef.current = null;
    if (dragStateRef.current?.pointerId === e.pointerId) dragStateRef.current = null;
    if (wasDrag) {
      setIsPanning(false);
      // Suppress the synthetic click that follows a drag, so the dot under
      // the cursor doesn't trigger run-focus.
      const svg = e.currentTarget;
      const handler = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      svg.addEventListener('click', handler, { capture: true, once: true });
      setTimeout(() => svg.removeEventListener('click', handler, true), 300);
    }
  };

  return {
    view,
    xFor,
    yFor,
    isZoomed,
    isPanning,
    reset,
    svgEvents: {
      onWheel,
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointer,
      onPointerCancel: finishPointer,
      onPointerLeave: finishPointer,
      // touchAction: 'none' lets the SVG own all touch gestures inside it.
      // Page scroll still works outside the SVG (the rest of the panel +
      // dashboard), so vertical scrolling on a tall page is unaffected.
      style: {
        touchAction: 'none',
        cursor: isPanning ? 'grabbing' : isZoomed ? 'grab' : undefined,
      },
    },
  };
}
