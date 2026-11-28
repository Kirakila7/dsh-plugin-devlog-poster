import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStyle } from './styles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MASCOTS_DIR = join(__dirname, '..', 'assets', 'mascots');

const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
const MONO_STACK = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/**
 * Bright chibi comic palettes harmonizing P2–P4 carousel slides with the 4 AI-girl P1 covers.
 */
const COMIC_PALETTES = {
  big_fat_fish: {
    bgFrom: '#EFF6FF',
    bgMid: '#F8FBFF',
    bgTo: '#DBEAFE',
    panelFill: 'rgba(255,255,255,0.62)',
    panelStroke: '#BFDBFE',
    dotPattern: '#93C5FD',
    ink: '#1E293B',
    bodyInk: '#1E293B',
    muted: '#475569',
    accent: '#2563EB',
    accentSoft: '#38BDF8',
    accentTint: '#E0F2FE',
    badgeText: '#FFFFFF',
    shadow: '#1E293B',
    pitfallBg: '#FFFBEB',
    pitfallTagBg: '#FEF3C7',
    pitfallAccent: '#B45309',
    motif: 'bubbles',
  },
  gemini: {
    bgFrom: '#F5F3FF',
    bgMid: '#FAF8FF',
    bgTo: '#EDE9FE',
    panelFill: 'rgba(255,255,255,0.62)',
    panelStroke: '#DDD6FE',
    dotPattern: '#C4B5FD',
    ink: '#2E1065',
    bodyInk: '#2E1065',
    muted: '#5B21B6',
    accent: '#7C3AED',
    accentSoft: '#F59E0B',
    accentTint: '#F3E8FF',
    badgeText: '#FFFFFF',
    shadow: '#2E1065',
    pitfallBg: '#FFFBEB',
    pitfallTagBg: '#FEF3C7',
    pitfallAccent: '#B45309',
    motif: 'stars',
  },
  chatgpt: {
    bgFrom: '#F0FDF4',
    bgMid: '#F7FFF9',
    bgTo: '#DCFCE7',
    panelFill: 'rgba(255,255,255,0.66)',
    panelStroke: '#BBF7D0',
    dotPattern: '#86EFAC',
    ink: '#14532D',
    bodyInk: '#1E293B',
    muted: '#166534',
    accent: '#10B981',
    accentSoft: '#34D399',
    accentTint: '#D1FAE5',
    badgeText: '#FFFFFF',
    shadow: '#14532D',
    pitfallBg: '#FFFBEB',
    pitfallTagBg: '#FEF3C7',
    pitfallAccent: '#B45309',
    motif: 'code',
  },
  claude: {
    bgFrom: '#FFF7ED',
    bgMid: '#FFFBF5',
    bgTo: '#FFEDD5',
    panelFill: 'rgba(255,255,255,0.64)',
    panelStroke: '#FED7AA',
    dotPattern: '#FDBA74',
    ink: '#3B1E0E',
    bodyInk: '#3B1E0E',
    muted: '#7C2D12',
    accent: '#EA580C',
    accentSoft: '#D97757',
    accentTint: '#FFEDD5',
    badgeText: '#FFFFFF',
    shadow: '#3B1E0E',
    pitfallBg: '#FEF2F2',
    pitfallTagBg: '#FEE2E2',
    pitfallAccent: '#B91C1C',
    motif: 'spark',
  },
};

function resolveComicPalette(styleId = 'big_fat_fish') {
  return COMIC_PALETTES[styleId] || COMIC_PALETTES.big_fat_fish;
}

/**
 * Resolve built-in AI-girl cover artwork path for a given style (credit: Zipzipipe).
 */
export function resolveDefaultMascotPath(styleId = 'big_fat_fish') {
  const candidate = join(MASCOTS_DIR, `${styleId}.png`);
  return existsSync(candidate) ? candidate : null;
}

function escapeXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Estimate visual width in half-width units: CJK / fullwidth / emoji = 2, ASCII = 1.
 */
function charDisplayWidth(ch) {
  const cp = ch.codePointAt(0);
  if (cp == null) return 0;
  if (
    cp >= 0x1100 &&
    (cp <= 0x115f ||
      cp === 0x2329 ||
      cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe10 && cp <= 0xfe19) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      cp >= 0x1f000)
  ) {
    return 2;
  }
  return 1;
}

function getDisplayWidth(text = '') {
  let width = 0;
  for (const ch of String(text)) {
    width += charDisplayWidth(ch);
  }
  return width;
}

function truncateByDisplayWidth(text, maxUnits) {
  const str = String(text || '').replace(/\s+/g, ' ').trim();
  if (getDisplayWidth(str) <= maxUnits) return str;
  const target = Math.max(2, maxUnits - 2);
  let out = '';
  let used = 0;
  for (const ch of str) {
    const w = charDisplayWidth(ch);
    if (used + w > target) break;
    out += ch;
    used += w;
  }
  return `${out.trimEnd()}…`;
}

/**
 * Display-width-aware text wrapper (CJK=2, ASCII=1) with clean word breaks for ASCII runs.
 */
function wrapText(text, maxUnits) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [''];
  const lines = [];
  let current = '';
  let currentWidth = 0;
  const chars = [...cleaned];

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const w = charDisplayWidth(ch);

    if (currentWidth + w > maxUnits && current) {
      // Avoid breaking mid-ASCII-word if there's a nearby space
      const lastSpace = current.lastIndexOf(' ');
      if (w === 1 && ch !== ' ' && lastSpace > Math.floor(current.length * 0.45)) {
        const head = current.slice(0, lastSpace).trimEnd();
        const tail = current.slice(lastSpace + 1);
        lines.push(head);
        current = tail + ch;
        currentWidth = getDisplayWidth(current);
      } else {
        lines.push(current.trimEnd());
        current = ch === ' ' ? '' : ch;
        currentWidth = ch === ' ' ? 0 : w;
      }
    } else {
      if (current === '' && ch === ' ') continue;
      current += ch;
      currentWidth += w;
    }
  }
  if (current.trim()) lines.push(current.trimEnd());
  return lines.length > 0 ? lines : [''];
}

function wrapTextClamped(text, maxUnits, maxLines) {
  const all = wrapText(text, maxUnits);
  if (all.length <= maxLines) return all;
  const kept = all.slice(0, maxLines);
  kept[maxLines - 1] = truncateByDisplayWidth(`${kept[maxLines - 1]} ${all.slice(maxLines).join(' ')}`, maxUnits);
  return kept;
}

/**
 * Convert a local PNG/JPG/WebP image path into an inline data URI for SVG compositing.
 */
