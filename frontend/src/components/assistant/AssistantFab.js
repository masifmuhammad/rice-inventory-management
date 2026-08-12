import React, { useCallback, useState } from 'react';
import { FiDollarSign, FiFileText, FiMessageCircle, FiPackage } from 'react-icons/fi';
import { AnimatePresence, motion } from 'framer-motion';
import useMediaQuery, { usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import { useAssistant } from '../../context/AssistantContext';
import { springUI, withReducedMotion } from '../../utils/motion';
import AssistantHubSheet, { AssistantSpeedDialItem } from './AssistantHub';
import { AssistantBrandMark, AssistantFabTrigger } from './AssistantChrome';
import AssistantPanels from './AssistantPanels';

const DESKTOP_ACTIONS = [
  { id: 'chat', icon: FiMessageCircle, label: 'Chat & Voice', sublabel: 'پوچھیں' },
  { id: 'scan-receipt', icon: FiDollarSign, label: 'Scan receipt', sublabel: 'رسید' },
  { id: 'scan', icon: FiPackage, label: 'Stock slip', sublabel: 'سلپ' },
  { id: 'briefing', icon: FiFileText, label: 'Briefing', sublabel: 'خلاصہ' },
];

export default function AssistantFab() {
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const reducedMotion = usePrefersReducedMotion();
  const { enabled, hubOpen, setHubOpen, openPanel, menuPinned, setMenuPinned } = useAssistant();
  const [hovered, setHovered] = useState(false);

  const menuOpen = isMobile ? hubOpen : hovered || menuPinned;

  const closeMenu = useCallback(() => {
    setHovered(false);
    setMenuPinned(false);
    setHubOpen(false);
  }, [setHubOpen, setMenuPinned]);

  const handleFabClick = () => {
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

      <div
        className="fixed z-50 flex flex-col items-end gap-3 pointer-events-none
          right-4 sm:right-6
          bottom-[calc(var(--app-tabbar-height)+env(safe-area-inset-bottom)+1rem)] lg:bottom-6"
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
                <p className="assistant-ur text-[10px] !leading-normal text-content-subtle mt-0.5 pl-8" dir="rtl" lang="ur">
                  مدد
                </p>
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
      </div>

      <AssistantHubSheet open={hubOpen} onClose={() => setHubOpen(false)} />
      <AssistantPanels />
    </>
  );
}
