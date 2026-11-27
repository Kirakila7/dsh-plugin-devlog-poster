import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  fileToDataUri,
  renderCarouselSlidesSvg,
  renderHorizontalCardSvg,
  renderVerticalCardSvg,
  resolveDefaultMascotPath,
} from './card-renderer.js';
import { formatMultiPlatformDevlog } from './formatter.js';
import { AVAILABLE_STYLES, MODEL_STYLES } from './styles.js';
import { formatWorkReport } from './work-report.js';
import { buildAllPlatformImagePrompts } from './image-gen.js';

const WORKBENCH_THEMES = {
  big_fat_fish: {
    shortName: '大肥鱼',
    pageBg: '#EFF6FF',
    pageBgEnd: '#DBEAFE',
    surface: '#FFFFFF',
    surfaceSoft: '#E0F2FE',
    ink: '#1E293B',
    muted: '#475569',
    accent: '#2563EB',
    accentSoft: '#38BDF8',
    border: '#1E293B',
    borderSubtle: '#BFDBFE',
    dotColor: '#38BDF8',
    shadow: 'rgba(30, 41, 59, 0.16)',
  },
  gemini: {
    shortName: '哈基米',
    pageBg: '#F5F3FF',
    pageBgEnd: '#EDE9FE',
    surface: '#FFFFFF',
    surfaceSoft: '#F3E8FF',
    ink: '#2E1065',
    muted: '#5B21B6',
    accent: '#7C3AED',
    accentSoft: '#F59E0B',
    border: '#2E1065',
    borderSubtle: '#DDD6FE',
    dotColor: '#8B5CF6',
    shadow: 'rgba(46, 16, 101, 0.16)',
  },
  chatgpt: {
    shortName: '白龙娘',
    pageBg: '#F0FDF4',
    pageBgEnd: '#DCFCE7',
    surface: '#FFFFFF',
    surfaceSoft: '#D1FAE5',
    ink: '#14532D',
    muted: '#166534',
    accent: '#059669',
    accentSoft: '#34D399',
    border: '#14532D',
    borderSubtle: '#BBF7D0',
    dotColor: '#10B981',
    shadow: 'rgba(20, 83, 45, 0.16)',
  },
  claude: {
    shortName: '克劳德',
    pageBg: '#FFF7ED',
    pageBgEnd: '#FFEDD5',
    surface: '#FFFFFF',
    surfaceSoft: '#FFEDD5',
    ink: '#3B1E0E',
    muted: '#7C2D12',
    accent: '#EA580C',
    accentSoft: '#D97757',
    border: '#3B1E0E',
    borderSubtle: '#FED7AA',
    dotColor: '#EA580C',
    shadow: 'rgba(59, 30, 14, 0.16)',
  },
};

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeJsonForScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function buildStyleVariants(context, defaultFormatted, { heroImageDataUri } = {}) {
  const variants = {};
  for (const styleId of AVAILABLE_STYLES) {
    const formatted =
      styleId === defaultFormatted.meta.style
        ? defaultFormatted
        : formatMultiPlatformDevlog(context, { style: styleId });
    const defaultMascotPath = !heroImageDataUri ? resolveDefaultMascotPath(styleId) : null;
    const effectiveHero = heroImageDataUri || (defaultMascotPath ? fileToDataUri(defaultMascotPath) : null);
    const isMascotCover = Boolean(!heroImageDataUri && defaultMascotPath);
    const slides = renderCarouselSlidesSvg(context, formatted, {
      heroImageDataUri: effectiveHero,
      isMascotCover,
    });
    const wb = WORKBENCH_THEMES[styleId] || WORKBENCH_THEMES.big_fat_fish;
    variants[styleId] = {
      id: styleId,
      name: MODEL_STYLES[styleId].name,
      shortName: wb.shortName,
      subtitle: MODEL_STYLES[styleId].subtitle,
      emoji: MODEL_STYLES[styleId].emoji,
      accent: wb.accent,
      bg: wb.pageBg,
      theme: wb,
      projectShort: context.projectName.split('/').pop() || context.projectName,
      title: formatted.meta.title,
      statsLine: formatted.meta.statsLine,
      platforms: {
        xiaohongshu: {
          text: formatted.platforms.xiaohongshu.content,
        },
        bilibili: {
          text: formatted.platforms.bilibili.content,
          extra: formatted.platforms.bilibili.videoOutline,
        },
        douyin: {
          text: formatted.platforms.douyin.content,
          extra: formatted.platforms.douyin.videoScript,
        },
        github: {
          text: formatted.platforms.github.content,
        },
      },
      verticalSvg: renderVerticalCardSvg(context, formatted, {
        heroImageDataUri: effectiveHero,
        isMascotCover,
      }),
      horizontalSvg: renderHorizontalCardSvg(context, formatted, { heroImageDataUri }),
      slides,
      imagePrompts: buildAllPlatformImagePrompts(context, { style: styleId }),
    };
  }
  return variants;
}

function deduplicatePreviewVariants(variants) {
  const mascotDataUris = {};
  const uriToKey = new Map();

  function registerDataUri(dataUri, preferredKey) {
    const existing = uriToKey.get(dataUri);
    if (existing) return existing;
    let key = preferredKey;
    let suffix = 1;
    while (Object.prototype.hasOwnProperty.call(mascotDataUris, key)) {
      key = `${preferredKey}_${suffix}`;
      suffix += 1;
    }
    mascotDataUris[key] = dataUri;
    uriToKey.set(dataUri, key);
    return key;
  }

  function stripInlineImages(svg, styleId) {
    if (!svg || !svg.includes('data:image/')) return svg;
    return svg.replace(
      /<image\b([^>]*?)\bhref="(data:image\/[^"]+)"([^>]*?)(\/?)>/g,
      (match, before, dataUri, after, selfClose) => {
        const isMascotCover = /data-mascot-cover="1"/.test(before) || /data-mascot-cover="1"/.test(after);
        const preferredKey = isMascotCover ? styleId : 'custom_hero';
        const key = registerDataUri(dataUri, preferredKey);
        return `<image${before}data-mascot-id="${key}" href=""${after}${selfClose}>`;
      }
    );
  }

  const previewVariants = {};
  for (const [styleId, variant] of Object.entries(variants)) {
    previewVariants[styleId] = {
      ...variant,
      verticalSvg: stripInlineImages(variant.verticalSvg, styleId),
      horizontalSvg: stripInlineImages(variant.horizontalSvg, styleId),
      slides: (variant.slides || []).map((slide) => ({
        ...slide,
        svg: stripInlineImages(slide.svg, styleId),
      })),
    };
  }

  return { previewVariants, mascotDataUris };
}

