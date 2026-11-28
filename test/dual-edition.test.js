import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  AVAILABLE_EDITIONS,
  AVAILABLE_STYLES,
  EDITIONS,
  normalizeEditionId,
  OFFICE_STYLE,
  resolveEdition,
  resolveStyle,
} from '../src/styles.js';
import { validateConfigPatch } from '../src/config.js';
import { formatMultiPlatformDevlog } from '../src/formatter.js';
import {
  renderCarouselSlidesSvg,
  renderHorizontalCardSvg,
  renderVerticalCardSvg,
} from '../src/card-renderer.js';
import { writeDevlogBundle } from '../src/publisher.js';

const ROOT = process.cwd();

function makeContext() {
  return {
    isGitRepo: true,
    repoPath: '/tmp/demo-office',
    projectName: 'Kirakila7/dsh-plugin-devlog-poster',
    branch: 'main',
    since: '24 hours ago',
    commits: [
      { sha: 'abc1234', date: '2026-11-28', author: 'Dev', subject: 'feat: split office and community editions' },
    ],
    stats: { filesChanged: 6, insertions: 420, deletions: 45 },
    changedFiles: ['src/styles.js', 'src/card-renderer.js', 'src/publisher.js', 'src/cli.js'],
    highlights: [
      '拆分办公专业版（极简商务日报）与社区二创版（二次元工作日报图文）',
      '工作台支持顶部一键切换办公版 / 社区二创版并自动同步文案与 4 图简报',
    ],
    pitfalls: ['需要确保办公版零二次元与零玩梗，且不破坏社区版 4 套 AI 娘画风'],
    nextSteps: ['补充双模式测试用例并验证 CLI --edition 完整链路'],
    collectedAt: '2026-11-28T12:00:00.000Z',
  };
}

test('styles & config normalize dual editions and keep AVAILABLE_STYLES backward compatible', () => {
  assert.deepEqual(AVAILABLE_EDITIONS, ['community', 'office']);
  assert.deepEqual(AVAILABLE_STYLES, ['big_fat_fish', 'gemini', 'chatgpt', 'claude']);

  assert.equal(normalizeEditionId('office'), 'office');
  assert.equal(normalizeEditionId('work'), 'office');
  assert.equal(normalizeEditionId('办公'), 'office');
  assert.equal(normalizeEditionId('办公专业版'), 'office');
  assert.equal(normalizeEditionId('community'), 'community');
  assert.equal(normalizeEditionId('acg'), 'community');
  assert.equal(normalizeEditionId('社区二创版'), 'community');
  assert.equal(normalizeEditionId('unknown_mode'), null);

  assert.equal(resolveEdition('office').id, 'office');
  assert.equal(resolveStyle('gemini', { edition: 'office' }).id, 'office');
  assert.equal(resolveStyle('gemini', { edition: 'community' }).id, 'gemini');
  assert.ok(OFFICE_STYLE.copyPrompt.includes('不要使用二次元人设'));

  const validPatch = validateConfigPatch({ defaultEdition: 'work' });
  assert.equal(validPatch.valid, true);
  assert.equal(validPatch.normalized.defaultEdition, 'office');

  const invalidPatch = validateConfigPatch({ defaultEdition: 'invalid_edition' });
  assert.equal(invalidPatch.valid, false);
  assert.ok(invalidPatch.errors[0].includes('Invalid defaultEdition'));
});

