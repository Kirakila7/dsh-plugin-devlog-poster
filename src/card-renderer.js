import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStyle } from './styles.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MASCOTS_DIR = join(__dirname, '..', 'assets', 'mascots');

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

function wrapText(text, maxChars) {
  const lines = [];
  let current = '';
  for (const ch of String(text || '')) {
    current += ch;
    if (current.length >= maxChars) {
      lines.push(current);
      current = '';
    }
  }
  if (current) lines.push(current);
  return lines;
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
  if (styleId === 'gemini') {
    return `
  <g transform="translate(${x}, ${y}) scale(${scale})">
    <defs>
      <linearGradient id="gemStar_${uid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#60A5FA"/>
        <stop offset="55%" stop-color="#A78BFA"/>
        <stop offset="100%" stop-color="#F472B6"/>
      </linearGradient>
    </defs>
    <circle cx="110" cy="95" r="72" fill="#818CF8" opacity="0.16"/>
    <path d="M110 18 C118 68, 142 88, 192 95 C142 102, 118 122, 110 172 C102 122, 78 102, 28 95 C78 88, 102 68, 110 18 Z" fill="url(#gemStar_${uid})"/>
    <path d="M188 26 C191 42, 198 49, 214 52 C198 55, 191 62, 188 78 C185 62, 178 55, 162 52 C178 49, 185 42, 188 26 Z" fill="#C4B5FD"/>
  </g>`;
  }

  if (styleId === 'chatgpt') {
    return `
  <g transform="translate(${x}, ${y}) scale(${scale})">
    <circle cx="112" cy="96" r="70" fill="#10A37F" opacity="0.18"/>
    <g fill="none" stroke="#34D399" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" transform="translate(112, 96)">
      <polygon points="0,-54 47,-27 47,27 0,54 -47,27 -47,-27"/>
      <polygon points="0,-28 24,-14 24,14 0,28 -24,14 -24,-14" stroke="#A7F3D0" stroke-width="6"/>
      <line x1="0" y1="-54" x2="0" y2="-28"/>
      <line x1="47" y1="-27" x2="24" y2="-14"/>
      <line x1="47" y1="27" x2="24" y2="14"/>
      <line x1="0" y1="54" x2="0" y2="28"/>
      <line x1="-47" y1="27" x2="-24" y2="14"/>
      <line x1="-47" y1="-27" x2="-24" y2="-14"/>
    </g>
  </g>`;
  }

  if (styleId === 'claude') {
    return `
  <g transform="translate(${x}, ${y}) scale(${scale})">
    <circle cx="112" cy="96" r="70" fill="#D97757" opacity="0.18"/>
    <g transform="translate(112, 96)" stroke="#F4A261" stroke-width="11" stroke-linecap="round">
      <line x1="0" y1="-54" x2="0" y2="54"/>
      <line x1="-54" y1="0" x2="54" y2="0"/>
      <line x1="-38" y1="-38" x2="38" y2="38"/>
      <line x1="38" y1="-38" x2="-38" y2="38"/>
      <circle cx="0" cy="0" r="14" fill="#D97757" stroke="none"/>
    </g>
  </g>`;
  }

  return `
  <g transform="translate(${x}, ${y}) scale(${scale})">
    <path d="M92 22 C86 -6, 62 -10, 56 6" fill="none" stroke="#7DD3FC" stroke-width="6" stroke-linecap="round"/>
    <path d="M98 22 C106 -6, 130 -10, 136 6" fill="none" stroke="#BAE6FD" stroke-width="6" stroke-linecap="round"/>
    <circle cx="18" cy="48" r="8" fill="none" stroke="#7DD3FC" stroke-width="3" opacity="0.8"/>
    <circle cx="34" cy="24" r="5" fill="#BAE6FD" opacity="0.7"/>
    <path d="M188 92 C218 68, 240 58, 246 74 C250 86, 232 98, 224 102 C238 110, 248 124, 240 134 C230 146, 208 130, 184 114 Z" fill="#2563EB"/>
    <ellipse cx="114" cy="100" rx="88" ry="66" fill="#3B82F6"/>
    <ellipse cx="102" cy="64" rx="54" ry="20" fill="#60A5FA" opacity="0.55"/>
    <path d="M38 118 C64 156, 152 162, 186 122 C154 134, 80 136, 38 118 Z" fill="#E0F2FE"/>
    <path d="M114 118 C128 142, 156 144, 156 126 C156 114, 134 108, 114 118 Z" fill="#1D4ED8"/>
    <ellipse cx="58" cy="108" rx="10" ry="6" fill="#F472B6" opacity="0.45"/>
    <circle cx="62" cy="90" r="8" fill="#0F172A"/>
    <circle cx="59" cy="87" r="2.8" fill="#FFFFFF"/>
    <path d="M36 106 Q48 118 62 110" fill="none" stroke="#0F172A" stroke-width="4.5" stroke-linecap="round"/>
  </g>`;
}