function buildPreviewHtml(defaultStyleId, variants, workReport) {
  const { previewVariants, mascotDataUris } = deduplicatePreviewVariants(variants);
  const initial = previewVariants[defaultStyleId] || previewVariants.big_fat_fish;
  const wb = initial.theme;

  const switcherButtons = AVAILABLE_STYLES.map((id) => {
    const item = previewVariants[id];
    const activeClass = id === initial.id ? 'style-btn active' : 'style-btn';
    return `<button type="button" class="${activeClass}" data-style="${id}" onclick="switchStyle('${id}')"><span class="style-dot" style="background:${item.theme.dotColor}"></span><span>${escapeHtml(item.emoji)} ${escapeHtml(item.shortName)}</span></button>`;
  }).join('\n          ');

  const sections = [
    {
      id: 'xiaohongshu',
      label: '小红书 · 图文笔记',
      url: 'https://creator.xiaohongshu.com/publish/publish?target=image',
      text: initial.platforms.xiaohongshu.text,
      limitHint: '标题≤20字 · 正文≤1000字',
    },
    {
      id: 'douyin',
      label: '抖音 · 图文 / 口播',
      url: 'https://creator.douyin.com/creator-micro/content/upload',
      text: initial.platforms.douyin.text,
      extraLabel: '30s 快节奏口播',
      extraText: initial.platforms.douyin.extra,
      limitHint: '建议≤500字',
    },
    {
      id: 'bilibili',
      label: 'B站 · 图文动态',
      url: 'https://t.bilibili.com/',
      text: initial.platforms.bilibili.text,
      extraLabel: '60s 口播大纲',
      extraText: initial.platforms.bilibili.extra,
      limitHint: '动态≤2000字',
    },
    {
      id: 'github',
      label: 'GitHub · Release / Devlog',
      url: 'https://github.com/',
      text: initial.platforms.github.text,
      limitHint: 'Markdown 长文',
    },
  ];

  const cardsHtml = sections
    .map(
      (s) => `
    <article class="panel copy-panel" data-platform="${s.id}">
      <div class="panel-head">
        <div class="panel-title-group">
          <h2>${escapeHtml(s.label)}</h2>
          <div class="char-badges" id="${s.id}-badges" aria-live="polite"></div>
        </div>
        <div class="actions">
          <button type="button" class="btn-primary" onclick="copyText('${s.id}-text', this, '${escapeHtml(s.label)}')">一键复制正文</button>
          <a class="btn-ghost" href="${s.url}" target="_blank" rel="noreferrer">打开发布页 ↗</a>
        </div>
      </div>
      <textarea id="${s.id}-text" rows="10" oninput="handleCopyInput('${s.id}')">${escapeHtml(s.text)}</textarea>
      ${
        s.extraText
          ? `<div class="sub-head">
               <div class="sub-title-group">
                 <span>${escapeHtml(s.extraLabel)}</span>
                 <span class="char-pill neutral" id="${s.id}-extra-badge"></span>
               </div>
               <button type="button" class="btn-secondary" onclick="copyText('${s.id}-extra', this, '${escapeHtml(s.extraLabel)}')">复制脚本</button>
             </div>
             <textarea id="${s.id}-extra" rows="5" oninput="updateCharCounts()">${escapeHtml(s.extraText)}</textarea>`
          : ''
      }
    </article>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(initial.title)} · Devlog 创作工作台</title>
  <style>
    :root {
      color-scheme: light;
      --page-bg: ${wb.pageBg};
      --page-bg-end: ${wb.pageBgEnd};
      --surface: ${wb.surface};
      --surface-soft: ${wb.surfaceSoft};
      --ink: ${wb.ink};
      --muted: ${wb.muted};
      --accent: ${wb.accent};
      --accent-soft: ${wb.accentSoft};
      --border: ${wb.border};
      --border-subtle: ${wb.borderSubtle};
      --shadow-color: ${wb.shadow};
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      overflow-x: hidden;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 10%, var(--surface-soft) 0%, transparent 40%),
        radial-gradient(circle at 90% 85%, var(--page-bg-end) 0%, transparent 45%),
        linear-gradient(160deg, var(--page-bg) 0%, var(--page-bg-end) 100%);
      min-height: 100vh;
      transition: background 0.25s ease, color 0.2s ease;
    }

    /* Sticky comic studio topbar */
    .topbar {
      position: sticky;
      top: 0;
      z-index: 40;
      background: color-mix(in srgb, var(--surface) 88%, transparent);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border-bottom: 2.5px solid var(--border);
      box-shadow: 0 4px 18px var(--shadow-color);
    }

    .topbar-inner {
      max-width: 1280px;
      margin: 0 auto;
      padding: 14px 20px 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .topbar-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .brand-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .brand-title-line {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }

    h1 {
      margin: 0;
      font-size: 20px;
      line-height: 1.25;
      font-weight: 900;
      color: var(--ink);
      letter-spacing: -0.01em;
    }

    .stats-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 11px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      color: var(--ink);
      background: var(--surface-soft);
      border: 1.5px solid var(--border);
    }

    .subtitle-line {
      font-size: 12px;
      color: var(--muted);
      font-weight: 600;
    }

    /* 4-style AI-girl pill switcher */
    .switcher {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    .switcher-label {
      font-size: 12px;
      font-weight: 800;
      color: var(--muted);
      margin-right: 2px;
    }

    .style-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: var(--surface);
      color: var(--ink);
      border: 2px solid var(--border);
      border-radius: 999px;
      padding: 6px 13px;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 2px 2px 0 var(--border);
      transition: transform 0.14s ease, box-shadow 0.14s ease, background 0.16s ease, color 0.16s ease;
    }

    .style-btn:hover {
      transform: translate(-1px, -1px);
      box-shadow: 3px 3px 0 var(--border);
    }

    .style-btn.active {
      background: var(--accent);
      color: #FFFFFF;
      transform: translate(1px, 1px);
      box-shadow: 1px 1px 0 var(--border);
    }

    .style-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 1.5px solid var(--border);
      flex-shrink: 0;
    }

    .style-btn.active .style-dot {
      border-color: #FFFFFF;
    }

    /* Tab navigation */
    .tabs {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: none;
    }
    .tabs::-webkit-scrollbar { display: none; }

    .tab-btn {
      flex-shrink: 0;
      background: transparent;
      color: var(--muted);
      border: 2px solid transparent;
      border-radius: 11px;
      padding: 7px 14px;
      font-size: 13px;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .tab-btn:hover {
      background: var(--surface-soft);
      color: var(--ink);
    }

    .tab-btn.active {
      background: var(--surface-soft);
      color: var(--ink);
      border-color: var(--border);
      box-shadow: 2px 2px 0 var(--border);
    }

    /* Main workspace container */
    .workspace {
      max-width: 1280px;
      margin: 0 auto;
      padding: 22px 20px 64px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .tab-section.tab-hidden {
      display: none !important;
    }

    .section-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 14px;
    }

    .section-banner h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 900;
      color: var(--ink);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-sub {
      font-size: 13px;
      color: var(--muted);
      font-weight: 600;
    }

    /* Grids & comic cards */
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
      gap: 18px;
    }

    .panel, .card-box {
      background: var(--surface);
      border: 2.5px solid var(--border);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 4px 4px 0 var(--border);
      min-width: 0;
    }

    .panel-head, .sub-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 12px;
    }

    .panel-title-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .panel-head h2, .panel-head h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 900;
      color: var(--ink);
    }

    .sub-head {
      margin-top: 14px;
      margin-bottom: 8px;
      align-items: center;
      font-size: 13px;
      font-weight: 800;
      color: var(--muted);
    }

    .sub-title-group {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }

    .char-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .char-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 9px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      border: 1.5px solid currentColor;
    }

    .char-pill.ok {
      background: #ECFDF5;
      color: #047857;
    }

    .char-pill.warn {
      background: #FFFBEB;
      color: #B45309;
    }

    .char-pill.over {
      background: #FEF2F2;
      color: #B91C1C;
    }

    .char-pill.neutral {
      background: var(--surface-soft);
      color: var(--muted);
      border-color: var(--border-subtle);
    }

    textarea {
      width: 100%;
      background: #F8FAFC;
      color: #0F172A;
      border: 2px solid var(--border-subtle);
      border-radius: 12px;
      padding: 12px 13px;
      font-size: 13.5px;
      line-height: 1.65;
      resize: vertical;
      font-family: inherit;
      transition: border-color 0.15s ease, background 0.15s ease;
    }

    textarea:focus {
      outline: none;
      border-color: var(--accent);
      background: #FFFFFF;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    button, .btn-ghost, .file-label {
      font-family: inherit;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      border-radius: 10px;
      padding: 7px 13px;
      font-size: 12.5px;
      font-weight: 800;
      cursor: pointer;
      text-decoration: none;
      transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
      white-space: nowrap;
    }

    button:disabled {
      opacity: 0.65;
      cursor: wait;
    }

    .btn-primary {
      background: var(--accent);
      color: #FFFFFF;
      border: 2px solid var(--border);
      box-shadow: 2px 2px 0 var(--border);
    }

    .btn-primary:hover:not(:disabled) {
      transform: translate(-1px, -1px);
      box-shadow: 3px 3px 0 var(--border);
    }

    .btn-secondary {
      background: var(--surface-soft);
      color: var(--ink);
      border: 2px solid var(--border);
      box-shadow: 2px 2px 0 var(--border);
    }

    .btn-secondary:hover:not(:disabled) {
      transform: translate(-1px, -1px);
      box-shadow: 3px 3px 0 var(--border);
    }

    .btn-ghost, .file-label {
      background: var(--surface);
      color: var(--ink);
      border: 2px solid var(--border-subtle);
    }

    .btn-ghost:hover, .file-label:hover {
      border-color: var(--border);
      background: var(--surface-soft);
    }

    /* Visuals tab: Phone-frame carousel + 4-slide grid */
    .visuals-hero {
      display: grid;
      grid-template-columns: minmax(290px, 360px) 1fr;
      gap: 20px;
      align-items: start;
    }

    .phone-panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      position: sticky;
      top: 138px;
    }

    .phone-frame {
      width: 100%;
      max-width: 326px;
      background: #111827;
      border: 3px solid var(--border);
      border-radius: 34px;
      padding: 12px 11px 14px;
      box-shadow: 6px 6px 0 var(--border);
    }

    .phone-notch {
      width: 92px;
      height: 16px;
      border-radius: 999px;
      background: #020617;
      margin: 0 auto 10px;
    }

    .phone-screen {
      background: #FFFFFF;
      border-radius: 22px;
      overflow: hidden;
      border: 1.5px solid #334155;
    }

    .phone-app-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      border-bottom: 1px solid #E2E8F0;
      font-size: 11px;
      font-weight: 800;
      color: #0F172A;
    }

    .phone-app-pill {
      background: #FEF2F2;
      color: #E11D48;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 800;
    }

    .phone-stage {
      position: relative;
      background: var(--page-bg);
      cursor: zoom-in;
    }

    .phone-stage svg {
      width: 100%;
      height: auto;
      display: block;
    }

    .phone-nav-btn {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.92);
      color: #0F172A;
      border: 2px solid #0F172A;
      font-size: 18px;
      line-height: 1;
      box-shadow: 2px 2px 0 #0F172A;
      z-index: 4;
    }

    .phone-nav-btn.prev { left: 8px; }
    .phone-nav-btn.next { right: 8px; }

    .phone-dots {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 6px;
      padding: 8px 0 4px;
      background: #FFFFFF;
    }

    .phone-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      border: 1.5px solid #0F172A;
      background: #E2E8F0;
      padding: 0;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .phone-dot.active {
      width: 22px;
      background: var(--accent);
    }

    .phone-caption {
      padding: 6px 12px 12px;
      background: #FFFFFF;
      color: #1E293B;
    }

    .phone-caption-title {
      font-size: 12.5px;
      font-weight: 800;
      line-height: 1.35;
      margin-bottom: 4px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .phone-caption-body {
      font-size: 11px;
      line-height: 1.45;
      color: #475569;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      white-space: pre-line;
    }

    .phone-kbd-hint {
      font-size: 11.5px;
      color: var(--muted);
      font-weight: 700;
      text-align: center;
    }

    /* 4-slide grid */
    .slides-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
      gap: 14px;
    }

    .slide-card {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition: transform 0.14s ease;
    }

    .slide-card.active-slide {
      outline: 3px solid var(--accent);
      outline-offset: 2px;
    }

    .svg-frame {
      border-radius: 12px;
      overflow: hidden;
      border: 2px solid var(--border-subtle);
      background: var(--page-bg);
      cursor: zoom-in;
    }

    .svg-frame svg {
      width: 100%;
      height: auto;
      display: block;
    }

    .standalone-cards {
      margin-top: 20px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.45fr);
      gap: 18px;
      align-items: start;
    }

    /* Lightbox modal (P1) */
    .lightbox {
      position: fixed;
      inset: 0;
      z-index: 90;
      background: rgba(15, 23, 42, 0.78);
      backdrop-filter: blur(6px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .lightbox.open {
      display: flex;
    }

    .lightbox-dialog {
      background: var(--surface);
      border: 3px solid var(--border);
      border-radius: 20px;
      box-shadow: 8px 8px 0 var(--border);
      max-width: min(92vw, 980px);
      max-height: 92vh;
      width: auto;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .lightbox-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 2px solid var(--border-subtle);
    }

    .lightbox-body {
      padding: 16px;
      overflow: auto;
      display: flex;
      justify-content: center;
      align-items: center;
      background: var(--page-bg);
    }

    .lightbox-body svg {
      max-height: 76vh;
      max-width: 100%;
      width: auto;
      height: auto;
      border-radius: 12px;
      display: block;
    }

    /* Toast notifications */
    .toast-stack {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 100;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: min(92vw, 340px);
      pointer-events: none;
    }

    .toast {
      pointer-events: auto;
      background: var(--surface);
      color: var(--ink);
      border: 2.5px solid var(--border);
      border-radius: 12px;
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 800;
      box-shadow: 4px 4px 0 var(--border);
      animation: toastIn 0.18s ease-out;
    }

    .toast.success { border-left: 7px solid #10B981; }
    .toast.info { border-left: 7px solid var(--accent); }
    .toast.warn { border-left: 7px solid #F59E0B; }

    @keyframes toastIn {
      from { opacity: 0; transform: translateY(10px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @media (max-width: 960px) {
      .visuals-hero {
        grid-template-columns: 1fr;
      }
      .phone-panel {
        position: static;
      }
      .standalone-cards {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 768px) {
      .topbar-inner {
        padding: 12px 14px 10px;
      }
      .workspace {
        padding: 16px 14px 56px;
      }
      h1 {
        font-size: 17px;
      }
      .panel, .card-box {
        padding: 14px;
        box-shadow: 3px 3px 0 var(--border);
      }
      .style-btn {
        padding: 5px 10px;
        font-size: 12px;
      }
      .toast-stack {
        left: 14px;
        right: 14px;
        bottom: 14px;
        max-width: none;
      }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="topbar-inner">
      <div class="topbar-row">
        <div class="brand-block">
          <div class="brand-title-line">
            <h1 id="page-title">${escapeHtml(initial.title)}</h1>
            <span class="stats-badge" id="page-meta">${escapeHtml(initial.statsLine)}</span>
          </div>
          <div class="subtitle-line" id="page-subtitle">${escapeHtml(initial.name)} · ${escapeHtml(initial.subtitle)}</div>
        </div>

        <nav class="switcher" aria-label="模型风格实时切换">
          <span class="switcher-label">AI 娘换肤：</span>
          ${switcherButtons}
        </nav>
      </div>

      <nav class="tabs" role="tablist" aria-label="创作工作台分页">
        <button type="button" role="tab" class="tab-btn active" data-tab="visuals" aria-selected="true" onclick="switchTab('visuals')">🖼️ 轮播与封面</button>
        <button type="button" role="tab" class="tab-btn" data-tab="copy" aria-selected="false" onclick="switchTab('copy')">✍️ 四平台文案</button>
        <button type="button" role="tab" class="tab-btn" data-tab="report" aria-selected="false" onclick="switchTab('report')">📋 工作日报</button>
        <button type="button" role="tab" class="tab-btn" data-tab="prompts" aria-selected="false" onclick="switchTab('prompts')">🎨 生图提示词</button>
        <button type="button" role="tab" class="tab-btn" data-tab="all" aria-selected="false" onclick="switchTab('all')">📑 全部展开</button>
      </nav>
    </div>
  </header>

  <main class="workspace" id="workspace">
    <!-- Tab 1: Visuals (Phone Frame + 4-Slide Carousel + Standalone Cards) -->
    <section class="tab-section" data-section="visuals">
      <div class="section-banner">
        <div>
          <h2>🖼️ 小红书 / 抖音 4 图轮播套图</h2>
          <div class="section-sub">P1 AI 娘封面 → P2 核心更新 → P3 踩坑与改动速览 → P4 预告互动，亮色漫画风格一镜到底</div>
        </div>
        <div class="actions">
          <label class="file-label" title="上传自定义 AI 底图替换封面">
            🖼️ 叠加 AI 底图
            <input id="hero-file-input" type="file" accept="image/*" style="display:none" onchange="applyLocalHero(event)" />
          </label>
          <button type="button" class="btn-secondary" id="btn-reset-hero" onclick="resetLocalHero()">恢复默认 AI 娘</button>
          <button type="button" class="btn-primary" id="btn-export-all" onclick="exportAllSlidesPng(this)">📦 一键导出 4 图 PNG</button>
        </div>
      </div>

      <div class="visuals-hero">
        <!-- Interactive Mobile Phone Carousel Viewer -->
        <aside class="panel phone-panel" aria-label="手机端轮播实时预览">
          <div class="panel-head" style="width:100%;margin-bottom:0;">
            <div>
              <h3 id="phone-slide-title">1 / 4 · P1 封面卡</h3>
            </div>
            <div class="actions">
              <button type="button" class="btn-ghost" onclick="openCurrentPhoneLightbox()">🔍 放大</button>
              <button type="button" class="btn-primary" onclick="downloadCurrentPhoneSlide()">导出 PNG</button>
            </div>
          </div>

          <div class="phone-frame">
            <div class="phone-notch"></div>
            <div class="phone-screen">
              <div class="phone-app-bar">
                <span id="phone-handle">@${escapeHtml(initial.projectShort)}</span>
                <span class="phone-app-pill">小红书 / 抖音预览</span>
              </div>
              <div class="phone-stage" id="phone-stage" onclick="openCurrentPhoneLightbox()">
                <button type="button" class="phone-nav-btn prev" aria-label="上一张" onclick="event.stopPropagation(); stepPhoneSlide(-1)">‹</button>
                <div id="phone-svg-host"></div>
                <button type="button" class="phone-nav-btn next" aria-label="下一张" onclick="event.stopPropagation(); stepPhoneSlide(1)">›</button>
              </div>
              <div class="phone-dots" id="phone-dots">
                ${initial.slides
                  .map(
                    (slide, idx) =>
                      `<button type="button" class="phone-dot${idx === 0 ? ' active' : ''}" aria-label="${escapeHtml(slide.label)}" onclick="setPhoneSlide(${idx})"></button>`
                  )
                  .join('')}
              </div>
              <div class="phone-caption">
                <div class="phone-caption-title" id="phone-caption-title"></div>
                <div class="phone-caption-body" id="phone-caption-body"></div>
              </div>
            </div>
          </div>
          <div class="phone-kbd-hint">支持点击左右箭头或键盘 ← / → 切换套图</div>
        </aside>

        <!-- 4-Slide Grid -->
        <div class="slides-grid">
          ${initial.slides
            .map(
              (slide, idx) => `
          <div class="card-box slide-card${idx === 0 ? ' active-slide' : ''}" id="slide-card-${idx}">
            <div class="panel-head" style="margin-bottom:0;">
              <h3>${escapeHtml(slide.label)}</h3>
              <button type="button" class="btn-secondary" onclick="downloadPng('svg-slide-${idx}', 'slide-${idx + 1}', 1080, 1440)">导出 PNG</button>
            </div>
            <div class="svg-frame" onclick="openLightbox('svg-slide-${idx}', '${escapeHtml(slide.label)}', 'slide-${idx + 1}', 1080, 1440)" title="点击放大查看">
              <div id="svg-slide-${idx}">${slide.svg}</div>
            </div>
          </div>`
            )
            .join('\n')}
        </div>
      </div>

      <!-- Standalone 3:4 & 16:9 Cover Cards -->
      <div class="standalone-cards">
        <div class="card-box">
          <div class="panel-head">
            <h3>3:4 竖版封面卡（小红书 / 抖音）</h3>
            <div class="actions">
              <label class="file-label">叠加 AI 底图<input id="hero-file-input-alt" type="file" accept="image/*" style="display:none" onchange="applyLocalHero(event)"/></label>
              <button type="button" class="btn-secondary" onclick="resetLocalHero()">恢复默认 AI 娘</button>
              <button type="button" class="btn-primary" onclick="downloadPng('svg-vertical', 'vertical', 1080, 1440)">导出 PNG</button>
            </div>
          </div>
          <div class="svg-frame" onclick="openLightbox('svg-vertical', '3:4 竖版封面卡', 'vertical', 1080, 1440)" title="点击放大查看">
            <div id="svg-vertical">${initial.verticalSvg}</div>
          </div>
        </div>
        <div class="card-box">
          <div class="panel-head">
            <h3>16:9 横版进度卡（B站 / GitHub）</h3>
            <div class="actions">
              <button type="button" class="btn-ghost" onclick="openLightbox('svg-horizontal', '16:9 横版进度卡', 'horizontal', 1600, 900)">🔍 放大</button>
              <button type="button" class="btn-primary" onclick="downloadPng('svg-horizontal', 'horizontal', 1600, 900)">导出 PNG</button>
            </div>
          </div>
          <div class="svg-frame" onclick="openLightbox('svg-horizontal', '16:9 横版进度卡', 'horizontal', 1600, 900)" title="点击放大查看">
            <div id="svg-horizontal">${initial.horizontalSvg}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Tab 2: 4-Platform Copy -->
    <section class="tab-section tab-hidden" data-section="copy">
      <div class="section-banner">
        <div>
          <h2>✍️ 四平台适配文案（实时字数检测）</h2>
          <div class="section-sub">支持直接编辑微调，字数上限状态实时变色，一键复制带 file:// 降级兜底</div>
        </div>
      </div>
      <div class="grid">
        ${cardsHtml}
      </div>
    </section>

    <!-- Tab 3: Work Reports -->
    <section class="tab-section tab-hidden" data-section="report">
      <div class="section-banner">
        <div>
          <h2>📋 团队工作日报（纯文本 / Markdown 双版本）</h2>
          <div class="section-sub">适配 QQ / 微信 / Slack 与飞书 / 钉钉 / 企微 / Discord，一键直发</div>
        </div>
      </div>
      <div class="grid">
        <article class="panel">
          <div class="panel-head">
            <div class="panel-title-group">
              <h2>📄 文本版（QQ / 微信 / Slack 纯文本）</h2>
              <div class="char-badges"><span class="char-pill neutral" id="work-plain-badge"></span></div>
            </div>
            <button type="button" class="btn-primary" onclick="copyText('work-plain', this, '纯文本工作日报')">一键复制</button>
          </div>
          <textarea id="work-plain" rows="11" oninput="updateCharCounts()">${escapeHtml(workReport.qqText)}</textarea>
        </article>
        <article class="panel">
          <div class="panel-head">
            <div class="panel-title-group">
              <h2>📝 Markdown 版（GitHub / 飞书 / 钉钉 / 企微 / Discord）</h2>
              <div class="char-badges"><span class="char-pill neutral" id="work-md-badge"></span></div>
            </div>
            <button type="button" class="btn-primary" onclick="copyText('work-md', this, 'Markdown 工作日报')">一键复制</button>
          </div>
          <textarea id="work-md" rows="11" oninput="updateCharCounts()">${escapeHtml(workReport.markdown)}</textarea>
        </article>
      </div>
    </section>

    <!-- Tab 4: Image Prompts -->
    <section class="tab-section tab-hidden" data-section="prompts">
      <div class="section-banner">
        <div>
          <h2>🎨 AI 生图提示词（随风格自动联动）</h2>
          <div class="section-sub">可直接粘贴至即梦 / Seedream / 豆包 / Flux / GPT Image，再点顶部「叠加 AI 底图」合成</div>
        </div>
      </div>
      <div class="grid">
        <article class="panel">
          <div class="panel-head">
            <h2>🎨 竖版提示词（小红书 3:4 / 抖音 3:4）</h2>
            <button type="button" class="btn-primary" onclick="copyText('prompt-xhs', this, '3:4 生图提示词')">复制 Prompt</button>
          </div>
          <textarea id="prompt-xhs" rows="8">${escapeHtml(initial.imagePrompts.xiaohongshu.prompt)}</textarea>
        </article>
        <article class="panel">
          <div class="panel-head">
            <h2>🎨 横版提示词（B站 16:9 / GitHub 16:9）</h2>
            <button type="button" class="btn-primary" onclick="copyText('prompt-bili', this, '16:9 生图提示词')">复制 Prompt</button>
          </div>
          <textarea id="prompt-bili" rows="8">${escapeHtml(initial.imagePrompts.bilibili.prompt)}</textarea>
        </article>
      </div>
    </section>
  </main>

  <!-- Click-to-Zoom Lightbox Modal -->
  <div class="lightbox" id="lightbox-modal" role="dialog" aria-modal="true" aria-labelledby="lightbox-title" onclick="if (event.target === this) closeLightbox()">
    <div class="lightbox-dialog">
      <div class="lightbox-head">
        <strong id="lightbox-title">预览放大</strong>
        <div class="actions">
          <button type="button" class="btn-primary" id="lightbox-export-btn">导出 PNG</button>
          <button type="button" class="btn-ghost" onclick="closeLightbox()">关闭 (ESC)</button>
        </div>
      </div>
      <div class="lightbox-body" id="lightbox-body"></div>
    </div>
  </div>

  <!-- Toast Notification Stack -->
  <div class="toast-stack" id="toast-stack" aria-live="polite"></div>

  <script>
    window.__MASCOT_DATA_URIS__ = ${safeJsonForScript(mascotDataUris)};
    window.__DEVLOG_VARIANTS__ = ${safeJsonForScript(previewVariants)};
    window.__CURRENT_STYLE__ = ${JSON.stringify(initial.id)};
    window.__CURRENT_TAB__ = 'visuals';
    window.__PHONE_SLIDE_INDEX__ = 0;
    window.__CUSTOM_HERO_URI__ = null;

    function hydrateMascotImages(root) {
      const scope = root || document;
      const registry = window.__MASCOT_DATA_URIS__ || {};
      scope.querySelectorAll('image[data-mascot-id]').forEach((img) => {
        if (img.getAttribute('data-local-hero') === '1') return;
        const id = img.getAttribute('data-mascot-id');
        const uri = id && registry[id];
        if (uri && img.getAttribute('href') !== uri) {
          img.setAttribute('href', uri);
        }
      });
    }

    function showToast(message, tone = 'info') {
      const stack = document.getElementById('toast-stack');
      if (!stack) return;
      const el = document.createElement('div');
      el.className = 'toast ' + tone;
      el.textContent = message;
      stack.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(6px)';
        el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
        setTimeout(() => el.remove(), 220);
      }, 2400);
    }

    function applyThemeTokens(theme) {
      if (!theme) return;
      const root = document.documentElement;
      root.style.setProperty('--page-bg', theme.pageBg);
      root.style.setProperty('--page-bg-end', theme.pageBgEnd);
      root.style.setProperty('--surface', theme.surface);
      root.style.setProperty('--surface-soft', theme.surfaceSoft);
      root.style.setProperty('--ink', theme.ink);
      root.style.setProperty('--muted', theme.muted);
      root.style.setProperty('--accent', theme.accent);
      root.style.setProperty('--accent-soft', theme.accentSoft);
      root.style.setProperty('--border', theme.border);
      root.style.setProperty('--border-subtle', theme.borderSubtle);
      root.style.setProperty('--shadow-color', theme.shadow);
    }

    function switchTab(tabId) {
      window.__CURRENT_TAB__ = tabId;
      document.querySelectorAll('.tab-btn').forEach((btn) => {
        const active = btn.dataset.tab === tabId;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      document.querySelectorAll('.tab-section').forEach((sec) => {
        const show = tabId === 'all' || sec.dataset.section === tabId;
        sec.classList.toggle('tab-hidden', !show);
      });
    }

    function pillHtml(text, cls) {
      return '<span class="char-pill ' + cls + '">' + text + '</span>';
    }

    function updateCharCounts() {
      // Xiaohongshu: first line title <= 20 chars, body <= 1000 chars
      const xhsEl = document.getElementById('xiaohongshu-text');
      const xhsBadges = document.getElementById('xiaohongshu-badges');
      if (xhsEl && xhsBadges) {
        const val = xhsEl.value || '';
        const firstLine = (val.split('\\n').find((l) => l.trim().length > 0) || '').trim();
        const titleLen = [...firstLine].length;
        const bodyLen = [...val].length;
        const titleCls = titleLen > 20 ? 'over' : titleLen >= 18 ? 'warn' : 'ok';
        const bodyCls = bodyLen > 1000 ? 'over' : bodyLen > 850 ? 'warn' : 'ok';
        xhsBadges.innerHTML =
          pillHtml('标题 ' + titleLen + '/20字', titleCls) +
          pillHtml('正文 ' + bodyLen + '/1000字', bodyCls);
      }

      // Douyin: <= 500 chars
      const dyEl = document.getElementById('douyin-text');
      const dyBadges = document.getElementById('douyin-badges');
      if (dyEl && dyBadges) {
        const len = [...(dyEl.value || '')].length;
        const cls = len > 500 ? 'over' : len > 420 ? 'warn' : 'ok';
        dyBadges.innerHTML = pillHtml('正文 ' + len + '/500字', cls);
      }

      // Bilibili: <= 2000 chars
      const biliEl = document.getElementById('bilibili-text');
      const biliBadges = document.getElementById('bilibili-badges');
      if (biliEl && biliBadges) {
        const len = [...(biliEl.value || '')].length;
        const cls = len > 2000 ? 'over' : len > 1700 ? 'warn' : 'ok';
        biliBadges.innerHTML = pillHtml('动态 ' + len + '/2000字', cls);
      }

      // GitHub: char + line summary
      const ghEl = document.getElementById('github-text');
      const ghBadges = document.getElementById('github-badges');
      if (ghEl && ghBadges) {
        const val = ghEl.value || '';
        const len = [...val].length;
        const lines = val ? val.split('\\n').length : 0;
        ghBadges.innerHTML = pillHtml(len + ' 字 · ' + lines + ' 行', 'neutral');
      }

      // Extras & work reports
      [
        ['douyin-extra', 'douyin-extra-badge'],
        ['bilibili-extra', 'bilibili-extra-badge'],
        ['work-plain', 'work-plain-badge'],
        ['work-md', 'work-md-badge'],
      ].forEach(([srcId, badgeId]) => {
        const src = document.getElementById(srcId);
        const badge = document.getElementById(badgeId);
        if (src && badge) {
          badge.textContent = [...(src.value || '')].length + ' 字';
        }
      });
    }

    function syncPhoneCaption() {
      const xhsEl = document.getElementById('xiaohongshu-text');
      const titleEl = document.getElementById('phone-caption-title');
      const bodyEl = document.getElementById('phone-caption-body');
      if (!xhsEl || !titleEl || !bodyEl) return;
      const lines = (xhsEl.value || '').split('\\n').map((l) => l.trim()).filter(Boolean);
      titleEl.textContent = lines[0] || '';
      bodyEl.textContent = lines.slice(1, 5).join('\\n');
    }

    function handleCopyInput(platformId) {
      updateCharCounts();
      if (platformId === 'xiaohongshu') {
        syncPhoneCaption();
      }
    }

    function scopeSvgIds(svgMarkup, prefix) {
      if (!svgMarkup) return '';
      const ids = new Set();
      svgMarkup.replace(/\\bid="([^"]+)"/g, (_, id) => {
        ids.add(id);
        return _;
      });
      let out = svgMarkup;
      ids.forEach((id) => {
        const nextId = prefix + '_' + id;
        out = out.split('id="' + id + '"').join('id="' + nextId + '"');
        out = out.split('url(#' + id + ')').join('url(#' + nextId + ')');
      });
      return out;
    }

    function renderPhoneSlide() {
      const v = window.__DEVLOG_VARIANTS__[window.__CURRENT_STYLE__];
      if (!v || !v.slides || !v.slides.length) return;
      const idx = Math.max(0, Math.min(window.__PHONE_SLIDE_INDEX__, v.slides.length - 1));
      window.__PHONE_SLIDE_INDEX__ = idx;
      const slide = v.slides[idx];
      const sourceBox = document.getElementById('svg-slide-' + idx);
      const host = document.getElementById('phone-svg-host');
      if (host && sourceBox) {
        host.innerHTML = scopeSvgIds(sourceBox.innerHTML, 'phone');
      }
      const titleEl = document.getElementById('phone-slide-title');
      if (titleEl) {
        titleEl.textContent = (idx + 1) + ' / ' + v.slides.length + ' · ' + slide.label;
      }
      document.querySelectorAll('#phone-dots .phone-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === idx);
      });
      document.querySelectorAll('.slide-card').forEach((card, i) => {
        card.classList.toggle('active-slide', i === idx);
      });
    }

    function setPhoneSlide(idx) {
      window.__PHONE_SLIDE_INDEX__ = idx;
      renderPhoneSlide();
    }

    function stepPhoneSlide(delta) {
      const v = window.__DEVLOG_VARIANTS__[window.__CURRENT_STYLE__];
      if (!v || !v.slides) return;
      const total = v.slides.length;
      window.__PHONE_SLIDE_INDEX__ = (window.__PHONE_SLIDE_INDEX__ + delta + total) % total;
      renderPhoneSlide();
    }

    function patchHeroOnContainer(containerId, dataUri) {
      const svg = document.querySelector('#' + containerId + ' svg');
      if (!svg) return;
      const existingImg = svg.querySelector('image[data-hero-layer="1"], image[data-local-hero="1"], image');
      if (existingImg) {
        if (!existingImg.getAttribute('data-orig-href')) {
          existingImg.setAttribute('data-orig-href', existingImg.getAttribute('href') || '');
        }
        existingImg.setAttribute('href', dataUri);
        existingImg.setAttribute('data-local-hero', '1');
        return;
      }
      const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      img.setAttribute('data-hero-layer', '1');
      img.setAttribute('data-local-hero', '1');
      img.setAttribute('x', '0');
      img.setAttribute('y', '0');
      img.setAttribute('width', '1080');
      img.setAttribute('height', '1440');
      img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      img.setAttribute('opacity', '0.42');
      img.setAttribute('href', dataUri);
      const firstRect = svg.querySelector('rect');
      if (firstRect && firstRect.nextSibling) {
        svg.insertBefore(img, firstRect.nextSibling);
      } else {
        svg.insertBefore(img, svg.firstChild);
      }
    }

    function switchStyle(styleId) {
      const v = window.__DEVLOG_VARIANTS__[styleId];
      if (!v) return;
      window.__CURRENT_STYLE__ = styleId;
      applyThemeTokens(v.theme);
      document.getElementById('page-title').textContent = v.title;
      document.getElementById('page-meta').textContent = v.statsLine;
      document.getElementById('page-subtitle').textContent = v.name + ' · ' + v.subtitle;
      document.getElementById('xiaohongshu-text').value = v.platforms.xiaohongshu.text;
      document.getElementById('bilibili-text').value = v.platforms.bilibili.text;
      document.getElementById('bilibili-extra').value = v.platforms.bilibili.extra;
      document.getElementById('douyin-text').value = v.platforms.douyin.text;
      document.getElementById('douyin-extra').value = v.platforms.douyin.extra;
      document.getElementById('github-text').value = v.platforms.github.text;
      document.getElementById('svg-vertical').innerHTML = v.verticalSvg;
      document.getElementById('svg-horizontal').innerHTML = v.horizontalSvg;
      v.slides.forEach((slide, idx) => {
        const box = document.getElementById('svg-slide-' + idx);
        if (box) box.innerHTML = slide.svg;
      });
      hydrateMascotImages(document.getElementById('workspace'));
      if (window.__CUSTOM_HERO_URI__) {
        patchHeroOnContainer('svg-vertical', window.__CUSTOM_HERO_URI__);
        patchHeroOnContainer('svg-slide-0', window.__CUSTOM_HERO_URI__);
      }
      document.getElementById('prompt-xhs').value = v.imagePrompts.xiaohongshu.prompt;
      document.getElementById('prompt-bili').value = v.imagePrompts.bilibili.prompt;
      document.querySelectorAll('.style-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.style === styleId);
      });
      updateCharCounts();
      syncPhoneCaption();
      renderPhoneSlide();
      showToast('已切换为 ' + v.emoji + ' ' + v.shortName + ' 风格', 'info');
    }

    function applyLocalHero(evt) {
      const file = evt.target.files && evt.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUri = reader.result;
        window.__CUSTOM_HERO_URI__ = dataUri;
        patchHeroOnContainer('svg-vertical', dataUri);
        patchHeroOnContainer('svg-slide-0', dataUri);
        renderPhoneSlide();
        showToast('已叠加自定义 AI 底图：' + file.name, 'success');
      };
      reader.readAsDataURL(file);
    }

    function resetLocalHero() {
      const v = window.__DEVLOG_VARIANTS__[window.__CURRENT_STYLE__];
      if (!v) return;
      window.__CUSTOM_HERO_URI__ = null;
      document.getElementById('svg-vertical').innerHTML = v.verticalSvg;
      const slide0 = document.getElementById('svg-slide-0');
      if (slide0 && v.slides[0]) {
        slide0.innerHTML = v.slides[0].svg;
      }
      hydrateMascotImages(document.getElementById('workspace'));
      ['hero-file-input', 'hero-file-input-alt'].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.value = '';
      });
      renderPhoneSlide();
      showToast('已恢复默认 AI 娘封面 (' + v.shortName + ')', 'info');
    }

    function fallbackCopyText(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }

    async function copyText(id, btn, label) {
      const el = document.getElementById(id);
      if (!el) return;
      const text = el.value;
      let copied = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          copied = true;
        }
      } catch (_) {
        copied = false;
      }
      if (!copied) {
        copied = fallbackCopyText(text);
      }
      if (copied) {
        if (btn) {
          const old = btn.textContent;
          btn.textContent = '已复制 ✓';
          setTimeout(() => { btn.textContent = old; }, 1500);
        }
        showToast('已复制 ' + (label || '内容') + ' ✓', 'success');
      } else {
        showToast('自动复制受限，请手动 Ctrl/Cmd+C 复制', 'warn');
      }
    }

    function renderSvgToPngAndDownload(containerId, kind, width, height) {
      return new Promise((resolve, reject) => {
        const svgEl = document.querySelector('#' + containerId + ' svg');
        if (!svgEl) {
          reject(new Error('SVG not found: ' + containerId));
          return;
        }
        hydrateMascotImages(svgEl);
        const xml = new XMLSerializer().serializeToString(svgEl);
        const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(url);
          const a = document.createElement('a');
          a.download = 'devlog-' + window.__CURRENT_STYLE__ + '-' + kind + '.png';
          a.href = canvas.toDataURL('image/png');
          a.click();
          resolve(a.download);
        };
        img.onerror = (err) => {
          URL.revokeObjectURL(url);
          reject(err);
        };
        img.src = url;
      });
    }

    async function downloadPng(containerId, kind, width, height) {
      try {
        const filename = await renderSvgToPngAndDownload(containerId, kind, width, height);
        showToast('已导出 ' + filename, 'success');
      } catch (_) {
        showToast('PNG 导出失败，请重试', 'warn');
      }
    }

    async function exportAllSlidesPng(btn) {
      const v = window.__DEVLOG_VARIANTS__[window.__CURRENT_STYLE__];
      if (!v || !v.slides || !v.slides.length) return;
      const total = v.slides.length;
      const oldText = btn ? btn.textContent : '';
      if (btn) btn.disabled = true;
      try {
        for (let i = 0; i < total; i += 1) {
          if (btn) btn.textContent = '导出中 ' + (i + 1) + '/' + total + '...';
          await renderSvgToPngAndDownload('svg-slide-' + i, 'slide-' + (i + 1), 1080, 1440);
          if (i < total - 1) {
            await new Promise((r) => setTimeout(r, 220));
          }
        }
        if (btn) btn.textContent = '已导出 ' + total + '/' + total + ' ✓';
        showToast('4 图轮播 PNG 批量导出完成 (' + v.shortName + ')', 'success');
      } catch (_) {
        showToast('批量导出中断，请检查浏览器多文件下载权限', 'warn');
      } finally {
        setTimeout(() => {
          if (btn) {
            btn.textContent = oldText || '📦 一键导出 4 图 PNG';
            btn.disabled = false;
          }
        }, 1800);
      }
    }

    function downloadCurrentPhoneSlide() {
      const idx = window.__PHONE_SLIDE_INDEX__ || 0;
      downloadPng('svg-slide-' + idx, 'slide-' + (idx + 1), 1080, 1440);
    }

    function openLightbox(containerId, title, kind, width, height) {
      const modal = document.getElementById('lightbox-modal');
      const titleEl = document.getElementById('lightbox-title');
      const bodyEl = document.getElementById('lightbox-body');
      const exportBtn = document.getElementById('lightbox-export-btn');
      const src = document.getElementById(containerId);
      if (!modal || !src) return;
      titleEl.textContent = title;
      bodyEl.innerHTML = scopeSvgIds(src.innerHTML, 'lb');
      exportBtn.onclick = () => downloadPng(containerId, kind, width, height);
      modal.classList.add('open');
    }

    function openCurrentPhoneLightbox() {
      const v = window.__DEVLOG_VARIANTS__[window.__CURRENT_STYLE__];
      const idx = window.__PHONE_SLIDE_INDEX__ || 0;
      const label = v && v.slides[idx] ? v.slides[idx].label : '轮播图';
      openLightbox('svg-slide-' + idx, label, 'slide-' + (idx + 1), 1080, 1440);
    }

    function closeLightbox() {
      const modal = document.getElementById('lightbox-modal');
      if (modal) modal.classList.remove('open');
    }

    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      if (e.key === 'Escape') {
        closeLightbox();
        return;
      }
      if (tag === 'textarea' || tag === 'input') return;
      if (e.key === 'ArrowLeft') {
        stepPhoneSlide(-1);
      } else if (e.key === 'ArrowRight') {
        stepPhoneSlide(1);
      }
    });

    // Initial live hydration
    hydrateMascotImages(document.getElementById('workspace'));
    updateCharCounts();
    syncPhoneCaption();
    renderPhoneSlide();
  </script>
</body>
</html>
`;
}

/**
 * Write all 4 platform drafts, SVG cards, and an interactive multi-style preview.html bundle.
 */
export function writeDevlogBundle(
  context,
  formatted,
  { outputDir = 'out', heroImagePath } = {}
) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeName = context.projectName
    .split('/')
    .pop()
    .replace(/[^a-zA-Z0-9_-]/g, '-');
  const bundleDir = resolve(outputDir, `${stamp}-${safeName}`);
  mkdirSync(bundleDir, { recursive: true });

  const heroImageDataUri = heroImagePath ? fileToDataUri(heroImagePath) : null;
  const variants = buildStyleVariants(context, formatted, { heroImageDataUri });
  const workReport = formatWorkReport(context, { period: 'daily' });
  const activeStyle = formatted.meta.style || 'big_fat_fish';
  const verticalSvg = variants[activeStyle].verticalSvg;
  const horizontalSvg = variants[activeStyle].horizontalSvg;
  const slides = variants[activeStyle].slides;
  const previewHtml = buildPreviewHtml(activeStyle, variants, workReport);

  const slideFiles = slides.map((s) => {
    const filePath = join(bundleDir, `${s.id}.svg`);
    writeFileSync(filePath, s.svg, 'utf8');
    return filePath;
  });

  const files = {
    github: join(bundleDir, 'github.md'),
    xiaohongshu: join(bundleDir, 'xiaohongshu.md'),
    bilibili: join(bundleDir, 'bilibili.md'),
    douyin: join(bundleDir, 'douyin.md'),
    workDailyMd: join(bundleDir, 'work-daily.md'),
    workDailyPlain: join(bundleDir, 'work-daily-plain.txt'),
    imagePrompts: join(bundleDir, 'image-prompts.json'),
    cardVertical: join(bundleDir, 'card-vertical.svg'),
    cardHorizontal: join(bundleDir, 'card-horizontal.svg'),
    slides: slideFiles,
    preview: join(bundleDir, 'preview.html'),
    manifest: join(bundleDir, 'bundle.json'),
  };

  writeFileSync(files.github, formatted.platforms.github.content + '\n', 'utf8');
  writeFileSync(files.xiaohongshu, formatted.platforms.xiaohongshu.content + '\n', 'utf8');
  writeFileSync(
    files.bilibili,
    `${formatted.platforms.bilibili.content}\n\n---\n\n${formatted.platforms.bilibili.videoOutline}\n`,
    'utf8'
  );
  writeFileSync(
    files.douyin,
    `${formatted.platforms.douyin.content}\n\n---\n\n${formatted.platforms.douyin.videoScript}\n`,
    'utf8'
  );
  writeFileSync(files.workDailyMd, workReport.markdown + '\n', 'utf8');
  writeFileSync(files.workDailyPlain, workReport.qqText + '\n', 'utf8');
  writeFileSync(
    files.imagePrompts,
    JSON.stringify(variants[activeStyle].imagePrompts, null, 2) + '\n',
    'utf8'
  );
  writeFileSync(files.cardVertical, verticalSvg, 'utf8');
  writeFileSync(files.cardHorizontal, horizontalSvg, 'utf8');
  writeFileSync(files.preview, previewHtml, 'utf8');
  writeFileSync(
    files.manifest,
    JSON.stringify(
      { context, formatted, workReport, files, availableStyles: AVAILABLE_STYLES },
      null,
      2
    ) + '\n',
    'utf8'
  );

  return { bundleDir, files };
}

