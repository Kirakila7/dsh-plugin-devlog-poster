import { execFileSync } from 'node:child_process';
import {
  accessSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const DRAFT_PLATFORMS = {
  xiaohongshu: {
    id: 'xiaohongshu',
    label: '小红书创作者平台',
    url: 'https://creator.xiaohongshu.com/publish/publish?target=image',
    cardType: 'vertical',
    cardSize: { width: 1080, height: 1440 },
    maxTitleChars: 20,
    imageTabText: '上传图文',
    selectors: {
      imageTab:
        '[role="tab"]:has-text("上传图文"), button:has-text("上传图文"), span:has-text("上传图文"), div.creator-tab:has-text("上传图文"), text=上传图文',
      fileInput: 'input[type="file"][accept*="image"], input[type="file"]',
      titleInput: 'input[placeholder*="标题"], input.d-text, input[placeholder*="填写标题"]',
      bodyEditor: '[contenteditable="true"], .ql-editor, #post-textarea, textarea',
      saveDraftBtn: 'button:has-text("暂存离开"), button:has-text("存草稿")',
    },
  },
  bilibili: {
    id: 'bilibili',
    label: 'B站动态',
    url: 'https://t.bilibili.com/',
    cardType: 'horizontal',
    cardSize: { width: 1600, height: 900 },
    selectors: {
      fileInput: 'input[type="file"][accept*="image"], input[type="file"]',
      bodyEditor: '.bili-rich-textarea__inner, [contenteditable="true"], textarea',
      saveDraftBtn: 'button:has-text("存草稿")',
    },
  },
  douyin: {
    id: 'douyin',
    label: '抖音创作者服务平台',
    url: 'https://creator.douyin.com/creator-micro/content/upload',
    cardType: 'vertical',
    cardSize: { width: 1080, height: 1440 },
    maxTitleChars: 30,
    imageTabText: '发布图文',
    selectors: {
      imageTab:
        '[role="tab"]:has-text("发布图文"), button:has-text("发布图文"), span:has-text("发布图文"), text=发布图文',
      fileInput: 'input[type="file"][accept*="image"], input[type="file"]',
      titleInput: 'input[placeholder*="标题"]',
      bodyEditor: '[contenteditable="true"], .zone-container, textarea',
      saveDraftBtn: 'button:has-text("存草稿"), button:has-text("暂存离开")',
    },
  },
};

/**
 * Clamp a platform title cleanly using Unicode codepoints (`[...str]`) so
 * surrogate-pair emojis are never split and result length is <= maxChars.
 */
export function clampPlatformTitle(title, maxChars) {
  const normalized = String(title ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (!Number.isFinite(maxChars) || maxChars <= 0) return normalized;

  const codepoints = [...normalized];
  if (codepoints.length <= maxChars) return normalized;
  if (maxChars === 1) return codepoints[0];

  const prefix = codepoints.slice(0, maxChars - 1).join('').trimEnd();
  return `${prefix || codepoints.slice(0, maxChars - 1).join('')}…`;
}

/**
 * Remove the 30-second oral script section (e.g. `---\n\n【30秒...】`) from
 * Douyin image-carousel captions while keeping the body copy and hashtags intact.
 */
export function stripDouyinOralScript(content) {
  const normalized = String(content ?? '').replace(/\r\n/g, '\n');
  if (!normalized.trim()) return '';

  return normalized
    .replace(
      /\n[ \t]*-{3,}[ \t]*\n+[ \t]*【[^】\n]*(?:30\s*[秒s]|口播)[^】\n]*】[\s\S]*$/i,
      ''
    )
    .replace(/\n+[ \t]*【[^】\n]*30\s*[秒s][^】\n]*】[\s\S]*$/i, '')
    .replace(/^[ \t]*【[^】\n]*30\s*[秒s][^】\n]*】[\s\S]*$/i, '')
    .trim();
}

function resolveBundleAssetPath(bundleDir, rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  if (existsSync(rawPath)) return rawPath;

  const inBundleByName = resolve(bundleDir, basename(rawPath));
  if (existsSync(inBundleByName)) return inBundleByName;

  const inBundleRelative = resolve(bundleDir, rawPath);
  if (existsSync(inBundleRelative)) return inBundleRelative;

  return isAbsolute(rawPath) ? rawPath : inBundleRelative;
}

function readFallbackMarkdown(bundleDir, manifest, platformId) {
  const candidates = [
    resolveBundleAssetPath(bundleDir, manifest.files?.[platformId]),
    resolve(bundleDir, `${platformId}.md`),
  ].filter(Boolean);

  for (const filePath of candidates) {
    if (existsSync(filePath)) {
      try {
        return readFileSync(filePath, 'utf8');
      } catch {
        // ignore unreadable fallback file
      }
    }
  }
  return '';
}

export function loadBundlePlatformPayload(bundleDir, platformId) {
  const manifestPath = resolve(bundleDir, 'bundle.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Bundle manifest not found at ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const platformSpec = DRAFT_PLATFORMS[platformId];
  if (!platformSpec) {
    throw new Error(
      `Unsupported draft platform "${platformId}". Choose from: ${Object.keys(DRAFT_PLATFORMS).join(', ')}`
    );
  }
  const entry = manifest.formatted?.platforms?.[platformId];
  if (!entry) {
    throw new Error(`Platform "${platformId}" content not found in bundle manifest.`);
  }

  let svgPaths = [];
  if (platformSpec.cardType === 'horizontal') {
    const horizontalSvg = resolveBundleAssetPath(bundleDir, manifest.files?.cardHorizontal);
    if (horizontalSvg) svgPaths = [horizontalSvg];
  } else {
    const rawSlides =
      Array.isArray(manifest.files?.slides) && manifest.files.slides.length > 0
        ? manifest.files.slides
        : manifest.files?.cardVertical
          ? [manifest.files.cardVertical]
          : [];
    svgPaths = rawSlides.map((p) => resolveBundleAssetPath(bundleDir, p)).filter(Boolean);
  }

  const pngPaths = svgPaths.map((svg) =>
    resolve(bundleDir, `${basename(svg, extname(svg))}.png`)
  );
  const svgPath = svgPaths[0];
  const pngPath =
    pngPaths[0] ||
    resolve(
      bundleDir,
      platformSpec.cardType === 'horizontal' ? 'card-horizontal.png' : 'card-vertical.png'
    );

  const rawTitle = entry.title || manifest.formatted?.meta?.title || '';
  const title = platformSpec.maxTitleChars
    ? clampPlatformTitle(rawTitle, platformSpec.maxTitleChars)
    : rawTitle;

  let content = entry.content || '';
  if (!content) {
    content = readFallbackMarkdown(bundleDir, manifest, platformId);
  }
  if (platformId === 'douyin') {
    content = stripDouyinOralScript(content);
  }

  return {
    platformSpec,
    title,
    rawTitle,
    content,
    svgPath,
    svgPaths,
    pngPath,
    pngPaths,
  };
}

export function readPngDimensions(pngPath) {
  const buf = readFileSync(pngPath);
  if (buf.length < 24) {
    throw new Error(`Invalid PNG file (too small): ${pngPath}`);
  }
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error(`Invalid PNG magic header: ${pngPath}`);
  }
  const ihdr = buf.subarray(12, 16).toString('ascii');
  if (ihdr !== 'IHDR') {
    throw new Error(`Missing PNG IHDR chunk: ${pngPath}`);
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

function safeReaddir(dirPath) {
  try {
    return readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function readPackageJson(dirPath) {
  try {
    const pkgPath = join(dirPath, 'package.json');
    if (!existsSync(pkgPath)) return null;
    return JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

function resolvePackageEntryFile(pkgDir, pkgJson) {
  const exportEntry = pkgJson?.exports?.['.'];
  const rawCandidates = [];
  if (typeof exportEntry === 'string') {
    rawCandidates.push(exportEntry);
  } else if (exportEntry && typeof exportEntry === 'object') {
    if (typeof exportEntry.import === 'string') rawCandidates.push(exportEntry.import);
    if (typeof exportEntry.default === 'string') rawCandidates.push(exportEntry.default);
    if (typeof exportEntry.require === 'string') rawCandidates.push(exportEntry.require);
  }
  if (typeof pkgJson?.main === 'string') {
    rawCandidates.push(pkgJson.main);
  }
  rawCandidates.push('index.mjs', 'index.js');

  for (const rel of rawCandidates) {
    const abs = resolve(pkgDir, rel);
    if (existsSync(abs)) return abs;
  }
  return null;
}

function collectNodeModulesCandidates(nodeModulesDir, list, sourceTag = nodeModulesDir) {
  if (!nodeModulesDir || !existsSync(nodeModulesDir)) return;
  for (const pkgName of ['playwright', 'playwright-core']) {
    list.push({
      type: 'dir',
      path: join(nodeModulesDir, pkgName),
      source: sourceTag,
    });
  }
}

function collectAncestorNodeModules(startDir, list, sourceTag) {
  if (!startDir) return;
  let current = resolve(startDir);
  while (true) {
    collectNodeModulesCandidates(join(current, 'node_modules'), list, sourceTag);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function collectSubdirNodeModules(baseDir, subParts, list, sourceTag) {
  if (!baseDir || !existsSync(baseDir)) return;
  for (const entry of safeReaddir(baseDir)) {
    if (!entry.isDirectory()) continue;
    const nmDir = join(baseDir, entry.name, ...subParts);
    if (existsSync(nmDir)) {
      for (const pkgName of ['playwright', 'playwright-core']) {
        list.push({
          type: 'dir',
          path: join(nmDir, pkgName),
          source: sourceTag,
        });
      }
    }
  }
}

function collectMsPlaywrightLinks(linksDir, list) {
  if (!linksDir || !existsSync(linksDir)) return;
  for (const entry of safeReaddir(linksDir)) {
    if (entry.isDirectory()) continue;
    const linkFile = join(linksDir, entry.name);
    try {
      const target = readFileSync(linkFile, 'utf8').trim();
      if (!target) continue;
      const siblingPlaywright = join(dirname(target), 'playwright');
      if (existsSync(siblingPlaywright)) {
        list.push({ type: 'dir', path: siblingPlaywright, source: 'ms-playwright-links' });
      }
      list.push({ type: 'dir', path: target, source: 'ms-playwright-links' });
    } catch {
      // ignore unreadable link file
    }
  }
}

function extractPlaywrightModule(mod) {
  if (mod?.chromium) return mod;
  if (mod?.default?.chromium) return mod.default;
  return null;
}

export async function resolvePlaywrightRuntime(options = {}) {
  const {
    env = process.env,
    homeDir = homedir(),
    cwd = process.cwd(),
    importImpl = (specifier) => import(specifier),
    execFileSyncImpl = execFileSync,
    skipStandardImport = false,
  } = options;

  const searchedLocations = [];
  const triedPaths = new Set();

  async function tryDirCandidate(dirPath, source) {
    if (!dirPath) return null;
    let canonical = dirPath;
    try {
      if (existsSync(dirPath)) canonical = realpathSync(dirPath);
    } catch {
      // keep raw path
    }
    if (triedPaths.has(canonical)) return null;
    triedPaths.add(canonical);
    searchedLocations.push(dirPath);

    if (!existsSync(dirPath)) return null;

    let stat;
    try {
      stat = statSync(dirPath);
    } catch {
      return null;
    }

    if (stat.isFile()) {
      try {
        const mod = await importImpl(pathToFileURL(dirPath).href);
        const pw = extractPlaywrightModule(mod);
        if (pw) {
          return {
            found: true,
            playwright: pw,
            packageName: basename(dirname(dirPath)),
            packageVersion: null,
            packageRoot: dirname(dirPath),
            moduleSource: source,
          };
        }
      } catch {
        return null;
      }
      return null;
    }

    const pkgJson = readPackageJson(dirPath);
    if (!pkgJson) return null;
    const entryFile = resolvePackageEntryFile(dirPath, pkgJson);
    if (!entryFile) return null;

    try {
      const mod = await importImpl(pathToFileURL(entryFile).href);
      const pw = extractPlaywrightModule(mod);
      if (!pw) return null;
      return {
        found: true,
        playwright: pw,
        packageName: pkgJson.name || basename(dirPath),
        packageVersion: pkgJson.version || null,
        packageRoot: dirPath,
        moduleSource: source,
      };
    } catch {
      return null;
    }
  }

  // 1. Explicit env override: PLAYWRIGHT_MODULE_PATH / PLAYWRIGHT_PATH
  for (const [envKey, rawVal] of [
    ['PLAYWRIGHT_MODULE_PATH', env.PLAYWRIGHT_MODULE_PATH],
    ['PLAYWRIGHT_PATH', env.PLAYWRIGHT_PATH],
  ]) {
    if (!rawVal) continue;
    const resolvedEnvPath = resolve(cwd, rawVal);
    if (existsSync(resolvedEnvPath)) {
      const hit = await tryDirCandidate(resolvedEnvPath, `env:${envKey}`);
      if (hit) return hit;
    } else {
      searchedLocations.push(rawVal);
      try {
        const mod = await importImpl(rawVal);
        const pw = extractPlaywrightModule(mod);
        if (pw) {
          return {
            found: true,
            playwright: pw,
            packageName: rawVal,
            packageVersion: null,
            packageRoot: null,
            moduleSource: `env:${envKey}`,
          };
        }
      } catch {
        // continue
      }
    }
  }

  // 2. Standard Node ESM import('playwright') / import('playwright-core')
  if (!skipStandardImport) {
    for (const pkgName of ['playwright', 'playwright-core']) {
      searchedLocations.push(`import:${pkgName}`);
      try {
        const mod = await importImpl(pkgName);
        const pw = extractPlaywrightModule(mod);
        if (pw) {
          return {
            found: true,
            playwright: pw,
            packageName: pkgName,
            packageVersion: null,
            packageRoot: null,
            moduleSource: 'node-import',
          };
        }
      } catch {
        // continue
      }
    }
  }

  const candidates = [];

  // 3. NODE_PATH entries
  if (env.NODE_PATH) {
    for (const nodePathDir of env.NODE_PATH.split(delimiter).filter(Boolean)) {
      collectNodeModulesCandidates(nodePathDir, candidates);
    }
  }

  // 4. Local node_modules walking up from cwd & package root
  collectAncestorNodeModules(cwd, candidates, 'local-node_modules');
  collectAncestorNodeModules(PACKAGE_ROOT, candidates, 'package-node_modules');

  // 5. Global npm roots
  const globalRoots = [];
  if (env.npm_config_prefix) {
    globalRoots.push(join(env.npm_config_prefix, 'lib', 'node_modules'));
  }
  try {
    const pathParts = [
      dirname(process.execPath),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      env.PATH || '',
    ].filter(Boolean);
    const npmRoot = execFileSyncImpl('npm', ['root', '-g'], {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...env, PATH: pathParts.join(delimiter) },
    }).trim();
    if (npmRoot) globalRoots.push(npmRoot);
  } catch {
    // npm may not be available in minimal environments
  }
  globalRoots.push('/opt/homebrew/lib/node_modules', '/usr/local/lib/node_modules');
  for (const rootDir of globalRoots) {
    if (!existsSync(rootDir)) continue;
    for (const pkgName of ['playwright', 'playwright-core']) {
      candidates.push({
        type: 'dir',
        path: join(rootDir, pkgName),
        source: 'global-npm',
      });
    }
  }

  // 6. Playwright .links/* caches
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
    collectMsPlaywrightLinks(join(env.PLAYWRIGHT_BROWSERS_PATH, '.links'), candidates);
  }
  collectMsPlaywrightLinks(join(homeDir, 'Library', 'Caches', 'ms-playwright', '.links'), candidates);
  collectMsPlaywrightLinks(join(homeDir, '.cache', 'ms-playwright', '.links'), candidates);

  // 7. Known agent/CLI runtime caches (codex-runtimes, npx, nvm, bun, pnpm)
  collectSubdirNodeModules(
    join(homeDir, '.cache', 'codex-runtimes'),
    ['dependencies', 'node', 'node_modules'],
    candidates,
    'codex-runtimes'
  );
  collectSubdirNodeModules(
    join(homeDir, '.npm', '_npx'),
    ['node_modules'],
    candidates,
    'npm-npx-cache'
  );
  collectSubdirNodeModules(
    join(homeDir, '.nvm', 'versions', 'node'),
    ['lib', 'node_modules'],
    candidates,
    'nvm-global'
  );
  const bunGlobal = join(homeDir, '.bun', 'install', 'global', 'node_modules');
  if (existsSync(bunGlobal)) {
    for (const pkgName of ['playwright', 'playwright-core']) {
      candidates.push({ type: 'dir', path: join(bunGlobal, pkgName), source: 'bun-global' });
    }
  }
  collectSubdirNodeModules(
    join(homeDir, 'Library', 'pnpm', 'global'),
    ['node_modules'],
    candidates,
    'pnpm-global'
  );
  collectSubdirNodeModules(
    join(homeDir, '.local', 'share', 'pnpm', 'global'),
    ['node_modules'],
    candidates,
    'pnpm-global'
  );

  for (const candidate of candidates) {
    const hit = await tryDirCandidate(candidate.path, candidate.source);
    if (hit) return hit;
  }

  return {
    found: false,
    playwright: null,
    packageName: null,
    packageVersion: null,
    packageRoot: null,
    moduleSource: null,
    searchedLocations,
  };
}

function isUsableExecutable(filePath, platform = process.platform) {
  if (!filePath || !existsSync(filePath)) return false;
  if (platform === 'win32') return true;
  try {
    accessSync(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function extractRevision(text) {
  const match = String(text || '').match(/chromium-(\d+)/);
  return match ? Number(match[1]) : null;
}

function getCachedChromiumBinarySubpaths(platform = process.platform) {
  if (platform === 'darwin') {
    return [
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  if (platform === 'win32') {
    return ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe'];
  }
  return ['chrome-linux64/chrome', 'chrome-linux/chrome'];
}

function getSystemBrowserCandidates(platform = process.platform) {
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }
  if (platform === 'win32') {
    return [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
}

export function findCachedChromiumExecutable(options = {}) {
  const {
    playwright = null,
    env = process.env,
    homeDir = homedir(),
    platform = process.platform,
    includeSystemFallback = true,
  } = options;

  // 1. Explicit executable path overrides
  for (const [envKey, rawExe] of [
    ['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH', env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH],
    ['CHROMIUM_PATH', env.CHROMIUM_PATH],
  ]) {
    if (rawExe && isUsableExecutable(rawExe, platform)) {
      return {
        found: true,
        executablePath: rawExe,
        source: `env:${envKey}`,
        revision: extractRevision(rawExe),
      };
    }
  }

  // 2. Playwright's own expected executablePath (only if actually present on disk)
  try {
    const pwExe = playwright?.chromium?.executablePath?.();
    if (pwExe && isUsableExecutable(pwExe, platform)) {
      return {
        found: true,
        executablePath: pwExe,
        source: 'playwright-default',
        revision: extractRevision(pwExe),
      };
    }
  } catch {
    // ignore if executablePath() throws
  }

  // 3. Cached ms-playwright directories (newest chromium-* revision first)
  const browserRoots = [
    env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== '0'
      ? env.PLAYWRIGHT_BROWSERS_PATH
      : null,
    join(homeDir, 'Library', 'Caches', 'ms-playwright'),
    join(homeDir, '.cache', 'ms-playwright'),
  ].filter(Boolean);

  const subpaths = getCachedChromiumBinarySubpaths(platform);
  const revisionDirs = [];
  for (const rootDir of browserRoots) {
    if (!existsSync(rootDir)) continue;
    for (const entry of safeReaddir(rootDir)) {
      if (!entry.isDirectory()) continue;
      const match = entry.name.match(/^chromium-(\d+)$/);
      if (!match) continue;
      revisionDirs.push({
        revision: Number(match[1]),
        dir: join(rootDir, entry.name),
      });
    }
  }
  revisionDirs.sort((a, b) => b.revision - a.revision);

  for (const item of revisionDirs) {
    for (const relBin of subpaths) {
      const candidate = join(item.dir, relBin);
      if (isUsableExecutable(candidate, platform)) {
        return {
          found: true,
          executablePath: candidate,
          source: 'ms-playwright-cache',
          revision: item.revision,
        };
      }
    }
  }

  // 4. System Chrome / Chromium fallbacks
  if (includeSystemFallback) {
    for (const sysBin of getSystemBrowserCandidates(platform)) {
      if (isUsableExecutable(sysBin, platform)) {
        return {
          found: true,
          executablePath: sysBin,
          source: 'system-browser',
          revision: null,
        };
      }
    }
  }

  return {
    found: false,
    executablePath: null,
    source: null,
    revision: null,
  };
}

export async function inspectDraftAutomationEnvironment(options = {}) {
  const runtime = await resolvePlaywrightRuntime(options);
  const browser = findCachedChromiumExecutable({
    ...options,
    playwright: runtime.playwright,
  });

  const playwrightFound = runtime.found;
  const chromiumFound = browser.found;
  const ok = playwrightFound && chromiumFound;

  let missingReason = null;
  let installInstructions = '';
  if (!playwrightFound) {
    missingReason = 'PLAYWRIGHT_NOT_INSTALLED';
    installInstructions =
      'Run `npm install playwright && npx playwright install chromium` (or set PLAYWRIGHT_MODULE_PATH to an existing playwright/playwright-core installation).';
  } else if (!chromiumFound) {
    missingReason = 'CHROMIUM_NOT_INSTALLED';
    installInstructions =
      'Run `npx playwright install chromium` (or `npm install playwright && npx playwright install chromium`, or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH).';
  }

  return {
    ok,
    playwrightFound,
    packageName: runtime.packageName,
    packageVersion: runtime.packageVersion,
    packageRoot: runtime.packageRoot,
    moduleSource: runtime.moduleSource,
    playwright: runtime.playwright,
    chromiumFound,
    executablePath: browser.executablePath,
    chromiumSource: browser.source,
    chromiumRevision: browser.revision,
    missingReason,
    installInstructions,
  };
}

function buildSvgHtmlDocument(svgContent, { width, height }) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        background: transparent;
      }
      body > svg {
        display: block;
        width: ${width}px;
        height: ${height}px;
      }
    </style>
  </head>
  <body>${svgContent}</body>
</html>`;
}

async function waitForPageAssetsReady(page, assetTimeoutMs = 5000) {
  await page.evaluate(async (timeoutMs) => {
    const withTimeout = (promise) => {
      let timerId;
      return Promise.race([
        promise,
        new Promise((res) => {
          timerId = setTimeout(res, timeoutMs);
        }),
      ]).finally(() => {
        if (timerId !== undefined) clearTimeout(timerId);
      });
    };

    if (document.fonts && document.fonts.ready) {
      await withTimeout(document.fonts.ready.catch(() => {}));
    }
    const elements = Array.from(document.querySelectorAll('img, image'));
    await Promise.all(
      elements.map(async (el) => {
        if (el.tagName && el.tagName.toLowerCase() === 'img') {
          await withTimeout(
            (async () => {
              if (!el.complete) {
                await new Promise((res) => {
                  el.addEventListener('load', res, { once: true });
                  el.addEventListener('error', res, { once: true });
                });
              }
              if (typeof el.decode === 'function') {
                await el.decode().catch(() => {});
              }
            })()
          );
        } else {
          const href =
            el.getAttribute('href') ||
            el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
          if (href) {
            await withTimeout(
              new Promise((res) => {
                const probe = new Image();
                probe.onload = () => {
                  if (typeof probe.decode === 'function') {
                    probe.decode().catch(() => {}).finally(res);
                  } else {
                    res();
                  }
                };
                probe.onerror = () => res();
                probe.src = href;
                if (probe.complete) {
                  if (typeof probe.decode === 'function') {
                    probe.decode().catch(() => {}).finally(res);
                  } else {
                    res();
                  }
                }
              })
            );
          }
        }
      })
    );
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  }, assetTimeoutMs);
}

export async function renderSvgToPng(browserOrContext, svgPath, pngPath, { width, height }) {
  if (!svgPath || !existsSync(svgPath)) return null;
  const svgContent = readFileSync(svgPath, 'utf8');
  mkdirSync(dirname(pngPath), { recursive: true });

  const isBrowserInstance = typeof browserOrContext?.newContext === 'function';
  const context = isBrowserInstance
    ? await browserOrContext.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
      })
    : browserOrContext;

  const page = await context.newPage();
  try {
    if (!isBrowserInstance && typeof page.setViewportSize === 'function') {
      await page.setViewportSize({ width, height });
    }
    await page.setContent(buildSvgHtmlDocument(svgContent, { width, height }), {
      waitUntil: 'domcontentloaded',
    });
    await waitForPageAssetsReady(page);
    await page.screenshot({
      path: pngPath,
      type: 'png',
      clip: { x: 0, y: 0, width, height },
      scale: 'css',
    });

    const dims = readPngDimensions(pngPath);
    if (dims.width !== width || dims.height !== height) {
      throw new Error(
        `Rendered PNG dimension mismatch for ${pngPath}: expected ${width}x${height}, got ${dims.width}x${dims.height}`
      );
    }
    return pngPath;
  } finally {
    await page.close().catch(() => {});
    if (isBrowserInstance) {
      await context.close().catch(() => {});
    }
  }
}

export async function renderSlidesToPngs(
  items,
  { width, height, playwright = null, executablePath = null } = {}
) {
  const validItems = (items || []).filter((item) => item?.svgPath && existsSync(item.svgPath));
  if (validItems.length === 0) return [];

  let pw = playwright;
  let exe = executablePath;
  if (!pw?.chromium || !exe) {
    const envInfo = await inspectDraftAutomationEnvironment();
    if (!pw?.chromium) {
      if (!envInfo.playwrightFound) {
        throw new Error(`PLAYWRIGHT_NOT_INSTALLED: ${envInfo.installInstructions}`);
      }
      pw = envInfo.playwright;
    }
    if (!exe) {
      exe = envInfo.executablePath;
    }
  }

  const browser = await pw.chromium.launch({
    headless: true,
    ...(exe ? { executablePath: exe } : {}),
  });

  try {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    try {
      const rendered = [];
      for (const item of validItems) {
        const outPath = await renderSvgToPng(context, item.svgPath, item.pngPath, {
          width,
          height,
        });
        if (outPath) rendered.push(outPath);
      }
      return rendered;
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

function isLoginPageUrl(url) {
  const lower = String(url || '').toLowerCase();
  return (
    lower.includes('/login') ||
    lower.includes('passport.') ||
    lower.includes('/signin') ||
    lower.includes('sso.')
  );
}

async function hasVisibleLocator(page, selectorList) {
  if (!selectorList) return false;
  const parts = selectorList
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const sel of parts) {
    try {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
        return true;
      }
    } catch {
      // ignore selector error on dynamic page
    }
  }
  return false;
}

async function isVideoOnlyFileInput(locatorItem) {
  if (typeof locatorItem?.getAttribute !== 'function') return false;
  const accept = String((await locatorItem.getAttribute('accept').catch(() => '')) || '').toLowerCase();
  return Boolean(accept && accept.includes('video') && !accept.includes('image'));
}

async function hasAttachedFileInput(page, selectorList, { ignoreVideoOnly = false } = {}) {
  if (!selectorList) return false;
  const parts = selectorList
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const sel of parts) {
    try {
      const loc = page.locator(sel);
      const count = await loc.count();
      for (let i = 0; i < count; i++) {
        const item = typeof loc.nth === 'function' ? loc.nth(i) : loc.first();
        if (ignoreVideoOnly) {
          const disabled =
            typeof item.isDisabled === 'function'
              ? await item.isDisabled().catch(() => false)
              : false;
          if (disabled) continue;
          if (await isVideoOnlyFileInput(item)) continue;
        }
        return true;
      }
    } catch {
      // ignore selector error
    }
  }
  return false;
}

async function clickImageTabIfPresent(page, platformSpec, { isClosed = () => page.isClosed() } = {}) {
  const tryClickOnce = async () => {
    const exactText = platformSpec.imageTabText;
    if (exactText && typeof page.getByText === 'function') {
      try {
        const exactMatches = page.getByText(exactText, { exact: true });
        const count = await exactMatches.count();
        for (let i = 0; i < count; i++) {
          const candidate = exactMatches.nth(i);
          if (await candidate.isVisible().catch(() => false)) {
            await candidate.click({ timeout: 3000 });
            return true;
          }
        }
      } catch {
        // fall back to selector list
      }
    }

    const selectorList = platformSpec.selectors?.imageTab;
    if (!selectorList) return false;
    for (const sel of selectorList.split(',').map((s) => s.trim()).filter(Boolean)) {
      try {
        const loc = page.locator(sel).first();
        if ((await loc.count()) > 0 && (await loc.isVisible().catch(() => false))) {
          await loc.click({ timeout: 3000 });
          return true;
        }
      } catch {
        // try next selector
      }
    }
    return false;
  };

  if (await tryClickOnce()) return true;

  if (platformSpec.imageTabText) {
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !isClosed()) {
      const hasImageFile = await hasAttachedFileInput(page, platformSpec.selectors?.fileInput, {
        ignoreVideoOnly: true,
      });
      if (hasImageFile) return false;
      await page.waitForTimeout(250).catch(() => {});
      if (isClosed()) return false;
      if (await tryClickOnce()) return true;
    }
  }
  return false;
}

async function waitForFileInput(
  page,
  selectorList,
  timeoutMs = 15000,
  { isClosed = () => page.isClosed() } = {}
) {
  const startTime = Date.now();
  const deadline = startTime + timeoutMs;
  const imagePriorityDeadline = startTime + Math.min(2500, Math.floor(timeoutMs / 3));
  const selectors = String(selectorList || 'input[type="file"]')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  while (Date.now() < deadline && !isClosed()) {
    const preferImageAccept = Date.now() < imagePriorityDeadline;
    const activeSelectors = preferImageAccept
      ? selectors.filter((s) => s.includes('image'))
      : selectors;
    const passSelectors = activeSelectors.length > 0 ? activeSelectors : selectors;

    for (const sel of passSelectors) {
      if (isClosed()) return null;
      try {
        const loc = page.locator(sel);
        const count = await loc.count();
        for (let i = 0; i < count; i++) {
          const item = loc.nth(i);
          const disabled = await item.isDisabled().catch(() => false);
          if (disabled) continue;
          if (await isVideoOnlyFileInput(item)) {
            continue;
          }
          return item;
        }
      } catch {
        // ignore during transitions
      }
    }
    await page.waitForTimeout(400).catch(() => {});
    if (isClosed()) return null;
  }
  return null;
}

async function waitForVisibleLocator(
  page,
  selectorList,
  timeoutMs = 30000,
  { isClosed = () => page.isClosed() } = {}
) {
  if (!selectorList) return null;
  const deadline = Date.now() + timeoutMs;
  const selectors = selectorList
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  while (Date.now() < deadline && !isClosed()) {
    for (const sel of selectors) {
      if (isClosed()) return null;
      try {
        const loc = page.locator(sel);
        const count = await loc.count();
        for (let i = 0; i < count; i++) {
          const candidate = loc.nth(i);
          if (await candidate.isVisible().catch(() => false)) {
            return candidate;
          }
        }
      } catch {
        // ignore during transitions
      }
    }
    await page.waitForTimeout(500).catch(() => {});
    if (isClosed()) return null;
  }
  return null;
}

async function waitForCreatorComposerReady(
  page,
  browserContext,
  platformSpec,
  { loginTimeoutMs = 300000, emitStatus }
) {
  let contextClosed = false;
  const onClose = () => {
    contextClosed = true;
  };
  browserContext.once('close', onClose);

  const deadline = Date.now() + loginTimeoutMs;
  let notifiedLoginWait = false;
  let sawLoginUrl = false;
  let lastRedirectAt = 0;
  let lastRedirectFromUrl = '';
  const startTime = Date.now();
  const targetUrlObj = new URL(platformSpec.url);

  try {
    while (Date.now() < deadline) {
      if (contextClosed || page.isClosed()) {
        return { ready: false, reason: 'BROWSER_CLOSED' };
      }

      const currentUrl = page.url();
      const onLoginUrl = isLoginPageUrl(currentUrl);
      if (onLoginUrl) sawLoginUrl = true;
      const hasTab = await hasVisibleLocator(page, platformSpec.selectors.imageTab);
      const hasFile = await hasAttachedFileInput(page, platformSpec.selectors.fileInput, {
        ignoreVideoOnly: true,
      });
      const hasBody = await hasVisibleLocator(page, platformSpec.selectors.bodyEditor);

      if (contextClosed || page.isClosed()) {
        return { ready: false, reason: 'BROWSER_CLOSED' };
      }

      if (!onLoginUrl && (hasTab || hasFile || hasBody)) {
        return { ready: true, waitedForLogin: notifiedLoginWait };
      }

      // Some creator portals land on a home dashboard after QR login instead of the publish URL.
      // Only redirect when off the target publish pathname and with a cooldown to avoid reload loops.
      if (!onLoginUrl && (sawLoginUrl || notifiedLoginWait)) {
        let onTargetPath = false;
        try {
          const curUrlObj = new URL(currentUrl);
          onTargetPath =
            curUrlObj.origin === targetUrlObj.origin &&
            curUrlObj.pathname === targetUrlObj.pathname;
        } catch {
          onTargetPath = currentUrl.startsWith(platformSpec.url.split('?')[0]);
        }
        const canRedirect =
          currentUrl.startsWith(targetUrlObj.origin) &&
          !onTargetPath &&
          currentUrl !== lastRedirectFromUrl &&
          Date.now() - lastRedirectAt > 10000;
        if (canRedirect) {
          lastRedirectAt = Date.now();
          lastRedirectFromUrl = currentUrl;
          await page
            .goto(platformSpec.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
            .catch(() => {});
          await page.waitForTimeout(1200).catch(() => {});
          if (contextClosed || page.isClosed()) {
            return { ready: false, reason: 'BROWSER_CLOSED' };
          }
          continue;
        }
      }

      if (!notifiedLoginWait && (onLoginUrl || Date.now() - startTime >= 2500)) {
        notifiedLoginWait = true;
        emitStatus(
          `⏳ Waiting for ${platformSpec.label} login (please scan the QR code in the opened browser window)...`
        );
      }

      await page.waitForTimeout(1500).catch(() => {});
      if (contextClosed || page.isClosed()) {
        return { ready: false, reason: 'BROWSER_CLOSED' };
      }
    }

    return { ready: false, reason: 'LOGIN_TIMEOUT' };
  } finally {
    browserContext.off?.('close', onClose);
  }
}

function waitForContextClose(browserContext) {
  return new Promise((resolveClose) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolveClose();
    };

    const checkAllPagesClosed = () => {
      setTimeout(async () => {
        if (settled) return;
        try {
          if (browserContext.pages().length === 0) {
            await browserContext.close().catch(() => {});
            finish();
          }
        } catch {
          finish();
        }
      }, 600);
    };

    const watchPage = (page) => {
      page.once('close', checkAllPagesClosed);
    };

    browserContext.once('close', finish);
    browserContext.on('page', watchPage);

    try {
      const pages = browserContext.pages();
      if (pages.length === 0) {
        finish();
      } else {
        for (const p of pages) watchPage(p);
      }
    } catch {
      finish();
    }
  });
}

/**
 * Fill platform creator page as a draft using an isolated Playwright persistent browser.
 * Never clicks the final "Publish" button and keeps the browser open by default for review.
 */
export async function savePlatformDraft({
  platform = 'xiaohongshu',
  bundleDir,
  profileDir = join(homedir(), '.dsh-devlog-poster', 'browser-profile'),
  dryRun = true,
  keepOpen = true,
  keepOpenMs = 0,
  waitForClose = false,
  loginTimeoutMs = 300000,
  autoSaveDraft = false,
  onStatus = null,
} = {}) {
  const payload = loadBundlePlatformPayload(bundleDir, platform);
  const { platformSpec, title, rawTitle, content, svgPath, svgPaths, pngPath, pngPaths } = payload;

  const slideCount = svgPaths.length;
  const plan = {
    ok: true,
    dryRun: true,
    platform: platformSpec.id,
    label: platformSpec.label,
    url: platformSpec.url,
    profileDir,
    title,
    rawTitle,
    contentPreview: content.slice(0, 140),
    contentLength: content.length,
    svgPath,
    svgPaths,
    pngPath,
    pngPaths,
    slideCount,
    steps: [
      `Render ${slideCount || 1} ${platformSpec.cardType} SVG slide(s) to ${platformSpec.cardSize.width}x${platformSpec.cardSize.height} PNG(s)`,
      `Launch isolated Chromium with persistent profile (${profileDir})`,
      `Navigate to ${platformSpec.url} and wait cleanly for QR login if needed`,
      ...(platformSpec.imageTabText
        ? [`Switch to "${platformSpec.imageTabText}" image-post tab`]
        : []),
      `Upload ${pngPaths.length || 1} PNG image(s) + fill formatted title & caption`,
      'Keep browser open for manual review/save (NEVER auto-click Publish)',
    ],
  };

  if (dryRun) {
    return plan;
  }

  const emitStatus = (msg) => {
    if (typeof onStatus === 'function') {
      onStatus(msg);
    } else {
      console.error(msg);
    }
  };

  const envInfo = await inspectDraftAutomationEnvironment();
  if (!envInfo.playwrightFound) {
    return {
      ok: false,
      dryRun: false,
      platform: platformSpec.id,
      error: 'PLAYWRIGHT_NOT_INSTALLED',
      message: `Playwright is optional and not installed yet. ${envInfo.installInstructions}`,
      instructions: envInfo.installInstructions,
      plan,
    };
  }
  if (!envInfo.chromiumFound) {
    return {
      ok: false,
      dryRun: false,
      platform: platformSpec.id,
      error: 'CHROMIUM_NOT_INSTALLED',
      message: `Playwright (${envInfo.packageName}) was found, but no Chromium browser binary was detected. ${envInfo.installInstructions}`,
      instructions: envInfo.installInstructions,
      plan,
    };
  }

  const notes = [];
  const renderItems = svgPaths.map((sPath, idx) => ({
    svgPath: sPath,
    pngPath: pngPaths[idx],
  }));

  emitStatus(
    `🖼️  Rendering ${renderItems.length} ${platformSpec.cardType} SVG slide(s) to ${platformSpec.cardSize.width}×${platformSpec.cardSize.height} PNG...`
  );
  const renderedPngs = await renderSlidesToPngs(renderItems, {
    width: platformSpec.cardSize.width,
    height: platformSpec.cardSize.height,
    playwright: envInfo.playwright,
    executablePath: envInfo.executablePath,
  });
  const renderedPng = renderedPngs[0] || null;
  if (renderedPngs.length > 0) {
    notes.push(
      `Rendered ${renderedPngs.length} PNG(s) at ${platformSpec.cardSize.width}x${platformSpec.cardSize.height}: ${renderedPngs.map((p) => basename(p)).join(', ')}`
    );
  }

  mkdirSync(profileDir, { recursive: true });
  emitStatus(`🌐 Launching Chromium persistent profile (${profileDir})...`);
  const browserContext = await envInfo.playwright.chromium.launchPersistentContext(profileDir, {
    headless: false,
    executablePath: envInfo.executablePath,
    viewport: { width: 1360, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  let shouldCloseOnExit = keepOpen === false;
  let contextClosed = false;
  let page = null;
  const onContextClose = () => {
    contextClosed = true;
  };
  browserContext.once?.('close', onContextClose);

  const isAutomationClosed = () => contextClosed || Boolean(page?.isClosed?.());
  const isTargetClosedError = (err) =>
    err?.name === 'TargetClosedError' ||
    /Target page, context or browser has been closed|Target closed|has been closed/i.test(
      err?.message || ''
    );
  const buildClosedResult = () => {
    shouldCloseOnExit = true;
    return {
      ok: false,
      dryRun: false,
      platform: platformSpec.id,
      error: 'BROWSER_CLOSED',
      message: `Browser was closed before ${platformSpec.label} draft could be filled.`,
      plan,
      renderedPng,
      renderedPngs,
      notes,
      savedDraft: false,
      browserKeptOpen: false,
    };
  };

  try {
    const existingPages = browserContext.pages();
    page = existingPages.length > 0 ? existingPages[0] : await browserContext.newPage();
    if (isAutomationClosed()) {
      return buildClosedResult();
    }
    await page.goto(platformSpec.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (isAutomationClosed()) {
      return buildClosedResult();
    }

    const loginState = await waitForCreatorComposerReady(page, browserContext, platformSpec, {
      loginTimeoutMs,
      emitStatus,
    });
    if (!loginState.ready) {
      shouldCloseOnExit = true;
      return {
        ok: false,
        dryRun: false,
        platform: platformSpec.id,
        error: loginState.reason,
        message:
          loginState.reason === 'BROWSER_CLOSED'
            ? 'Browser window was closed before creator draft automation completed.'
            : `Timed out after ${Math.round(loginTimeoutMs / 1000)}s waiting for ${platformSpec.label} login.`,
        renderedPng,
        renderedPngs,
        notes,
        browserKeptOpen: false,
      };
    }
    if (isAutomationClosed()) {
      return buildClosedResult();
    }

    if (loginState.waitedForLogin) {
      notes.push('Completed interactive QR login in persistent profile');
    }

    // Switch to image-post tab (e.g. 上传图文 on Xiaohongshu, 发布图文 on Douyin)
    if (platformSpec.selectors.imageTab || platformSpec.imageTabText) {
      const switched = await clickImageTabIfPresent(page, platformSpec, {
        isClosed: isAutomationClosed,
      });
      if (isAutomationClosed()) {
        return buildClosedResult();
      }
      if (switched) {
        notes.push(`Selected image-post tab (${platformSpec.imageTabText || 'image'})`);
        await page.waitForTimeout(1000).catch(() => {});
        if (isAutomationClosed()) {
          return buildClosedResult();
        }
      }
    }

    // Upload all rendered PNGs
    if (renderedPngs.length > 0 && platformSpec.selectors.fileInput) {
      const fileInput = await waitForFileInput(page, platformSpec.selectors.fileInput, 15000, {
        isClosed: isAutomationClosed,
      });
      if (isAutomationClosed()) {
        return buildClosedResult();
      }
      if (fileInput) {
        try {
          await fileInput.setInputFiles(renderedPngs);
        } catch (err) {
          if (isAutomationClosed() || isTargetClosedError(err)) {
            return buildClosedResult();
          }
          throw err;
        }
        if (isAutomationClosed()) {
          return buildClosedResult();
        }
        notes.push(`Uploaded ${renderedPngs.length} PNG image(s) to file input`);
      } else {
        notes.push('File input not found after login check; upload images manually if needed');
      }
    }

    // Wait for title/body editor controls to mount after image upload
    if (title && platformSpec.selectors.titleInput) {
      const titleEl = await waitForVisibleLocator(page, platformSpec.selectors.titleInput, 30000, {
        isClosed: isAutomationClosed,
      });
      if (isAutomationClosed()) {
        return buildClosedResult();
      }
      if (titleEl) {
        let titleFillErr = null;
        await titleEl.fill(title).catch((err) => {
          titleFillErr = err;
        });
        if (isAutomationClosed() || isTargetClosedError(titleFillErr)) {
          return buildClosedResult();
        }
        notes.push(`Filled post title (${[...title].length} chars)`);
      }
    }

    if (content && platformSpec.selectors.bodyEditor) {
      const bodyEl = await waitForVisibleLocator(page, platformSpec.selectors.bodyEditor, 30000, {
        isClosed: isAutomationClosed,
      });
      if (isAutomationClosed()) {
        return buildClosedResult();
      }
      if (bodyEl) {
        let bodyErr = null;
        const tagName = await bodyEl
          .evaluate((el) => el.tagName?.toLowerCase() || '')
          .catch((err) => {
            bodyErr = err;
            return '';
          });
        if (isAutomationClosed() || isTargetClosedError(bodyErr)) {
          return buildClosedResult();
        }
        if (tagName === 'textarea' || tagName === 'input') {
          await bodyEl.fill(content).catch((err) => {
            bodyErr = err;
          });
          if (isAutomationClosed() || isTargetClosedError(bodyErr)) {
            return buildClosedResult();
          }
        } else {
          await bodyEl.click().catch((err) => {
            bodyErr = err;
          });
          if (isAutomationClosed() || isTargetClosedError(bodyErr)) {
            return buildClosedResult();
          }
          await page.keyboard.insertText(content).catch((err) => {
            bodyErr = err;
          });
          if (isAutomationClosed() || isTargetClosedError(bodyErr)) {
            return buildClosedResult();
          }
        }
        notes.push(`Inserted post caption (${content.length} chars)`);
      }
    }

    // Never auto-click Publish. Only click Save Draft if explicitly requested via autoSaveDraft.
    let savedDraft = false;
    if (autoSaveDraft && platformSpec.selectors.saveDraftBtn) {
      const draftBtn = await waitForVisibleLocator(
        page,
        platformSpec.selectors.saveDraftBtn,
        5000,
        { isClosed: isAutomationClosed }
      );
      if (isAutomationClosed()) {
        return buildClosedResult();
      }
      if (draftBtn) {
        let draftErr = null;
        await draftBtn.click().catch((err) => {
          draftErr = err;
        });
        if (isAutomationClosed() || isTargetClosedError(draftErr)) {
          return buildClosedResult();
        }
        savedDraft = true;
        notes.push('Clicked Save Draft button');
      }
    } else {
      notes.push('Left draft open in browser for manual review (Publish is NEVER clicked)');
    }

    if (isAutomationClosed()) {
      return buildClosedResult();
    }

    if (keepOpenMs > 0) {
      await page.waitForTimeout(keepOpenMs).catch(() => {});
      if (isAutomationClosed()) {
        shouldCloseOnExit = true;
      }
    }

    const stillOpen = keepOpen !== false && !isAutomationClosed();
    if (!stillOpen) {
      shouldCloseOnExit = true;
    }

    const result = {
      ok: true,
      dryRun: false,
      platform: platformSpec.id,
      url: isAutomationClosed() ? platformSpec.url : page.url(),
      title,
      renderedPng,
      renderedPngs,
      savedDraft,
      browserKeptOpen: stillOpen,
      notes,
    };

    if (stillOpen) {
      Object.defineProperty(result, 'waitForClose', {
        value: () => waitForContextClose(browserContext),
        enumerable: false,
      });
      if (waitForClose) {
        await waitForContextClose(browserContext);
      }
    }

    return result;
  } catch (err) {
    if (isAutomationClosed() || isTargetClosedError(err)) {
      return buildClosedResult();
    }
    shouldCloseOnExit = true;
    throw err;
  } finally {
    if (typeof browserContext.off === 'function') {
      browserContext.off('close', onContextClose);
    } else if (typeof browserContext.removeListener === 'function') {
      browserContext.removeListener('close', onContextClose);
    }
    if (shouldCloseOnExit) {
      await browserContext.close().catch(() => {});
    }
  }
}