function renderHeroBackdropLayer(heroImageDataUri, width, height, uid) {
  if (!heroImageDataUri) return '';
  return `
  <image href="${heroImageDataUri}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="0.42"/>
  <defs>
    <linearGradient id="heroScrim_${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.35"/>
      <stop offset="55%" stop-color="#000000" stop-opacity="0.58"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.82"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#heroScrim_${uid})"/>`;
}

/**
 * Render a 3:4 vertical Devlog cover card (1080x1440).
 * When heroImageDataUri is provided, uses a bright Xiaohongshu comic-poster layout
 * that showcases the AI-girl illustration clearly with crisp top headline & bottom frosted summary card.
 */
export function renderVerticalCardSvg(
  context,
  formatted,
  { heroImageDataUri, isMascotCover = false } = {}
) {
  const theme = resolveStyle(formatted?.meta?.style);
  const project = escapeXml(context.projectName.split('/').pop() || context.projectName);
  const dateStr = escapeXml(formatted.meta.dateStr);
  const statsLine = escapeXml(formatted.meta.statsLine);
  const bullets = (context.highlights?.length > 0
    ? context.highlights
    : context.commits?.map((c) => c.subject) || ['阶段性进展与闭环整理']
  ).slice(0, 4);
  const pitfall = context.pitfalls?.[0];

  if (heroImageDataUri && isMascotCover) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <image href="${heroImageDataUri}" x="0" y="0" width="1080" height="1440" preserveAspectRatio="xMidYMid slice"/>
  <!-- Bottom minimal pill preserving full artwork & top comic title -->
  <rect x="64" y="1296" width="952" height="84" rx="42" fill="rgba(255,255,255,0.92)" stroke="#1E293B" stroke-width="5"/>
  <text x="108" y="1349" fill="#0F172A" font-size="30" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${project} · ${dateStr} · ${statsLine}</text>
  <text x="1012" y="1418" text-anchor="end" fill="#475569" font-size="20" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">AI 娘形象来源：Zipzipipe · dsh-plugin-devlog-poster</text>
</svg>
`;
  }

  if (heroImageDataUri) {
    const shortBullets = bullets.slice(0, 2);
    const bulletTextSvg = shortBullets
      .map(
        (item, idx) =>
          `<text x="116" y="${1222 + idx * 54}" fill="#1E293B" font-size="31" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(theme.bulletIcon)} ${escapeXml(item.length > 26 ? `${item.slice(0, 26)}…` : item)}</text>`
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <image href="${heroImageDataUri}" x="0" y="0" width="1080" height="1440" preserveAspectRatio="xMidYMid slice"/>
  <!-- Top comic-style sticker badge & bold outlined title -->
  <rect x="72" y="58" width="430" height="58" rx="29" fill="${theme.accentFrom}" stroke="#1E293B" stroke-width="5"/>
  <text x="104" y="97" fill="#FFFFFF" font-size="28" font-weight="900" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(theme.badgeLabel)} · ${dateStr}</text>

  <text x="72" y="198" fill="#FFFFFF" stroke="#1E293B" stroke-width="14" paint-order="stroke" stroke-linejoin="round" font-size="70" font-weight="900" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${project}</text>

  <!-- Bottom frosted cream comic card -->
  <rect x="64" y="1096" width="952" height="278" rx="32" fill="rgba(255,255,255,0.92)" stroke="#1E293B" stroke-width="6"/>
  <text x="116" y="1160" fill="#0F172A" font-size="33" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(theme.subtitle.split('·')[0].trim())} · ${statsLine}</text>
  ${bulletTextSvg}
  <text x="116" y="1342" fill="#64748B" font-size="24" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">dsh-plugin-devlog-poster · ${escapeXml(theme.name)}</text>
</svg>
`;
  }

  const bulletBlocks = bullets
    .map((item, idx) => {
      const y = 550 + idx * 150;
      const wrapped = wrapText(item, 22).slice(0, 2);
      const textLines = wrapped
        .map(
          (line, lineIdx) =>
            `<text x="150" y="${y + 50 + lineIdx * 40}" fill="${theme.textColor}" font-size="33" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(line)}</text>`
        )
        .join('\n');
      return `
  <rect x="84" y="${y}" width="912" height="122" rx="24" fill="${theme.cardFill}" stroke="${theme.cardStroke}" stroke-width="2"/>
  <circle cx="118" cy="${y + 40}" r="13" fill="${theme.dotColor}"/>
  ${textLines}`;
    })
    .join('\n');

  const pitfallBlock = pitfall
    ? `
  <rect x="84" y="1170" width="912" height="110" rx="22" fill="rgba(251,191,36,0.12)" stroke="rgba(251,191,36,0.38)" stroke-width="2"/>
  <text x="120" y="1216" fill="#FDE68A" font-size="26" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">⚠️ 避坑笔记</text>
  <text x="120" y="1256" fill="#FEF3C7" font-size="28" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(pitfall.length > 28 ? `${pitfall.slice(0, 28)}…` : pitfall)}</text>`
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

  <rect x="84" y="92" width="440" height="56" rx="28" fill="url(#badgeV_${theme.id})"/>
  <text x="116" y="130" fill="${theme.badgeTextColor}" font-size="27" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(theme.badgeLabel)} · ${dateStr}</text>

  ${renderMascotSvg(theme.id, 710, 88, 1.1, `v_${theme.id}`)}

  <text x="84" y="274" fill="#FFFFFF" font-size="66" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${project}</text>
  <text x="84" y="344" fill="${theme.subtitleColor}" font-size="31" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(theme.subtitle)}</text>

  <rect x="84" y="406" width="912" height="92" rx="20" fill="${theme.statsFill}" stroke="${theme.statsStroke}" stroke-width="2"/>
  <text x="120" y="464" fill="${theme.textColor}" font-size="31" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${statsLine}</text>

  ${bulletBlocks}
  ${pitfallBlock}

  <text x="84" y="1364" fill="${theme.subtitleColor}" opacity="0.78" font-size="25" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">dsh-plugin-devlog-poster · ${escapeXml(theme.name)} · Branch: ${escapeXml(context.branch || 'main')}</text>
