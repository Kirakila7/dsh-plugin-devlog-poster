import { resolveStyle } from './styles.js';

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

function renderMascotSvg(styleId, x, y, scale = 1) {
  if (styleId === 'gemini') {
    return `
  <g transform="translate(${x}, ${y}) scale(${scale})">
    <defs>
      <linearGradient id="gemStar" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#60A5FA"/>
        <stop offset="55%" stop-color="#A78BFA"/>
        <stop offset="100%" stop-color="#F472B6"/>
      </linearGradient>
    </defs>
    <circle cx="110" cy="95" r="72" fill="#818CF8" opacity="0.16"/>
    <path d="M110 18 C118 68, 142 88, 192 95 C142 102, 118 122, 110 172 C102 122, 78 102, 28 95 C78 88, 102 68, 110 18 Z" fill="url(#gemStar)"/>
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

  // Default: Big Fat Fish (蓝色大肥鱼)
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

/**
 * Render a 3:4 vertical Devlog cover card (1080x1440) for Xiaohongshu & Douyin.
 */
export function renderVerticalCardSvg(context, formatted) {
  const theme = resolveStyle(formatted?.meta?.style);
  const project = escapeXml(context.projectName.split('/').pop() || context.projectName);
  const dateStr = escapeXml(formatted.meta.dateStr);
  const statsLine = escapeXml(formatted.meta.statsLine);
  const bullets = (context.highlights?.length > 0
    ? context.highlights
    : context.commits?.map((c) => c.subject) || ['阶段性进展与闭环整理']
  ).slice(0, 4);
  const pitfall = context.pitfalls?.[0];

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
  <rect x="84" y="1170" width="912" height="110" rx="22" fill="rgba(251,191,36,0.10)" stroke="rgba(251,191,36,0.35)" stroke-width="2"/>
  <text x="120" y="1216" fill="#FDE68A" font-size="26" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">⚠️ 避坑笔记</text>
  <text x="120" y="1256" fill="#FEF3C7" font-size="28" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(pitfall.length > 28 ? `${pitfall.slice(0, 28)}…` : pitfall)}</text>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <defs>
    <linearGradient id="bgV" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bgStops[0]}"/>
      <stop offset="52%" stop-color="${theme.bgStops[1]}"/>
      <stop offset="100%" stop-color="${theme.bgStops[2]}"/>
    </linearGradient>
    <linearGradient id="badgeV" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${theme.accentFrom}"/>
      <stop offset="100%" stop-color="${theme.accentTo}"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1440" fill="url(#bgV)"/>
  <circle cx="940" cy="210" r="240" fill="${theme.accentFrom}" opacity="0.10"/>
  <circle cx="140" cy="1260" r="260" fill="${theme.accentTo}" opacity="0.10"/>

  <rect x="84" y="92" width="420" height="56" rx="28" fill="url(#badgeV)"/>
  <text x="116" y="130" fill="${theme.badgeTextColor}" font-size="27" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(theme.badgeLabel)} · ${dateStr}</text>

  ${renderMascotSvg(theme.id, 710, 88, 1.1)}

  <text x="84" y="274" fill="#FFFFFF" font-size="68" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${project}</text>
  <text x="84" y="344" fill="${theme.subtitleColor}" font-size="32" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(theme.subtitle)}</text>

  <rect x="84" y="406" width="912" height="92" rx="20" fill="${theme.statsFill}" stroke="${theme.statsStroke}" stroke-width="2"/>
  <text x="120" y="464" fill="${theme.textColor}" font-size="31" font-weight="600" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${statsLine}</text>

  ${bulletBlocks}
  ${pitfallBlock}

  <text x="84" y="1364" fill="${theme.subtitleColor}" opacity="0.72" font-size="25" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">dsh-plugin-devlog-poster · Style: ${escapeXml(theme.name)} · Branch: ${escapeXml(context.branch || 'main')}</text>
</svg>
`;
}

/**
 * Render a 16:9 horizontal Devlog summary card (1600x900) for Bilibili & GitHub.
 */
export function renderHorizontalCardSvg(context, formatted) {
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
    <linearGradient id="bgH" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${theme.bgStops[0]}"/>
      <stop offset="60%" stop-color="${theme.bgStops[1]}"/>
      <stop offset="100%" stop-color="${theme.bgStops[2]}"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bgH)"/>
  <circle cx="1430" cy="150" r="240" fill="${theme.accentFrom}" opacity="0.12"/>
  <circle cx="160" cy="820" r="220" fill="${theme.accentTo}" opacity="0.10"/>

  ${renderMascotSvg(theme.id, 1240, 68, 1.05)}

  <text x="96" y="112" fill="${theme.accentFrom}" font-size="28" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${escapeXml(theme.badgeLabel)} · ${dateStr} · ${escapeXml(context.branch || 'main')}</text>
  <text x="96" y="196" fill="#FFFFFF" font-size="62" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${project}</text>
  <text x="96" y="264" fill="${theme.subtitleColor}" font-size="30" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">${statsLine}</text>

  ${itemsSvg}

  <text x="96" y="846" fill="${theme.subtitleColor}" opacity="0.72" font-size="24" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif">dsh-plugin-devlog-poster · ${escapeXml(theme.footerTag)}</text>
</svg>
`;
}
