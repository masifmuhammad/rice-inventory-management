import React from 'react';
import { motion } from 'framer-motion';

// Flat illustrations for the 999 journey. Every piece is drawn in local
// coordinates with its base on y = 0, so the scene can stand it on the road.

export const INK = '#252823';
export const RICE = '#f4f1ea';
export const VER = '#1f3b2e';
export const MARI = '#c79a4a';
export const COB = '#66849a';
const JUTE = '#efe6d2';
const DARK = '#2a2520';

export function NineGlyph({ className }) {
  return <svg className={className} viewBox="0 0 102 164" aria-hidden="true"><text x="51" y="124" textAnchor="middle" fontFamily="Georgia, serif" fontSize="150" fontWeight="700">9</text></svg>;
}

export function Nines({ fill = 'currentColor', gap = 104 }) {
  return <g fill={fill} fontFamily="Georgia, serif" fontWeight="700" fontSize="172">{[0, gap, gap * 2].map(x => <text key={x} x={x} y="145">9</text>)}</g>;
}

// The scalloped label from the supplied 999 packaging, shared by every drawing.
export function BrandBadge({ field = RICE, nines = VER, edge = MARI }) {
  return <g>
    <path d="M210 106Q234 138 282 130Q348 120 353 174Q354 198 396 232Q354 262 353 290Q348 344 282 334Q236 328 210 362Q184 328 138 334Q72 344 67 290Q66 262 24 232Q66 198 67 174Q72 120 138 130Q186 138 210 106Z" fill={field} stroke={edge} strokeWidth="10" />
    <text x="210" y="286" textAnchor="middle" fontFamily="Georgia, serif" fontSize="164" fontWeight="700" fill={nines}>999</text>
  </g>;
}

// HM monogram and wheat from the owner's supplied identity.
export function Logo({ className, title = 'HM Edibles' }) {
  const label = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };
  return <svg className={className} viewBox="0 0 420 470" fill="currentColor" {...label}>
    {title && <title>{title}</title>}
    <path d="M208 408A182 182 0 1 1 332 92" fill="none" stroke={MARI} strokeWidth="8" />
    <text x="85" y="258" fontFamily="Georgia, serif" fontSize="216" fill="currentColor">H</text>
    <text x="173" y="304" fontFamily="Georgia, serif" fontSize="188" fill={MARI}>M</text>
    <path d="M232 406Q386 364 365 100" fill="none" stroke={MARI} strokeWidth="7" />
    {[0, 1, 2, 3, 4].map(i => <g key={i} transform={`translate(${358 - i * i * 3} ${132 + i * 43}) rotate(${i * 7})`} fill={MARI}><path d="M0 0Q-40-10-34-49Q-5-36 0 0Z" /><path d="M3 18Q39-2 34-37Q5-24 3 18Z" /></g>)}
  </svg>;
}

export function Grain({ className, style }) {
  return <svg className={className} style={style} viewBox="0 0 20 44" aria-hidden="true"><path d="M10 0C17 8 19 30 10 44C1 30 3 8 10 0Z" fill="currentColor" /></svg>;
}

// `tone` paints the whole clump one colour, for silhouettes.
export function Paddy({ ripe = true, tone }) {
  const head = tone || (ripe ? '#d9a531' : '#9aa43f');
  return <g fill="none" strokeLinecap="round">
    <path d="M-2 0Q-30-50-48-78M2 0Q28-46 50-70" stroke={tone || '#86903a'} strokeWidth="4" />
    {[-16, -7, 2, 10, 18].map(a => {
      const x = a * 3, y = -140 + Math.abs(a) * 1.5, side = a >= 0 ? 1 : -1;
      return <g key={a}>
        <path d={`M0 0Q${a}-70 ${x} ${y}`} stroke={tone || '#a28f42'} strokeWidth="3" />
        <path d={`M${x} ${y}q${14 * side} 6 ${22 * side} 36`} stroke={head} strokeWidth="6" strokeDasharray="6 3" />
      </g>;
    })}
  </g>;
}

