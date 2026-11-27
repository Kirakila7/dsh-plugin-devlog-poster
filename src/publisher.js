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
    variants[styleId] = {
      id: styleId,
      name: MODEL_STYLES[styleId].name,
      emoji: MODEL_STYLES[styleId].emoji,
      accent: MODEL_STYLES[styleId].accentFrom,
      bg: MODEL_STYLES[styleId].bgStops[0],
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

function buildPreviewHtml(defaultStyleId, variants, workReport) {
  const initial = variants[defaultStyleId] || variants.big_fat_fish;
  const switcherButtons = AVAILABLE_STYLES.map((id) => {
    const item = variants[id];
    const activeClass = id === initial.id ? 'style-btn active' : 'style-btn';
    return `<button class="${activeClass}" data-style="${id}" onclick="switchStyle('${id}')">${escapeHtml(item.emoji)} ${escapeHtml(item.name)}</button>`;
  }).join('\n      ');

  const sections = [
    {
      id: 'xiaohongshu',
      label: '小红书 · 图文笔记',
      url: 'https://creator.xiaohongshu.com/publish/publish?target=image',
      text: initial.platforms.xiaohongshu.text,
    },
    {
      id: 'bilibili',
      label: 'B站 · 图文动态',
      url: 'https://t.bilibili.com/',
      text: initial.platforms.bilibili.text,
      extraLabel: '60s 口播大纲',
      extraText: initial.platforms.bilibili.extra,
    },
    {
      id: 'douyin',
      label: '抖音 · 图文 / 口播',
      url: 'https://creator.douyin.com/creator-micro/content/upload',
      text: initial.platforms.douyin.text,
      extraLabel: '30s 快节奏口播',
      extraText: initial.platforms.douyin.extra,
    },
    {
      id: 'github',
      label: 'GitHub · Release / Devlog',
      url: 'https://github.com/',
      text: initial.platforms.github.text,
    },
  ];

  const cardsHtml = sections
    .map(
      (s) => `
    <section class="panel">
      <div class="panel-head">
        <h2>${escapeHtml(s.label)}</h2>
        <div class="actions">
          <button onclick="copyText('${s.id}-text', this)">一键复制正文</button>
          <a class="link-btn" href="${s.url}" target="_blank" rel="noreferrer">打开发布页</a>
        </div>
      </div>
      <textarea id="${s.id}-text" rows="10">${escapeHtml(s.text)}</textarea>
      ${
        s.extraText
          ? `<div class="sub-head">
               <span>${escapeHtml(s.extraLabel)}</span>
               <button onclick="copyText('${s.id}-extra', this)">复制脚本</button>
             </div>
             <textarea id="${s.id}-extra" rows="5">${escapeHtml(s.extraText)}</textarea>`
          : ''
      }
    </section>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(initial.title)} · Devlog 预览</title>
  <style>
    :root {
      color-scheme: dark;
      --accent: ${initial.accent};
      --page-bg: ${initial.bg};
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
    }
    body { margin: 0; padding: 28px; background: var(--page-bg); color: #e2e8f0; transition: background 0.25s ease; }
    header { max-width: 1200px; margin: 0 auto 18px; display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 12px; }
    h1 { margin: 0; font-size: 24px; color: #fff; }
    .meta { color: #94a3b8; font-size: 14px; }
    .switcher { max-width: 1200px; margin: 0 auto 22px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .switcher-label { font-size: 13px; color: #94a3b8; margin-right: 4px; }
    .style-btn { background: rgba(255,255,255,0.06); color: #cbd5e1; border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.18s ease; }
    .style-btn:hover { border-color: var(--accent); color: #fff; }
    .style-btn.active { background: var(--accent); color: #090d16; border-color: var(--accent); }
    .grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 20px; }
    .panel { background: rgba(17,24,39,0.88); border: 1px solid rgba(255,255,255,0.10); border-radius: 14px; padding: 18px; }
    .panel-head, .sub-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px; }
    .panel-head h2 { margin: 0; font-size: 17px; color: var(--accent); }
    .sub-head { margin-top: 12px; font-size: 13px; color: #cbd5e1; }
    textarea { width: 100%; box-sizing: border-box; background: rgba(15,23,42,0.9); color: #f8fafc; border: 1px solid rgba(148,163,184,0.28); border-radius: 10px; padding: 12px; font-size: 13px; line-height: 1.6; resize: vertical; }
    .actions { display: flex; gap: 8px; }
    button, .link-btn { background: var(--accent); color: #0f172a; border: none; border-radius: 8px; padding: 7px 12px; font-size: 12px; font-weight: 700; cursor: pointer; text-decoration: none; }
    .link-btn { background: #334155; color: #f8fafc; }
    .cards-wrap { max-width: 1200px; margin: 24px auto 0; display: grid; grid-template-columns: 1fr 1.4fr; gap: 20px; }
    .card-box { background: rgba(17,24,39,0.88); border: 1px solid rgba(255,255,255,0.10); border-radius: 14px; padding: 16px; }
    .card-box svg { width: 100%; height: auto; border-radius: 10px; display: block; }
  </style>
</head>
<body>
  <header>
    <h1 id="page-title">${escapeHtml(initial.title)}</h1>
    <div class="meta" id="page-meta">${escapeHtml(initial.statsLine)} · dsh-plugin-devlog-poster</div>
  </header>

  <nav class="switcher" aria-label="模型风格实时切换">
    <span class="switcher-label">实时换肤：</span>
    ${switcherButtons}
  </nav>

  <main class="grid">
    ${cardsHtml}
  </main>

  <section class="grid" style="margin-top: 20px;">
    <section class="panel">
      <div class="panel-head">
        <h2>📄 文本版（QQ / 微信 / Slack 纯文本）</h2>
        <button onclick="copyText('work-plain', this)">一键复制</button>
      </div>
      <textarea id="work-plain" rows="9">${escapeHtml(workReport.qqText)}</textarea>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>📝 Markdown 版（GitHub / 飞书 / 钉钉 / 企微 / Discord）</h2>
        <button onclick="copyText('work-md', this)">一键复制</button>
      </div>
      <textarea id="work-md" rows="9">${escapeHtml(workReport.markdown)}</textarea>
    </section>
  </section>

  <section class="grid" style="margin-top: 20px;">
    <section class="panel">
      <div class="panel-head">
        <h2>🎨 图文版 · 生图提示词（小红书 3:4 / 抖音 3:4）</h2>
        <button onclick="copyText('prompt-xhs', this)">复制 Prompt</button>
      </div>
      <textarea id="prompt-xhs" rows="7">${escapeHtml(initial.imagePrompts.xiaohongshu.prompt)}</textarea>
    </section>
    <section class="panel">
      <div class="panel-head">
        <h2>🎨 图文版 · 生图提示词（B站 16:9 / GitHub 16:9）</h2>
        <button onclick="copyText('prompt-bili', this)">复制 Prompt</button>
      </div>
      <textarea id="prompt-bili" rows="7">${escapeHtml(initial.imagePrompts.bilibili.prompt)}</textarea>
    </section>
  </section>

  <section class="cards-wrap">
    <div class="card-box">
      <div class="panel-head">
        <h2>3:4 竖版封面卡（小红书 / 抖音）</h2>
        <div class="actions">
          <label class="link-btn" style="cursor:pointer;">叠加 AI 底图<input type="file" accept="image/*" style="display:none" onchange="applyLocalHero(event)"/></label>
          <button onclick="downloadPng('svg-vertical', 'vertical', 1080, 1440)">导出 PNG</button>
        </div>
      </div>
      <div id="svg-vertical">${initial.verticalSvg}</div>
    </div>
    <div class="card-box">
      <div class="panel-head">
        <h2>16:9 横版进度卡（B站 / GitHub）</h2>
        <button onclick="downloadPng('svg-horizontal', 'horizontal', 1600, 900)">导出 PNG</button>
      </div>
      <div id="svg-horizontal">${initial.horizontalSvg}</div>
    </div>
  </section>

  <section class="carousel-wrap" style="max-width:1200px;margin:24px auto 0;">
    <div class="panel-head" style="margin-bottom:14px;">
      <h2 style="margin:0;color:var(--accent);font-size:18px;">🖼️ 小红书 / 抖音 4 图轮播套图（P1 封面 → P2 更新 → P3 踩坑 → P4 预告）</h2>
    </div>
    <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));">
      ${initial.slides
        .map(
          (slide, idx) => `
      <div class="card-box">
        <div class="panel-head">
          <h2>${escapeHtml(slide.label)}</h2>
          <button onclick="downloadPng('svg-slide-${idx}', 'slide-${idx + 1}', 1080, 1440)">导出 PNG</button>
        </div>
        <div id="svg-slide-${idx}">${slide.svg}</div>
      </div>`
        )
        .join('\n')}
    </div>
  </section>

  <script>
    window.__DEVLOG_VARIANTS__ = ${safeJsonForScript(variants)};
    window.__CURRENT_STYLE__ = ${JSON.stringify(initial.id)};

    function switchStyle(styleId) {
      const v = window.__DEVLOG_VARIANTS__[styleId];
      if (!v) return;
      window.__CURRENT_STYLE__ = styleId;
      document.documentElement.style.setProperty('--accent', v.accent);
      document.documentElement.style.setProperty('--page-bg', v.bg);
      document.getElementById('page-title').textContent = v.title;
      document.getElementById('page-meta').textContent = v.statsLine + ' · ' + v.name + ' · dsh-plugin-devlog-poster';
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
      document.getElementById('prompt-xhs').value = v.imagePrompts.xiaohongshu.prompt;
      document.getElementById('prompt-bili').value = v.imagePrompts.bilibili.prompt;
      document.querySelectorAll('.style-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.style === styleId);
      });
    }

    function applyLocalHero(evt) {
      const file = evt.target.files && evt.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUri = reader.result;
        ['svg-vertical', 'svg-slide-0'].forEach((id) => {
          const svg = document.querySelector('#' + id + ' svg');
          if (!svg) return;
          let img = svg.querySelector('image[data-local-hero="1"]');
          if (!img) {
            img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
            img.setAttribute('data-local-hero', '1');
            img.setAttribute('x', '0');
            img.setAttribute('y', '0');
            img.setAttribute('width', '1080');
            img.setAttribute('height', '1440');
            img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
            img.setAttribute('opacity', '0.40');
            const firstRect = svg.querySelector('rect');
            if (firstRect && firstRect.nextSibling) {
              svg.insertBefore(img, firstRect.nextSibling);
            }
          }
          img.setAttribute('href', dataUri);
        });
      };
      reader.readAsDataURL(file);
    }

    async function copyText(id, btn) {
      const el = document.getElementById(id);
      await navigator.clipboard.writeText(el.value);
      const old = btn.textContent;
      btn.textContent = '已复制 ✓';
      setTimeout(() => { btn.textContent = old; }, 1500);
    }

    function downloadPng(containerId, kind, width, height) {
      const svgEl = document.querySelector('#' + containerId + ' svg');
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
      };
      img.src = url;
    }
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
