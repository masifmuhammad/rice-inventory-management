import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiHelpCircle, FiPrinter, FiRadio } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Button from '../components/ui/Button';
import { Select } from '../components/ui/Field';
import ScanStation from '../components/barcodes/ScanStation';
import LabelStudio from '../components/barcodes/LabelStudio';
import './Barcodes.css';
import { translate, useAppLanguage } from '../context/LanguageContext';

function BarcodeWorkspace() {
  useAppLanguage();
  const [params, setParams] = useSearchParams();
  const [help, setHelp] = useState(false);
  const [size, setSize] = useState('70x40');
  const tab = params.get('tab') === 'labels' ? 'labels' : 'scan';
  const [scanMode, setScanMode] = useState(params.get('mode') || 'stock_out');
  const changeTab = (next) => { setParams(next === 'labels' ? { tab: 'labels' } : { mode: scanMode }); };
  return <div className="barcode-page space-y-5">
    <div className="barcode-page-heading"><PageHeader title={translate("Scan & labels")} description={translate("Scan bags. Print labels. Keep stock in step.")} /><Button icon={FiHelpCircle} variant="ghost" aria-label={translate("Setup & help")} title={translate("Setup & help")} aria-expanded={help} onClick={() => setHelp((value) => !value)}><span>{translate("Setup & help")}</span></Button></div>
    <div className="barcode-workspace-toolbar"><div className="barcode-tabs" role="group" aria-label={translate("Barcode workspace")}><button type="button" aria-pressed={tab === 'scan'} className={tab === 'scan' ? 'is-active' : ''} onClick={() => changeTab('scan')}><FiRadio aria-hidden="true" />{translate("Scan bags")}</button><button type="button" aria-pressed={tab === 'labels'} className={tab === 'labels' ? 'is-active' : ''} onClick={() => changeTab('labels')}><FiPrinter aria-hidden="true" />{translate("Make labels")}</button></div>
      {tab === 'labels' && <Select label={translate("Label paper")} value={size} onChange={(e) => setSize(e.target.value)} className="barcode-paper-select"><option value="50x30">{translate("50 × 30 mm")}</option><option value="70x40">{translate("70 × 40 mm")}</option><option value="100x50">{translate("100 × 50 mm")}</option><option value="a4">{translate("A4 cut-out labels")}</option></Select>}
    </div>
    {help && <section className="barcode-help"><h2 className="font-semibold text-lg">{translate("Set up once. Scan all day.")}</h2><ol className="space-y-3 mt-4 text-sm"><li><strong>{translate("Connect the scanner.")}</strong>{translate(" Use USB or Bluetooth keyboard (HID) mode. Enable Code 128, match your keyboard language, and set an Enter suffix.")}</li><li><strong>{translate("Set up the printer.")}</strong>{translate(" Install its normal printer driver. Choose the matching label paper above. Print at 100% scale, no margins, no headers or footers.")}</li><li><strong>{translate("Test one label.")}</strong>{translate(" Use “Read label” to confirm a printed bag’s code. A preview test label is only for checking print quality; it has no stock record.")}</li><li><strong>{translate("At both shops.")}</strong>{translate(" Sign in to the same business. Receive bags once, then scan them out at the selling shop. A counter name records where a scan happened; stock is shared across the business.")}</li></ol><p className="text-xs text-content-muted mt-4">{translate("Camera scanning needs HTTPS or localhost and camera permission. USB scanners do not need camera access. Browsers use a print dialog; select your printer there. These are internal pack codes, not retail GS1 product numbers.")}</p></section>}
    {tab === 'scan' ? <ScanStation key={`scan-${scanMode}`} initialMode={scanMode} size={size} /> : <LabelStudio size={size} onScan={(mode) => { setScanMode(mode); setParams({ mode }); }} />}
  </div>;
}
export default function Barcodes() {
  const { businessId } = useAuth();
  return <BarcodeWorkspace key={businessId} />;
}
