import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import {
  DRAFT_PLATFORMS,
  clampPlatformTitle,
  findCachedChromiumExecutable,
  inspectDraftAutomationEnvironment,
  loadBundlePlatformPayload,
  readPngDimensions,
  renderSlidesToPngs,
  renderSvgToPng,
  resolvePlaywrightRuntime,
  savePlatformDraft,
  stripDouyinOralScript,
} from '../src/draft-automation.js';

const ROOT = process.cwd();
const HAKIMI_BUNDLE_DIR = resolve(
  ROOT,
  'out/launch-post/hakimi-v0.8.0/2026-11-27T19-09-51-dsh-plugin-devlog-poster'
);
const CLI_PATH = resolve(ROOT, 'src/cli.js');

function assertValidPngDimensions(pngPath, expectedWidth, expectedHeight) {
  assert.ok(existsSync(pngPath), `Expected PNG to exist: ${pngPath}`);
  const buf = readFileSync(pngPath);
  assert.ok(buf.length > 100, `Expected non-trivial PNG size for ${pngPath}`);
  assert.deepEqual(
    buf.subarray(0, 8),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    `Invalid PNG magic bytes in ${pngPath}`
  );
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.equal(width, expectedWidth, `Width mismatch for ${pngPath}`);
  assert.equal(height, expectedHeight, `Height mismatch for ${pngPath}`);
  assert.deepEqual(readPngDimensions(pngPath), { width: expectedWidth, height: expectedHeight });
}

test('clampPlatformTitle enforces codepoint-safe limits for Xiaohongshu (<=20) and Douyin (<=30)', () => {
  const shortTitle = '正常标题123';
  assert.equal(clampPlatformTitle(shortTitle, 20), shortTitle);

  const emojiBurst = '🚀'.repeat(25);
  const clampedEmoji = clampPlatformTitle(emojiBurst, 20);
  assert.ok([...clampedEmoji].length <= 20);
  assert.equal([...clampedEmoji].length, 20);
  assert.ok(clampedEmoji.endsWith('…'));
  assert.ok(!/[\uD800-\uDBFF]$/.test(clampedEmoji.slice(0, -1)), 'Must not split surrogate pair');

  const xhsLong = '✦ 哈基，基米，哈基米！今天把 dsh-plugin-devlog-poster 唱着歌写完了 🎵';
  const xhsClamped = clampPlatformTitle(xhsLong, 20);
  assert.ok([...xhsClamped].length <= 20);
  assert.ok(xhsClamped.endsWith('…'));

  const douyinLong = '✦ 哈基米更新日志｜dsh-plugin-devlog-poster (2026.11.28) 🎵';
  const douyinClamped = clampPlatformTitle(douyinLong, 30);
  assert.ok([...douyinClamped].length <= 30);
  assert.ok(douyinClamped.endsWith('…'));
});

test('stripDouyinOralScript removes 30s oral script block while preserving body and hashtags', () => {
  const withOralScript = [
    '✦ 哈基米更新日志｜dsh-plugin-devlog-poster (2026.11.28) 🎵',
    '',
    '🎵 核心亮点更新',
    '#dsh-plugin-devlog-poster #哈基米',
    '',
    '---',
    '',
    '【30秒快节奏口播 · 哈基米（Gemini · 元气接梗娘）】',
    '今天把 dsh-plugin-devlog-poster 又推了一版。',
  ].join('\n');

  const stripped = stripDouyinOralScript(withOralScript);
  assert.ok(stripped.includes('🎵 核心亮点更新'));
  assert.ok(stripped.includes('#dsh-plugin-devlog-poster #哈基米'));
  assert.ok(!stripped.includes('30秒快节奏口播'));
  assert.ok(!stripped.includes('---'));

  const standaloneOral = '正文内容\n\n【30秒口播脚本】\n第一句\n第二句';
  assert.equal(stripDouyinOralScript(standaloneOral), '正文内容');

  const normalDivider = '第一段\n\n---\n\n第二段正常正文';
  assert.equal(stripDouyinOralScript(normalDivider), normalDivider);
});

