import React from 'react';
import { motion } from 'framer-motion';
import {
  FiDollarSign,
  FiFileText,
  FiMessageCircle,
  FiPackage,
} from 'react-icons/fi';
import Modal from '../ui/Modal';
import { useAssistant } from '../../context/AssistantContext';
import { staggerContainer, staggerItem, springSnappy } from '../../utils/motion';
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery';
import { AssistantIconWell } from './AssistantChrome';
import { BiLine } from './AssistantCopy';

const ACTIONS = [
  {
    id: 'chat',
    icon: FiMessageCircle,
    title: 'Chat & Voice',
    description: 'Type or speak about stock, sales, cash',
  },
  {
    id: 'scan-receipt',
    icon: FiDollarSign,
    title: 'Scan receipt',
    description: 'Money in/out from a receipt photo',
  },
  {
    id: 'scan',
    icon: FiPackage,
    title: 'Scan stock slip',
    description: 'Delivery note → stock in',
  },
  {
    id: 'briefing',
    icon: FiFileText,
    title: 'Briefing',
    description: "Today's business summary",
  },
];

export default function AssistantHubSheet({ open, onClose }) {
  const { openPanel } = useAssistant();
  const reducedMotion = usePrefersReducedMotion();

  const pick = (id) => {
    openPanel(id === 'voice' ? 'chat' : id);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assistant"
      description={<BiLine en="Speak Urdu or English · replies in English" size="sm" />}
      size="md"
    >
      <motion.div
        className="grid grid-cols-2 gap-3"
        variants={reducedMotion ? undefined : staggerContainer}
        initial={reducedMotion ? undefined : 'hidden'}
        animate={reducedMotion ? undefined : 'show'}
      >
        {ACTIONS.map(({ id, icon, title, description }) => (
          <motion.button
            key={id}
            type="button"
            variants={reducedMotion ? undefined : staggerItem}
            onClick={() => pick(id)}
            whileTap={reducedMotion ? undefined : { scale: 0.96 }}
            transition={springSnappy}
            className="group flex flex-col items-start gap-3 rounded-[20px] p-3.5 text-left min-h-[124px]
              bg-surface-sunken/60
              shadow-[inset_0_0_0_1px_rgb(var(--hairline)/0.08)]
              hover:bg-primary-500/[0.06]
              hover:shadow-[inset_0_0_0_1px_rgb(var(--color-primary-500)/0.28)]
              transition-[background-color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0,1)]
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <AssistantIconWell
              icon={icon}
              className="transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)]
                group-hover:bg-primary-500 group-hover:text-white group-hover:shadow-[0_1px_2px_rgb(0_0_0/0.12)]"
            />
            <span className="min-w-0 space-y-1">
              <span
                className="block assistant-en-sm font-semibold text-content tracking-tight text-balance"
                lang="en"
              >
                {title}
              </span>
              <span
                className="block assistant-en-sm text-content-muted text-pretty leading-snug"
                lang="en"
              >
                {description}
              </span>
            </span>
          </motion.button>
        ))}
      </motion.div>
    </Modal>
  );
}

export function AssistantSpeedDialItem({ icon: Icon, label, onClick, visible }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-2.5 py-2 rounded-[14px] text-left
        transition-[background-color,opacity,transform,border-color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]
        hover:bg-surface-sunken active:scale-[0.96] motion-reduce:active:scale-100
        border border-transparent hover:border-hairline/[0.1]
        ${visible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-1.5 pointer-events-none'}`}
      tabIndex={visible ? 0 : -1}
    >
      <AssistantIconWell icon={Icon} size="sm" tone="muted" />
      <span className="min-w-0 space-y-0.5">
        <span className="block assistant-en-sm font-medium text-content tracking-tight" lang="en">
          {label}
        </span>
      </span>
    </button>
  );
}