export function fileToDataUri(imagePath) {
  if (!imagePath || !existsSync(imagePath)) return null;
  const ext = extname(imagePath).toLowerCase();
  const mime =
    ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.webp'
        ? 'image/webp'
        : 'image/png';
  const b64 = readFileSync(imagePath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

function renderMascotSvg(styleId, x, y, scale = 1, uid = 'v') {
  // All 4 icons are drawn in a normalized 200x200 coordinate space centered at (100, 100)
  // matching the bold dark-ink chibi comic sticker icons on the 4 official AI-girl covers.
  if (styleId === 'gemini') {
    return `
  <g data-mascot-icon="gemini" transform="translate(${x}, ${y}) scale(${scale})">
    <defs>
      <linearGradient id="gemOuter_${uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#C4B5FD"/>
        <stop offset="55%" stop-color="#A78BFA"/>
        <stop offset="100%" stop-color="#8B5CF6"/>
      </linearGradient>
      <linearGradient id="gemCore_${uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FEF08A"/>
        <stop offset="55%" stop-color="#FCD34D"/>
        <stop offset="100%" stop-color="#F59E0B"/>
      </linearGradient>
    </defs>
    <!-- Bold dark-ink 4-point sparkle sticker with lavender outer rim & golden core -->
    <path d="M96 22 C104 68, 128 92, 174 100 C128 108, 104 132, 96 178 C88 132, 64 108, 18 100 C64 92, 88 68, 96 22 Z" fill="url(#gemOuter_${uid})" stroke="#2E1065" stroke-width="8" stroke-linejoin="round"/>
    <path d="M96 48 C102 78, 118 94, 148 100 C118 106, 102 122, 96 152 C90 122, 74 106, 44 100 C74 94, 90 78, 96 48 Z" fill="url(#gemCore_${uid})"/>
    <!-- Tiny companion sparkle accent -->
    <path d="M156 36 C158 46, 163 51, 173 53 C163 55, 158 60, 156 70 C154 60, 149 55, 139 53 C149 51, 154 46, 156 36 Z" fill="#FDE047" stroke="#2E1065" stroke-width="5" stroke-linejoin="round"/>
  </g>`;
  }

  if (styleId === 'chatgpt') {
    return `
  <g data-mascot-icon="chatgpt" transform="translate(${x}, ${y}) scale(${scale})">
    <defs>
      <linearGradient id="gptMint_${uid}" x1="0.15" y1="0.1" x2="0.85" y2="0.95">
        <stop offset="0%" stop-color="#D1FAE5"/>
        <stop offset="48%" stop-color="#A7F3D0"/>
        <stop offset="100%" stop-color="#6EE7B7"/>
      </linearGradient>
    </defs>
    <!-- 3 comic burst ticks on top-left -->
    <g stroke="#14532D" stroke-width="7.5" stroke-linecap="round">
      <line x1="65" y1="22" x2="70" y2="38"/>
      <line x1="36" y1="39" x2="49" y2="51"/>
      <line x1="22" y1="68" x2="38" y2="73"/>
    </g>
    <!-- Cute bold-outlined mint-green round smiling blob -->
    <circle cx="106" cy="108" r="64" fill="url(#gptMint_${uid})" stroke="#14532D" stroke-width="8"/>
    <ellipse cx="82" cy="76" rx="18" ry="10" transform="rotate(-24 82 76)" fill="#ECFDF5" opacity="0.85"/>
    <!-- Tiny vertical dot eyes + happy open smile -->
    <ellipse cx="94" cy="103" rx="5.5" ry="9" fill="#14532D"/>
    <ellipse cx="132" cy="101" rx="5.5" ry="9" fill="#14532D"/>
    <path d="M105 114 L123 113 C123 126, 118 131, 114 131 C109 131, 105 125, 105 114 Z" fill="#FB7185" stroke="#14532D" stroke-width="4.5" stroke-linejoin="round"/>
  </g>`;
  }

  if (styleId === 'claude') {
    return `
  <g data-mascot-icon="claude" transform="translate(${x}, ${y}) scale(${scale})">
    <defs>
      <linearGradient id="claudeSun_${uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FB923C"/>
        <stop offset="55%" stop-color="#EA580C"/>
        <stop offset="100%" stop-color="#D9532F"/>
      </linearGradient>
    </defs>
    <!-- Bold dark-ink warm terracotta-orange 8-point starburst flower -->
    <polygon points="100,22 117,59 155,45 141,83 178,100 141,117 155,155 117,141 100,178 83,141 45,155 59,117 22,100 59,83 45,45 83,59" fill="url(#claudeSun_${uid})" stroke="#3B1E0E" stroke-width="8" stroke-linejoin="round"/>
    <!-- Warm cream inner ring + terracotta center -->
    <circle cx="100" cy="100" r="27" fill="#FFF7ED"/>
    <circle cx="100" cy="100" r="17" fill="#EA580C"/>
  </g>`;
  }

  // big_fat_fish: bold-ink chibi comic whale sticker matching official cover top-left icon
  const whaleBodyPath =
    'M18 122 C14 82, 46 62, 84 64 C112 66, 126 86, 136 102 C142 110, 149 106, 150 96 C138 88, 134 72, 141 65 C149 58, 161 65, 166 77 C173 68, 184 69, 186 79 C188 90, 177 103, 164 110 C163 138, 146 161, 114 170 C78 179, 32 167, 20 138 C18 132, 17 127, 18 122 Z';

  return `
  <g data-mascot-icon="big_fat_fish" transform="translate(${x}, ${y}) scale(${scale})">
    <defs>
      <clipPath id="whaleClip_${uid}">
        <path d="${whaleBodyPath}"/>
      </clipPath>
      <linearGradient id="whaleSpout_${uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#E0F2FE"/>
        <stop offset="100%" stop-color="#BAE6FD"/>
      </linearGradient>
    </defs>
    <!-- Two chunky teardrop water-spout droplets with thick dark-ink outlines -->
    <path d="M90 63 C86 48, 72 43, 74 31 C76 20, 91 19, 95 31 C98 40, 94 52, 90 63 Z" fill="url(#whaleSpout_${uid})" stroke="#1E293B" stroke-width="6.5" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M96 58 C100 41, 111 22, 126 19 C139 17, 146 28, 139 39 C133 48, 117 48, 107 57 C103 60, 98 62, 96 58 Z" fill="url(#whaleSpout_${uid})" stroke="#1E293B" stroke-width="6.5" stroke-linejoin="round" stroke-linecap="round"/>
    <!-- Upward-curving J-shaped soft cornflower-blue whale body -->
    <path d="${whaleBodyPath}" fill="#6498FC"/>
    <!-- Creamy white rounded belly with curved pale blue-gray pleats clipped cleanly inside body -->
    <g clip-path="url(#whaleClip_${uid})">
      <path d="M12 124 C42 108, 72 120, 96 135 C118 147, 138 145, 162 128 L176 188 L8 188 Z" fill="#FFFDF9"/>
      <g fill="none" stroke="#C7D4F5" stroke-width="5" stroke-linecap="round">
        <path d="M33 116 C35 135, 45 153, 60 170"/>
        <path d="M54 118 C59 140, 73 158, 94 173"/>
        <path d="M77 126 C85 146, 102 160, 124 169"/>
        <path d="M103 137 C113 150, 127 158, 144 161"/>
      </g>
      <!-- Dark-ink belly separation arc (softly paused under pink cheek, no mouth line) -->
      <path d="M14 124 C40 110, 64 116, 82 128" fill="none" stroke="#1E293B" stroke-width="5.5" stroke-linecap="round"/>
      <path d="M102 138 C120 146, 139 144, 158 130" fill="none" stroke="#1E293B" stroke-width="5.5" stroke-linecap="round"/>
    </g>
    <!-- Single solid dark dot eye + soft pink oval blush cheek (NO mouth line) -->
    <ellipse cx="77" cy="109" rx="5.8" ry="6.8" fill="#1E293B"/>
    <ellipse cx="94" cy="121" rx="10.8" ry="7.4" fill="#FDA4AF" opacity="0.92"/>
    <!-- Crisp uniform thick dark-ink outer body outline on top -->
    <path d="${whaleBodyPath}" fill="none" stroke="#1E293B" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>
  </g>`;
}

function renderHeroBackdropLayer(heroImageDataUri, width, height, uid) {
  if (!heroImageDataUri) return '';
  return `
  <image data-hero-layer="1" href="${heroImageDataUri}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="0.42"/>
  <defs>
    <linearGradient id="heroScrim_${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.35"/>
      <stop offset="55%" stop-color="#000000" stop-opacity="0.58"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.82"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#heroScrim_${uid})"/>`;
}

function renderComicDecorations(comic, uid) {
  const panels = `
  <g opacity="0.9">
    <rect x="-40" y="42" width="370" height="220" rx="26" transform="rotate(-7 145 152)" fill="${comic.panelFill}" stroke="${comic.panelStroke}" stroke-width="4"/>
    <rect x="740" y="-20" width="390" height="250" rx="26" transform="rotate(6 935 105)" fill="${comic.panelFill}" stroke="${comic.panelStroke}" stroke-width="4"/>
    <rect x="-50" y="1090" width="380" height="260" rx="28" transform="rotate(5 140 1220)" fill="${comic.panelFill}" stroke="${comic.panelStroke}" stroke-width="4"/>
    <rect x="730" y="1140" width="400" height="260" rx="28" transform="rotate(-6 930 1270)" fill="${comic.panelFill}" stroke="${comic.panelStroke}" stroke-width="4"/>
    <rect x="0" y="0" width="1080" height="1440" fill="url(#comicDots_${uid})" opacity="0.32"/>
  </g>`;

  if (comic.motif === 'bubbles') {
    return `${panels}
  <g opacity="0.85">
    <circle cx="964" cy="212" r="24" fill="#FFFFFF" stroke="${comic.ink}" stroke-width="3.5"/>
    <circle cx="956" cy="204" r="6" fill="${comic.accentSoft}"/>
    <circle cx="920" cy="248" r="12" fill="#E0F2FE" stroke="${comic.ink}" stroke-width="3"/>
    <circle cx="1010" cy="254" r="9" fill="#FFFFFF" stroke="${comic.ink}" stroke-width="2.5"/>
  </g>`;
  }

  if (comic.motif === 'stars') {
    return `${panels}
  <g opacity="0.9">
    <path d="M968 186 L976 206 L996 214 L976 222 L968 242 L960 222 L940 214 L960 206 Z" fill="#FDE047" stroke="${comic.ink}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M918 232 L923 243 L934 248 L923 253 L918 264 L913 253 L902 248 L913 243 Z" fill="#C4B5FD" stroke="${comic.ink}" stroke-width="3" stroke-linejoin="round"/>
  </g>`;
  }

  if (comic.motif === 'code') {
    return `${panels}
  <g opacity="0.92" transform="rotate(8 955 215)">
    <rect x="902" y="182" width="106" height="66" rx="16" fill="#FFFFFF" stroke="${comic.ink}" stroke-width="3.5"/>
    <rect x="902" y="182" width="106" height="18" rx="8" fill="${comic.accentTint}" stroke="${comic.ink}" stroke-width="3"/>
    <text x="955" y="232" text-anchor="middle" fill="${comic.ink}" font-size="22" font-weight="900" font-family="${MONO_STACK}">&lt;/&gt;</text>
  </g>`;
  }

  return `${panels}
  <g opacity="0.92">
    <g transform="translate(964, 214)" stroke="${comic.ink}" stroke-width="3.5" stroke-linecap="round">
      <line x1="0" y1="-26" x2="0" y2="26" stroke="${comic.accent}" stroke-width="6"/>
      <line x1="-26" y1="0" x2="26" y2="0" stroke="${comic.accent}" stroke-width="6"/>
      <line x1="-18" y1="-18" x2="18" y2="18" stroke="${comic.accentSoft}" stroke-width="5"/>
      <line x1="18" y1="-18" x2="-18" y2="18" stroke="${comic.accentSoft}" stroke-width="5"/>
      <circle cx="0" cy="0" r="8" fill="#FDE68A" stroke="${comic.ink}" stroke-width="3.5"/>
    </g>
  </g>`;
}

function isOfficeMode(formatted) {
  return formatted?.meta?.edition === 'office' || formatted?.meta?.style === 'office';
}

function formatCompactMetric(value, prefix = '') {
  const num = Number(value) || 0;
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return `${prefix}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 10_000) return `${prefix}${(abs / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${prefix}${abs}`;
}

function renderOfficeSlideShell({
  uid,
  pageIndex,
  pageTag,
  heading,
  subtitle,
  bodySvg,
  footer,
  rightCue = 'WORK DAILY',
}) {
  const safePageTag = escapeXml(pageTag);
  const safeHeading = escapeXml(truncateByDisplayWidth(heading, 24));
  const safeSubtitle = subtitle ? escapeXml(truncateByDisplayWidth(subtitle, 46)) : '';
  const safeFooter = escapeXml(truncateByDisplayWidth(footer, 58));
  const safeCue = escapeXml(rightCue);

  const pagerDots = Array.from({ length: 4 }, (_, i) => {
    const cx = 860 + i * 32;
    return i === pageIndex
      ? `<rect x="${cx - 12}" y="96" width="32" height="10" rx="5" fill="#2563EB"/>`
      : `<circle cx="${cx + 4}" cy="101" r="5" fill="#CBD5E1"/>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440" data-office-slide="${pageIndex + 1}">
  <defs>
    <linearGradient id="officeBg_${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#F1F5F9"/>
    </linearGradient>
  </defs>

  <!-- Minimalist executive daily-report canvas (zero anime / zero comic clutter) -->
  <rect width="1080" height="1440" fill="url(#officeBg_${uid})"/>
  <rect x="0" y="0" width="1080" height="14" fill="#0F172A"/>
  <rect x="0" y="0" width="340" height="14" fill="#2563EB"/>

  <!-- Header badge & clean pager -->
  <rect x="76" y="76" width="268" height="46" rx="10" fill="#EFF6FF" stroke="#BFDBFE" stroke-width="2"/>
  <text x="100" y="107" fill="#1D4ED8" font-size="22" font-weight="800" font-family="${FONT_STACK}">${safePageTag}</text>
  <g aria-label="office-pager">${pagerDots}</g>

  <!-- Clean executive typography -->
  <text x="76" y="212" fill="#0F172A" font-size="52" font-weight="900" font-family="${FONT_STACK}">${safeHeading}</text>
  ${
    safeSubtitle
      ? `<text x="76" y="264" fill="#475569" font-size="25" font-weight="500" font-family="${FONT_STACK}">${safeSubtitle}</text>`
      : ''
  }
  <line x1="76" y1="296" x2="1004" y2="296" stroke="#E2E8F0" stroke-width="2"/>

  ${bodySvg}

  <!-- Structured executive footer -->
  <line x1="76" y1="1328" x2="1004" y2="1328" stroke="#CBD5E1" stroke-width="1.5"/>
  <text x="76" y="1380" fill="#64748B" font-size="22" font-weight="600" font-family="${FONT_STACK}">${safeFooter}</text>
  <text x="1004" y="1380" text-anchor="end" fill="#2563EB" font-size="21" font-weight="800" font-family="${MONO_STACK}">${safeCue}</text>
</svg>
`;
}

function renderOfficeVerticalCardSvg(context, formatted) {
  const rawProject = context.projectName.split('/').pop() || context.projectName;
  const project = escapeXml(truncateByDisplayWidth(rawProject, 24));
  const repoFull = escapeXml(truncateByDisplayWidth(context.projectName, 44));
  const dateStr = escapeXml(formatted.meta.dateStr);
  const branch = escapeXml(truncateByDisplayWidth(context.branch || 'main', 22));
  const commitsCount = context.commits?.length || 0;
  const { filesChanged = 0, insertions = 0, deletions = 0 } = context.stats || {};
  const bullets = (context.highlights?.length > 0
    ? context.highlights
    : context.commits?.map((c) => c.subject) || ['完成本周期核心开发与验证工作']
  ).slice(0, 4);

  const kpis = [
    { label: 'COMMITS', value: formatCompactMetric(commitsCount), color: '#0F172A' },
    { label: 'FILES', value: formatCompactMetric(filesChanged), color: '#2563EB' },
    { label: 'ADDED', value: formatCompactMetric(insertions, '+'), color: '#059669' },
    { label: 'REMOVED', value: formatCompactMetric(deletions, '-'), color: '#DC2626' },
  ];

  const kpiSvg = kpis
    .map((kpi, idx) => {
      const x = 76 + idx * 238;
      const valFontSize = kpi.value.length > 6 ? 32 : 40;
      return `
  <rect x="${x}" y="470" width="214" height="134" rx="16" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
  <text x="${x + 24}" y="514" fill="#64748B" font-size="18" font-weight="700" font-family="${MONO_STACK}">${kpi.label}</text>
  <text x="${x + 24}" y="574" fill="${kpi.color}" font-size="${valFontSize}" font-weight="900" font-family="${MONO_STACK}">${escapeXml(kpi.value)}</text>`;
    })
    .join('\n');

  const bulletSvg = bullets
    .map((item, idx) => {
      const y = 696 + idx * 142;
      const lines = wrapTextClamped(item, 42, 2);
      return `
  <rect x="76" y="${y}" width="928" height="122" rx="16" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
  <rect x="76" y="${y}" width="10" height="122" rx="5" fill="#2563EB"/>
  <text x="112" y="${y + (lines.length > 1 ? 52 : 70)}" fill="#0F172A" font-size="29" font-weight="700" font-family="${FONT_STACK}">${escapeXml(lines[0] || '')}</text>
  ${lines[1] ? `<text x="112" y="${y + 94}" fill="#334155" font-size="27" font-weight="500" font-family="${FONT_STACK}">${escapeXml(lines[1])}</text>` : ''}`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440" data-office-slide="1">
  <defs>
    <linearGradient id="officeCoverBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F8FAFC"/>
      <stop offset="100%" stop-color="#EFF6FF"/>
    </linearGradient>
    <linearGradient id="officeHeroBand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#1E293B"/>
    </linearGradient>
  </defs>

  <rect width="1080" height="1440" fill="url(#officeCoverBg)"/>

  <!-- Executive Dark Navy Header Band -->
  <rect x="0" y="0" width="1080" height="422" fill="url(#officeHeroBand)"/>
  <rect x="0" y="414" width="1080" height="8" fill="#2563EB"/>

  <rect x="76" y="72" width="296" height="46" rx="10" fill="rgba(37,99,235,0.24)" stroke="#3B82F6" stroke-width="1.5"/>
  <text x="100" y="103" fill="#93C5FD" font-size="21" font-weight="800" font-family="${MONO_STACK}">WORK DAILY BRIEF · P1/4</text>
  <text x="1004" y="103" text-anchor="end" fill="#94A3B8" font-size="23" font-weight="700" font-family="${MONO_STACK}">${dateStr}</text>

  <text x="76" y="218" fill="#FFFFFF" font-size="60" font-weight="900" font-family="${FONT_STACK}">${project}</text>
  <text x="76" y="278" fill="#CBD5E1" font-size="28" font-weight="500" font-family="${FONT_STACK}">工程研发工作日报 · 项目进度与交付摘要</text>

  <rect x="76" y="324" width="440" height="48" rx="10" fill="rgba(255,255,255,0.08)" stroke="rgba(148,163,184,0.35)" stroke-width="1.5"/>
  <text x="98" y="356" fill="#E2E8F0" font-size="21" font-weight="600" font-family="${MONO_STACK}">branch: ${branch}</text>

  <!-- 4 KPI Metric Cards -->
  ${kpiSvg}

  <text x="76" y="662" fill="#475569" font-size="22" font-weight="800" font-family="${FONT_STACK}">📌 本周期核心交付摘要</text>
  ${bulletSvg}

  <line x1="76" y1="1328" x2="1004" y2="1328" stroke="#CBD5E1" stroke-width="1.5"/>
  <text x="76" y="1380" fill="#64748B" font-size="22" font-weight="600" font-family="${FONT_STACK}">办公专业版 · ${repoFull}</text>
  <text x="1004" y="1380" text-anchor="end" fill="#2563EB" font-size="21" font-weight="800" font-family="${MONO_STACK}">01 / 04 →</text>
</svg>
`;
}

function renderOfficeHorizontalCardSvg(context, formatted) {
  const project = escapeXml(truncateByDisplayWidth(context.projectName, 38));
  const dateStr = escapeXml(formatted.meta.dateStr);
  const branch = escapeXml(truncateByDisplayWidth(context.branch || 'main', 22));
  const statsLine = escapeXml(truncateByDisplayWidth(formatted.meta.statsLine, 56));
  const bullets = (context.highlights?.length > 0
    ? context.highlights
    : context.commits?.map((c) => c.subject) || ['完成本周期核心开发与验证工作']
  ).slice(0, 4);

  const itemsSvg = bullets
    .map((item, idx) => {
      const y = 332 + idx * 112;
      const line = escapeXml(truncateByDisplayWidth(item, 68));
      return `
  <rect x="88" y="${y}" width="1424" height="90" rx="14" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
  <rect x="88" y="${y}" width="10" height="90" rx="5" fill="#2563EB"/>
  <rect x="120" y="${y + 22}" width="58" height="46" rx="10" fill="#EFF6FF"/>
  <text x="149" y="${y + 53}" text-anchor="middle" fill="#1D4ED8" font-size="23" font-weight="900" font-family="${MONO_STACK}">0${idx + 1}</text>
  <text x="202" y="${y + 55}" fill="#0F172A" font-size="29" font-weight="600" font-family="${FONT_STACK}">${line}</text>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" data-office-horizontal="1">
  <rect width="1600" height="900" fill="#F8FAFC"/>
  <rect x="0" y="0" width="1600" height="278" fill="#0F172A"/>
  <rect x="0" y="272" width="1600" height="6" fill="#2563EB"/>

  <rect x="88" y="48" width="360" height="44" rx="10" fill="rgba(37,99,235,0.24)" stroke="#3B82F6" stroke-width="1.5"/>
  <text x="112" y="77" fill="#93C5FD" font-size="21" font-weight="800" font-family="${MONO_STACK}">WORK DAILY BRIEF · ${dateStr}</text>
  <text x="1512" y="77" text-anchor="end" fill="#94A3B8" font-size="22" font-weight="700" font-family="${MONO_STACK}">branch: ${branch}</text>

  <text x="88" y="172" fill="#FFFFFF" font-size="56" font-weight="900" font-family="${FONT_STACK}">${project}</text>
  <text x="88" y="232" fill="#CBD5E1" font-size="27" font-weight="600" font-family="${FONT_STACK}">${statsLine}</text>

  ${itemsSvg}

  <line x1="88" y1="812" x2="1512" y2="812" stroke="#CBD5E1" stroke-width="1.5"/>
  <text x="88" y="856" fill="#64748B" font-size="23" font-weight="600" font-family="${FONT_STACK}">dsh-plugin-devlog-poster · 办公专业版 · 极简商务工作日报</text>
  <text x="1512" y="856" text-anchor="end" fill="#2563EB" font-size="21" font-weight="800" font-family="${MONO_STACK}">16:9 WORK BRIEF</text>
</svg>
`;
}

function renderOfficeCarouselSlidesSvg(context, formatted) {
  const project = context.projectName.split('/').pop() || context.projectName;
  const footer = `办公专业版 · ${project} · ${formatted.meta.dateStr}`;
  const points = (context.highlights?.length > 0
    ? context.highlights
    : context.commits?.map((c) => c.subject) || ['完成本周期核心开发与验证工作']
  ).slice(0, 5);
  const pitfalls =
    context.pitfalls?.length > 0
      ? context.pitfalls
      : ['当前无阻塞性风险，各项变更已按计划验证'];
  const nextSteps =
    context.nextSteps?.length > 0 ? context.nextSteps : ['按迭代排期推进下一阶段交付'];

  const slide1 = renderOfficeVerticalCardSvg(context, formatted);

  // P2 Deliverables
  const p2Count = points.length;
  const p2CardH = p2Count <= 3 ? 214 : p2Count === 4 ? 192 : 162;
  const p2Gap = p2Count <= 3 ? 32 : p2Count === 4 ? 24 : 20;
  const p2MaxLines = p2Count <= 3 ? 3 : 2;
  const p2StartY = 336;

  const p2Body = points
    .map((item, idx) => {
      const y = p2StartY + idx * (p2CardH + p2Gap);
      const lines = wrapTextClamped(item, 40, p2MaxLines);
      return `
  <rect x="76" y="${y}" width="928" height="${p2CardH}" rx="18" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
  <rect x="76" y="${y}" width="10" height="${p2CardH}" rx="5" fill="#2563EB"/>
  <rect x="112" y="${y + 24}" width="128" height="34" rx="8" fill="#EFF6FF"/>
  <text x="176" y="${y + 47}" text-anchor="middle" fill="#1D4ED8" font-size="19" font-weight="800" font-family="${MONO_STACK}">ITEM 0${idx + 1}</text>
  ${lines
    .map(
      (l, li) =>
        `<text x="112" y="${y + 98 + li * 40}" fill="#0F172A" font-size="30" font-weight="700" font-family="${FONT_STACK}">${escapeXml(l)}</text>`
    )
    .join('\n')}`;
    })
    .join('\n');

  const slide2 = renderOfficeSlideShell({
    uid: 'office_p2',
    pageIndex: 1,
    pageTag: 'P2 / 4 · 今日产出',
    heading: '今日核心交付清单',
    subtitle: `${formatted.meta.statsLine} · 共 ${points.length} 项重点`,
    bodySvg: p2Body,
    footer,
    rightCue: '02 / 04 →',
  });

  // P3 Risks & Changed Files Summary
  const visiblePitfalls = pitfalls.slice(0, 3);
  const p3CardH = visiblePitfalls.length === 1 ? 248 : visiblePitfalls.length === 2 ? 210 : 198;
  const p3Gap = 26;
  const p3StartY = 336;

  const p3Risks = visiblePitfalls
    .map((p, idx) => {
      const y = p3StartY + idx * (p3CardH + p3Gap);
      const lines = wrapTextClamped(p, 40, visiblePitfalls.length === 1 ? 4 : 3);
      return `
  <rect x="76" y="${y}" width="928" height="${p3CardH}" rx="18" fill="#FFFBEB" stroke="#FDE68A" stroke-width="2"/>
  <rect x="76" y="${y}" width="10" height="${p3CardH}" rx="5" fill="#D97706"/>
  <rect x="112" y="${y + 24}" width="184" height="34" rx="8" fill="#FEF3C7"/>
  <text x="204" y="${y + 47}" text-anchor="middle" fill="#B45309" font-size="19" font-weight="800" font-family="${FONT_STACK}">风险与复盘 #${idx + 1}</text>
  ${lines
    .map(
      (l, li) =>
        `<text x="112" y="${y + 98 + li * 40}" fill="#0F172A" font-size="30" font-weight="600" font-family="${FONT_STACK}">${escapeXml(l)}</text>`
    )
    .join('\n')}`;
    })
    .join('\n');

  let p3Snapshot = '';
  if (visiblePitfalls.length <= 2) {
    const snapY = p3StartY + visiblePitfalls.length * (p3CardH + p3Gap) + 12;
    const snapH = Math.min(340, 1286 - snapY);
    const changedFiles = (context.changedFiles || []).slice(0, 4);
    const filePills = changedFiles
      .map((f, idx) => {
        const row = Math.floor(idx / 2);
        const col = idx % 2;
        const px = 112 + col * 432;
        const py = snapY + 150 + row * 64;
        const label = escapeXml(truncateByDisplayWidth(f, 30));
        return `
    <rect x="${px}" y="${py}" width="414" height="48" rx="10" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="1.5"/>
    <text x="${px + 18}" y="${py + 31}" fill="#334155" font-size="20" font-weight="600" font-family="${MONO_STACK}">${label}</text>`;
      })
      .join('\n');

    p3Snapshot = `
  <rect x="76" y="${snapY}" width="928" height="${snapH}" rx="18" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
  <text x="112" y="${snapY + 52}" fill="#0F172A" font-size="26" font-weight="800" font-family="${FONT_STACK}">📊 本轮代码变更速览</text>
  <text x="112" y="${snapY + 104}" fill="#2563EB" font-size="24" font-weight="700" font-family="${FONT_STACK}">${escapeXml(truncateByDisplayWidth(`${context.branch || 'main'} · ${formatted.meta.statsLine}`, 44))}</text>
  ${filePills}`;
  }

  const slide3 = renderOfficeSlideShell({
    uid: 'office_p3',
    pageIndex: 2,
    pageTag: 'P3 / 4 · 风险复盘',
    heading: '风险、卡点与变更范围',
    subtitle: '记录工程决策与阻塞项，方便团队快速对齐上下文',
    bodySvg: `${p3Risks}\n${p3Snapshot}`,
    footer,
    rightCue: '03 / 04 →',
  });

  // P4 Next Actions & Clean Executive Summary Box (no anime / no comment-bait)
  const visibleNext = nextSteps.slice(0, 3);
  const p4CardH = 148;
  const p4Gap = 24;
  const p4StartY = 336;

  const p4Next = visibleNext
    .map((n, idx) => {
      const y = p4StartY + idx * (p4CardH + p4Gap);
      const lines = wrapTextClamped(n, 38, 2);
      return `
  <rect x="76" y="${y}" width="928" height="${p4CardH}" rx="18" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
  <rect x="112" y="${y + 46}" width="52" height="52" rx="12" fill="#EFF6FF" stroke="#BFDBFE" stroke-width="2"/>
  <text x="138" y="${y + 81}" text-anchor="middle" fill="#1D4ED8" font-size="24" font-weight="900" font-family="${MONO_STACK}">${idx + 1}</text>
  <text x="188" y="${y + (lines.length > 1 ? 62 : 82)}" fill="#0F172A" font-size="30" font-weight="700" font-family="${FONT_STACK}">${escapeXml(lines[0] || '')}</text>
  ${lines[1] ? `<text x="188" y="${y + 106}" fill="#334155" font-size="28" font-weight="500" font-family="${FONT_STACK}">${escapeXml(lines[1])}</text>` : ''}`;
    })
    .join('\n');

  const summaryY = 900;
  const repoLabel = escapeXml(truncateByDisplayWidth(context.projectName, 42));
  const branchLabel = escapeXml(truncateByDisplayWidth(context.branch || 'main', 26));

  const p4Summary = `
  ${p4Next}
  <rect x="76" y="${summaryY}" width="928" height="330" rx="20" fill="#0F172A"/>
  <rect x="76" y="${summaryY}" width="928" height="8" rx="4" fill="#2563EB"/>
  <text x="116" y="${summaryY + 66}" fill="#93C5FD" font-size="21" font-weight="800" font-family="${MONO_STACK}">REPORT METADATA · 办公专业版</text>
  <text x="116" y="${summaryY + 132}" fill="#FFFFFF" font-size="38" font-weight="900" font-family="${FONT_STACK}">项目同步完成 · 可直接发工作群</text>
  <text x="116" y="${summaryY + 194}" fill="#CBD5E1" font-size="25" font-weight="600" font-family="${MONO_STACK}">Repo   : ${repoLabel}</text>
  <text x="116" y="${summaryY + 240}" fill="#CBD5E1" font-size="25" font-weight="600" font-family="${MONO_STACK}">Branch : ${branchLabel} · ${escapeXml(formatted.meta.dateStr)}</text>
  <text x="116" y="${summaryY + 286}" fill="#94A3B8" font-size="22" font-weight="500" font-family="${FONT_STACK}">支持飞书 / 钉钉 / 企业微信 / Slack / Discord / QQ 一键推送</text>`;

  const slide4 = renderOfficeSlideShell({
    uid: 'office_p4',
    pageIndex: 3,
    pageTag: 'P4 / 4 · 明日计划',
    heading: '下一步行动项',
    subtitle: '明确下一周期交付重点与协作对齐事项',
    bodySvg: p4Summary,
    footer,
    rightCue: '04 / 04 ✓',
  });

  return [
    { id: 'slide-1-cover', label: 'P1 简报封面', svg: slide1 },
    { id: 'slide-2-changes', label: 'P2 今日产出', svg: slide2 },
    { id: 'slide-3-pitfalls', label: 'P3 风险复盘', svg: slide3 },
    { id: 'slide-4-next', label: 'P4 明日计划', svg: slide4 },
  ];
}

/**
 * Render a 3:4 vertical Devlog cover card (1080x1440).
 * When heroImageDataUri is provided, uses a bright Xiaohongshu comic-poster layout
 * that showcases the AI-girl illustration clearly with crisp comic pill & Zipzipipe credit.
 */
export function renderVerticalCardSvg(
  context,
  formatted,
  { heroImageDataUri, isMascotCover = false } = {}
) {
  if (isOfficeMode(formatted)) {
    return renderOfficeVerticalCardSvg(context, formatted);
  }
  const theme = resolveStyle(formatted?.meta?.style);
  const comic = resolveComicPalette(theme.id);
  const rawProject = context.projectName.split('/').pop() || context.projectName;
  const project = escapeXml(truncateByDisplayWidth(rawProject, 20));
  const dateStr = escapeXml(formatted.meta.dateStr);
  const statsLine = escapeXml(truncateByDisplayWidth(formatted.meta.statsLine, 26));
  const bullets = (context.highlights?.length > 0
    ? context.highlights
    : context.commits?.map((c) => c.subject) || ['阶段性进展与闭环整理']
  ).slice(0, 4);
  const pitfall = context.pitfalls?.[0];

  if (heroImageDataUri && isMascotCover) {
    const pillSummary = escapeXml(
      truncateByDisplayWidth(`${rawProject} · ${formatted.meta.dateStr} · ${formatted.meta.statsLine}`, 48)
    );
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <image data-hero-layer="1" data-mascot-cover="1" href="${heroImageDataUri}" x="0" y="0" width="1080" height="1440" preserveAspectRatio="xMidYMid slice"/>
  <!-- Bottom minimal comic pill with hard offset shadow preserving full artwork & top comic title -->
  <rect x="70" y="1302" width="952" height="84" rx="42" fill="${comic.shadow}" opacity="0.88"/>
  <rect x="64" y="1296" width="952" height="84" rx="42" fill="rgba(255,255,255,0.95)" stroke="${comic.ink}" stroke-width="5"/>
  <circle cx="106" cy="1338" r="11" fill="${comic.accent}" stroke="${comic.ink}" stroke-width="3.5"/>
  <text x="134" y="1349" fill="${comic.ink}" font-size="28" font-weight="800" font-family="${FONT_STACK}">${pillSummary}</text>
  <text x="1012" y="1420" text-anchor="end" fill="#475569" font-size="20" font-weight="700" font-family="${FONT_STACK}">AI 娘形象来源：Zipzipipe · dsh-plugin-devlog-poster</text>
</svg>
`;
  }

  if (heroImageDataUri) {
    const shortBullets = bullets.slice(0, 2);
    const bulletTextSvg = shortBullets
      .map(
        (item, idx) =>
          `<text x="116" y="${1222 + idx * 54}" fill="${comic.ink}" font-size="31" font-weight="700" font-family="${FONT_STACK}">${escapeXml(theme.bulletIcon)} ${escapeXml(truncateByDisplayWidth(item, 44))}</text>`
      )
      .join('\n');
    const topBadgeText = escapeXml(truncateByDisplayWidth(`${theme.badgeLabel} · ${formatted.meta.dateStr}`, 28));
    const cardHeaderText = escapeXml(
      truncateByDisplayWidth(`${theme.subtitle.split('·')[0].trim()} · ${formatted.meta.statsLine}`, 44)
    );

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <image data-hero-layer="1" href="${heroImageDataUri}" x="0" y="0" width="1080" height="1440" preserveAspectRatio="xMidYMid slice"/>
  <!-- Top comic-style sticker badge & bold outlined title -->
  <rect x="78" y="64" width="460" height="58" rx="29" fill="${comic.shadow}"/>
  <rect x="72" y="58" width="460" height="58" rx="29" fill="${comic.accent}" stroke="${comic.ink}" stroke-width="5"/>
  <text x="104" y="97" fill="#FFFFFF" font-size="27" font-weight="900" font-family="${FONT_STACK}">${topBadgeText}</text>

  <text x="72" y="200" fill="#FFFFFF" stroke="${comic.ink}" stroke-width="14" paint-order="stroke" stroke-linejoin="round" font-size="68" font-weight="900" font-family="${FONT_STACK}">${project}</text>

  <!-- Bottom frosted comic card with offset shadow -->
  <rect x="71" y="1103" width="952" height="278" rx="32" fill="${comic.shadow}"/>
  <rect x="64" y="1096" width="952" height="278" rx="32" fill="rgba(255,255,255,0.94)" stroke="${comic.ink}" stroke-width="6"/>
  <text x="116" y="1160" fill="${comic.ink}" font-size="32" font-weight="800" font-family="${FONT_STACK}">${cardHeaderText}</text>
  ${bulletTextSvg}
  <text x="116" y="1342" fill="${comic.muted}" font-size="23" font-weight="700" font-family="${FONT_STACK}">dsh-plugin-devlog-poster · ${escapeXml(theme.name)}</text>
</svg>
`;
  }

  const bulletBlocks = bullets
    .map((item, idx) => {
      const y = 550 + idx * 150;
      const wrapped = wrapTextClamped(item, 42, 2);
      const textLines = wrapped
        .map(
          (line, lineIdx) =>
            `<text x="150" y="${y + 52 + lineIdx * 40}" fill="${theme.textColor}" font-size="32" font-family="${FONT_STACK}">${escapeXml(line)}</text>`
        )
        .join('\n');
      return `
  <rect x="84" y="${y}" width="912" height="122" rx="24" fill="${theme.cardFill}" stroke="${theme.cardStroke}" stroke-width="2"/>
  <circle cx="118" cy="${y + 42}" r="13" fill="${theme.dotColor}"/>
  ${textLines}`;
    })
    .join('\n');

  const pitfallBlock = pitfall
    ? `
  <rect x="84" y="1170" width="912" height="110" rx="22" fill="rgba(251,191,36,0.12)" stroke="rgba(251,191,36,0.38)" stroke-width="2"/>
  <text x="120" y="1216" fill="#FDE68A" font-size="26" font-weight="700" font-family="${FONT_STACK}">⚠️ 避坑笔记</text>
  <text x="120" y="1256" fill="#FEF3C7" font-size="28" font-family="${FONT_STACK}">${escapeXml(truncateByDisplayWidth(pitfall, 50))}</text>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <defs>
    <linearGradient id="bgV_${theme.id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bgStops[0]}"/>
      <stop offset="52%" stop-color="${theme.bgStops[1]}"/>
      <stop offset="100%" stop-color="${theme.bgStops[2]}"/>
    </linearGradient>
    <linearGradient id="badgeV_${theme.id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${theme.accentFrom}"/>
      <stop offset="100%" stop-color="${theme.accentTo}"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1440" fill="url(#bgV_${theme.id})"/>
  ${renderHeroBackdropLayer(heroImageDataUri, 1080, 1440, `v_${theme.id}`)}
  <circle cx="940" cy="210" r="240" fill="${theme.accentFrom}" opacity="0.10"/>
  <circle cx="140" cy="1260" r="260" fill="${theme.accentTo}" opacity="0.10"/>

  <rect x="84" y="92" width="460" height="56" rx="28" fill="url(#badgeV_${theme.id})"/>
  <text x="116" y="130" fill="${theme.badgeTextColor}" font-size="26" font-weight="800" font-family="${FONT_STACK}">${escapeXml(truncateByDisplayWidth(`${theme.badgeLabel} · ${formatted.meta.dateStr}`, 28))}</text>

  ${renderMascotSvg(theme.id, 756, 78, 1.08, `v_${theme.id}`)}

  <text x="84" y="274" fill="#FFFFFF" font-size="64" font-weight="800" font-family="${FONT_STACK}">${project}</text>
  <text x="84" y="344" fill="${theme.subtitleColor}" font-size="30" font-family="${FONT_STACK}">${escapeXml(truncateByDisplayWidth(theme.subtitle, 40))}</text>

  <rect x="84" y="406" width="912" height="92" rx="20" fill="${theme.statsFill}" stroke="${theme.statsStroke}" stroke-width="2"/>
  <text x="120" y="464" fill="${theme.textColor}" font-size="30" font-weight="600" font-family="${FONT_STACK}">${statsLine}</text>

  ${bulletBlocks}
  ${pitfallBlock}

  <text x="84" y="1364" fill="${theme.subtitleColor}" opacity="0.78" font-size="25" font-family="${FONT_STACK}">dsh-plugin-devlog-poster · ${escapeXml(theme.name)} · Branch: ${escapeXml(context.branch || 'main')}</text>
</svg>
`;
}

/**
 * Render a 16:9 horizontal Devlog summary card (1600x900) for Bilibili & GitHub.
 */
export function renderHorizontalCardSvg(context, formatted, { heroImageDataUri } = {}) {
  if (isOfficeMode(formatted)) {
    return renderOfficeHorizontalCardSvg(context, formatted);
  }
  const theme = resolveStyle(formatted?.meta?.style);
  const comic = resolveComicPalette(theme.id);
  const project = escapeXml(truncateByDisplayWidth(context.projectName, 34));
  const dateStr = escapeXml(formatted.meta.dateStr);
  const statsLine = escapeXml(truncateByDisplayWidth(formatted.meta.statsLine, 56));
  const badgeText = escapeXml(
    truncateByDisplayWidth(`${theme.badgeLabel} · ${formatted.meta.dateStr} · ${context.branch || 'main'}`, 46)
  );
  const bullets = (context.highlights?.length > 0
    ? context.highlights
    : context.commits?.map((c) => c.subject) || ['阶段性进展与闭环整理']
  ).slice(0, 4);

  const itemsSvg = bullets
    .map((item, idx) => {
      const y = 342 + idx * 110;
      const line = escapeXml(truncateByDisplayWidth(item, 68));
      return `
  <rect x="96" y="${y}" width="1408" height="86" rx="20" fill="${theme.cardFill}" stroke="${theme.cardStroke}" stroke-width="2.5"/>
  <rect x="120" y="${y + 20}" width="64" height="46" rx="12" fill="${theme.accentFrom}" opacity="0.22"/>
  <text x="152" y="${y + 52}" text-anchor="middle" fill="${theme.accentFrom}" font-size="25" font-weight="900" font-family="${FONT_STACK}">0${idx + 1}</text>
  <text x="206" y="${y + 54}" fill="${theme.textColor}" font-size="30" font-weight="600" font-family="${FONT_STACK}">${escapeXml(theme.bulletIcon)} ${line}</text>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="bgH_${theme.id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bgStops[0]}"/>
      <stop offset="60%" stop-color="${theme.bgStops[1]}"/>
      <stop offset="100%" stop-color="${theme.bgStops[2]}"/>
    </linearGradient>
    <linearGradient id="pillH_${theme.id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${theme.accentFrom}"/>
      <stop offset="100%" stop-color="${theme.accentTo}"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bgH_${theme.id})"/>
  ${renderHeroBackdropLayer(heroImageDataUri, 1600, 900, `h_${theme.id}`)}
  <circle cx="1430" cy="150" r="240" fill="${theme.accentFrom}" opacity="0.12"/>
  <circle cx="160" cy="820" r="220" fill="${theme.accentTo}" opacity="0.10"/>

  <!-- Mascot badge medallion -->
  <circle cx="1370" cy="176" r="112" fill="rgba(255,255,255,0.06)" stroke="${theme.cardStroke}" stroke-width="2.5"/>
  ${renderMascotSvg(theme.id, 1270, 76, 1.0, `h_${theme.id}`)}

  <!-- Top sticker header pill -->
  <rect x="96" y="64" width="660" height="52" rx="26" fill="url(#pillH_${theme.id})"/>
  <text x="128" y="99" fill="${theme.badgeTextColor}" font-size="25" font-weight="800" font-family="${FONT_STACK}">${badgeText}</text>

  <text x="96" y="198" fill="#FFFFFF" font-size="60" font-weight="900" font-family="${FONT_STACK}">${project}</text>

  <!-- Stats strip -->
  <rect x="96" y="230" width="1060" height="62" rx="16" fill="${theme.statsFill}" stroke="${theme.statsStroke}" stroke-width="2"/>
  <text x="124" y="271" fill="${theme.textColor}" font-size="28" font-weight="700" font-family="${FONT_STACK}">⚡ ${statsLine}</text>

  ${itemsSvg}

  <rect x="1312" y="810" width="192" height="40" rx="20" fill="${comic.accentTint}" opacity="0.18" stroke="${theme.accentFrom}" stroke-width="1.5"/>
  <text x="1408" y="837" text-anchor="middle" fill="${theme.subtitleColor}" font-size="19" font-weight="800" font-family="${FONT_STACK}">16:9 DEVLOG</text>
  <text x="96" y="842" fill="${theme.subtitleColor}" opacity="0.82" font-size="24" font-weight="600" font-family="${FONT_STACK}">dsh-plugin-devlog-poster · ${escapeXml(theme.footerTag)}</text>
</svg>
`;
}

function renderPagerDots(comic, activeIndex, total = 4) {
  const dots = [];
  let cursorX = 838;
  for (let i = 0; i < total; i += 1) {
    if (i === activeIndex) {
      dots.push(
        `<rect x="${cursorX}" y="98" width="44" height="22" rx="11" fill="${comic.accent}" stroke="${comic.ink}" stroke-width="3.5"/>`
      );
      cursorX += 58;
    } else {
      dots.push(
        `<circle cx="${cursorX + 11}" cy="109" r="10" fill="#FFFFFF" stroke="${comic.ink}" stroke-width="3.5"/>`
      );
      cursorX += 34;
    }
  }
  return `<g aria-label="carousel-pager">${dots.join('')}</g>`;
}

function renderComicSlideShell({
  comic,
  uid,
  pageIndex,
  pageTag,
  heading,
  subtitle,
  bodySvg,
  footer,
  swipeCue = '左滑继续 →',
}) {
  const safePageTag = escapeXml(pageTag);
  const safeHeading = escapeXml(truncateByDisplayWidth(heading, 24));
  const safeSubtitle = subtitle ? escapeXml(truncateByDisplayWidth(subtitle, 44)) : '';
  const safeFooter = escapeXml(truncateByDisplayWidth(footer, 44));
  const safeCue = escapeXml(swipeCue);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440" data-comic-slide="${pageIndex + 1}">
  <defs>
    <linearGradient id="slideBg_${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${comic.bgFrom}"/>
      <stop offset="52%" stop-color="${comic.bgMid}"/>
      <stop offset="100%" stop-color="${comic.bgTo}"/>
    </linearGradient>
    <pattern id="comicDots_${uid}" width="26" height="26" patternUnits="userSpaceOnUse">
      <circle cx="5" cy="5" r="2.2" fill="${comic.dotPattern}"/>
    </pattern>
  </defs>

  <!-- Bright chibi comic backdrop harmonizing with P1 AI-girl covers -->
  <rect width="1080" height="1440" fill="url(#slideBg_${uid})"/>
  ${renderComicDecorations(comic, uid)}

  <!-- Top sticker pill + 4-dot pager -->
  <rect x="90" y="88" width="290" height="56" rx="28" fill="${comic.shadow}"/>
  <rect x="84" y="82" width="290" height="56" rx="28" fill="${comic.accent}" stroke="${comic.ink}" stroke-width="4.5"/>
  <text x="116" y="119" fill="${comic.badgeText}" font-size="26" font-weight="900" font-family="${FONT_STACK}">${safePageTag}</text>

  ${renderPagerDots(comic, pageIndex, 4)}

  <!-- Bold comic title + accent highlight bar -->
  <rect x="84" y="246" width="180" height="14" rx="7" fill="${comic.accentSoft}" opacity="0.65"/>
  <text x="84" y="234" fill="#FFFFFF" stroke="${comic.ink}" stroke-width="11" paint-order="stroke" stroke-linejoin="round" font-size="56" font-weight="900" font-family="${FONT_STACK}">${safeHeading}</text>
  ${
    safeSubtitle
      ? `<text x="84" y="290" fill="${comic.muted}" font-size="25" font-weight="700" font-family="${FONT_STACK}">${safeSubtitle}</text>`
      : ''
  }

  ${bodySvg}

  <!-- Bottom comic footer + swipe cue -->
  <line x1="84" y1="1316" x2="996" y2="1316" stroke="${comic.panelStroke}" stroke-width="3" stroke-dasharray="10 8"/>
  <text x="84" y="1374" fill="${comic.muted}" font-size="23" font-weight="700" font-family="${FONT_STACK}">${safeFooter}</text>
  <rect x="780" y="1340" width="220" height="50" rx="25" fill="${comic.shadow}"/>
  <rect x="776" y="1336" width="220" height="50" rx="25" fill="#FFFFFF" stroke="${comic.ink}" stroke-width="4"/>
  <text x="886" y="1370" text-anchor="middle" fill="${comic.ink}" font-size="23" font-weight="900" font-family="${FONT_STACK}">${safeCue}</text>
</svg>
`;
}

/**
 * Render a 4-slide 3:4 carousel pack tailored for Xiaohongshu / Douyin multi-image posts:
 * P1 Cover -> P2 Core Updates -> P3 Pitfalls & Snapshot -> P4 Next Up & CTA.
 */
export function renderCarouselSlidesSvg(
  context,
  formatted,
  { heroImageDataUri, isMascotCover = false } = {}
) {
  if (isOfficeMode(formatted)) {
    return renderOfficeCarouselSlidesSvg(context, formatted);
  }
  const theme = resolveStyle(formatted?.meta?.style);
  const comic = resolveComicPalette(theme.id);
  const project = context.projectName.split('/').pop() || context.projectName;
  const footer = `${theme.badgeLabel} · ${project} · ${formatted.meta.dateStr}`;
  const points = (context.highlights?.length > 0
    ? context.highlights
    : context.commits?.map((c) => c.subject) || ['阶段性进展与闭环整理']
  ).slice(0, 5);
  const pitfalls = context.pitfalls?.length > 0 ? context.pitfalls : ['把大需求切小，先保证单次闭环可验证'];
  const nextSteps = context.nextSteps?.length > 0 ? context.nextSteps : ['持续迭代并欢迎评论区提需求'];

  // P1 Cover (reuses rich vertical cover or built-in AI-girl cover)
  const slide1 = renderVerticalCardSvg(context, formatted, { heroImageDataUri, isMascotCover });

  // P2 Core Updates (bright chibi comic cards with adaptive spacing)
  const p2Count = points.length;
  const p2CardH = p2Count <= 3 ? 220 : p2Count === 4 ? 196 : 166;
  const p2Gap = p2Count <= 3 ? 34 : p2Count === 4 ? 26 : 22;
  const p2MaxLines = p2Count <= 3 ? 3 : 2;
  const p2StartY = 330;

  const p2Items = points
    .map((item, idx) => {
      const y = p2StartY + idx * (p2CardH + p2Gap);
      const lines = wrapTextClamped(item, 40, p2MaxLines);
      const lineSpacing = p2Count <= 3 ? 42 : 38;
      return `
  <rect x="91" y="${y + 7}" width="912" height="${p2CardH}" rx="26" fill="${comic.shadow}"/>
  <rect x="84" y="${y}" width="912" height="${p2CardH}" rx="26" fill="#FFFFFF" stroke="${comic.ink}" stroke-width="4.5"/>
  <rect x="116" y="${y + 24}" width="144" height="38" rx="19" fill="${comic.accentTint}" stroke="${comic.ink}" stroke-width="3"/>
  <text x="188" y="${y + 51}" text-anchor="middle" fill="${comic.accent}" font-size="22" font-weight="900" font-family="${FONT_STACK}">STEP 0${idx + 1}</text>
  ${lines
    .map(
      (l, li) =>
        `<text x="118" y="${y + 104 + li * lineSpacing}" fill="${comic.bodyInk}" font-size="31" font-weight="700" font-family="${FONT_STACK}">${escapeXml(l)}</text>`
    )
    .join('\n')}`;
    })
    .join('\n');

  const slide2 = renderComicSlideShell({
    comic,
    uid: `p2_${theme.id}`,
    pageIndex: 1,
    pageTag: 'P2 / 4 · 核心更新',
    heading: '本轮核心更新清单',
    subtitle: `${formatted.meta.statsLine} · 共 ${points.length} 项重点`,
    bodySvg: p2Items,
    footer,
    swipeCue: '左滑继续 →',
  });

  // P3 Pitfalls & Lessons + "本轮改动速览" Density Balance when pitfalls <= 2
  const visiblePitfalls = pitfalls.slice(0, 3);
  const p3CardH = visiblePitfalls.length === 1 ? 260 : visiblePitfalls.length === 2 ? 216 : 206;
  const p3Gap = 28;
  const p3StartY = 330;

  const p3Pitfalls = visiblePitfalls
    .map((p, idx) => {
      const y = p3StartY + idx * (p3CardH + p3Gap);
      const lines = wrapTextClamped(p, 40, visiblePitfalls.length === 1 ? 4 : 3);
      return `
  <rect x="91" y="${y + 7}" width="912" height="${p3CardH}" rx="26" fill="${comic.shadow}"/>
  <rect x="84" y="${y}" width="912" height="${p3CardH}" rx="26" fill="${comic.pitfallBg}" stroke="${comic.ink}" stroke-width="4.5"/>
  <rect x="116" y="${y + 24}" width="210" height="40" rx="20" fill="${comic.pitfallTagBg}" stroke="${comic.ink}" stroke-width="3"/>
  <text x="221" y="${y + 52}" text-anchor="middle" fill="${comic.pitfallAccent}" font-size="22" font-weight="900" font-family="${FONT_STACK}">⚠️ 踩坑记录 #${idx + 1}</text>
  ${lines
    .map(
      (l, li) =>
        `<text x="118" y="${y + 108 + li * 40}" fill="${comic.bodyInk}" font-size="31" font-weight="700" font-family="${FONT_STACK}">${escapeXml(l)}</text>`
    )
    .join('\n')}`;
    })
    .join('\n');

  let p3SnapshotCard = '';
  if (visiblePitfalls.length <= 2) {
    const snapY = p3StartY + visiblePitfalls.length * (p3CardH + p3Gap) + 18;
    const snapH = Math.min(430, Math.max(290, 1272 - snapY));
    const stats = context.stats || {};
    const changedFiles = (context.changedFiles || []).slice(0, 6);
    const statPills = [
      `🌿 分支 ${truncateByDisplayWidth(context.branch || 'main', 14)}`,
      stats.filesChanged > 0 ? `📁 ${stats.filesChanged} 文件` : `✨ ${points.length} 项更新`,
      stats.insertions || stats.deletions
        ? `⚡ +${stats.insertions || 0} / -${stats.deletions || 0}`
        : `📦 ${(context.commits || []).length} Commits`,
    ];

    const statPillsSvg = statPills
      .map((label, idx) => {
        const px = 118 + idx * 284;
        return `
  <rect x="${px}" y="${snapY + 96}" width="268" height="48" rx="16" fill="${comic.accentTint}" stroke="${comic.ink}" stroke-width="3"/>
  <text x="${px + 134}" y="${snapY + 128}" text-anchor="middle" fill="${comic.ink}" font-size="22" font-weight="800" font-family="${FONT_STACK}">${escapeXml(truncateByDisplayWidth(label, 18))}</text>`;
      })
      .join('\n');

    const fileRows = changedFiles.length > 0
      ? changedFiles
          .slice(0, snapH >= 360 ? 6 : 4)
          .map((file, idx) => {
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const fx = 118 + col * 428;
            const fy = snapY + 172 + row * 62;
            return `
  <rect x="${fx}" y="${fy}" width="410" height="48" rx="14" fill="#FFFFFF" stroke="${comic.panelStroke}" stroke-width="3"/>
  <text x="${fx + 18}" y="${fy + 32}" fill="${comic.muted}" font-size="21" font-weight="700" font-family="${MONO_STACK}">📄 ${escapeXml(truncateByDisplayWidth(file, 29))}</text>`;
          })
          .join('\n')
      : `
  <rect x="118" y="${snapY + 174}" width="844" height="72" rx="18" fill="#FFFFFF" stroke="${comic.panelStroke}" stroke-width="3"/>
  <text x="148" y="${snapY + 219}" fill="${comic.muted}" font-size="25" font-weight="700" font-family="${FONT_STACK}">${escapeXml(theme.bulletIcon)} ${escapeXml(truncateByDisplayWidth(formatted.meta.statsLine, 46))}</text>`;

    p3SnapshotCard = `
  <rect x="91" y="${snapY + 7}" width="912" height="${snapH}" rx="28" fill="${comic.shadow}"/>
  <rect x="84" y="${snapY}" width="912" height="${snapH}" rx="28" fill="#FFFFFF" stroke="${comic.ink}" stroke-width="4.5"/>
  <rect x="118" y="${snapY + 26}" width="218" height="44" rx="22" fill="${comic.accent}" stroke="${comic.ink}" stroke-width="3.5"/>
  <text x="227" y="${snapY + 56}" text-anchor="middle" fill="#FFFFFF" font-size="23" font-weight="900" font-family="${FONT_STACK}">📦 本轮改动速览</text>
  <text x="358" y="${snapY + 57}" fill="${comic.muted}" font-size="22" font-weight="700" font-family="${FONT_STACK}">${escapeXml(truncateByDisplayWidth(project, 26))}</text>
  ${statPillsSvg}
  ${fileRows}`;
  }

  const slide3 = renderComicSlideShell({
    comic,
    uid: `p3_${theme.id}`,
    pageIndex: 2,
    pageTag: 'P3 / 4 · 踩坑复盘',
    heading: '真实踩坑与取舍',
    subtitle: '把走过的弯路记下来，下一次迭代少踩一半',
    bodySvg: `${p3Pitfalls}\n${p3SnapshotCard}`,
    footer,
    swipeCue: '左滑继续 →',
  });

  // P4 Next Up & Community CTA (bright comic cards + crisp non-overlapping CTA)
  const visibleNext = nextSteps.slice(0, 3);
  const p4CardH = 148;
  const p4Gap = 24;
  const p4StartY = 330;

  const p4Next = visibleNext
    .map((n, idx) => {
      const y = p4StartY + idx * (p4CardH + p4Gap);
      const lines = wrapTextClamped(n, 38, 2);
      return `
  <rect x="91" y="${y + 7}" width="912" height="${p4CardH}" rx="26" fill="${comic.shadow}"/>
  <rect x="84" y="${y}" width="912" height="${p4CardH}" rx="26" fill="#FFFFFF" stroke="${comic.ink}" stroke-width="4.5"/>
  <circle cx="142" cy="${y + 74}" r="28" fill="${comic.accentTint}" stroke="${comic.ink}" stroke-width="3.5"/>
  <text x="142" y="${y + 84}" text-anchor="middle" fill="${comic.accent}" font-size="26" font-weight="900" font-family="${FONT_STACK}">${idx + 1}</text>
  <text x="194" y="${y + (lines.length > 1 ? 62 : 84)}" fill="${comic.bodyInk}" font-size="31" font-weight="700" font-family="${FONT_STACK}">${escapeXml(lines[0] || '')}</text>
  ${lines[1] ? `<text x="194" y="${y + 108}" fill="${comic.bodyInk}" font-size="31" font-weight="700" font-family="${FONT_STACK}">${escapeXml(lines[1])}</text>` : ''}`;
    })
    .join('\n');

  const ctaY = 892;
  const ctaH = 342;
  const repoLabel = escapeXml(truncateByDisplayWidth(`开源仓库：${context.projectName}`, 46));
  const installCommands = {
    big_fat_fish: 'dsh plugin add github:Kirakila7/dsh-plugin-devlog-poster',
    gemini: 'npx skills add Kirakila7/dsh-plugin-devlog-poster',
    chatgpt: 'npx skills add Kirakila7/dsh-plugin-devlog-poster',
    claude: 'npx skills add Kirakila7/dsh-plugin-devlog-poster',
  };
  const installCmd = installCommands[theme.id] || installCommands.big_fat_fish;

  const p4Cta = `
  ${p4Next}
  <!-- Bright Comic CTA Card with clean left-copy / right-emblem layout -->
  <rect x="92" y="${ctaY + 8}" width="912" height="${ctaH}" rx="30" fill="${comic.shadow}"/>
  <rect x="84" y="${ctaY}" width="912" height="${ctaH}" rx="30" fill="${comic.accentTint}" stroke="${comic.ink}" stroke-width="5"/>

  <!-- Left column (x=124..700): zero overlap with right mascot medallion -->
  <rect x="124" y="${ctaY + 34}" width="176" height="42" rx="21" fill="${comic.accent}" stroke="${comic.ink}" stroke-width="3.5"/>
  <text x="212" y="${ctaY + 63}" text-anchor="middle" fill="#FFFFFF" font-size="22" font-weight="900" font-family="${FONT_STACK}">💬 互动时间</text>

  <text x="124" y="${ctaY + 138}" fill="${comic.ink}" font-size="40" font-weight="900" font-family="${FONT_STACK}">欢迎评论区点菜 / 催更</text>
  <text x="124" y="${ctaY + 194}" fill="${comic.muted}" font-size="24" font-weight="700" font-family="${FONT_STACK}">${repoLabel}</text>

  <rect x="124" y="${ctaY + 230}" width="590" height="66" rx="18" fill="#FFFFFF" stroke="${comic.ink}" stroke-width="3.5"/>
  <text x="142" y="${ctaY + 270}" fill="${comic.ink}" font-size="16" font-weight="700" font-family="${MONO_STACK}">${escapeXml(installCmd)}</text>

  <!-- Right column: crisp white comic medallion hosting mini mascot emblem -->
  <circle cx="858" cy="${ctaY + 177}" r="92" fill="${comic.shadow}"/>
  <circle cx="852" cy="${ctaY + 171}" r="92" fill="#FFFFFF" stroke="${comic.ink}" stroke-width="4.5"/>
  ${renderMascotSvg(theme.id, 772, ctaY + 91, 0.8, `p4_${theme.id}`)}`;

  const slide4 = renderComicSlideShell({
    comic,
    uid: `p4_${theme.id}`,
    pageIndex: 3,
    pageTag: 'P4 / 4 · 预告互动',
    heading: '下一步计划',
    subtitle: '点个关注不迷路，下轮实机更新马上安排',
    bodySvg: p4Cta,
    footer,
    swipeCue: '完结撒花 ✨',
  });

  return [
    { id: 'slide-1-cover', label: 'P1 封面卡', svg: slide1 },
    { id: 'slide-2-changes', label: 'P2 核心更新', svg: slide2 },
    { id: 'slide-3-pitfalls', label: 'P3 真实踩坑', svg: slide3 },
    { id: 'slide-4-next', label: 'P4 预告与互动', svg: slide4 },
  ];
}