export function Stubble() {
  return <path d="M-10 0V-14M-3 0V-20M4 0V-16M11 0V-11" stroke="#b39a52" strokeWidth="3" strokeLinecap="round" />;
}

export function Sack() {
  return <g>
    <path d="M-32 0C-38-30-34-62-22-76L-12-84H12L22-76C34-62 38-30 32 0Z" fill={JUTE} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
    <path d="M-35-52H35" stroke={COB} strokeWidth="6" />
    <path d="M-15-76H15" stroke={INK} strokeWidth="4" strokeLinecap="round" />
    <g transform="translate(-21 -58) scale(.1)"><BrandBadge /></g>
  </g>;
}

export function Carton() {
  return <g>
    <rect x="-44" y="-64" width="88" height="64" rx="3" fill="#cfa86c" stroke={INK} strokeWidth="3" />
    <path d="M-44-50H44" stroke="#b08a50" strokeWidth="6" />
    <g transform="translate(-21 -57) scale(.1)"><BrandBadge /></g>
  </g>;
}

function Wheel({ cx, spin, cy = -46, k = 1 }) {
  return <g transform={`translate(${cx} ${cy}) scale(${k})`}>
    <motion.g style={{ rotate: spin }}>
      <circle r="46" fill={INK} />
      <circle r="29" fill={MARI} />
      <path d="M0-25V25M-21.6-12.5L21.6 12.5M-21.6 12.5L21.6-12.5" stroke={COB} strokeWidth="6" />
      <circle r="7" fill={INK} />
      <circle cy="-38" r="3" fill={RICE} />
    </motion.g>
  </g>;
}

// What a truck carries: a netted heap of sacks or a stack of cartons, drawn so
// either can appear and disappear as the story loads and unloads it.
function Load({ sacks, cartons, y = 0 }) {
  return <g transform={`translate(0 ${y})`}>
    <motion.g style={{ opacity: sacks }}>
      <path d="M20-336Q40-392 90-384Q120-410 170-396Q210-422 260-398Q300-414 340-392Q400-402 436-336Z" fill={JUTE} stroke={INK} strokeWidth="3" />
      <path d="M60-340L150-396M150-340L250-404M250-340L340-396" stroke={INK} strokeWidth="2" strokeDasharray="8 6" />
    </motion.g>
    <motion.g style={{ opacity: cartons }}>
      {[[70, -336], [160, -336], [250, -336], [340, -336], [115, -400], [205, -400], [295, -400]].map(([x, y]) => <g key={`${x}${y}`} transform={`translate(${x} ${y})`}><Carton /></g>)}
    </motion.g>
  </g>;
}

// The painted truck artwork (1254px square, ground at y 992), fitted to the
// drawn truck's frame: 640 wide with its ground at 0. Its own sack load is
// clipped off above the rail so the story can load and unload it, and drawn
// wheels sit exactly over the painted ones so they can turn.
const TK = 0.54;
export function ArtTruck({ href, spin, sacks = 0, cartons = 0 }) {
  const at = v => v * TK;
  return <g>
    <defs>
      <clipPath id="k-truck-body">
        <rect x={at(-43)} y={at(488 - 992)} width={at(1254)} height={at(600)} />
        <rect x={at(845 - 43)} y={at(240 - 992)} width={at(420)} height={at(260)} />
      </clipPath>
    </defs>
    <Load sacks={sacks} cartons={cartons} y={64} />
    <image href={href} x={at(-43)} y={at(-992)} width={at(1254)} height={at(1254)} clipPath="url(#k-truck-body)" />
    {[240, 430, 1015].map(x => <Wheel key={x} cx={at(x - 43)} cy={at(900 - 992)} k={1.08} spin={spin} />)}
  </g>;
}

