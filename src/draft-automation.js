import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const DRAFT_PLATFORMS = {
  xiaohongshu: {
    id: 'xiaohongshu',
    label: '小红书创作者平台',
    url: 'https://creator.xiaohongshu.com/publish/publish?target=image',
    cardType: 'vertical',
    cardSize: { width: 1080, height: 1440 },
    selectors: {
      fileInput: 'input[type="file"]',
      titleInput: 'input[placeholder*="标题"], input.d-text',
      bodyEditor: '[contenteditable="true"], .ql-editor, textarea',
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
      fileInput: 'input[type="file"]',
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
    selectors: {
      imageTab: 'text=发布图文, span:has-text("发布图文")',
      fileInput: 'input[type="file"]',
      titleInput: 'input[placeholder*="标题"]',
      bodyEditor: '[contenteditable="true"], .zone-container, textarea',
      saveDraftBtn: 'button:has-text("存草稿"), button:has-text("暂存离开")',
    },
  },
};

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
  const svgPath =
    platformSpec.cardType === 'horizontal'
      ? manifest.files?.cardHorizontal
      : manifest.files?.cardVertical;

  return {
    platformSpec,
    title: entry.title || manifest.formatted?.meta?.title || '',
    content: entry.content || '',
    svgPath,
    pngPath: resolve(
      bundleDir,
      platformSpec.cardType === 'horizontal' ? 'card-horizontal.png' : 'card-vertical.png'
    ),
  };
}

async function tryImportPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return null;
  }
}

async function renderSvgToPng(context, svgPath, pngPath, { width, height }) {
  if (!svgPath || !existsSync(svgPath)) return null;
  const svgContent = readFileSync(svgPath, 'utf8');
  const page = await context.newPage({ viewport: { width, height } });
  try {
    await page.setContent(
      `<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden;background:transparent">${svgContent}</body></html>`
    );
    await page.screenshot({ path: pngPath, type: 'png' });
    return pngPath;
  } finally {
    await page.close();
  }
}

/**
 * Fill platform creator page and save as draft using an isolated Playwright persistent browser.
 * Never clicks final "Publish" button and never hijacks the main desktop mouse.
 */
export async function savePlatformDraft({
  platform = 'xiaohongshu',
  bundleDir,
  profileDir = join(homedir(), '.dsh-devlog-poster', 'browser-profile'),
  dryRun = true,
  keepOpenMs = 8000,
} = {}) {
  const payload = loadBundlePlatformPayload(bundleDir, platform);
  const { platformSpec, title, content, svgPath, pngPath } = payload;

  const plan = {
    ok: true,
    dryRun: true,
    platform: platformSpec.id,
    label: platformSpec.label,
    url: platformSpec.url,
    profileDir,
    title,
    contentPreview: content.slice(0, 140),
    svgPath,
    pngPath,
    steps: [
      `Launch isolated Chromium with persistent profile (${profileDir})`,
      `Render ${platformSpec.cardType} SVG card to PNG (${pngPath})`,
      `Navigate to ${platformSpec.url} (if not logged in, wait for manual login)`,
      'Upload card PNG + fill title & body copy',
      'Click "Save Draft" or pause on preview (NEVER auto-publish)',
    ],
  };

  if (dryRun) {
    return plan;
  }

  const playwright = await tryImportPlaywright();
  if (!playwright?.chromium) {
    return {
      ok: false,
      dryRun: false,
      platform: platformSpec.id,
      error: 'PLAYWRIGHT_NOT_INSTALLED',
      message:
        'Playwright is optional and not installed yet. Run `npm install playwright && npx playwright install chromium` to enable browser draft automation.',
      plan,
    };
  }

  mkdirSync(profileDir, { recursive: true });
  const browserContext = await playwright.chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1360, height: 900 },
  });

  const notes = [];
  try {
    const renderedPng = await renderSvgToPng(
      browserContext,
      svgPath,
      pngPath,
      platformSpec.cardSize
    );
    if (renderedPng) notes.push(`Rendered PNG card: ${renderedPng}`);

    const page = await browserContext.newPage();
    await page.goto(platformSpec.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Optional tab switch (e.g. Douyin image post tab)
    if (platformSpec.selectors.imageTab) {
      const tab = page.locator(platformSpec.selectors.imageTab).first();
      if ((await tab.count()) > 0) {
        await tab.click().catch(() => {});
        await page.waitForTimeout(1000);
      }
    }

    // Upload rendered PNG card if file input exists
    if (renderedPng && platformSpec.selectors.fileInput) {
      const fileInput = page.locator(platformSpec.selectors.fileInput).first();
      if ((await fileInput.count()) > 0) {
        await fileInput.setInputFiles(renderedPng).catch(() => {});
        notes.push('Uploaded card PNG to file input');
        await page.waitForTimeout(1500);
      } else {
        notes.push('File input not visible yet (login may be required on first run)');
      }
    }

    // Fill title
    if (title && platformSpec.selectors.titleInput) {
      const titleEl = page.locator(platformSpec.selectors.titleInput).first();
      if ((await titleEl.count()) > 0) {
        await titleEl.fill(title).catch(() => {});
        notes.push('Filled post title');
      }
    }

    // Fill body
    if (content && platformSpec.selectors.bodyEditor) {
      const bodyEl = page.locator(platformSpec.selectors.bodyEditor).first();
      if ((await bodyEl.count()) > 0) {
        await bodyEl.click().catch(() => {});
        await page.keyboard.insertText(content).catch(() => {});
        notes.push('Inserted post body copy');
      }
    }

    // Try saving draft if button is present; never click publish
    let savedDraft = false;
    if (platformSpec.selectors.saveDraftBtn) {
      const draftBtn = page.locator(platformSpec.selectors.saveDraftBtn).first();
      if ((await draftBtn.count()) > 0) {
        await draftBtn.click().catch(() => {});
        savedDraft = true;
        notes.push('Clicked Save Draft button');
      }
    }

    if (keepOpenMs > 0) {
      await page.waitForTimeout(keepOpenMs);
    }

    return {
      ok: true,
      dryRun: false,
      platform: platformSpec.id,
      url: page.url(),
      renderedPng,
      savedDraft,
      notes,
    };
  } finally {
    await browserContext.close();
  }
}
