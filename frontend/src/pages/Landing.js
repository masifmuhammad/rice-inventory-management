import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, transform, useMotionTemplate, useReducedMotion, useScroll, useTransform, useVelocity } from 'framer-motion';
import { FiArrowDown, FiArrowUpRight } from 'react-icons/fi';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';
import '@fontsource/schibsted-grotesk/latin-400.css';
import '@fontsource/schibsted-grotesk/latin-500.css';
import '@fontsource/schibsted-grotesk/latin-600.css';
import './Landing.css';
import { ArtTruck, BrandBadge, Carton, Degh, Grain, INK, Logo, MARI, Mill, NineGlyph, Pack, Paddy, PunjabScene, RICE, Sack, Shop, Stubble, VER } from './LandingArt';

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);
const MOTION_OK = '(prefers-reduced-motion: no-preference)';

// Urdu on this page is set in Noto Sans Arabic: an even-stroked sans that sits
// with Schibsted Grotesk, where calligraphic Nastaliq fought it.
const FONTS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700&display=swap';

const ASSETS = '/brand/999/';
const ART = `${ASSETS}rebrand-v2/`;
const EASE = [0.22, 1, 0.36, 1];
const W = 8400; // width of the journey world, in SVG units; its height is 1000.

// Opacity driven by scroll goes through a plain function: framer's accelerated
// scroll-linked opacity misplaced multi-stop fades.
const useFade = (p, input, output) => useTransform(p, transform(input, output));

// The journey. `at`/`to` are the share of the story's scroll each chapter owns.
const CHAPTERS = [
  { key: 'field', title: 'The field', at: 0, to: 0.115, heading: 'It starts in the paddy.', body: 'Rice ripens gold across the fields of Punjab in autumn. Then it is cut, threshed and gathered in.' },
  { key: 'sacks', title: 'The sacks', at: 0.115, to: 0.235, heading: 'Into the boriyan.', body: 'Threshed paddy is filled into jute sacks and stacked at the edge of the field until the truck arrives.' },
  { key: 'road', title: 'The road', at: 0.235, to: 0.38, heading: 'Loaded onto a painted truck.', body: 'In Pakistan a goods truck is a moving painting. Ours carries the green and gold of HM Edibles.' },
  { key: 'mill', title: 'The mill', at: 0.38, to: 0.58, heading: 'Husked, polished, sorted.', body: 'At the mill the husk comes off, the grain is polished, and a sorter picks out every discoloured grain.' },
  { key: 'pack', title: 'The pack', at: 0.58, to: 0.70, heading: 'Sealed with the 999 mark.', body: 'Clean rice is weighed and sealed into a 999 pack, then boxed for the road again.' },
  { key: 'shop', title: 'The shop', at: 0.70, to: 0.85, heading: 'To the kiryana on your street.', body: 'The truck sets off once more, to the corner shop where your family buys its groceries.' },
  { key: 'table', title: 'The table', at: 0.85, to: 1, heading: 'And onto your dastarkhwan.', body: 'Basmati in the biryani, sella in the degh, steam rice with the daal.' },
];

const RICES = [
  { key: 'adwar', name: 'Adwar Totaa', color: '#1f3b2e', pack: 0, description: 'The green 999 pack. Totaa rice for familiar recipes and everyday cooking.', best: 'Everyday meals' },
  { key: 'kainat', name: 'Kainat Steam', color: '#684087', pack: 1, description: 'The purple 999 pack. Kainat steam rice for the dishes you love to share.', best: 'Biryani and pulao' },
  { key: 'short-grain', name: 'Short Grain', color: '#235d95', pack: 2, description: 'The blue 999 pack. Short grain rice for comforting meals around the family table.', best: 'Daal chawal' },
];

function Packshot({ rice, className = '' }) {
  return <span className={`k-packshot ${className}`} style={{ '--pack-column': rice.pack }}>
    <img src={`${ASSETS}packs/front-lineup.png`} alt={`999 ${rice.name} rice, front of the 1 kg pack`} draggable="false" />
  </span>;
}

// Every picture the page shows, under /brand/999/. The preloader decodes them
// all before the page appears.
const IMAGES = [
  ...['field', 'sacks', 'road', 'mill', 'pack', 'shop', 'table', 'family', 'dinner-premium'].map(key => `rebrand-v2/${key}.webp`),
  'packs/front-lineup.png', 'originals/kainat-25kg.png',
];

function Cutout({ chapter, className = '' }) {
  return <img className={`k-cutout ${className}`} src={`${ART}${chapter.key}.webp`} alt="" draggable="false" />;
}

function InventoryLink({ className = '', children }) {
  return <Link to="/inventory" className={`k-inventory ${className}`}><span>{children}</span><FiArrowUpRight aria-hidden="true" /></Link>;
}

const scrollBehavior = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
const navigationBehavior = top => Math.abs(top - window.scrollY) > window.innerHeight * 2 ? 'instant' : scrollBehavior();

