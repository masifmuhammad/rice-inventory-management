import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiArrowDownLeft, FiArrowUpRight, FiPackage, FiPrinter } from 'react-icons/fi';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import usePrefetchRoute from '../hooks/usePrefetchRoute';
import './InventoryActions.css';
import { translate, useAppLanguage } from '../context/LanguageContext';

const ACTIONS = [
  { title: 'View stock', description: 'See available rice', path: '/products', tone: 'stock', icon: FiPackage },
  { title: 'Stock in', description: 'Receive rice bags', path: '/barcodes?mode=stock_in', tone: 'in', icon: FiArrowDownLeft },
  { title: 'Stock out', description: 'Scan bags to sell', path: '/barcodes?mode=stock_out', tone: 'out', icon: FiArrowUpRight },
];
export default function InventoryActions() {
  useAppLanguage();
  const reduced = usePrefersReducedMotion();
  const prefetch = usePrefetchRoute();
  return <section aria-label={translate("Rice inventory actions")} className="inventory-actions">
    <div className="inventory-actions-heading"><h2>{translate("Your rice, one tap away.")}</h2><Link to="/barcodes?tab=labels" onMouseEnter={() => prefetch('/barcodes')}><FiPrinter aria-hidden="true" />{translate("Make labels")}</Link></div>
    <div className="inventory-action-grid">{ACTIONS.map(({ title, description, path, tone, icon: Icon }, i) => <motion.div key={path} initial={reduced ? false : { y: 6, opacity: .85 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: .3, delay: i * .04, ease: [.22, 1, .36, 1] }}><Link to={path} onMouseEnter={() => prefetch(path.split('?')[0])} onFocus={() => prefetch(path.split('?')[0])} className={`inventory-action inventory-action-${tone}`}><div className="inventory-action-top"><Icon className="inventory-action-icon" aria-hidden="true" /></div><strong>{translate(title)}</strong><p>{translate(description)}</p></Link></motion.div>)}</div>
  </section>;
}