test('office edition renders zero-anime executive 4-slide daily brief and clean business copy', () => {
  const ctx = makeContext();
  const formatted = formatMultiPlatformDevlog(ctx, { edition: 'office' });

  assert.equal(formatted.meta.edition, 'office');
  assert.equal(formatted.meta.editionName, EDITIONS.office.name);
  assert.equal(formatted.meta.style, 'office');
  assert.ok(formatted.meta.title.includes('工作日报'));

  // Zero anime persona slang & community casual phrasing in office copy
  const allCopy = [
    formatted.platforms.github.content,
    formatted.platforms.xiaohongshu.content,
    formatted.platforms.bilibili.content,
    formatted.platforms.bilibili.videoOutline,
    formatted.platforms.douyin.content,
    formatted.platforms.douyin.videoScript,
    formatted.platforms.linkedin.content,
  ].join('\n');
  for (const forbidden of [
    '大肥鱼',
    '哈基米',
    '白龙娘',
    '克劳德',
    '大狗大狗',
    '踩到的坑',
    '点个关注不迷路',
    '顺手填了几个坑',
  ]) {
    assert.equal(allCopy.includes(forbidden), false, `Office copy must not include "${forbidden}"`);
  }
  assert.ok(formatted.platforms.xiaohongshu.content.includes('⚠️ 风险与卡点：'));
  assert.ok(formatted.platforms.github.content.includes('### ⚠️ Risks & Resolutions'));

  // Executive 4-slide vector cards (no mascot cover, no comic comment-bait, full date in footer)
  const slides = renderCarouselSlidesSvg(ctx, formatted);
  assert.equal(slides.length, 4);
  assert.ok(slides[0].svg.includes('data-office-slide="1"'));
  assert.ok(slides[0].svg.includes('WORK DAILY BRIEF'));
  assert.equal(slides[0].svg.includes('data-mascot-cover="1"'), false);
  assert.ok(slides[1].svg.includes('今日核心交付清单'));
  assert.ok(slides[2].svg.includes('风险、卡点与变更范围'));
  assert.ok(slides[3].svg.includes('REPORT METADATA'));
  assert.ok(slides[3].svg.includes('2026.11.28'), 'Office P4 footer should show full date without truncation');
  assert.equal(slides[3].svg.includes('欢迎评论区点菜 / 催更'), false);

  // Compact KPI formatting for huge monorepo stats
  const hugeCtx = makeContext();
  hugeCtx.stats = { filesChanged: 128, insertions: 123456, deletions: 25400 };
  const hugeFormatted = formatMultiPlatformDevlog(hugeCtx, { edition: 'office' });
  const hugeCover = renderVerticalCardSvg(hugeCtx, hugeFormatted);
  assert.ok(hugeCover.includes('+123.5k'));
  assert.ok(hugeCover.includes('-25.4k'));

  const vSvg = renderVerticalCardSvg(ctx, formatted);
  assert.ok(vSvg.includes('viewBox="0 0 1080 1440"'));
  assert.ok(vSvg.includes('data-office-slide="1"'));

  const hSvg = renderHorizontalCardSvg(ctx, formatted);
  assert.ok(hSvg.includes('viewBox="0 0 1600 900"'));
  assert.ok(hSvg.includes('16:9 WORK BRIEF'));
});

test('preview.html workbench supports one-click switching between Community ACG and Office editions', () => {
  const tmpOut = mkdtempSync(join(tmpdir(), 'dsh-dual-edition-'));
  try {
    const ctx = makeContext();
    const officeFormatted = formatMultiPlatformDevlog(ctx, { edition: 'office' });
    const bundle = writeDevlogBundle(ctx, officeFormatted, { outputDir: tmpOut });
    const html = readFileSync(bundle.files.preview, 'utf8');
    const manifest = JSON.parse(readFileSync(bundle.files.manifest, 'utf8'));

    assert.equal(manifest.edition, 'office');
    assert.deepEqual(manifest.availableEditions, ['community', 'office']);
    assert.ok(html.includes('switchEdition('));
    assert.ok(html.includes('data-edition="community"'));
    assert.ok(html.includes('data-edition="office"'));
    assert.ok(html.includes('办公专业版'));
    assert.ok(html.includes('社区二创版'));
    assert.ok(html.includes('window.__CURRENT_EDITION__ = "office"'));
    assert.ok(html.includes('class="file-label community-only is-hidden">叠加 AI 底图<input id="hero-file-input-alt"'));
    assert.ok(html.includes("querySelector('#slide-card-' + idx + ' h3')"));

    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch);
    assert.doesNotThrow(() => new Function(scriptMatch[1]));
  } finally {
    rmSync(tmpOut, { recursive: true, force: true });
  }
});

test('CLI generate --edition office produces office bundle and JSON metadata', () => {
  const tmpOut = mkdtempSync(join(tmpdir(), 'dsh-cli-office-'));
  try {
    const stdout = execFileSync(
      process.execPath,
      [
        resolve(ROOT, 'src/cli.js'),
        'generate',
        '--edition',
        'office',
        '--out',
        tmpOut,
        '--json',
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.edition, 'office');
    assert.equal(parsed.style, 'office');
    const slide1 = readFileSync(parsed.files.slides[0], 'utf8');
    assert.ok(slide1.includes('data-office-slide="1"'));
    assert.ok(slide1.includes('WORK DAILY BRIEF'));
  } finally {
    rmSync(tmpOut, { recursive: true, force: true });
  }
});