function navigateToSection(hash) {
  const target = document.getElementById(hash.slice(1));
  if (!target) return;
  // Keep section navigation local, so app-level route restoration cannot reset it.
  window.history.replaceState(window.history.state, '', hash);
  const heading = target.querySelector('h1, h2');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
  }
  const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - 90);
  window.scrollTo({ top, behavior: navigationBehavior(top) });
}

function handleLocalAnchor(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href^="#"]');
  if (!link || !document.getElementById(link.hash.slice(1))) return;
  event.preventDefault();
  navigateToSection(link.hash);
}

// Scroll the story so a chapter is on stage.
function jumpTo(chapter) {
  const story = document.getElementById('safar');
  if (!story) return;
  const share = chapter.at + (chapter.to - chapter.at) * 0.35;
  const top = story.offsetTop + share * (story.offsetHeight - window.innerHeight);
  window.scrollTo({ top, behavior: navigationBehavior(top) });
}

// One bar on every screen: menu on the left, the mark in the centre, and on
// the right inventory access (the staff's main way in) beside the chapters.
function Header({ onPreview }) {
  const [tray, setTray] = useState(null);
  const pendingNavigation = useRef(null);
  const reduce = useReducedMotion();

  const close = () => setTray(null);
  const toggle = kind => () => setTray(open => (open === kind ? null : kind));

  useEffect(() => {
    if (!tray) return undefined;
    const onKey = event => {
      if (event.key !== 'Escape') return;
      document.querySelector('[aria-controls="k-tray"][aria-expanded="true"]')?.focus();
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tray]);

  const go = chapter => { pendingNavigation.current = () => jumpTo(chapter); close(); };
  const goToSection = (event, hash) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!tray) { navigateToSection(hash); return; }
    pendingNavigation.current = () => navigateToSection(hash);
    close();
  };
  const finishNavigation = () => {
    if (tray || !pendingNavigation.current) return;
    const navigate = pendingNavigation.current;
    pendingNavigation.current = null;
    requestAnimationFrame(navigate);
  };

  return <>
    <motion.div className="k-scrim" aria-hidden="true" initial={false} animate={{ opacity: tray ? 1 : 0 }} style={{ pointerEvents: tray ? 'auto' : 'none' }} transition={{ duration: 0.4 }} onClick={close} />
    <header className="k-header" data-open={tray ? '' : undefined}>
      <div className="k-bar">
        <div className="k-bar-side">
          <button type="button" className="k-icon-btn" aria-expanded={tray === 'menu'} aria-controls="k-tray" aria-label="Menu" onClick={toggle('menu')}>
            <span className="k-burger" data-x={tray === 'menu' ? '' : undefined}><i /><i /></span>
          </button>
        </div>
        <a href="#top" className="k-brand" aria-label="999, back to top" onClick={event => goToSection(event, '#top')}>
          <Logo className="k-brand-mark" />
          <span className="k-brand-name">HM Edibles</span>
        </a>
        <div className="k-bar-side k-bar-end">
          <InventoryLink className="k-inventory-small">Inventory</InventoryLink>
          <button type="button" className="k-icon-btn" aria-expanded={tray === 'chapters'} aria-controls="k-tray" aria-label="Chapters of the journey" onClick={toggle('chapters')}>
            <span className="k-chapters-icon" data-x={tray === 'chapters' ? '' : undefined}><i /><i /><i /></span>
          </button>
        </div>
      </div>
      <motion.div id="k-tray" className="k-tray" initial={false} animate={{ height: tray ? 'auto' : 0 }} transition={reduce ? { duration: 0 } : { duration: 0.35, ease: EASE }} onAnimationComplete={finishNavigation}>
        <>
          {tray === 'chapters' && <div>
            <ol className="k-rail">{CHAPTERS.map((chapter, index) => <motion.li key={chapter.key}
              initial={reduce ? false : { opacity: 0, y: 14, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.5, delay: 0.06 + index * 0.04, ease: EASE }}>
              <button type="button" onClick={() => go(chapter)} onPointerEnter={() => onPreview(index)} onFocus={() => onPreview(index)}>
                <span className="k-rail-art"><Cutout chapter={chapter} /></span>
                <span className="k-rail-title">{chapter.title}</span>
              </button>
            </motion.li>)}</ol>
          </div>}
          {tray === 'menu' && <div className="k-menu">
            <InventoryLink className="k-inventory-tray">Inventory software</InventoryLink>
            <nav aria-label="Page sections">{[['#safar', 'Journey', 'From the field to your table'], ['#rice', 'Rice', 'Find the pack for your dish'], ['#family', 'Family', 'The people behind 999']].map(([href, label, detail], index) => <motion.a key={href} href={href} onClick={event => goToSection(event, href)} aria-label={label}
              initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.08 + index * 0.05, ease: EASE }}>
              <span className="k-menu-link-copy"><span>{label}</span><small>{detail}</small></span><FiArrowUpRight aria-hidden="true" />
            </motion.a>)}</nav>
            <div className="k-menu-aside" aria-hidden="true"><img src={`${ART}road.webp`} alt="" /><p>A little closer to where<br />your rice comes from.</p></div>
          </div>}
        </>
        {tray && <p className="k-tray-foot"><span>Made in Pakistan</span><a href="https://hmricemills.com/" target="_blank" rel="noreferrer">Haji Muhammad Rice Mills <FiArrowUpRight aria-hidden="true" /></a></p>}
      </motion.div>
    </header>
  </>;
}

