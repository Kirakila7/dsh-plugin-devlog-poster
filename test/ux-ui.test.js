import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  fileToDataUri,
  renderCarouselSlidesSvg,
  renderHorizontalCardSvg,
  renderVerticalCardSvg,
  resolveDefaultMascotPath,
} from '../src/card-renderer.js';
import { formatMultiPlatformDevlog } from '../src/formatter.js';
import { writeDevlogBundle } from '../src/publisher.js';
import { AVAILABLE_STYLES } from '../src/styles.js';

function makeContext(overrides = {}) {
  return {
    isGitRepo: true,
    repoPath: '/tmp/demo',
    projectName: 'Kirakila7/dsh-plugin-devlog-poster-super-long-repo-name',
    branch: 'feat/ui-polish',
    since: '24 hours ago',
    commits: [
      { sha: 'abc1234', date: '2026-11-27', author: 'Dev', subject: 'feat: unify chibi comic carousel deck' },
    ],
    stats: { filesChanged: 5, insertions: 420, deletions: 112 },
    changedFiles: [
      'src/card-renderer.js',
      'src/publisher.js',
      'test/ux-ui.test.js',
      'assets/mascots/big_fat_fish.png',
    ],
    highlights: [
      '重做 P2-P4 亮色漫画风轮播套图，和 P1 AI 娘封面视觉无缝衔接',
      'Added interactive phone-frame carousel preview & batch PNG export for Xiaohongshu/Douyin',
    ],
    pitfalls: ['CJK 与英文混排时等宽字符计数会导致长行溢出，改为按显示宽度自动折行'],
    nextSteps: ['支持一键导出所有尺寸封面与实机预览'],
    collectedAt: '2026-11-27T06:00:00.000Z',
    ...overrides,
  };
}

test('P2-P4 carousel slides adopt bright chibi comic palettes, pager dots, swipe cues, and P3 snapshot card', () => {
  const expectedBgFrom = {
    big_fat_fish: '#EFF6FF',
    gemini: '#F5F3FF',
    chatgpt: '#F0FDF4',
    claude: '#FFF7ED',
  };

  const ctx = makeContext();
  for (const styleId of AVAILABLE_STYLES) {
    const formatted = formatMultiPlatformDevlog(ctx, { style: styleId });
    const mascotPath = resolveDefaultMascotPath(styleId);
    assert.ok(mascotPath, `mascot missing for ${styleId}`);
    const heroDataUri = fileToDataUri(mascotPath);

    const slides = renderCarouselSlidesSvg(ctx, formatted, {
      heroImageDataUri: heroDataUri,
      isMascotCover: true,
    });
    assert.equal(slides.length, 4);

    // P1 retains Zipzipipe credit & mascot cover tag & safely truncated pill
    assert.ok(slides[0].svg.includes('Zipzipipe'));
    assert.ok(slides[0].svg.includes('data-hero-layer="1"'));
    assert.ok(slides[0].svg.includes('…'), 'long P1 pill text should truncate safely with ellipsis');

    // P2-P4 share bright pastel comic palette + 4-dot pager + dark-ink stroke
    for (let i = 1; i <= 3; i += 1) {
      const svg = slides[i].svg;
      assert.ok(svg.includes(expectedBgFrom[styleId]), `${styleId} P${i + 1} missing pastel bg`);
      assert.ok(svg.includes('aria-label="carousel-pager"'), `${styleId} P${i + 1} missing pager dots`);
      assert.ok(svg.includes('stroke-width="4.5"'), `${styleId} P${i + 1} missing comic border`);
    }

    // Swipe cue on P2-P3, finish badge on P4
    assert.ok(slides[1].svg.includes('左滑继续 →'));
    assert.ok(slides[2].svg.includes('左滑继续 →'));
    assert.ok(slides[3].svg.includes('完结撒花'));

    // P3 density balance renders "本轮改动速览" & changedFiles pills when pitfalls.length <= 2
    assert.ok(slides[2].svg.includes('本轮改动速览'));
    assert.ok(slides[2].svg.includes('src/card-renderer.js'));

    // P4 CTA block
    assert.ok(slides[3].svg.includes('欢迎评论区点菜 / 催更'));
  }
});

test('P3 skips snapshot card when 3 pitfalls already fill the slide', () => {
  const ctx = makeContext({
    pitfalls: ['踩坑 1：长文本折行', '踩坑 2：SVG defs 冲突', '踩坑 3：file:// 剪贴板权限'],
  });
  const formatted = formatMultiPlatformDevlog(ctx, { style: 'gemini' });
  const slides = renderCarouselSlidesSvg(ctx, formatted, { isMascotCover: true });
  assert.ok(slides[2].svg.includes('踩坑记录 #3'));
  assert.equal(slides[2].svg.includes('本轮改动速览'), false);
});

test('renderHorizontalCardSvg and vector renderVerticalCardSvg stay well-formed with mixed CJK/ASCII text', () => {
  const ctx = makeContext();
  const formatted = formatMultiPlatformDevlog(ctx, { style: 'claude' });
  const hSvg = renderHorizontalCardSvg(ctx, formatted);
  assert.ok(hSvg.includes('viewBox="0 0 1600 900"'));
  assert.ok(hSvg.includes('16:9 DEVLOG'));
  assert.ok(hSvg.includes('01'));

  const vSvg = renderVerticalCardSvg(ctx, formatted);
  assert.ok(vSvg.includes('viewBox="0 0 1080 1440"'));
});

