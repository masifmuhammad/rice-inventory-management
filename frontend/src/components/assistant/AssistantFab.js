import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FiDollarSign, FiFileText, FiMessageCircle, FiPackage } from 'react-icons/fi';
import { AnimatePresence, motion, useMotionValue } from 'framer-motion';
import useMediaQuery, { usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import { useAssistant } from '../../context/AssistantContext';
import { springUI, withReducedMotion } from '../../utils/motion';
import AssistantHubSheet, { AssistantSpeedDialItem } from './AssistantHub';
import { AssistantBrandMark, AssistantFabTrigger } from './AssistantChrome';
import AssistantPanels from './AssistantPanels';

const DESKTOP_ACTIONS = [
  { id: 'chat', icon: FiMessageCircle, label: 'Chat & Voice' },
  { id: 'scan-receipt', icon: FiDollarSign, label: 'Scan receipt' },
  { id: 'scan', icon: FiPackage, label: 'Stock slip' },
  { id: 'briefing', icon: FiFileText, label: 'Briefing' },
];

/**
 * Where the user last parked the button, as an offset from its default corner.
 *
 * Stored rather than reset each visit: a button that will not stay where it was
 * put is more irritating than one that cannot be moved at all.
 */
const OFFSET_KEY = 'rim.assistant-fab-offset';

const readOffset = () => {
  try {
    const raw = localStorage.getItem(OFFSET_KEY);
    if (!raw) return { x: 0, y: 0 };
    const parsed = JSON.parse(raw);
    return {
      x: Number.isFinite(parsed?.x) ? parsed.x : 0,
      y: Number.isFinite(parsed?.y) ? parsed.y : 0,
    };
  } catch {
    return { x: 0, y: 0 };
  }
};

export default function AssistantFab() {
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const reducedMotion = usePrefersReducedMotion();
  const { enabled, hubOpen, setHubOpen, openPanel, menuPinned, setMenuPinned } = useAssistant();
  const [hovered, setHovered] = useState(false);

  /* ----------------------------------------------------------- dragging ---
     The button floats over the page, so on a short list it lands on top of the
     last row's controls — which is exactly where a delete button tends to be.
     Rather than guess at safe padding for every screen, let it be moved. */
  const boundsRef = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  // Set while a real drag is in progress, so the click that framer-motion fires
  // on release does not also open the assistant.
  const draggedRef = useRef(false);

  useEffect(() => {
    const saved = readOffset();
    x.set(saved.x);
    y.set(saved.y);
  }, [x, y]);

  // A button parked against the right edge of a phone would sit off-screen on a
  // desktop-width window, and vice versa. Snap it back into reach on resize.
  useEffect(() => {
    const clamp = () => {
      const bounds = boundsRef.current?.getBoundingClientRect();
      if (!bounds) return;
      if (Math.abs(x.get()) > bounds.width) x.set(0);
      if (Math.abs(y.get()) > bounds.height) y.set(0);
    };
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [x, y]);

  const handleDragEnd = (event, info) => {
    // A few pixels of travel is a tap with a shaky thumb, not a drag.
    const moved = Math.hypot(info.offset.x, info.offset.y) > 6;
    if (moved) {
      try {
        localStorage.setItem(OFFSET_KEY, JSON.stringify({ x: x.get(), y: y.get() }));
      } catch {
        /* storage disabled — the position just will not survive a reload */
      }
      // Outlive the synthetic click that follows pointer-up.
      draggedRef.current = true;
      setTimeout(() => {
        draggedRef.current = false;
      }, 80);
    }
  };

  const menuOpen = isMobile ? hubOpen : hovered || menuPinned;

  const closeMenu = useCallback(() => {
    setHovered(false);
    setMenuPinned(false);
    setHubOpen(false);
  }, [setHubOpen, setMenuPinned]);

  const handleFabClick = () => {
    // The user was repositioning the button, not asking for the assistant.
    if (draggedRef.current) return;

    if (isMobile) {
      setHubOpen((v) => !v);
      return;
    }
    setHubOpen(true);
    setMenuPinned(false);
    setHovered(false);
  };

  const pickAction = (id) => {
    openPanel(id);
    closeMenu();
  };

  if (enabled === false || enabled === null) return null;

  return (
    <>
      {!isMobile && menuPinned && (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-transparent"
          aria-label="Close assistant menu"
          onClick={closeMenu}
        />
      )}

      {/* The area the button may be dragged within: below the header, above the
          tab bar, inside the side gutters. framer-motion reads this element's
          box for `dragConstraints`, so it never lands somewhere unreachable. */}
      <div
        ref={boundsRef}
        aria-hidden="true"
        className="fixed z-40 pointer-events-none
          left-4 right-4 sm:left-6 sm:right-6
          top-[calc(var(--app-header-height)+3rem)]
          bottom-[calc(var(--app-tabbar-height)+1.5rem)] lg:bottom-6"
      />

      <motion.div
        drag
        dragConstraints={boundsRef}
        dragMomentum={false}
        dragElastic={0.04}
        onDragEnd={handleDragEnd}
        style={{ x, y }}
        // `touch-action: none` is what lets a drag start on a touchscreen at
        // all — without it the browser claims the gesture for scrolling.
        className="fixed z-50 flex flex-col items-end gap-3 pointer-events-none touch-none
          right-4 sm:right-6
          bottom-[calc(var(--app-tabbar-height)+1.5rem)] lg:bottom-6"
        onMouseEnter={() => !isMobile && setHovered(true)}
        onMouseLeave={() => !isMobile && !menuPinned && setHovered(false)}
      >
        <AnimatePresence initial={false}>
          {!isMobile && menuOpen && (
            <motion.div
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
              transition={withReducedMotion(springUI, reducedMotion)}
              className="pointer-events-auto w-[13.5rem] rounded-[18px] chrome-raised
                border border-hairline/[0.1] bg-surface-1 overflow-hidden p-1.5 relative z-50
                shadow-[0_16px_40px_-12px_rgb(0_0_0/0.28)]"
            >
              <div className="px-2.5 py-2 mb-1 border-b border-hairline/[0.07]">
                <AssistantBrandMark />
              </div>
              {DESKTOP_ACTIONS.map((action) => (
                <AssistantSpeedDialItem
                  key={action.id}
                  {...action}
                  visible={menuOpen}
                  onClick={() => pickAction(action.id)}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="pointer-events-auto relative z-50">
          <AssistantFabTrigger onClick={handleFabClick} expanded={hubOpen || (menuOpen && !isMobile)} />
        </div>
      </motion.div>

      <AssistantHubSheet open={hubOpen} onClose={() => setHubOpen(false)} />
      <AssistantPanels />
    </>
  );
}