// A rice pack seen from the front: a gusseted pouch with a crimped top seal.
export function Pack({ color = VER, name = 'Adwar Totaa', urdu = 'Made in Pakistan', ink = RICE }) {
  // 28 steps of 5 span the 144-wide seal exactly; a longer run poked out past its corner.
  const crimp = Array.from({ length: 28 }, (_, i) => `l5 ${i % 2 ? 5 : -5}`).join('');
  return <g>
    <path d="M-74 0Q-82-110-72-200H72Q82-110 74 0Z" fill={color} stroke={INK} strokeWidth="3" />
    <rect x="-74" y="-214" width="148" height="18" rx="3" fill={color} stroke={INK} strokeWidth="3" />
    <path d={`M-70-205${crimp}`} stroke={INK} strokeWidth="1.5" fill="none" opacity=".45" />
    <g transform="translate(-42 -208) scale(.2)"><BrandBadge /></g>
    <text x="0" y="-105" textAnchor="middle" fill={ink} fontSize="15" fontWeight="600" fontFamily="Georgia, serif">{name.toUpperCase()}</text>
    <text x="0" y="-89" textAnchor="middle" fill={ink} fontSize="8">{urdu}</text>
    <ellipse cx="0" cy="-49" rx="38" ry="33" fill={RICE} stroke={MARI} strokeWidth="2" />
    {[-24, -12, 0, 12, 24].map((x, i) => <g key={x}>{[-61, -47, -33].map(y => <path key={y} d={`M${x} ${y}c3 4 3 10 0 14c-3-4-3-10 0-14Z`} fill="#d9cfb9" transform={`rotate(${i % 2 ? 30 : -30} ${x} ${y + 6})`} />)}</g>)}
    <text y="-5" textAnchor="middle" fontSize="9" fill={ink}>NET WT. 1 kg</text>
  </g>;
}

export function Degh() {
  return <g>
    <path d="M-112-10Q-124-112-92-150H92Q124-112 112-10Z" fill="#b8743a" stroke={INK} strokeWidth="3" />
    <path d="M-104-60H104" stroke="#9a5b26" strokeWidth="6" />
    <ellipse cy="-152" rx="100" ry="14" fill="#d59357" stroke={INK} strokeWidth="3" />
    <path d="M-70-160Q0-196 70-160" fill="#c47f44" stroke={INK} strokeWidth="3" />
    <circle cy="-186" r="8" fill={INK} />
    <path d="M-130-112h18M112-112h18" stroke={INK} strokeWidth="8" strokeLinecap="round" />
    <ellipse cy="-4" rx="118" ry="8" fill={INK} opacity=".15" />
  </g>;
}

