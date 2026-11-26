import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  renderHorizontalCardSvg,
  renderVerticalCardSvg,
} from './card-renderer.js';

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPreviewHtml(formatted, verticalSvg, horizontalSvg) {
  const platforms = formatted.platforms;
  const sections = [
    {
      id: 'xiaohongshu',
      label: '小红书 · 图文笔记',
      url: 'https://creator.xiaohongshu.com/publish/publish',
      text: platforms.xiaohongshu.content,
    },
    {
      id: 'bilibili',
      label: 'B站 · 图文动态',
      url: 'https://t.bilibili.com/',
      text: platforms.bilibili.content,
      extraLabel: '60s 口播大纲',
      extraText: platforms.bilibili.videoOutline,
    },
    {
      id: 'douyin',
      label: '抖音 · 图文 / 口播',
      url: 'https://creator.douyin.com/creator-micro/content/upload',
      text: platforms.douyin.content,
      extraLabel: '30s 快节奏口播',
      extraText: platforms.douyin.videoScript,
    },
    {
      id: 'github',
      label: 'GitHub · Release / Devlog',
      url: 'https://github.com/',
      text: platforms.github.content,
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
  <title>${escapeHtml(formatted.meta.title)} · Devlog 预览</title>
  <style>
    :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; }
    body { margin: 0; padding: 28px; background: #0b1120; color: #e2e8f0; }
    header { max-width: 1200px; margin: 0 auto 24px; display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 12px; }
    h1 { margin: 0; font-size: 24px; color: #fff; }
    .meta { color: #94a3b8; font-size: 14px; }
    .grid { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 20px; }
    .panel { background: #111827; border: 1px solid #1f2937; border-radius: 14px; padding: 18px; }
    .panel-head, .sub-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px; }
    .panel-head h2 { margin: 0; font-size: 17px; color: #38bdf8; }
    .sub-head { margin-top: 12px; font-size: 13px; color: #cbd5e1; }
    textarea { width: 100%; box-sizing: border-box; background: #0f172a; color: #f8fafc; border: 1px solid #334155; border-radius: 10px; padding: 12px; font-size: 13px; line-height: 1.6; resize: vertical; }
    button, .link-btn { background: #38bdf8; color: #0f172a; border: none; border-radius: 8px; padding: 7px 12px; font-size: 12px; font-weight: 700; cursor: pointer; text-decoration: none; }
    .link-btn { background: #334155; color: #f8fafc; }
    .cards-wrap { max-width: 1200px; margin: 24px auto 0; display: grid; grid-template-columns: 1fr 1.4fr; gap: 20px; }
    .card-box { background: #111827; border: 1px solid #1f2937; border-radius: 14px; padding: 16px; }
    .card-box svg { width: 100%; height: auto; border-radius: 10px; display: block; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(formatted.meta.title)}</h1>
    <div class="meta">${escapeHtml(formatted.meta.statsLine)} · dsh-plugin-devlog-poster</div>
  </header>

  <main class="grid">
    ${cardsHtml}
  </main>

  <section class="cards-wrap">
    <div class="card-box">
      <div class="panel-head">
        <h2>3:4 竖版封面卡（小红书 / 抖音）</h2>
        <button onclick="downloadPng('svg-vertical', 'devlog-vertical.png', 1080, 1440)">导出 PNG</button>
      </div>
      <div id="svg-vertical">${verticalSvg}</div>
    </div>
    <div class="card-box">
      <div class="panel-head">
        <h2>16:9 横版进度卡（B站 / GitHub）</h2>
        <button onclick="downloadPng('svg-horizontal', 'devlog-horizontal.png', 1600, 900)">导出 PNG</button>
      </div>
      <div id="svg-horizontal">${horizontalSvg}</div>
    </div>
  </section>

  <script>
    async function copyText(id, btn) {
      const el = document.getElementById(id);
      await navigator.clipboard.writeText(el.value);
      const old = btn.textContent;
      btn.textContent = '已复制 ✓';
      setTimeout(() => { btn.textContent = old; }, 1500);
    }

    function downloadPng(containerId, filename, width, height) {
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
        a.download = filename;
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
 * Write all 4 platform drafts, SVG cards, and an interactive preview.html bundle.
 */
export function writeDevlogBundle(context, formatted, { outputDir = 'out' } = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const safeName = context.projectName
    .split('/')
    .pop()
    .replace(/[^a-zA-Z0-9_-]/g, '-');
  const bundleDir = resolve(outputDir, `${stamp}-${safeName}`);
  mkdirSync(bundleDir, { recursive: true });

  const verticalSvg = renderVerticalCardSvg(context, formatted);
  const horizontalSvg = renderHorizontalCardSvg(context, formatted);
  const previewHtml = buildPreviewHtml(formatted, verticalSvg, horizontalSvg);

  const files = {
    github: join(bundleDir, 'github.md'),
    xiaohongshu: join(bundleDir, 'xiaohongshu.md'),
    bilibili: join(bundleDir, 'bilibili.md'),
    douyin: join(bundleDir, 'douyin.md'),
    cardVertical: join(bundleDir, 'card-vertical.svg'),
    cardHorizontal: join(bundleDir, 'card-horizontal.svg'),
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
  writeFileSync(files.cardVertical, verticalSvg, 'utf8');
  writeFileSync(files.cardHorizontal, horizontalSvg, 'utf8');
  writeFileSync(files.preview, previewHtml, 'utf8');
  writeFileSync(
    files.manifest,
    JSON.stringify({ context, formatted, files }, null, 2) + '\n',
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