/**
 * Publish devlog to GitHub (either append to local DEVLOG.md or create a GitHub Release via `gh`).
 * Defaults to dryRun=true to prevent accidental remote publishing.
 */
export function publishToGitHub({
  mode = 'devlog_file',
  repoPath = process.cwd(),
  repo,
  tag,
  title,
  body,
  dryRun = true,
  ghBin = 'gh',
} = {}) {
  if (!body) {
    throw new Error('publishToGitHub requires non-empty `body` content.');
  }

  if (mode === 'devlog_file') {
    const devlogPath = resolve(repoPath, 'DEVLOG.md');
    const existing = existsSync(devlogPath) ? readFileSync(devlogPath, 'utf8') : '# DEVLOG\n\n';
    const nextContent = `${existing.trimEnd()}\n\n${body.trim()}\n`;
    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        mode,
        target: devlogPath,
        preview: body.trim(),
      };
    }
    writeFileSync(devlogPath, nextContent, 'utf8');
    return {
      ok: true,
      dryRun: false,
      mode,
      target: devlogPath,
    };
  }

  if (mode === 'release') {
    const releaseTag = tag || `devlog-${new Date().toISOString().slice(0, 10)}`;
    const releaseTitle = title || releaseTag;
    const args = ['release', 'create', releaseTag, '--title', releaseTitle, '--notes', body];
    if (repo) args.push('--repo', repo);

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        mode,
        command: `${ghBin} ${args.join(' ')}`,
        tag: releaseTag,
        title: releaseTitle,
      };
    }

    const stdout = execFileSync(ghBin, args, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();

    return {
      ok: true,
      dryRun: false,
      mode,
      tag: releaseTag,
      url: stdout,
    };
  }

  throw new Error(`Unsupported GitHub publish mode: ${mode}`);
}