test('preview.html workbench includes tabs, phone carousel, char badges, batch export, toast, fallback copy, hero reset & lightbox', () => {
  const tmpOut = mkdtempSync(join(tmpdir(), 'dsh-ux-ui-'));
  try {
    const ctx = makeContext();
    const formatted = formatMultiPlatformDevlog(ctx, { style: 'big_fat_fish' });
    const bundle = writeDevlogBundle(ctx, formatted, { outputDir: tmpOut });
    const html = readFileSync(bundle.files.preview, 'utf8');

    // Compatibility guardrails
    assert.ok(html.includes('switchStyle('));
    assert.ok(html.includes('window.__DEVLOG_VARIANTS__'));
    assert.ok(html.includes('data-style="big_fat_fish"'));
    assert.ok(html.includes('data-style="gemini"'));
    assert.ok(html.includes('data-style="chatgpt"'));
    assert.ok(html.includes('data-style="claude"'));
    assert.ok(html.includes('一键复制正文'));
    assert.ok(html.includes('导出 PNG'));

    // New Scope A workbench features
    assert.ok(html.includes("switchTab('visuals')"));
    assert.ok(html.includes("switchTab('copy')"));
    assert.ok(html.includes("switchTab('report')"));
    assert.ok(html.includes("switchTab('prompts')"));
    assert.ok(html.includes("switchTab('all')"));
    assert.ok(html.includes('phone-frame'));
    assert.ok(html.includes('ArrowLeft'));
    assert.ok(html.includes('ArrowRight'));
    assert.ok(html.includes('exportAllSlidesPng('));
    assert.ok(html.includes('一键导出 4 图 PNG'));
    assert.ok(html.includes('updateCharCounts('));
    assert.ok(html.includes('/1000字'));
    assert.ok(html.includes('/500字'));
    assert.ok(html.includes('/2000字'));
    assert.ok(html.includes("document.execCommand('copy')"));
    assert.ok(html.includes('toast-stack'));
    assert.ok(html.includes('resetLocalHero()'));
    assert.ok(html.includes('恢复默认 AI 娘'));
    assert.ok(html.includes('lightbox-modal'));
    assert.ok(html.includes('minmax(min(100%, 420px), 1fr)'));

    // Verify inline workbench <script> parses cleanly as valid JS
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'preview.html should contain inline script');
    assert.doesNotThrow(() => new Function(scriptMatch[1]), 'inline workbench script must be valid JS');

    // Mascot base64 deduplication in preview.html while standalone SVGs stay self-contained
    assert.ok(html.includes('window.__MASCOT_DATA_URIS__'));
    assert.ok(html.includes('hydrateMascotImages('));
    assert.ok(html.includes('data-mascot-id="big_fat_fish"'));
    const b64Matches = html.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/g) || [];
    assert.equal(b64Matches.length, 4, 'each mascot PNG data URI should appear only once in preview.html');
    assert.equal(new Set(b64Matches).size, 4);
    assert.ok(Buffer.byteLength(html, 'utf8') < 12 * 1024 * 1024, 'deduplicated preview.html should be well under 12MB');

    const standaloneVertical = readFileSync(bundle.files.cardVertical, 'utf8');
    const standaloneSlide1 = readFileSync(bundle.files.slides[0], 'utf8');
    assert.ok(standaloneVertical.includes('data:image/png;base64,'));
    assert.ok(standaloneVertical.includes('Zipzipipe'));
    assert.ok(standaloneSlide1.includes('data:image/png;base64,'));
    assert.ok(standaloneSlide1.includes('Zipzipipe'));
  } finally {
    rmSync(tmpOut, { recursive: true, force: true });
  }
});

test('P4 comic medallion renders bold-ink sticker icons matching all 4 official covers', () => {
  const ctx = makeContext();
  const byStyle = {};
  for (const styleId of AVAILABLE_STYLES) {
    const formatted = formatMultiPlatformDevlog(ctx, { style: styleId });
    const slides = renderCarouselSlidesSvg(ctx, formatted, { isMascotCover: true });
    const p4 = slides[3].svg;
    assert.ok(p4.includes('r="92"'), `${styleId} P4 medallion should use r=92`);
    assert.ok(p4.includes(`data-mascot-icon="${styleId}"`), `${styleId} missing mascot icon marker`);
    byStyle[styleId] = p4;
  }

  // big_fat_fish: J-shaped cornflower-blue whale, ribbed white belly, dot eye, pink blush, 2 water drops, NO mouth line
  assert.ok(byStyle.big_fat_fish.includes('#6498FC'));
  assert.ok(byStyle.big_fat_fish.includes('#FFFDF9'));
  assert.ok(byStyle.big_fat_fish.includes('#C7D4F5'));
  assert.ok(byStyle.big_fat_fish.includes('#FDA4AF'));
  assert.ok(byStyle.big_fat_fish.includes('#BAE6FD'));
  assert.ok(byStyle.big_fat_fish.includes('whaleClip_p4_big_fat_fish'));
  assert.equal(byStyle.big_fat_fish.includes('Q48 118'), false, 'whale icon must have no mouth line');

  // gemini: 4-point sparkle with lavender outer + golden core
  assert.ok(byStyle.gemini.includes('#A78BFA'));
  assert.ok(byStyle.gemini.includes('#FCD34D'));

  // chatgpt: mint smiling blob with pink smile + 3 comic burst ticks
  assert.ok(byStyle.chatgpt.includes('#A7F3D0'));
  assert.ok(byStyle.chatgpt.includes('#FB7185'));
  assert.equal((byStyle.chatgpt.match(/<line x1="(65|36|22)"/g) || []).length, 3);

  // claude: 8-point terracotta starburst flower + warm cream inner ring
  assert.ok(byStyle.claude.includes('<polygon points="100,22'));
  assert.ok(byStyle.claude.includes('#EA580C'));
  assert.ok(byStyle.claude.includes('#FFF7ED'));
});