test('loadBundlePlatformPayload loads 4 slides for Xiaohongshu/Douyin, supports fallback, and preserves Bilibili 1600x900', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-payload-test-'));
  try {
    // 1. Standard 4-slide bundle (even with moved stale absolute paths)
    const bundle1 = join(tmpDir, 'moved-bundle');
    mkdirSync(bundle1, { recursive: true });
    const slideNames = [
      'slide-1-cover.svg',
      'slide-2-changes.svg',
      'slide-3-pitfalls.svg',
      'slide-4-next.svg',
    ];
    for (const s of slideNames) {
      writeFileSync(join(bundle1, s), '<svg width="1080" height="1440"></svg>');
    }
    writeFileSync(join(bundle1, 'card-horizontal.svg'), '<svg width="1600" height="900"></svg>');
    writeFileSync(
      join(bundle1, 'douyin.md'),
      '抖音正文\n#tag1\n\n---\n\n【30秒快节奏口播 · 测试】\n口播文案'
    );

    writeFileSync(
      join(bundle1, 'bundle.json'),
      JSON.stringify({
        formatted: {
          meta: { title: 'Meta Title' },
          platforms: {
            xiaohongshu: {
              title: '这是一个超过二十个字符的非常非常长的小红书测试标题🎉',
              content: '小红书正文',
            },
            douyin: {
              title: '这是一个超过三十个字符的非常非常非常长的抖音测试标题🎉🎵✨',
              content: '',
            },
            bilibili: {
              title: 'B站动态标题',
              content: 'B站正文内容',
            },
          },
        },
        files: {
          cardVertical: '/stale/old/location/card-vertical.svg',
          cardHorizontal: '/stale/old/location/card-horizontal.svg',
          slides: slideNames.map((s) => `/stale/old/location/${s}`),
        },
      })
    );

    const xhs = loadBundlePlatformPayload(bundle1, 'xiaohongshu');
    assert.equal(xhs.svgPaths.length, 4);
    assert.equal(xhs.pngPaths.length, 4);
    assert.deepEqual(
      xhs.svgPaths.map((p) => basename(p)),
      slideNames
    );
    assert.deepEqual(
      xhs.pngPaths.map((p) => basename(p)),
      [
        'slide-1-cover.png',
        'slide-2-changes.png',
        'slide-3-pitfalls.png',
        'slide-4-next.png',
      ]
    );
    assert.equal(xhs.svgPath, xhs.svgPaths[0]);
    assert.equal(xhs.pngPath, xhs.pngPaths[0]);
    assert.ok([...xhs.title].length <= 20);

    const dy = loadBundlePlatformPayload(bundle1, 'douyin');
    assert.equal(dy.svgPaths.length, 4);
    assert.equal(dy.pngPaths.length, 4);
    assert.ok([...dy.title].length <= 30);
    assert.equal(dy.content, '抖音正文\n#tag1');

    const bili = loadBundlePlatformPayload(bundle1, 'bilibili');
    assert.equal(bili.platformSpec.cardSize.width, 1600);
    assert.equal(bili.platformSpec.cardSize.height, 900);
    assert.equal(bili.svgPaths.length, 1);
    assert.equal(basename(bili.svgPath), 'card-horizontal.svg');
    assert.equal(basename(bili.pngPath), 'card-horizontal.png');

    // 2. Fallback to cardVertical when slides is absent/empty
    const bundle2 = join(tmpDir, 'fallback-bundle');
    mkdirSync(bundle2, { recursive: true });
    writeFileSync(join(bundle2, 'card-vertical.svg'), '<svg width="1080" height="1440"></svg>');
    writeFileSync(
      join(bundle2, 'bundle.json'),
      JSON.stringify({
        formatted: {
          platforms: {
            xiaohongshu: { title: '短标题', content: '正文' },
          },
        },
        files: {
          cardVertical: join(bundle2, 'card-vertical.svg'),
          slides: [],
        },
      })
    );
    const fallbackXhs = loadBundlePlatformPayload(bundle2, 'xiaohongshu');
    assert.equal(fallbackXhs.svgPaths.length, 1);
    assert.equal(basename(fallbackXhs.svgPath), 'card-vertical.svg');
    assert.equal(basename(fallbackXhs.pngPath), 'card-vertical.png');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('loadBundlePlatformPayload works cleanly on the real Hakimi v0.8.0 launch bundle', () => {
  assert.ok(existsSync(HAKIMI_BUNDLE_DIR), 'Hakimi bundle fixture must exist');

  const xhs = loadBundlePlatformPayload(HAKIMI_BUNDLE_DIR, 'xiaohongshu');
  assert.equal(xhs.svgPaths.length, 4);
  assert.ok([...xhs.title].length <= 20);
  assert.equal(basename(xhs.svgPaths[0]), 'slide-1-cover.svg');
  assert.equal(basename(xhs.svgPaths[3]), 'slide-4-next.svg');

  const dy = loadBundlePlatformPayload(HAKIMI_BUNDLE_DIR, 'douyin');
  assert.equal(dy.svgPaths.length, 4);
  assert.ok([...dy.title].length <= 30);
  assert.ok(!dy.content.includes('30秒快节奏口播'));

  const bili = loadBundlePlatformPayload(HAKIMI_BUNDLE_DIR, 'bilibili');
  assert.equal(bili.svgPaths.length, 1);
  assert.equal(basename(bili.svgPath), 'card-horizontal.svg');
});

test('Playwright and Chromium discovery handles .links, ms-playwright revisions, and missing setup messaging', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-pw-discover-'));
  try {
    const fakeHome = join(tmpDir, 'home');
    const fakeCwd = join(tmpDir, 'empty-cwd');
    mkdirSync(fakeHome, { recursive: true });
    mkdirSync(fakeCwd, { recursive: true });

    // 1. Missing both Playwright and Chromium
    const missingEnv = await inspectDraftAutomationEnvironment({
      homeDir: fakeHome,
      cwd: fakeCwd,
      env: { PATH: '' },
      skipStandardImport: true,
      execFileSyncImpl: () => {
        throw new Error('no npm');
      },
      includeSystemFallback: false,
    });
    assert.equal(missingEnv.ok, false);
    assert.equal(missingEnv.playwrightFound, false);
    assert.equal(missingEnv.missingReason, 'PLAYWRIGHT_NOT_INSTALLED');
    assert.ok(missingEnv.installInstructions.includes('npm install playwright'));

    // 2. Discover playwright-core via ms-playwright/.links/* and newest chromium-* revision
    const pwCoreDir = join(tmpDir, 'runtime', 'node_modules', 'playwright-core');
    mkdirSync(pwCoreDir, { recursive: true });
    writeFileSync(
      join(pwCoreDir, 'package.json'),
      JSON.stringify({ name: 'playwright-core', version: '1.62.1', main: 'index.mjs' })
    );
    writeFileSync(
      join(pwCoreDir, 'index.mjs'),
      `export const chromium = { executablePath: () => ${JSON.stringify(join(tmpDir, 'nonexistent-1234'))}, async launchPersistentContext() {} };\n`
    );

    const msPwDir = join(fakeHome, 'Library', 'Caches', 'ms-playwright');
    const linksDir = join(msPwDir, '.links');
    mkdirSync(linksDir, { recursive: true });
    writeFileSync(join(linksDir, 'pw-core-link'), pwCoreDir);

    const runtime = await resolvePlaywrightRuntime({
      homeDir: fakeHome,
      cwd: fakeCwd,
      env: { PATH: '' },
      skipStandardImport: true,
      execFileSyncImpl: () => {
        throw new Error('no npm');
      },
    });
    assert.equal(runtime.found, true);
    assert.equal(runtime.packageName, 'playwright-core');
    assert.equal(runtime.packageVersion, '1.62.1');
    assert.equal(runtime.moduleSource, 'ms-playwright-links');

    // Without Chromium binary, inspect reports CHROMIUM_NOT_INSTALLED
    const missingBrowser = await inspectDraftAutomationEnvironment({
      homeDir: fakeHome,
      cwd: fakeCwd,
      env: { PATH: '' },
      skipStandardImport: true,
      execFileSyncImpl: () => {
        throw new Error('no npm');
      },
      includeSystemFallback: false,
    });
    assert.equal(missingBrowser.ok, false);
    assert.equal(missingBrowser.playwrightFound, true);
    assert.equal(missingBrowser.chromiumFound, false);
    assert.equal(missingBrowser.missingReason, 'CHROMIUM_NOT_INSTALLED');
    assert.ok(missingBrowser.installInstructions.includes('npx playwright install chromium'));

    // Create two cached Chromium revisions (1223 and 1243) and verify newest (1243) wins
    const binSubpath =
      process.platform === 'darwin'
        ? 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
        : process.platform === 'win32'
          ? 'chrome-win64/chrome.exe'
          : 'chrome-linux/chrome';
    for (const rev of ['chromium-1223', 'chromium-1243']) {
      const exe = join(msPwDir, rev, binSubpath);
      mkdirSync(join(exe, '..'), { recursive: true });
      writeFileSync(exe, '#!/bin/sh\nexit 0\n');
      if (process.platform !== 'win32') chmodSync(exe, 0o755);
    }

    const foundExe = findCachedChromiumExecutable({
      playwright: runtime.playwright,
      homeDir: fakeHome,
      env: {},
      includeSystemFallback: false,
    });
    assert.equal(foundExe.found, true);
    assert.equal(foundExe.revision, 1243);
    assert.equal(foundExe.source, 'ms-playwright-cache');

    // 3. Discover playwright via PLAYWRIGHT_MODULE_PATH
    const pwFullDir = join(tmpDir, 'custom-pw', 'playwright');
    mkdirSync(pwFullDir, { recursive: true });
    writeFileSync(
      join(pwFullDir, 'package.json'),
      JSON.stringify({ name: 'playwright', version: '1.99.0', main: 'index.mjs' })
    );
    writeFileSync(
      join(pwFullDir, 'index.mjs'),
      'export const chromium = { executablePath: () => "" };\n'
    );
    const viaEnv = await resolvePlaywrightRuntime({
      homeDir: fakeHome,
      cwd: fakeCwd,
      env: { PLAYWRIGHT_MODULE_PATH: pwFullDir, PATH: '' },
      skipStandardImport: true,
    });
    assert.equal(viaEnv.found, true);
    assert.equal(viaEnv.packageName, 'playwright');
    assert.equal(viaEnv.moduleSource, 'env:PLAYWRIGHT_MODULE_PATH');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('cli.js doctor --json reports Playwright/Chromium status and dry-run save-draft formats 4 slides', () => {
  const docOut = execFileSync(process.execPath, [CLI_PATH, 'doctor', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, DEVLOG_POSTER_NO_OPEN: '1' },
  });
  const docJson = JSON.parse(docOut);
  const pwCheck = docJson.checks.find((c) => c.id === 'playwright');
  assert.ok(pwCheck, 'doctor must report playwright check');
  assert.ok(['ok', 'warn'].includes(pwCheck.status));
  if (pwCheck.status === 'ok') {
    assert.ok(pwCheck.detail.includes('Chromium'));
  } else {
    assert.ok(pwCheck.hint.includes('npm install playwright'));
  }

  // Also test missing Playwright warning in doctor under isolated HOME without caches
  const emptyHome = mkdtempSync(join(tmpdir(), 'dsh-doctor-no-pw-'));
  try {
    const cleanOut = execFileSync(process.execPath, [CLI_PATH, 'doctor', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        PATH: '/usr/bin:/bin',
        HOME: emptyHome,
        PLAYWRIGHT_BROWSERS_PATH: '0',
        DEVLOG_POSTER_NO_OPEN: '1',
      },
    });
    const cleanDoc = JSON.parse(cleanOut);
    const missingPw = cleanDoc.checks.find((c) => c.id === 'playwright');
    assert.equal(missingPw.status, 'warn');
    assert.ok(missingPw.hint.includes('npm install playwright'));
  } finally {
    rmSync(emptyHome, { recursive: true, force: true });
  }

  // Dry-run save-draft checks on Hakimi bundle
  const xhsPlan = JSON.parse(
    execFileSync(
      process.execPath,
      [CLI_PATH, 'save-draft', '--platform', 'xiaohongshu', '--bundle', HAKIMI_BUNDLE_DIR],
      { cwd: ROOT, encoding: 'utf8' }
    )
  );
  assert.equal(xhsPlan.ok, true);
  assert.equal(xhsPlan.dryRun, true);
  assert.equal(xhsPlan.slideCount, 4);
  assert.ok([...xhsPlan.title].length <= 20);
  assert.ok(xhsPlan.steps.some((s) => s.includes('NEVER auto-click Publish')));

  const dyPlan = JSON.parse(
    execFileSync(
      process.execPath,
      [CLI_PATH, 'save-draft', '--platform', 'douyin', '--bundle', HAKIMI_BUNDLE_DIR],
      { cwd: ROOT, encoding: 'utf8' }
    )
  );
  assert.equal(dyPlan.ok, true);
  assert.equal(dyPlan.slideCount, 4);
  assert.ok([...dyPlan.title].length <= 30);
});

test('savePlatformDraft returns PLAYWRIGHT_NOT_INSTALLED when Playwright is missing and uploads 4 PNGs without clicking Publish when mocked', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-save-draft-mock-'));
  const prevEnv = {
    HOME: process.env.HOME,
    PLAYWRIGHT_MODULE_PATH: process.env.PLAYWRIGHT_MODULE_PATH,
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
    PATH: process.env.PATH,
  };

  try {
    const bundleDir = join(tmpDir, 'bundle');
    mkdirSync(bundleDir, { recursive: true });
    const slideFiles = [
      'slide-1-cover.svg',
      'slide-2-changes.svg',
      'slide-3-pitfalls.svg',
      'slide-4-next.svg',
    ];
    for (const s of slideFiles) {
      writeFileSync(
        join(bundleDir, s),
        '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440"></svg>'
      );
    }
    writeFileSync(
      join(bundleDir, 'bundle.json'),
      JSON.stringify({
        formatted: {
          platforms: {
            xiaohongshu: {
              title: '超长小红书标题测试abcdefghijklmnopqrstuvwxyz',
              content: '正文内容测试',
            },
          },
        },
        files: {
          slides: slideFiles.map((s) => join(bundleDir, s)),
        },
      })
    );

    // 1. Missing Playwright case
    process.env.HOME = join(tmpDir, 'empty-home');
    mkdirSync(process.env.HOME, { recursive: true });
    delete process.env.PLAYWRIGHT_MODULE_PATH;
    delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
    process.env.PATH = '/usr/bin:/bin';

    const missingRes = await savePlatformDraft({
      platform: 'xiaohongshu',
      bundleDir,
      dryRun: false,
    });
    assert.equal(missingRes.ok, false);
    assert.equal(missingRes.error, 'PLAYWRIGHT_NOT_INSTALLED');
    assert.ok(missingRes.message.includes('npm install playwright'));

    // 2. Mock Playwright persistent browser flow: uploads 4 PNGs, never clicks Publish, keeps browser open
    const fakePngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    // Build a valid 1080x1440 PNG buffer by patching IHDR width/height + dummy IDAT (or write via mock)
    const mockExe = join(tmpDir, 'fake-chrome');
    writeFileSync(mockExe, '#!/bin/sh\nexit 0\n');
    chmodSync(mockExe, 0o755);

    const logFile = join(tmpDir, 'mock-actions.json');
    const mockPwFile = join(tmpDir, 'mock-playwright.mjs');
    // Mock writes a real PNG header with exact 1080x1440 IHDR for renderSvgToPng verification
    writeFileSync(
      mockPwFile,
      `
import { writeFileSync } from 'node:fs';
const actions = { clicked: [], uploaded: null, filledTitle: null, insertedBody: null, contextClosed: false };
function makePng1080x1440() {
  const buf = Buffer.from(${JSON.stringify(fakePngBase64)}, 'base64');
  // Patch IHDR width/height bytes 16..23 for dimension check in unit test
  const copy = Buffer.from(buf);
  copy.writeUInt32BE(1080, 16);
  copy.writeUInt32BE(1440, 20);
  return copy;
}
function makePage() {
  let closed = false;
  return {
    isClosed: () => closed,
    url: () => 'https://creator.xiaohongshu.com/publish/publish?target=image',
    async setViewportSize() {},
    async setContent() {},
    async evaluate() {},
    async screenshot({ path }) { writeFileSync(path, makePng1080x1440()); },
    async goto() {},
    async waitForTimeout() {},
    getByText(text) {
      return {
        async count() { return text === '上传图文' ? 1 : 0; },
        nth() {
          return {
            async isVisible() { return true; },
            async click() { actions.clicked.push('tab:' + text); },
          };
        },
      };
    },
    locator(sel) {
      const makeHandle = () => ({
        async count() { return 1; },
        first() { return makeHandle(); },
        nth() { return makeHandle(); },
        async isVisible() { return true; },
        async isDisabled() { return false; },
        async click() { actions.clicked.push('click:' + sel); },
        async setInputFiles(files) { actions.uploaded = files; },
        async fill(val) { actions.filledTitle = val; },
        async evaluate() { return 'div'; },
      });
      return makeHandle();
    },
    keyboard: {
      async insertText(txt) { actions.insertedBody = txt; },
    },
    async close() { closed = true; },
    once() {},
  };
}
export const chromium = {
  executablePath: () => ${JSON.stringify(mockExe)},
  async launch() {
    return {
      async newContext() {
        return {
          async newPage() { return makePage(); },
          async close() {},
        };
      },
      async close() {},
    };
  },
  async launchPersistentContext(profileDir, opts) {
    actions.profileDir = profileDir;
    actions.executablePath = opts.executablePath;
    const p = makePage();
    return {
      pages: () => [p],
      async newPage() { return p; },
      once() {},
      on() {},
      off() {},
      async close() {
        actions.contextClosed = true;
        writeFileSync(${JSON.stringify(logFile)}, JSON.stringify(actions));
      },
    };
  },
};
export { actions };
`
    );

    process.env.PLAYWRIGHT_MODULE_PATH = mockPwFile;
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = mockExe;

    const profileDir = join(tmpDir, 'profile');
    const mockRes = await savePlatformDraft({
      platform: 'xiaohongshu',
      bundleDir,
      profileDir,
      dryRun: false,
      keepOpen: true,
      onStatus: () => {},
    });

    assert.equal(mockRes.ok, true);
    assert.equal(mockRes.savedDraft, false);
    assert.equal(mockRes.browserKeptOpen, true);
    assert.equal(mockRes.renderedPngs.length, 4);
    assert.ok([...mockRes.title].length <= 20);

    const mockMod = await import(mockPwFile);
    assert.equal(mockMod.actions.contextClosed, false, 'Must keep browser open when keepOpen=true');
    assert.equal(mockMod.actions.uploaded.length, 4);
    assert.ok(mockMod.actions.clicked.includes('tab:上传图文'));
    assert.ok([...mockMod.actions.filledTitle].length <= 20);
    assert.equal(mockMod.actions.insertedBody, '正文内容测试');
    assert.ok(
      !mockMod.actions.clicked.some((c) => c.includes('发布') || c.includes('暂存')),
      'Must NEVER click Publish or auto-leave editor'
    );
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('real SVG-to-PNG renders all 4 Hakimi slides at exact 1080x1440 and horizontal card at 1600x900', async (t) => {
  const envInfo = await inspectDraftAutomationEnvironment();
  if (!envInfo.ok) {
    t.skip(`Playwright/Chromium not available on host: ${envInfo.installInstructions}`);
    return;
  }

  const tmpOut = mkdtempSync(join(tmpdir(), 'dsh-hakimi-png-'));
  try {
    const xhsPayload = loadBundlePlatformPayload(HAKIMI_BUNDLE_DIR, 'xiaohongshu');
    const slideItems = xhsPayload.svgPaths.map((svgPath) => ({
      svgPath,
      pngPath: join(tmpOut, `${basename(svgPath, '.svg')}.png`),
    }));
    assert.equal(slideItems.length, 4);

    const renderedSlides = await renderSlidesToPngs(slideItems, {
      width: DRAFT_PLATFORMS.xiaohongshu.cardSize.width,
      height: DRAFT_PLATFORMS.xiaohongshu.cardSize.height,
      playwright: envInfo.playwright,
      executablePath: envInfo.executablePath,
    });
    assert.equal(renderedSlides.length, 4);
    for (const pngFile of renderedSlides) {
      assertValidPngDimensions(pngFile, 1080, 1440);
    }

    // Also verify Bilibili 1600x900 horizontal card rendering AND regression test against 1360x900 parent context
    const biliPayload = loadBundlePlatformPayload(HAKIMI_BUNDLE_DIR, 'bilibili');
    const biliPng = join(tmpOut, 'card-horizontal.png');
    const browser = await envInfo.playwright.chromium.launch({
      headless: true,
      executablePath: envInfo.executablePath,
    });
    try {
      const mismatchedContext = await browser.newContext({
        viewport: { width: 1360, height: 900 },
        deviceScaleFactor: 2,
      });
      try {
        await renderSvgToPng(mismatchedContext, biliPayload.svgPath, biliPng, {
          width: 1600,
          height: 900,
        });
      } finally {
        await mismatchedContext.close();
      }
    } finally {
      await browser.close();
    }
    assertValidPngDimensions(biliPng, 1600, 900);
  } finally {
    rmSync(tmpOut, { recursive: true, force: true });
  }
});

test('savePlatformDraft waits cleanly through QR login redirect and skips video-only file inputs', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-qr-login-mock-'));
  const prevEnv = {
    PLAYWRIGHT_MODULE_PATH: process.env.PLAYWRIGHT_MODULE_PATH,
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  };

  try {
    const bundleDir = join(tmpDir, 'bundle');
    mkdirSync(bundleDir, { recursive: true });
    const slideFiles = [
      'slide-1-cover.svg',
      'slide-2-changes.svg',
      'slide-3-pitfalls.svg',
      'slide-4-next.svg',
    ];
    for (const s of slideFiles) {
      writeFileSync(
        join(bundleDir, s),
        '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440"></svg>'
      );
    }
    writeFileSync(
      join(bundleDir, 'bundle.json'),
      JSON.stringify({
        formatted: {
          platforms: {
            douyin: {
              title: '抖音扫码等待与图文上传测试标题',
              content: '抖音正文\n\n---\n\n【30秒快节奏口播 · 测试】\n去掉这句',
            },
          },
        },
        files: { slides: slideFiles.map((s) => join(bundleDir, s)) },
      })
    );

    const mockExe = join(tmpDir, 'fake-chrome');
    writeFileSync(mockExe, '#!/bin/sh\nexit 0\n');
    chmodSync(mockExe, 0o755);

    const fakePngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    const mockPwFile = join(tmpDir, 'mock-qr-pw.mjs');
    writeFileSync(
      mockPwFile,
      `
import { writeFileSync } from 'node:fs';
export const state = {
  gotoUrls: [],
  pollStep: 0,
  currentUrl: 'https://creator.douyin.com/login',
  uploadedAccept: null,
  uploadedFiles: null,
  filledTitle: null,
  insertedBody: null,
  tabClicked: false,
};
function makePng1080x1440() {
  const buf = Buffer.from(${JSON.stringify(fakePngBase64)}, 'base64');
  const copy = Buffer.from(buf);
  copy.writeUInt32BE(1080, 16);
  copy.writeUInt32BE(1440, 20);
  return copy;
}
function makePage() {
  return {
    isClosed: () => false,
    url: () => state.currentUrl,
    async setViewportSize() {},
    async setContent() {},
    async evaluate() {},
    async screenshot({ path }) { writeFileSync(path, makePng1080x1440()); },
    async goto(url) {
      state.gotoUrls.push(url);
      // Initial navigation redirects to login; subsequent goto lands on upload URL with query param
      if (state.gotoUrls.length === 1) {
        state.currentUrl = 'https://creator.douyin.com/login';
      } else {
        state.currentUrl = 'https://creator.douyin.com/creator-micro/content/upload?from=login';
      }
    },
    async waitForTimeout() {
      state.pollStep += 1;
      if (state.pollStep === 1) {
        // Simulate user scanning QR -> redirected to dashboard /home
        state.currentUrl = 'https://creator.douyin.com/creator-micro/home';
      }
    },
    getByText(text) {
      return {
        async count() {
          return text === '发布图文' && state.currentUrl.includes('/content/upload') ? 1 : 0;
        },
        nth() {
          return {
            async isVisible() { return true; },
            async click() { state.tabClicked = true; },
          };
        },
      };
    },
    locator(sel) {
      if (sel.includes('input[type="file"]')) {
        const inputs = sel.includes('image')
          ? [{ accept: 'image/png,image/jpeg' }]
          : [{ accept: 'video/mp4' }, { accept: 'image/png,image/jpeg' }];
        return {
          async count() {
            return state.currentUrl.includes('/content/upload') ? inputs.length : 0;
          },
          first() { return this.nth(0); },
          nth(idx) {
            const target = inputs[idx] || inputs[0];
            return {
              async count() {
                return state.currentUrl.includes('/content/upload') ? 1 : 0;
              },
              async isVisible() { return true; },
              async isDisabled() { return false; },
              async getAttribute(name) { return name === 'accept' ? target.accept : null; },
              async setInputFiles(files) {
                state.uploadedAccept = target.accept;
                state.uploadedFiles = files;
              },
            };
          },
        };
      }
      if (sel.includes('标题')) {
        return {
          async count() { return state.currentUrl.includes('/content/upload') ? 1 : 0; },
          first() { return this.nth(0); },
          nth() {
            return {
              async count() { return state.currentUrl.includes('/content/upload') ? 1 : 0; },
              async isVisible() { return true; },
              async fill(val) { state.filledTitle = val; },
            };
          },
        };
      }
      if (sel.includes('contenteditable') || sel.includes('textarea')) {
        return {
          async count() { return state.currentUrl.includes('/content/upload') ? 1 : 0; },
          first() { return this.nth(0); },
          nth() {
            return {
              async count() { return state.currentUrl.includes('/content/upload') ? 1 : 0; },
              async isVisible() { return state.currentUrl.includes('/content/upload'); },
              async evaluate() { return 'div'; },
              async click() {},
            };
          },
        };
      }
      return {
        async count() { return 0; },
        first() { return this; },
        nth() { return this; },
        async isVisible() { return false; },
      };
    },
    keyboard: {
      async insertText(txt) { state.insertedBody = txt; },
    },
    async close() {},
    once() {},
  };
}
export const chromium = {
  executablePath: () => ${JSON.stringify(mockExe)},
  async launch() {
    return {
      async newContext() {
        return {
          async newPage() { return makePage(); },
          async close() {},
        };
      },
      async close() {},
    };
  },
  async launchPersistentContext() {
    const p = makePage();
    return {
      pages: () => [p],
      async newPage() { return p; },
      once() {},
      on() {},
      off() {},
      async close() {},
    };
  },
};
`
    );

    process.env.PLAYWRIGHT_MODULE_PATH = mockPwFile;
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = mockExe;

    const statuses = [];
    const res = await savePlatformDraft({
      platform: 'douyin',
      bundleDir,
      profileDir: join(tmpDir, 'profile'),
      dryRun: false,
      keepOpen: true,
      loginTimeoutMs: 15000,
      onStatus: (msg) => statuses.push(msg),
    });

    assert.equal(res.ok, true);
    assert.equal(res.renderedPngs.length, 4);
    assert.ok(statuses.some((s) => s.includes('Waiting for') && s.includes('login')));

    const mockMod = await import(mockPwFile);
    assert.equal(mockMod.state.gotoUrls.length, 2, 'Should redirect once from /home back to upload URL without looping');
    assert.equal(mockMod.state.tabClicked, true);
    assert.equal(mockMod.state.uploadedAccept, 'image/png,image/jpeg');
    assert.equal(mockMod.state.uploadedFiles.length, 4);
    assert.equal(mockMod.state.insertedBody, '抖音正文');
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('savePlatformDraft closes browserContext on goto exception and LOGIN_TIMEOUT even when keepOpen=true', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-keepopen-cleanup-'));
  const prevEnv = {
    PLAYWRIGHT_MODULE_PATH: process.env.PLAYWRIGHT_MODULE_PATH,
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  };

  try {
    const bundleDir = join(tmpDir, 'bundle');
    mkdirSync(bundleDir, { recursive: true });
    writeFileSync(
      join(bundleDir, 'slide-1-cover.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440"></svg>'
    );
    writeFileSync(
      join(bundleDir, 'bundle.json'),
      JSON.stringify({
        formatted: {
          platforms: {
            xiaohongshu: { title: '清理测试', content: '正文' },
          },
        },
        files: { slides: [join(bundleDir, 'slide-1-cover.svg')] },
      })
    );

    const mockExe = join(tmpDir, 'fake-chrome');
    writeFileSync(mockExe, '#!/bin/sh\nexit 0\n');
    chmodSync(mockExe, 0o755);

    const fakePngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    const mockPwFile = join(tmpDir, 'mock-cleanup-pw.mjs');
    writeFileSync(
      mockPwFile,
      `
import { writeFileSync } from 'node:fs';
export const state = {
  mode: 'throw-goto',
  contextCloseCount: 0,
};
function makePng1080x1440() {
  const buf = Buffer.from(${JSON.stringify(fakePngBase64)}, 'base64');
  const copy = Buffer.from(buf);
  copy.writeUInt32BE(1080, 16);
  copy.writeUInt32BE(1440, 20);
  return copy;
}
function makeRenderPage() {
  return {
    isClosed: () => false,
    async setViewportSize() {},
    async setContent() {},
    async evaluate() {},
    async screenshot({ path }) { writeFileSync(path, makePng1080x1440()); },
    async close() {},
  };
}
function makeDraftPage() {
  return {
    isClosed: () => false,
    url: () => 'https://creator.xiaohongshu.com/login',
    async goto() {
      if (state.mode === 'throw-goto') {
        throw new Error('net::ERR_NAME_NOT_RESOLVED');
      }
    },
    async waitForTimeout() {
      await new Promise((r) => setTimeout(r, 30));
    },
    getByText() {
      return {
        async count() { return 0; },
        nth() { return { async isVisible() { return false; } }; },
      };
    },
    locator() {
      return {
        async count() { return 0; },
        first() { return this; },
        nth() { return this; },
        async isVisible() { return false; },
      };
    },
    async close() {},
    once() {},
  };
}
export const chromium = {
  executablePath: () => ${JSON.stringify(mockExe)},
  async launch() {
    return {
      async newContext() {
        return {
          async newPage() { return makeRenderPage(); },
          async close() {},
        };
      },
      async close() {},
    };
  },
  async launchPersistentContext() {
    const p = makeDraftPage();
    return {
      pages: () => [p],
      async newPage() { return p; },
      once() {},
      on() {},
      off() {},
      async close() {
        state.contextCloseCount += 1;
      },
    };
  },
};
`
    );

    process.env.PLAYWRIGHT_MODULE_PATH = mockPwFile;
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = mockExe;
    const mockMod = await import(mockPwFile);

    // 1. page.goto throws while keepOpen=true -> must still close browserContext
    mockMod.state.mode = 'throw-goto';
    await assert.rejects(
      () =>
        savePlatformDraft({
          platform: 'xiaohongshu',
          bundleDir,
          profileDir: join(tmpDir, 'profile-1'),
          dryRun: false,
          keepOpen: true,
          onStatus: () => {},
        }),
      /ERR_NAME_NOT_RESOLVED/
    );
    assert.equal(mockMod.state.contextCloseCount, 1);

    // 2. LOGIN_TIMEOUT while keepOpen=true -> must close browserContext cleanly
    mockMod.state.mode = 'login-timeout';
    const timeoutRes = await savePlatformDraft({
      platform: 'xiaohongshu',
      bundleDir,
      profileDir: join(tmpDir, 'profile-2'),
      dryRun: false,
      keepOpen: true,
      loginTimeoutMs: 20,
      onStatus: () => {},
    });
    assert.equal(timeoutRes.ok, false);
    assert.equal(timeoutRes.error, 'LOGIN_TIMEOUT');
    assert.equal(mockMod.state.contextCloseCount, 2);
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('savePlatformDraft handles mid-sleep waitForTimeout TargetClosedError gracefully and closes context', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-midsleep-close-'));
  const prevEnv = {
    PLAYWRIGHT_MODULE_PATH: process.env.PLAYWRIGHT_MODULE_PATH,
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  };

  try {
    const bundleDir = join(tmpDir, 'bundle');
    mkdirSync(bundleDir, { recursive: true });
    writeFileSync(
      join(bundleDir, 'slide-1-cover.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440"></svg>'
    );
    writeFileSync(
      join(bundleDir, 'bundle.json'),
      JSON.stringify({
        formatted: {
          platforms: {
            xiaohongshu: { title: '中途关闭测试', content: '正文' },
          },
        },
        files: { slides: [join(bundleDir, 'slide-1-cover.svg')] },
      })
    );

    const mockExe = join(tmpDir, 'fake-chrome');
    writeFileSync(mockExe, '#!/bin/sh\nexit 0\n');
    chmodSync(mockExe, 0o755);

    const fakePngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    const mockPwFile = join(tmpDir, 'mock-midsleep-pw.mjs');
    writeFileSync(
      mockPwFile,
      `
import { writeFileSync } from 'node:fs';
export const state = {
  mode: 'login-sleep',
  closed: false,
  contextCloseCount: 0,
  closeListeners: [],
};
function emitContextClose() {
  const listeners = state.closeListeners.splice(0, state.closeListeners.length);
  for (const fn of listeners) fn();
}
function makePng1080x1440() {
  const buf = Buffer.from(${JSON.stringify(fakePngBase64)}, 'base64');
  const copy = Buffer.from(buf);
  copy.writeUInt32BE(1080, 16);
  copy.writeUInt32BE(1440, 20);
  return copy;
}
function makeRenderPage() {
  return {
    isClosed: () => false,
    async setViewportSize() {},
    async setContent() {},
    async evaluate() {},
    async screenshot({ path }) { writeFileSync(path, makePng1080x1440()); },
    async close() {},
  };
}
function makeDraftPage() {
  return {
    isClosed: () => state.closed,
    url: () =>
      state.mode === 'login-sleep'
        ? 'https://creator.xiaohongshu.com/login'
        : 'https://creator.xiaohongshu.com/publish/publish?target=image',
    async goto() {},
    async waitForTimeout(ms) {
      if (state.mode === 'file-sleep' && ms !== 400) {
        return;
      }
      if (state.mode === 'locator-sleep' && ms !== 500) {
        return;
      }
      if (state.mode === 'context-close-event' && ms === 400) {
        emitContextClose();
        return;
      }
      if (state.mode === 'setInputFiles-closed' || state.mode === 'context-close-event') {
        return;
      }
      state.closed = true;
      throw new Error('Target page, context or browser has been closed');
    },
    getByText(text) {
      return {
        async count() {
          return state.mode !== 'login-sleep' && text === '上传图文' ? 1 : 0;
        },
        nth() {
          return {
            async isVisible() { return true; },
            async click() {},
          };
        },
      };
    },
    locator(sel) {
      return {
        async count() {
          if (state.mode !== 'login-sleep' && sel.includes('上传图文')) return 1;
          if (
            (state.mode === 'setInputFiles-closed' || state.mode === 'locator-sleep') &&
            sel.includes('input[type="file"]')
          ) {
            return 1;
          }
          return 0;
        },
        first() { return this; },
        nth() { return this; },
        async isVisible() { return state.mode !== 'login-sleep' && sel.includes('上传图文'); },
        async isDisabled() { return false; },
        async getAttribute(name) {
          return name === 'accept' ? 'image/png,image/jpeg' : null;
        },
        async click() {},
        async setInputFiles() {
          if (state.mode === 'setInputFiles-closed') {
            state.closed = true;
            throw new Error('Target page, context or browser has been closed');
          }
        },
      };
    },
    async close() { state.closed = true; },
    once() {},
  };
}
export const chromium = {
  executablePath: () => ${JSON.stringify(mockExe)},
  async launch() {
    return {
      async newContext() {
        return {
          async newPage() { return makeRenderPage(); },
          async close() {},
        };
      },
      async close() {},
    };
  },
  async launchPersistentContext() {
    const p = makeDraftPage();
    return {
      pages: () => [p],
      async newPage() { return p; },
      once(event, fn) {
        if (event === 'close' && typeof fn === 'function') {
          state.closeListeners.push(fn);
        }
      },
      on() {},
      off(event, fn) {
        if (event === 'close') {
          state.closeListeners = state.closeListeners.filter((item) => item !== fn);
        }
      },
      async close() {
        state.contextCloseCount += 1;
      },
    };
  },
};
`
    );

    process.env.PLAYWRIGHT_MODULE_PATH = mockPwFile;
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = mockExe;
    const mockMod = await import(mockPwFile);

    // 1. Mid-sleep closure during waitForCreatorComposerReady -> BROWSER_CLOSED + context closed
    mockMod.state.mode = 'login-sleep';
    mockMod.state.closed = false;
    const closedRes = await savePlatformDraft({
      platform: 'xiaohongshu',
      bundleDir,
      profileDir: join(tmpDir, 'profile-1'),
      dryRun: false,
      keepOpen: true,
      loginTimeoutMs: 10000,
      onStatus: () => {},
    });
    assert.equal(closedRes.ok, false);
    assert.equal(closedRes.error, 'BROWSER_CLOSED');
    assert.equal(closedRes.browserKeptOpen, false);
    assert.equal(mockMod.state.contextCloseCount, 1);

    // 2. Probe C3: Mid-sleep closure inside waitForFileInput (ms === 400) with keepOpen=true -> BROWSER_CLOSED + context closed
    mockMod.state.mode = 'file-sleep';
    mockMod.state.closed = false;
    const postFileRes = await savePlatformDraft({
      platform: 'xiaohongshu',
      bundleDir,
      profileDir: join(tmpDir, 'profile-2'),
      dryRun: false,
      keepOpen: true,
      loginTimeoutMs: 10000,
      onStatus: () => {},
    });
    assert.equal(postFileRes.ok, false);
    assert.equal(postFileRes.error, 'BROWSER_CLOSED');
    assert.equal(postFileRes.savedDraft, false);
    assert.equal(postFileRes.browserKeptOpen, false);
    assert.equal(mockMod.state.contextCloseCount, 2);

    // 3. Mid-sleep closure right after image tab click (ms === 1000) with keepOpen=true -> BROWSER_CLOSED + context closed
    mockMod.state.mode = 'tab-sleep';
    mockMod.state.closed = false;
    const postTabRes = await savePlatformDraft({
      platform: 'xiaohongshu',
      bundleDir,
      profileDir: join(tmpDir, 'profile-3'),
      dryRun: false,
      keepOpen: true,
      loginTimeoutMs: 10000,
      onStatus: () => {},
    });
    assert.equal(postTabRes.ok, false);
    assert.equal(postTabRes.error, 'BROWSER_CLOSED');
    assert.equal(postTabRes.browserKeptOpen, false);
    assert.equal(mockMod.state.contextCloseCount, 3);

    // 4. TargetClosedError thrown during setInputFiles with keepOpen=true -> BROWSER_CLOSED + context closed
    mockMod.state.mode = 'setInputFiles-closed';
    mockMod.state.closed = false;
    const uploadClosedRes = await savePlatformDraft({
      platform: 'xiaohongshu',
      bundleDir,
      profileDir: join(tmpDir, 'profile-4'),
      dryRun: false,
      keepOpen: true,
      loginTimeoutMs: 10000,
      onStatus: () => {},
    });
    assert.equal(uploadClosedRes.ok, false);
    assert.equal(uploadClosedRes.error, 'BROWSER_CLOSED');
    assert.equal(uploadClosedRes.browserKeptOpen, false);
    assert.equal(mockMod.state.contextCloseCount, 4);

    // 5. browserContext 'close' event emitted post-login while page.isClosed() stays false -> BROWSER_CLOSED + context closed
    mockMod.state.mode = 'context-close-event';
    mockMod.state.closed = false;
    const ctxClosedRes = await savePlatformDraft({
      platform: 'xiaohongshu',
      bundleDir,
      profileDir: join(tmpDir, 'profile-5'),
      dryRun: false,
      keepOpen: true,
      loginTimeoutMs: 10000,
      onStatus: () => {},
    });
    assert.equal(ctxClosedRes.ok, false);
    assert.equal(ctxClosedRes.error, 'BROWSER_CLOSED');
    assert.equal(ctxClosedRes.browserKeptOpen, false);
    assert.equal(mockMod.state.contextCloseCount, 5);

    // 6. Mid-sleep closure inside waitForVisibleLocator (ms === 500) with keepOpen=true -> BROWSER_CLOSED + context closed
    mockMod.state.mode = 'locator-sleep';
    mockMod.state.closed = false;
    const locatorClosedRes = await savePlatformDraft({
      platform: 'xiaohongshu',
      bundleDir,
      profileDir: join(tmpDir, 'profile-6'),
      dryRun: false,
      keepOpen: true,
      loginTimeoutMs: 10000,
      onStatus: () => {},
    });
    assert.equal(locatorClosedRes.ok, false);
    assert.equal(locatorClosedRes.error, 'BROWSER_CLOSED');
    assert.equal(locatorClosedRes.savedDraft, false);
    assert.equal(locatorClosedRes.browserKeptOpen, false);
    assert.equal(mockMod.state.contextCloseCount, 6);
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('pre-mounted hidden video-only file input does not bypass clickImageTabIfPresent while 上传图文 hydrates', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-video-race-'));
  const prevEnv = {
    PLAYWRIGHT_MODULE_PATH: process.env.PLAYWRIGHT_MODULE_PATH,
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  };

  try {
    const bundleDir = join(tmpDir, 'bundle');
    mkdirSync(bundleDir, { recursive: true });
    const slideFiles = [
      'slide-1-cover.svg',
      'slide-2-changes.svg',
      'slide-3-pitfalls.svg',
      'slide-4-next.svg',
    ];
    for (const s of slideFiles) {
      writeFileSync(
        join(bundleDir, s),
        '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440"></svg>'
      );
    }
    writeFileSync(
      join(bundleDir, 'bundle.json'),
      JSON.stringify({
        formatted: {
          platforms: {
            xiaohongshu: {
              title: '视频输入框竞态测试标题',
              content: '图文正文内容',
            },
          },
        },
        files: { slides: slideFiles.map((s) => join(bundleDir, s)) },
      })
    );

    const mockExe = join(tmpDir, 'fake-chrome');
    writeFileSync(mockExe, '#!/bin/sh\nexit 0\n');
    chmodSync(mockExe, 0o755);

    const fakePngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    const mockPwFile = join(tmpDir, 'mock-video-race-pw.mjs');
    writeFileSync(
      mockPwFile,
      `
import { writeFileSync } from 'node:fs';
export const state = {
  pollStep: 0,
  tabHydrated: false,
  tabClicked: false,
  imageInputMounted: false,
  uploadedAccept: null,
  uploadedFiles: null,
  filledTitle: null,
  insertedBody: null,
};
function makePng1080x1440() {
  const buf = Buffer.from(${JSON.stringify(fakePngBase64)}, 'base64');
  const copy = Buffer.from(buf);
  copy.writeUInt32BE(1080, 16);
  copy.writeUInt32BE(1440, 20);
  return copy;
}
function makeRenderPage() {
  return {
    isClosed: () => false,
    async setViewportSize() {},
    async setContent() {},
    async evaluate() {},
    async screenshot({ path }) { writeFileSync(path, makePng1080x1440()); },
    async close() {},
  };
}
function makeDraftPage() {
  return {
    isClosed: () => false,
    url: () => 'https://creator.xiaohongshu.com/publish/publish?target=image',
    async goto() {},
    async waitForTimeout() {
      state.pollStep += 1;
      if (state.pollStep >= 1) {
        state.tabHydrated = true;
      }
    },
    getByText(text) {
      return {
        async count() {
          return state.tabHydrated && text === '上传图文' ? 1 : 0;
        },
        nth() {
          return {
            async isVisible() { return state.tabHydrated; },
            async click() {
              state.tabClicked = true;
              state.imageInputMounted = true;
            },
          };
        },
      };
    },
    locator(sel) {
      if (sel.includes('上传图文')) {
        return {
          async count() { return state.tabHydrated ? 1 : 0; },
          first() { return this; },
          nth() { return this; },
          async isVisible() { return state.tabHydrated; },
          async click() {
            state.tabClicked = true;
            state.imageInputMounted = true;
          },
        };
      }
      if (sel.includes('input[type="file"]')) {
        const inputs = sel.includes('image')
          ? (state.imageInputMounted ? [{ accept: 'image/png,image/jpeg' }] : [])
          : (state.imageInputMounted
              ? [{ accept: 'video/*' }, { accept: 'image/png,image/jpeg' }]
              : [{ accept: 'video/*' }]);
        return {
          async count() { return inputs.length; },
          first() { return this.nth(0); },
          nth(idx) {
            const target = inputs[idx];
            return {
              async count() { return target ? 1 : 0; },
              async isVisible() { return false; },
              async isDisabled() { return false; },
              async getAttribute(name) { return name === 'accept' ? (target?.accept || '') : null; },
              async setInputFiles(files) {
                state.uploadedAccept = target?.accept || '';
                state.uploadedFiles = files;
              },
            };
          },
        };
      }
      if (sel.includes('标题')) {
        return {
          async count() { return state.imageInputMounted ? 1 : 0; },
          first() { return this; },
          nth() { return this; },
          async isVisible() { return state.imageInputMounted; },
          async fill(val) { state.filledTitle = val; },
        };
      }
      if (sel.includes('contenteditable') || sel.includes('textarea')) {
        return {
          async count() { return state.imageInputMounted ? 1 : 0; },
          first() { return this; },
          nth() { return this; },
          async isVisible() { return state.imageInputMounted; },
          async evaluate() { return 'div'; },
          async click() {},
        };
      }
      return {
        async count() { return 0; },
        first() { return this; },
        nth() { return this; },
        async isVisible() { return false; },
      };
    },
    keyboard: {
      async insertText(txt) { state.insertedBody = txt; },
    },
    async close() {},
    once() {},
  };
}
export const chromium = {
  executablePath: () => ${JSON.stringify(mockExe)},
  async launch() {
    return {
      async newContext() {
        return {
          async newPage() { return makeRenderPage(); },
          async close() {},
        };
      },
      async close() {},
    };
  },
  async launchPersistentContext() {
    const p = makeDraftPage();
    return {
      pages: () => [p],
      async newPage() { return p; },
      once() {},
      on() {},
      off() {},
      async close() {},
    };
  },
};
`
    );

    process.env.PLAYWRIGHT_MODULE_PATH = mockPwFile;
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = mockExe;

    const res = await savePlatformDraft({
      platform: 'xiaohongshu',
      bundleDir,
      profileDir: join(tmpDir, 'profile'),
      dryRun: false,
      keepOpen: false,
      loginTimeoutMs: 10000,
      onStatus: () => {},
    });

    assert.equal(res.ok, true);
    assert.equal(res.renderedPngs.length, 4);

    const mockMod = await import(mockPwFile);
    assert.ok(
      mockMod.state.pollStep >= 1,
      'waitForCreatorComposerReady must not exit on pre-mounted video-only input before 上传图文 hydrates'
    );
    assert.equal(mockMod.state.tabClicked, true, 'Must click 上传图文 once hydrated');
    assert.equal(mockMod.state.uploadedAccept, 'image/png,image/jpeg');
    assert.equal(mockMod.state.uploadedFiles.length, 4);
    assert.equal(mockMod.state.filledTitle, '视频输入框竞态测试标题');
    assert.equal(mockMod.state.insertedBody, '图文正文内容');
  } finally {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('renderSvgToPng completes within bounded timeout when external <image> hangs', async (t) => {
  const envInfo = await inspectDraftAutomationEnvironment();
  if (!envInfo.ok) {
    t.skip(`Playwright/Chromium not available on host: ${envInfo.installInstructions}`);
    return;
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-hanging-image-'));
  try {
    const svgPath = join(tmpDir, 'hanging.svg');
    const pngPath = join(tmpDir, 'hanging.png');
    writeFileSync(
      svgPath,
      [
        '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">',
        '  <rect width="1080" height="1440" fill="#18181b" />',
        '  <image href="https://example.invalid/hang.png" x="40" y="40" width="200" height="200" />',
        '</svg>',
      ].join('\n')
    );

    const browser = await envInfo.playwright.chromium.launch({
      headless: true,
      executablePath: envInfo.executablePath,
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 1080, height: 1440 },
        deviceScaleFactor: 1,
      });
      await context.route('**/*hang.png', () => {
        // Intentionally leave request hanging forever
      });
      try {
        const startedAt = Date.now();
        const out = await renderSvgToPng(context, svgPath, pngPath, {
          width: 1080,
          height: 1440,
        });
        const elapsedMs = Date.now() - startedAt;
        assert.equal(out, pngPath);
        assert.ok(
          elapsedMs < 15000,
          `Expected bounded asset timeout (<15000ms), got ${elapsedMs}ms`
        );
        assertValidPngDimensions(pngPath, 1080, 1440);
      } finally {
        await context.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