// Three nines, three rices. Pointing at (or tapping) a nine fills it with its
// rice's colour and puts that pack in the hero; otherwise the journey cycles.
function Hero({ preview }) {
  const reduce = useReducedMotion();
  const [rice, setRice] = useState(0);
  const chapter = CHAPTERS[preview ?? 2];
  const chosen = preview == null ? RICES[rice] : null;

  return <section id="top" className="k-hero" aria-labelledby="k-title">
    <div className="k-hero-mark" role="group" aria-label="999: one nine for each rice">
      {RICES.map((item, i) => <button key={item.key} type="button" className="k-nine" style={{ '--tone': item.color, '--idle': ['#1f3b2e', '#98723b', '#303a43'][i] }} aria-pressed={rice === i} aria-label={`${item.name}: ${item.best.toLowerCase()}`}
        onPointerEnter={event => { if (event.pointerType === 'mouse') setRice(i); }}
        onFocus={() => setRice(i)}
        onClick={() => setRice(i)}>
        <NineGlyph />
        <NineGlyph className="k-nine-fill" />
      </button>)}
    </div>
    <div className="k-hero-object" aria-hidden="true">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={chosen ? chosen.key : chapter.key} className="k-hero-object-inner"
          initial={reduce ? false : { opacity: 0, scale: 0.94, filter: 'blur(10px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 1.03, filter: 'blur(10px)' }} transition={{ duration: 0.45, ease: EASE }}>
          {chosen
            ? <Packshot rice={chosen} className="k-cutout-pack" />
            : <Cutout chapter={chapter} />}
        </motion.div>
      </AnimatePresence>
    </div>
    <div className="k-hero-copy">
      <p className="k-hero-rice" aria-live="polite">{chosen
        ? <><b style={{ color: chosen.color === MARI ? INK : chosen.color }}>{chosen.name}</b> · {chosen.best}</>
        : <>Three nines, three rices. <span className="k-hint-mouse">Point at one.</span><span className="k-hint-touch">Tap one.</span></>}</p>
      <h1 id="k-title" className="k-reveal">From the field to your dastarkhwan.</h1>
      <p lang="ur" dir="rtl">کھیت سے دسترخوان تک</p>
    </div>
    <a className="k-hero-cue" href="#safar"><span>Ride along</span><FiArrowDown aria-hidden="true" /></a>
  </section>;
}

// An object that travels through the world between two scroll positions.
function Flyer({ p, t0, t1, from, to, lift = 140, appear = t0, keep = false, scale: size = 1, children }) {
  const x = useTransform(p, [t0, t1], [from[0], to[0]]);
  const y = useTransform(p, [t0, (t0 + t1) / 2, t1], [from[1], Math.min(from[1], to[1]) - lift, to[1]]);
  const opacity = useFade(p, keep ? [appear - 0.004, appear] : [appear - 0.004, appear, t1, t1 + 0.002], keep ? [0, 1] : [0, 1, 1, 0]);
  const pop = useTransform(p, [appear - 0.012, appear], [0, size]);
  return <motion.g style={{ x, y, opacity }}><motion.g style={{ scale: pop }}>{children}</motion.g></motion.g>;
}

function Caption({ chapter, index, p }) {
  const { at, to } = chapter;
  const opacity = useTransform(p, v => Math.max(0, Math.min(1, at === 0 ? 1 : (v - at) / 0.015, to === 1 ? 1 : (to - v) / 0.015)));
  const y = useTransform(opacity, [0, 1], [18, 0]);
  return <motion.li className="k-caption" style={{ opacity, y }}>
    <p className="k-caption-step"><span>{String(index + 1).padStart(2, '0')}</span><span>{chapter.title}</span></p>
    <h3>{chapter.heading}</h3>
    <p>{chapter.body}</p>
  </motion.li>;
}

const PILE = [[1470, 800], [1545, 800], [1620, 800], [1508, 730], [1583, 730], [1545, 660]];
const FIELD = Array.from({ length: 42 }, (_, i) => i * 34 + 10);

function Story() {
  const ref = useRef(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const cam = useTransform(p, [0, 0.10, 0.22, 0.37, 0.40, 0.46, 0.58, 0.64, 0.71, 0.80, 0.86, 0.92, 1], [600, 900, 1150, 3020, 3250, 3700, 4500, 5100, 5420, 6500, 6950, 7750, 7750]);
  const truckX = useTransform(p, [0, 0.10, 0.22, 0.37, 0.46, 0.58, 0.71, 0.80, 1], [-900, 780, 780, 2700, 2700, 5120, 5120, 6040, 6040]);
  const spin = useTransform(truckX, v => (v / 46) * 57.3);
  const sacks = useFade(p, [0.215, 0.22, 0.40, 0.405], [0, 1, 1, 0]);
  const cartons = useFade(p, [0.703, 0.708], [0, 1]);
  const cut = useTransform(p, [0.015, 0.10], [-200, 1460]);
  const flow = useTransform(p, v => -v * 9000);
  const fill = useTransform(p, [0.56, 0.62], [0, -236]);
  const pour = useFade(p, [0.555, 0.56, 0.62, 0.625], [0, 1, 1, 0]);
  const packOut = useTransform(p, [0.625, 0.645], [0, 300]);
  const packGone = useFade(p, [0.64, 0.65], [1, 0]);
  const drum = useTransform(p, v => v * 4000);
  const sky = useTransform(p, [0, 0.35, 0.7, 1], ['#f6efdf', '#eef0ec', '#f3ecdd', '#f6dcc0']);
  const world = useMotionTemplate`translateX(calc(50vw - ${useTransform(cam, v => (v / W) * 100)}%))`;
  const far = useMotionTemplate`translateX(calc(50vw - ${useTransform(cam, v => (v * 0.55 / W) * 100)}%))`;
  const mid = useMotionTemplate`translateX(calc(50vw - ${useTransform(cam, v => (v * 0.8 / W) * 100)}%))`;
  const speed = useVelocity(truckX);
  const kmh = useTransform(speed, v => String(Math.min(99, Math.round(Math.abs(v) / 30))).padStart(2, '0'));
  const bar = useTransform(p, [0, 1], [0, 1]);
  const endOpacity = useFade(p, [0.9, 0.95], [0, 1]);
  const endScale = useTransform(p, [0.9, 0.97], [0.86, 1]);
  const endZoom = useTransform(p, [0.9, 1], [1.12, 1]);

  return <section id="safar" ref={ref} className="k-story" aria-labelledby="k-story-title">
    <motion.div className="k-stage" style={{ backgroundColor: sky }}>
      <h2 id="k-story-title" className="k-visually-hidden">The journey of a grain of 999 rice</h2>
      <div className="k-sun" aria-hidden="true" />

      <motion.svg className="k-layer" viewBox={`0 0 ${W} 1000`} style={{ transform: far }} aria-hidden="true">
        <path d={`M-800 760Q200 600 900 700T2400 690T3800 700T5400 720V1000H-800Z`} fill="#e7dcc4" />
        {[150, 420, 700, 980, 1290, 1700, 2080].map((x, i) => <g key={x} transform={`translate(${x} 712) scale(${0.8 + (i % 3) * 0.15})`} fill="#cfc49f">
          <rect x="-4" y="-70" width="8" height="70" /><ellipse cy="-82" rx="58" ry="20" />
        </g>)}
        {[3350, 3480, 3640, 3820, 3980, 4120].map((x, i) => <rect key={x} x={x} y={700 - (i % 3 + 1) * 70} width="120" height={(i % 3 + 1) * 70 + 60} fill="#ddd2bb" />)}
        <g fill="#d3c7ad"><rect x="3740" y="380" width="26" height="400" /><path d="M3732 380h42l-21-40Z" /><circle cx="3753" cy="372" r="8" /></g>
      </motion.svg>

      <motion.svg className="k-layer" viewBox={`0 0 ${W} 1000`} style={{ transform: mid }} aria-hidden="true">
        <text x="1700" y="700" textAnchor="middle" className="k-bigword">SAFAR</text>
        <text x="1700" y="330" textAnchor="middle" className="k-bigword-ur">سفر</text>
      </motion.svg>

      <motion.svg className="k-layer k-world" viewBox={`0 0 ${W} 1000`} style={{ transform: world }} aria-hidden="true">
        <defs><clipPath id="k-ripe"><motion.rect y="0" width="3000" height="1000" style={{ x: cut }} /></clipPath>
          <clipPath id="k-pack-fill"><motion.rect x="-90" y="0" width="180" height="250" style={{ y: fill }} /></clipPath></defs>
        <rect x="-1600" y="770" width="3200" height="40" fill="#d8c48e" />
        {FIELD.map(x => <g key={x}><g transform={`translate(${x + 17} 778) scale(.75)`}><Stubble /></g><g transform={`translate(${x} 806)`}><Stubble /></g></g>)}
        <g clipPath="url(#k-ripe)">{FIELD.map((x, i) => <g key={x}>
          <g transform={`translate(${x + 17} 778) scale(${0.72 + (i % 3) * 0.04})`} opacity=".8"><Paddy /></g>
          <g transform={`translate(${x} 806) scale(${0.95 + (i % 2) * 0.08})`}><Paddy /></g>
        </g>)}</g>

        <g transform="translate(6700 806)"><Shop /></g>
        <g transform="translate(7420 806)">
          <rect x="-20" y="-16" width="760" height="22" rx="4" fill={RICE} stroke={INK} strokeWidth="3" />
          <path d={`M-14-5${Array.from({ length: 37 }, (_, i) => `l10 ${i % 2 ? 6 : -6}`).join('')}`} stroke={VER} strokeWidth="3" fill="none" />
          {[110, 560].map(x => <g key={x} transform={`translate(${x} -16)`}>
            <ellipse rx="64" ry="12" fill={RICE} stroke={INK} strokeWidth="3" />
            <path d="M-38-6Q0-40 38-6Z" fill="#f2e3b3" stroke={INK} strokeWidth="2.5" />
          </g>)}
          <g transform="translate(680 -16)">
            <path d="M-46 0Q-50-36 0-40Q50-36 46 0Z" fill="#c9a46a" stroke={INK} strokeWidth="3" />
            <path d="M-34-30Q0-58 34-30" fill="#e8c98e" stroke={INK} strokeWidth="2.5" />
          </g>
          <g transform="translate(-10 -16)">
            <path d="M-18 0V-52Q-18-66-6-70V-78H6V-70Q18-66 18-52V0Z" fill="#b8743a" stroke={INK} strokeWidth="3" />
          </g>
          <g transform="translate(330 -16)"><Degh /></g>
          <g className="k-steam" transform="translate(330 -210)"><path d="M-30 0c-14-30 14-40 0-70M0 0c-14-30 14-40 0-70M30 0c-14-30 14-40 0-70" stroke="#9a8f80" strokeWidth="5" fill="none" strokeLinecap="round" /></g>
        </g>

        <rect x="-1600" y="806" width="10400" height="80" fill="#2b2723" />
        <path d="M-1600 846H8800" stroke={RICE} strokeWidth="6" strokeDasharray="44 36" opacity=".55" />
        <rect x="-1600" y="886" width="10400" height="200" fill="#ddd1b8" />

        <motion.g style={{ x: truckX }}><g transform="translate(0 836)"><ArtTruck href={`${ART}road.webp`} spin={spin} sacks={sacks} cartons={cartons} /></g></motion.g>

        <g transform="translate(3480 806)"><Mill /></g>
        <g transform="translate(4224 150) scale(.36)"><BrandBadge /></g>
        <path d="M3390 560H3510L3470 640H3430Z" fill={MARI} stroke={INK} strokeWidth="4" />
        <g fill="none" strokeLinecap="round" strokeWidth="9" strokeDasharray="12 11">
          <motion.path d="M3450 640V690H3640" stroke="#d9a531" style={{ strokeDashoffset: flow }} />
          <motion.path d="M3800 690H3950" stroke="#b98f5a" style={{ strokeDashoffset: flow }} />
          <motion.path d="M4110 690H4270" stroke={RICE} style={{ strokeDashoffset: flow }} />
          <motion.path d="M4430 690H4560V470H4760V490" stroke={RICE} style={{ strokeDashoffset: flow }} />
          <motion.path d="M3720 740V800" stroke="#8a6a3a" strokeWidth="6" style={{ strokeDashoffset: flow }} />
          <motion.path d="M4350 740V800" stroke={VER} strokeWidth="6" style={{ strokeDashoffset: flow }} />
          <motion.path d="M4760 556V590" stroke={RICE} style={{ strokeDashoffset: flow, opacity: pour }} />
        </g>
        <g className="k-machines">
          <rect x="3640" y="600" width="160" height="140" rx="12" />
          <motion.g style={{ rotate: drum }}><circle cx="4030" cy="660" r="78" /><path d="M3970 660H4090M4030 600V720" /></motion.g>
          <rect x="4270" y="600" width="160" height="140" rx="12" />
          <path d="M4700 490H4820L4790 550H4730Z" />
        </g>
        <path className="k-sortex-beam" d="M4290 630L4410 710" />
        <g className="k-machine-labels">
          {[[3720, 560, 'Husking'], [4030, 560, 'Polishing'], [4350, 560, 'Sorting'], [4930, 640, 'Packing']].map(([x, y, en]) => <g key={x} transform={`translate(${x} ${y})`}>
            <text textAnchor="middle">{en}</text>
          </g>)}
        </g>
        <motion.g style={{ x: packOut, opacity: packGone }}>
          <g transform="translate(4760 806)">
            <g opacity=".35"><Pack color="#4a4038" name="" urdu="" /></g>
            <g clipPath="url(#k-pack-fill)"><Pack /></g>
          </g>
        </motion.g>

        {PILE.map((spot, i) => <Flyer key={`pile${i}`} p={p} appear={0.03 + i * 0.012} t0={0.12 + i * 0.014} t1={0.15 + i * 0.014} from={spot} to={[840 + i * 62, 500]}><Sack /></Flyer>)}
        {[0, 1, 2].map(i => <Flyer key={`unload${i}`} p={p} t0={0.40 + i * 0.013} t1={0.425 + i * 0.013} from={[2860 + i * 110, 500]} to={[3450, 590]}><Sack /></Flyer>)}
        {[0, 1, 2].map(i => <Flyer key={`carton${i}`} p={p} t0={0.645 + i * 0.018} t1={0.67 + i * 0.018} from={[5080, 806]} to={[5190 + i * 110, 500]}><Carton /></Flyer>)}
        <Flyer p={p} t0={0.80} t1={0.84} from={[6240, 430]} to={[6960, 726]}><Carton /></Flyer>
        <Flyer p={p} t0={0.85} t1={0.89} from={[6960, 726]} to={[7950, 796]} lift={260} scale={0.5} keep><Pack /></Flyer>
      </motion.svg>

      <div className="k-hud">
        <ol className="k-captions">{CHAPTERS.map((chapter, index) => <Caption key={chapter.key} chapter={chapter} index={index} p={p} />)}</ol>
        <div className="k-gauge" aria-hidden="true">
          <motion.span className="k-gauge-bar" style={{ scaleX: bar }} />
          <span className="k-gauge-speed"><motion.span>{kmh}</motion.span> km/h</span>
        </div>
      </div>

      <motion.figure className="k-end-art" style={{ opacity: endOpacity }}>
        <motion.img style={{ scale: endZoom }} src={`${ART}dinner-premium.webp`} alt="Biryani and raita on an ivory linen table, with the green 999 Adwar Totaa rice pack" width="1536" height="1024" loading="lazy" />
      </motion.figure>
      <motion.div className="k-end k-end-over" style={{ opacity: endOpacity, scale: endScale }}>
        <h2 className="k-end-title">Made to be shared.</h2>
        <p>For the meals that bring us together.</p>
        <a className="k-end-cta" href="#rice">Choose your rice <FiArrowDown aria-hidden="true" /></a>
      </motion.div>
    </motion.div>
  </section>;
}

const SCATTER = [{ x: -160, y: 120, rotate: -24 }, { x: 0, y: 220, rotate: 14 }, { x: 160, y: 90, rotate: 28 }];

function RiceCard({ rice, index, progress }) {
  const from = SCATTER[index];
  const x = useTransform(progress, [0, 1], [from.x, 0]);
  const y = useTransform(progress, [0, 1], [from.y, 0]);
  const rotate = useTransform(progress, [0, 1], [from.rotate, index === 1 ? 0 : (index - 1) * 4]);
  return <li className="k-rice-card">
    <motion.div className="k-pack" style={{ x, y, rotate }}>
      <Packshot rice={rice} />
    </motion.div>
    <h3>{rice.name}</h3>
    <p>{rice.description}</p>
    <p className="k-best"><span>Best for</span>{rice.best}</p>
  </li>;
}

const FLOATERS = Array.from({ length: 16 }, (_, i) => ({ left: `${(i * 29) % 92 + 4}%`, top: `${(i * 37) % 88 + 4}%`, size: 11 + (i % 3) * 3, rotate: (i * 47) % 180, delay: -(i * 3.7), duration: 18 + (i % 4) * 3 }));

function Range() {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const section = ref.current;
    const measure = () => section.style.setProperty('--fall-distance', `${section.offsetHeight + 80}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(section);
    return () => observer.disconnect();
  }, []);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 0.15'] });
  const progress = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [0, 1]);
  return <section id="rice" ref={ref} className="k-range" aria-labelledby="k-rice-title">
    <div className="k-floaters" aria-hidden="true">{FLOATERS.map((f, i) => <Grain key={i} className="k-floater" style={{ left: f.left, width: f.size, '--rest-top': f.top, '--r': `${f.rotate}deg`, animationDelay: `${f.delay}s`, animationDuration: `${f.duration}s` }} />)}</div>
    <p className="k-label"><span>The rice</span></p>
    <h2 id="k-rice-title" className="k-reveal">Three rices, each for its dish.</h2>
    <ul className="k-rices">{RICES.map((rice, index) => <RiceCard key={rice.key} rice={rice} index={index} progress={progress} />)}</ul>
    <div className="k-bulk">
      <img src={`${ASSETS}originals/kainat-25kg.png`} alt="Original 999 Kainat 1121 Steam Rice 25 kg sack" loading="lazy" />
      <div><h3>For a bigger table.</h3><p>Kainat 1121 Steam Rice. Extra long grain, in the original 25 kg sack.</p><span>Product of Pakistan</span></div>
    </div>
  </section>;
}

// The truck-art motto, set large and alone. Its translation is a reveal: hover
// or focus on a pointer screen, a tap on a phone.
function Motto() {
  const [open, setOpen] = useState(false);
  return <div className="k-motto">
    <button type="button" className="k-motto-line" aria-expanded={open} aria-describedby="k-motto-tr" onClick={() => setOpen(value => !value)}>
      <span lang="ur" dir="rtl">دیکھ مگر پیار سے</span>
    </button>
    <p id="k-motto-tr" className="k-motto-tr" data-open={open ? '' : undefined}>
      <span>Look, but with love.</span>
      <span>Painted on the backs of trucks across Pakistan.</span>
    </p>
  </div>;
}

function Footer() {
  return <footer className="k-footer">
    <div className="k-jhalar" aria-hidden="true">{Array.from({ length: 48 }, (_, i) => <i key={i} style={{ '--i': i, '--h': `${34 + (i * 7) % 30}px` }} />)}</div>
    <div className="k-footer-brand-row">
      <a href="#top" className="k-footer-brand"><Logo title="" /><span>HM Edibles<small>999 · Premium grains</small></span></a>
      <a className="k-footer-rice-link" href="#rice">Find your rice <FiArrowUpRight aria-hidden="true" /></a>
    </div>
    <Motto />
    <nav className="k-footer-cols" aria-label="Footer">
      <div><h3>Journey</h3>{CHAPTERS.map(chapter => <button key={chapter.key} type="button" onClick={() => jumpTo(chapter)}>{chapter.title}</button>)}</div>
      <div><h3>Rice</h3>{RICES.map(rice => <a key={rice.key} href="#rice">{rice.name}</a>)}</div>
      <div><h3>HM Edibles</h3>
        <a href="https://hmricemills.com/" target="_blank" rel="noreferrer">Haji Muhammad Rice Mills <FiArrowUpRight aria-hidden="true" /></a>
        <Link to="/inventory">Inventory software</Link>
      </div>
    </nav>
    <a href="#top" className="k-footer-scene" aria-label="999, back to top">
      <PunjabScene truckHref={`${ART}road.webp`} />
    </a>
    <p className="k-footer-base"><span>© {new Date().getFullYear()} 999</span><span>Made in Pakistan</span><a href="#top">Back to top ↑</a></p>
  </footer>;
}

// The family: who stands behind the label, beside the paddies it comes from.
// The painting opens out of a smaller frame as it scrolls in.
function Family() {
  const ref = useRef(null);
  useGSAP(() => {
    gsap.matchMedia().add(MOTION_OK, () => {
      const scene = ref.current.querySelector('.k-family-scene');
      const painting = scene.querySelector('img');
      gsap.fromTo(painting, { scale: 1.2, clipPath: 'inset(14% 14% 14% 14% round 28px)' }, { scale: 1, clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', scrollTrigger: { trigger: scene, start: 'top 90%', end: 'center 55%', scrub: 0.8 } });
      gsap.fromTo(painting, { yPercent: -4 }, { yPercent: 4, ease: 'none', scrollTrigger: { trigger: scene, start: 'top bottom', end: 'bottom top', scrub: true } });
      gsap.from('.k-lineage > *', { y: 16, opacity: 0, duration: 0.8, ease: 'expo.out', stagger: 0.12, scrollTrigger: { trigger: '.k-lineage', start: 'top 90%', once: true } });
    });
  }, { scope: ref });

  return <section id="family" ref={ref} className="k-family" aria-labelledby="k-family-title">
    <div className="k-family-copy">
      <div className="k-hm-identity"><Logo title="" /><span>HM Edibles<small>Premium grains</small></span></div>
      <h2 id="k-family-title" className="k-reveal">A new name, from a family that knows rice.</h2>
      <p>999 is its own label, with its own look. Behind it is the family of Haji Muhammad Rice Mills, and a simple idea: good rice belongs at the centre of the cloth.</p>
      <div className="k-lineage">
        <a href="https://hmricemills.com/" target="_blank" rel="noreferrer">Haji Muhammad Rice Mills <FiArrowUpRight aria-hidden="true" /></a>
        <span className="k-lineage-line" aria-hidden="true" />
        <span className="k-lineage-new"><Logo className="k-lineage-mark" title="" /> Rice Company</span>
      </div>
    </div>
    <figure className="k-family-scene">
      <img src={`${ART}family.webp`} alt="Punjab paddy fields from above at harvest: gold plots, a canal, a farmhouse and harvesters" loading="lazy" />
      <figcaption>Punjab</figcaption>
    </figure>
  </section>;
}

// Every image the page shows, fetched and decoded before the curtain lifts, so
// nothing paints half-loaded on a slow connection. Waiting gives up after 12s;
// anything still in flight keeps loading behind the page.
const PRELOAD = IMAGES.map(path => `${ASSETS}${path}`);

function Preloader({ onReady, onGone }) {
  const ref = useRef(null);
  const [progress, setProgress] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    let loaded = 0, finished = false;
    const total = PRELOAD.length + 1;
    const started = performance.now();
    const tick = () => { loaded += 1; setProgress(Math.min(1, loaded / total)); };
    const decode = src => { const image = new Image(); image.src = src; return image.decode().catch(() => {}).then(tick); };
    const finish = () => {
      if (finished) return;
      finished = true;
      setProgress(1);
      onReady();
      // A cached visit is ready almost at once: lift quickly rather than show off.
      const quick = performance.now() - started < 400;
      if (reduce) gsap.to(ref.current, { opacity: 0, duration: 0.25, onComplete: onGone });
      else gsap.to(ref.current, { clipPath: 'inset(0% 0% 100% 0%)', duration: quick ? 0.55 : 0.95, delay: quick ? 0 : 0.25, ease: 'expo.inOut', onComplete: onGone });
    };
    Promise.all([...PRELOAD.map(decode), (document.fonts?.ready || Promise.resolve()).then(tick)]).then(finish);
    const timeout = setTimeout(finish, 12000);
    return () => { finished = true; clearTimeout(timeout); };
  }, [onReady, onGone, reduce]);

  const percent = Math.round(progress * 100);
  return <div ref={ref} className="k-loader" role="status">
    <div className="k-loader-mark" aria-hidden="true">
      <Logo className="k-loader-ghost" title="" />
      <div className="k-loader-fill" style={{ clipPath: `inset(${100 - percent}% 0% 0% 0%)` }}><Logo title="" /></div>
    </div>
    <p className="k-loader-count" aria-hidden="true">{percent}<span>%</span></p>
    <p className="k-loader-line">Bringing in the harvest<span className="k-visually-hidden">, {percent} percent</span></p>
  </div>;
}

export default function Landing() {
  const [preview, setPreview] = useState(null);
  const [ready, setReady] = useState(false);
  const [loaderGone, setLoaderGone] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const onGone = useCallback(() => setLoaderGone(true), []);
  const rootRef = useRef(null);

  // The page holds still under the loader.
  useEffect(() => {
    if (loaderGone) return undefined;
    const root = document.documentElement;
    root.style.overflow = 'hidden';
    return () => { root.style.overflow = ''; };
  }, [loaderGone]);

  // Once everything is in: headlines rise line by line from behind a mask and
  // the nines land like sacks thrown onto a pile.
  useGSAP(() => {
    if (!ready) return;
    gsap.matchMedia().add(MOTION_OK, () => {
      gsap.utils.toArray('.k-reveal').forEach(element => SplitText.create(element, {
        type: 'lines', mask: 'lines', autoSplit: true,
        onSplit: self => gsap.from(self.lines, { yPercent: 105, duration: 1, ease: 'expo.out', stagger: 0.09, scrollTrigger: { trigger: element, start: 'top 90%', once: true } }),
      }));
      gsap.from('.k-nine', { y: 24, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.08, delay: 0.1 });
      gsap.from('.k-hero-object', { y: 50, opacity: 0, duration: 1.1, ease: 'expo.out', delay: 0.7 });
      gsap.from('.k-hero-copy > p, .k-hero-cue', { y: 16, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.1, delay: 0.9 });
    });
  }, { scope: rootRef, dependencies: [ready] });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('rice-public-page');
    if (!document.querySelector(`link[href="${FONTS}"]`)) {
      const fonts = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: FONTS });
      document.head.appendChild(fonts);
    }
    const previousTitle = document.title, description = document.querySelector('meta[name="description"]'), previousDescription = description?.getAttribute('content');
    const favicon = document.querySelector('link[rel="icon"]');
    const previousIcon = favicon?.getAttribute('href'), previousIconType = favicon?.getAttribute('type');
    const themeColors = [...document.querySelectorAll('meta[name="theme-color"]')].map(element => [element, element.getAttribute('content')]);
    favicon?.setAttribute('href', `${ASSETS}favicon.svg`);
    favicon?.setAttribute('type', 'image/svg+xml');
    themeColors.forEach(([element]) => element.setAttribute('content', '#f4f1ea'));
    const frame = requestAnimationFrame(() => { document.title = '999 Rice Company — from the field to your dastarkhwan'; });
    description?.setAttribute('content', '999: Pakistani basmati, sella and steam rice, followed from the paddy field to your dastarkhwan.');
    return () => {
      root.classList.remove('rice-public-page'); cancelAnimationFrame(frame); document.title = previousTitle;
      if (previousDescription != null) description?.setAttribute('content', previousDescription);
      if (previousIcon != null) favicon?.setAttribute('href', previousIcon);
      if (previousIconType != null) favicon?.setAttribute('type', previousIconType);
      themeColors.forEach(([element, content]) => { if (content != null) element.setAttribute('content', content); });
    };
  }, []);

  return <div className="k" ref={rootRef} onClick={handleLocalAnchor}>
    {!loaderGone && <Preloader onReady={onReady} onGone={onGone} />}
    <a className="k-skip" href="#k-main">Skip to content</a>
    <Header onPreview={setPreview} />
    <main id="k-main" onPointerEnter={() => setPreview(null)}>
      <Hero preview={preview} />
      <Story />
      <Range />
      <Family />
      <section id="team" className="k-team" aria-labelledby="k-team-title">
        <p className="k-label"><span>999 team</span></p>
        <h2 id="k-team-title" className="k-reveal">Stock, sales and cash, in one place.</h2>
        <p>The inventory software for the people who run 999.</p>
        <InventoryLink className="k-inventory-large">Use the inventory software</InventoryLink>
      </section>
    </main>
    <Footer />
  </div>;
}