export function Shop() {
  const stripes = Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${i * 40} 0h40v40q-20 18-40 0Z`} fill={i % 2 ? RICE : VER} stroke={INK} strokeWidth="2" />);
  return <g>
    <rect x="0" y="-360" width="520" height="360" fill="#e9dfcc" stroke={INK} strokeWidth="4" />
    <rect x="20" y="-350" width="480" height="70" rx="6" fill={COB} />
    <text x="40" y="-306" fill={RICE} fontSize="30" fontWeight="700">Kiryana Store</text>
    <text x="480" y="-304" textAnchor="end" fill={MARI} fontSize="26" fontWeight="700" fontFamily="'Noto Sans Arabic', sans-serif">کریانہ سٹور</text>
    <rect x="40" y="-230" width="440" height="230" fill={DARK} />
    <g transform="translate(20 -280)">{stripes}</g>
    {[-180, -120].map(y => <g key={y}>
      <path d={`M50 ${y}H470`} stroke="#6a5a48" strokeWidth="5" />
      {[70, 110, 150, 230, 270, 350, 390, 430].map((x, i) => <rect key={x} x={x} y={y - 34} width="26" height="34" rx="3" fill={[VER, MARI, COB, RICE][(i + y) % 4]} />)}
    </g>)}
    <rect x="40" y="-80" width="440" height="80" fill="#c9a46a" stroke={INK} strokeWidth="3" />
  </g>;
}

export function Mill() {
  return <g>
    <path d="M0 80V-440L120-500V-440L240-500V-440L360-500V-440L480-500V-440L600-500V-440L720-500V-440L840-500V-440L960-500V-440L1080-500V-440L1200-500V-440L1320-500V-440L1440-500V-440L1560-500V-440H1640V80Z" fill="#ebe5d8" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
    <rect x="20" y="-370" width="1600" height="450" fill={DARK} />
    <rect x="1560" y="-160" width="80" height="240" fill="#14110d" />
  </g>;
}

// Dusk over the Punjab paddies, for the footer: the 999 sets like the sun behind
// rows of rice running to the horizon, a khaal catching the sky, the painted
// truck (truckHref) driving the bund road and a tubewell kotha with its lamp lit.
export function PunjabScene({ className, truckHref }) {
  const V = [720, 300];
  const rows = Array.from({ length: 24 }, (_, i) => -2400 + i * 240);
  return <svg className={className} viewBox="0 0 1440 560" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <linearGradient id="k-dusk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#24323d" />
        <stop offset=".42" stopColor="#50667b" />
        <stop offset=".72" stopColor="#b58d8f" />
        <stop offset="1" stopColor="#dfcba5" />
      </linearGradient>
      <linearGradient id="k-sun" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={MARI} />
        <stop offset="1" stopColor="#e3cd9e" />
      </linearGradient>
      <linearGradient id="k-khaal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={MARI} />
        <stop offset="1" stopColor="#6a8393" />
      </linearGradient>
      <radialGradient id="k-glow"><stop offset="0" stopColor={MARI} stopOpacity=".55" /><stop offset="1" stopColor={MARI} stopOpacity="0" /></radialGradient>
    </defs>
    <rect width="1440" height="310" fill="url(#k-dusk)" />
    {[[120, 40], [260, 90], [410, 30], [980, 60], [1130, 26], [1300, 84], [1380, 40], [560, 70], [860, 22]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="1.6" fill={RICE} opacity=".6" />)}
    <ellipse cx="720" cy="290" rx="520" ry="200" fill="url(#k-glow)" />
    <circle cx="720" cy="284" r="116" fill="url(#k-sun)" />
    <g className="k-birds" fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round">
      <path d="M1040 120q8-8 16 0q8-8 16 0" /><path d="M1084 104q6-6 12 0q6-6 12 0" /><path d="M1010 96q5-5 10 0q5-5 10 0" />
    </g>
    <path d="M0 300C60 284 90 292 130 286S210 270 260 288S330 278 380 290S470 274 520 292L560 296H880C920 286 980 278 1030 290S1110 272 1170 288S1260 280 1310 290S1400 282 1440 292V312H0Z" fill="#2a1a17" />
    <g fill="#2a1a17">
      <rect x="196" y="236" width="10" height="64" /><path d="M188 238h26l-13-26Z" /><circle cx="201" cy="208" r="5" />
      <ellipse cx="300" cy="262" rx="46" ry="16" /><rect x="297" y="262" width="6" height="34" />
      <ellipse cx="1210" cy="258" rx="54" ry="18" /><rect x="1207" y="258" width="6" height="40" />
      <rect x="1080" y="270" width="54" height="32" /><path d="M1074 272h66l-8-10h-50Z" />
    </g>
    <rect x="1098" y="282" width="10" height="10" fill={MARI} className="k-lamp" />
    <rect y="300" width="1440" height="260" fill="#5e4719" />
    {rows.map((x, i) => <path key={x} d={`M${V[0]} ${V[1]}L${x} 560H${x + 240}Z`} fill={i % 2 ? '#7a5d22' : '#5e4719'} />)}
    <path d={`M${V[0]} ${V[1]}L470 560H560Z`} fill="url(#k-khaal)" opacity=".9" />
    <rect y="296" width="1440" height="40" fill={VER} opacity=".18" />
    <rect y="306" width="1440" height="8" fill="#3a2716" />
    <g className="k-scene-truck"><image href={truckHref} x="-4" y={314 - 992 * 0.093} width={1254 * 0.093} height={1254 * 0.093} /></g>
    <g>{Array.from({ length: 44 }, (_, i) => <g key={i} transform={`translate(${i * 34 - 10} 566) scale(${0.62 + (i % 3) * 0.1})`}><Paddy tone="#1a120e" /></g>)}</g>
  </svg>;
}