</svg>
`;
}

/**
 * Render a 16:9 horizontal Devlog summary card (1600x900) for Bilibili & GitHub.
 */
export function renderHorizontalCardSvg(context, formatted, { heroImageDataUri } = {}) {
  const theme = resolveStyle(formatted?.meta?.style);
  const project = escapeXml(context.projectName);
  const dateStr = escapeXml(formatted.meta.dateStr);
  const statsLine = escapeXml(formatted.meta.statsLine);
  const bullets = (context.highlights?.length > 0
    ? context.highlights
    : context.commits?.map((c) => c.subject) || ['阶段性进展与闭环整理']
  ).slice(0, 4);

  const itemsSvg = bullets
    .map((item, idx) => {
      const y = 340 + idx * 108;
      const line = escapeXml(item.length > 42 ? `${item.slice(0, 42)}…` : item);
      return `
  <rect x="96" y="${y}" width="1408" height="82" rx="18" fill="${theme.cardFill}" stroke="${theme.cardStroke}" stroke-width="2"/>
  <text x="132" y="${y + 52}" fill="${theme.textColor}" font-size="30" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(theme.bulletIcon)} ${idx + 1}. ${line}</text>`;
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
  </defs>
  <rect width="1600" height="900" fill="url(#bgH_${theme.id})"/>
  ${renderHeroBackdropLayer(heroImageDataUri, 1600, 900, `h_${theme.id}`)}
  <circle cx="1430" cy="150" r="240" fill="${theme.accentFrom}" opacity="0.12"/>
  <circle cx="160" cy="820" r="220" fill="${theme.accentTo}" opacity="0.10"/>

  ${renderMascotSvg(theme.id, 1240, 68, 1.05, `h_${theme.id}`)}

  <text x="96" y="112" fill="${theme.accentFrom}" font-size="28" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(theme.badgeLabel)} · ${dateStr} · ${escapeXml(context.branch || 'main')}</text>
  <text x="96" y="196" fill="#FFFFFF" font-size="62" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${project}</text>
  <text x="96" y="264" fill="${theme.subtitleColor}" font-size="30" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${statsLine}</text>

  ${itemsSvg}

  <text x="96" y="846" fill="${theme.subtitleColor}" opacity="0.78" font-size="24" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">dsh-plugin-devlog-poster · ${escapeXml(theme.footerTag)}</text>
</svg>
`;
}

function renderSlideShell({ theme, uid, pageTag, heading, bodySvg, footer, heroImageDataUri }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <defs>
    <linearGradient id="slideBg_${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bgStops[0]}"/>
      <stop offset="55%" stop-color="${theme.bgStops[1]}"/>
      <stop offset="100%" stop-color="${theme.bgStops[2]}"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1440" fill="url(#slideBg_${uid})"/>
  ${renderHeroBackdropLayer(heroImageDataUri, 1080, 1440, `s_${uid}`)}
  <rect x="84" y="88" width="210" height="50" rx="25" fill="${theme.accentFrom}"/>
  <text x="116" y="122" fill="${theme.badgeTextColor}" font-size="25" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(pageTag)}</text>
  <text x="84" y="242" fill="#FFFFFF" font-size="58" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(heading)}</text>
  ${bodySvg}
  <text x="84" y="1364" fill="${theme.subtitleColor}" opacity="0.75" font-size="24" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(footer)}</text>
</svg>
`;
}

/**
 * Render a 4-slide 3:4 carousel pack tailored for Xiaohongshu / Douyin multi-image posts:
 * P1 Cover -> P2 Core Updates -> P3 Pitfalls & Lessons -> P4 Next Up & CTA.
 */
export function renderCarouselSlidesSvg(
  context,
  formatted,
  { heroImageDataUri, isMascotCover = false } = {}
) {
  const theme = resolveStyle(formatted?.meta?.style);
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

  // P2 Core Updates
  const p2Items = points
    .map((item, idx) => {
      const y = 320 + idx * 185;
      const lines = wrapText(item, 21).slice(0, 3);
      return `
  <rect x="84" y="${y}" width="912" height="156" rx="24" fill="${theme.cardFill}" stroke="${theme.cardStroke}" stroke-width="2"/>
  <text x="122" y="${y + 52}" fill="${theme.accentFrom}" font-size="26" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">STEP 0${idx + 1}</text>
  ${lines
    .map(
      (l, li) =>
        `<text x="122" y="${y + 98 + li * 38}" fill="${theme.textColor}" font-size="32" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(l)}</text>`
    )
    .join('\n')}`;
    })
    .join('\n');

  const slide2 = renderSlideShell({
    theme,
    uid: `p2_${theme.id}`,
    pageTag: 'P2 / 4 · 更新',
    heading: '本轮核心更新清单',
    bodySvg: p2Items,
    footer,
  });

  // P3 Pitfalls & Changed Files
  const p3Pitfalls = pitfalls
    .slice(0, 3)
    .map((p, idx) => {
      const y = 320 + idx * 210;
      const lines = wrapText(p, 21).slice(0, 3);
      return `
  <rect x="84" y="${y}" width="912" height="178" rx="24" fill="rgba(251,191,36,0.10)" stroke="rgba(251,191,36,0.36)" stroke-width="2"/>
  <text x="122" y="${y + 52}" fill="#FDE68A" font-size="26" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">⚠️ 踩坑记录 #${idx + 1}</text>
  ${lines
    .map(
      (l, li) =>
        `<text x="122" y="${y + 98 + li * 38}" fill="#FEF3C7" font-size="32" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(l)}</text>`
    )
    .join('\n')}`;
    })
    .join('\n');

  const slide3 = renderSlideShell({
    theme,
    uid: `p3_${theme.id}`,
    pageTag: 'P3 / 4 · 踩坑',
    heading: '真实踩坑与取舍',
    bodySvg: p3Pitfalls,
    footer,
  });

  // P4 Next Up & Community CTA
  const p4Next = nextSteps
    .slice(0, 3)
    .map((n, idx) => {
      const y = 340 + idx * 170;
      const lines = wrapText(n, 21).slice(0, 2);
      return `
  <rect x="84" y="${y}" width="912" height="140" rx="24" fill="${theme.cardFill}" stroke="${theme.cardStroke}" stroke-width="2"/>
  <text x="122" y="${y + 60}" fill="${theme.textColor}" font-size="33" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(theme.bulletIcon)} ${escapeXml(lines[0] || '')}</text>
  ${lines[1] ? `<text x="164" y="${y + 104}" fill="${theme.textColor}" font-size="33" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(lines[1])}</text>` : ''}`;
    })
    .join('\n');

  const p4Cta = `
  ${p4Next}
  <rect x="84" y="920" width="912" height="260" rx="28" fill="${theme.statsFill}" stroke="${theme.statsStroke}" stroke-width="2"/>
  ${renderMascotSvg(theme.id, 720, 946, 0.92, `p4_${theme.id}`)}
  <text x="126" y="1008" fill="#FFFFFF" font-size="40" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">欢迎评论区点菜 / 催更</text>
  <text x="126" y="1072" fill="${theme.subtitleColor}" font-size="30" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">开源仓库：${escapeXml(context.projectName)}</text>
  <text x="126" y="1126" fill="${theme.textColor}" font-size="27" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">dsh plugin add github:Kirakila7/dsh-plugin-devlog-poster</text>`;

  const slide4 = renderSlideShell({
    theme,
    uid: `p4_${theme.id}`,
    pageTag: 'P4 / 4 · 预告',
    heading: '下一步计划',
    bodySvg: p4Cta,
    footer,
  });

  return [
    { id: 'slide-1-cover', label: 'P1 封面卡', svg: slide1 },
    { id: 'slide-2-changes', label: 'P2 核心更新', svg: slide2 },
    { id: 'slide-3-pitfalls', label: 'P3 真实踩坑', svg: slide3 },
    { id: 'slide-4-next', label: 'P4 预告与互动', svg: slide4 },
  ];
}
