import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

import { formatMultiPlatformDevlog } from '../src/formatter.js';
import {
  buildAllPlatformImagePrompts,
  PLATFORM_IMAGE_PRESETS,
} from '../src/image-gen.js';
import { writeDevlogBundle } from '../src/publisher.js';
import {
  publishGlobalPlatform,
  SUPPORTED_GLOBAL_PLATFORMS,
} from '../src/global-publisher.js';
import {
  CONFIG_KEYS,
  DEFAULT_CONFIG,
  SECRET_CONFIG_KEYS,
  maskConfigSecrets,
  validateConfigPatch,
} from '../src/config.js';
import {
  apply,
  publishGlobalPlatform as indexPublishGlobalPlatform,
  SUPPORTED_GLOBAL_PLATFORMS as INDEX_SUPPORTED_GLOBAL_PLATFORMS,
} from '../src/index.js';
import { AVAILABLE_STYLES } from '../src/styles.js';

const NODE_BIN = process.execPath;
const CLI_PATH = resolve(process.cwd(), 'src/cli.js');

function runCli(args = [], { cwd = process.cwd(), env = {} } = {}) {
  const cleanEnv = { ...process.env, DEVLOG_POSTER_NO_OPEN: '1' };
  delete cleanEnv.DEVTO_API_KEY;
  delete cleanEnv.BLUESKY_HANDLE;
  delete cleanEnv.BLUESKY_APP_PASSWORD;
  try {
    const stdout = execFileSync(NODE_BIN, [CLI_PATH, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...cleanEnv, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      status: err.status ?? 1,
      stdout: err.stdout?.toString?.() || '',
      stderr: err.stderr?.toString?.() || '',
    };
  }
}

function makeContext(overrides = {}) {
  return {
    isGitRepo: true,
    repoPath: '/tmp/demo-global',
    projectName: 'Kirakila7/dsh-plugin-devlog-poster',
    branch: 'feat/global-platforms',
    since: '24 hours ago',
    commits: [
      {
        sha: 'a1b2c3d',
        date: '2026-11-27',
        author: 'Dev',
        subject: 'feat: add global Build-in-Public platforms (X, Reddit, LinkedIn, Bluesky, Dev.to)',
      },
      {
        sha: 'e4f5g6h',
        date: '2026-11-27',
        author: 'Dev',
        subject: 'test: verify char limits and ATProto / Dev.to dry-run flows',
      },
    ],
    stats: { filesChanged: 7, insertions: 520, deletions: 48 },
    changedFiles: ['src/formatter.js', 'src/global-publisher.js', 'src/publisher.js'],
    highlights: [
      'Added overseas Build-in-Public copy for X, Reddit, LinkedIn, Bluesky, and Dev.to',
      'Built zero-dependency native fetch publishers for Dev.to API and Bluesky ATProto',
      'Upgraded preview.html workbench with an overseas tab, live char badges, and intent links',
    ],
    pitfalls: [
      'Emoji surrogate pairs can push JS .length past 280 even when code points look shorter, so we bound both',
    ],
    nextSteps: ['Add analytics feedback loop after shipping devlogs'],
    collectedAt: '2026-11-27T08:00:00.000Z',
    ...overrides,
  };
}

test('formatMultiPlatformDevlog generates all 5 global platforms with strict char limits, valid intent URLs, YAML frontmatter, style tone, and multi-repo support', () => {
  const ctx = makeContext();
  const xLeadsByStyle = new Set();

  for (const style of AVAILABLE_STYLES) {
    const formatted = formatMultiPlatformDevlog(ctx, { style });

    // Existing domestic + GitHub platforms stay intact
    assert.ok(formatted.platforms.github?.content);
    assert.ok(formatted.platforms.xiaohongshu?.content);
    assert.ok(formatted.platforms.bilibili?.content);
    assert.ok(formatted.platforms.douyin?.content);

    // 1. X (Twitter)
    const x = formatted.platforms.x;
    assert.equal(x.platform, 'x');
    assert.ok(x.content.length > 20);
    assert.ok(x.content.length <= 280, `X content (${style}) exceeded 280 UTF-16 chars: ${x.content.length}`);
    assert.ok([...x.content].length <= 280, `X content (${style}) exceeded 280 code points`);
    assert.ok(x.intentUrl.startsWith('https://twitter.com/intent/tweet?text='));
    const xUrl = new URL(x.intentUrl);
    assert.equal(xUrl.searchParams.get('text'), x.content);
    const tweets = x.thread.split('\n\n---\n\n');
    assert.ok(tweets.length >= 3 && tweets.length <= 4, 'X thread must have 3-4 tweets');
    for (const tw of tweets) {
      assert.ok(tw.length <= 280, `X thread tweet exceeded 280 chars: ${tw.length}`);
    }
    xLeadsByStyle.add(x.content.split('\n')[0]);

    // 2. Reddit
    const reddit = formatted.platforms.reddit;
    assert.equal(reddit.platform, 'reddit');
    assert.ok(reddit.title.length > 10 && reddit.title.length <= 300);
    assert.ok(reddit.content.includes('### What shipped'));
    assert.deepEqual(reddit.suggestedSubreddits, [
      'r/SideProject',
      'r/indiehackers',
      'r/programming',
    ]);
    assert.ok(reddit.submitUrl.startsWith('https://www.reddit.com/submit?type=TEXT&title='));
    const rdUrl = new URL(reddit.submitUrl);
    assert.equal(rdUrl.searchParams.get('type'), 'TEXT');
    assert.equal(rdUrl.searchParams.get('title'), reddit.title);

    // 3. LinkedIn
    const linkedin = formatted.platforms.linkedin;
    assert.equal(linkedin.platform, 'linkedin');
    assert.ok(linkedin.title.length > 5);
    assert.ok(linkedin.content.includes('#BuildInPublic'));
    assert.ok([...linkedin.content].length <= 3000);

    // 4. Bluesky
    const bsky = formatted.platforms.bluesky;
    assert.equal(bsky.platform, 'bluesky');
    assert.ok(bsky.content.length > 20);
    assert.ok(bsky.content.length <= 300, `Bluesky content (${style}) exceeded 300 chars: ${bsky.content.length}`);
    assert.ok([...bsky.content].length <= 300);
    assert.ok(bsky.intentUrl.startsWith('https://bsky.app/intent/compose?text='));
    const bskyUrl = new URL(bsky.intentUrl);
    assert.equal(bskyUrl.searchParams.get('text'), bsky.content);

    // 5. Dev.to
    const devto = formatted.platforms.devto;
    assert.equal(devto.platform, 'devto');
    const fmMatch = devto.content.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(fmMatch, 'Dev.to content must start with YAML frontmatter');
    assert.match(fmMatch[1], /^title:\s*".+"$/m);
    assert.match(fmMatch[1], /^published:\s*false$/m);
    assert.match(fmMatch[1], /^tags:\s*\[buildinpublic, devlog, opensource, ai\]$/m);
    assert.ok(devto.content.includes('## What Shipped'));
  }

  // Distinct style voices across the 4 styles
  assert.equal(xLeadsByStyle.size, 4, 'all 4 styles should subtly adapt global platform tone');

  // Extreme long input stress test for X (<=280) and Bluesky (<=300)
  const extremeCtx = makeContext({
    projectName: 'org/ultra-long-monorepo-developer-tooling-platform-with-many-words',
    highlights: [
      'A'.repeat(260) + '🚀🐳✨',
      'B'.repeat(240),
    ],
    pitfalls: ['C'.repeat(250)],
  });
  const extremeFormatted = formatMultiPlatformDevlog(extremeCtx, { style: 'big_fat_fish' });
  assert.ok(extremeFormatted.platforms.x.content.length <= 280);
  assert.ok([...extremeFormatted.platforms.x.content].length <= 280);
  assert.ok(extremeFormatted.platforms.bluesky.content.length <= 300);
  assert.ok([...extremeFormatted.platforms.bluesky.content].length <= 300);

  // Multi-repo context support
  const multiCtx = makeContext({
    projectName: 'workspace (2 repos)',
    isMultiRepo: true,
    activeRepoCount: 2,
    scannedRepoCount: 4,
    projects: [
      {
        shortName: 'api-core',
        projectName: 'acme/api-core',
        branch: 'main',
        stats: { filesChanged: 3, insertions: 120, deletions: 10 },
        commits: [{ sha: '111aaaa', date: '2026-11-27', subject: 'feat: add streaming endpoint' }],
      },
      {
        shortName: 'web-ui',
        projectName: 'acme/web-ui',
        branch: 'feat/global',
        stats: { filesChanged: 4, insertions: 210, deletions: 35 },
        commits: [{ sha: '222bbbb', date: '2026-11-27', subject: 'feat: add overseas tab' }],
      },
    ],
  });
  const multiFormatted = formatMultiPlatformDevlog(multiCtx, { style: 'claude' });
  assert.ok(multiFormatted.platforms.x.content.includes('2 repos'));
  assert.ok(multiFormatted.platforms.reddit.content.includes('api-core'));
  assert.ok(multiFormatted.platforms.reddit.content.includes('web-ui'));
  assert.ok(multiFormatted.platforms.linkedin.content.includes('Active repositories (2)'));
  assert.ok(multiFormatted.platforms.devto.content.includes('### Repository Breakdown'));
});

test('image-gen includes 16:9 presets for x, reddit, linkedin, devto while keeping existing 4 presets intact', () => {
  for (const key of ['xiaohongshu', 'bilibili', 'douyin', 'github', 'x', 'reddit', 'linkedin', 'devto']) {
    assert.ok(PLATFORM_IMAGE_PRESETS[key], `missing preset ${key}`);
  }
  for (const globalKey of ['x', 'reddit', 'linkedin', 'devto']) {
    assert.equal(PLATFORM_IMAGE_PRESETS[globalKey].aspectRatio, '16:9');
    assert.equal(PLATFORM_IMAGE_PRESETS[globalKey].size, '1344x768');
  }

  const allPrompts = buildAllPlatformImagePrompts(makeContext(), { style: 'chatgpt' });
  assert.equal(allPrompts.x.aspectRatio, '16:9');
  assert.equal(allPrompts.reddit.aspectRatio, '16:9');
  assert.equal(allPrompts.linkedin.aspectRatio, '16:9');
  assert.equal(allPrompts.devto.aspectRatio, '16:9');
  assert.ok(allPrompts.devto.prompt.includes('Dev.to'));
});

test('publishGlobalPlatform handles dry-run & mock-fetch for Dev.to, Bluesky ATProto, and zero-key intents for X/Reddit/LinkedIn', async () => {
  assert.deepEqual(SUPPORTED_GLOBAL_PLATFORMS, ['devto', 'bluesky', 'x', 'reddit', 'linkedin']);
  assert.deepEqual(INDEX_SUPPORTED_GLOBAL_PLATFORMS, SUPPORTED_GLOBAL_PLATFORMS);
  assert.equal(indexPublishGlobalPlatform, publishGlobalPlatform);

  const formatted = formatMultiPlatformDevlog(makeContext(), { style: 'big_fat_fish' });

  // 1. Dev.to dry-run (masks api-key, defaults published: false)
  const devtoDry = await publishGlobalPlatform({
    platform: 'devto',
    formatted,
    apiKey: 'devto_secret_token_9876',
    dryRun: true,
  });
  assert.equal(devtoDry.ok, true);
  assert.equal(devtoDry.dryRun, true);
  assert.equal(devtoDry.published, false);
  assert.equal(devtoDry.request.url, 'https://dev.to/api/articles');
  assert.equal(devtoDry.request.headers['api-key'], 'dev***9876');
  assert.equal(devtoDry.request.body.article.published, false);
  assert.ok(!devtoDry.request.body.article.body_markdown.startsWith('---'));

  // Dev.to execute with mock fetch
  const devtoCalls = [];
  const mockDevtoFetch = async (url, init) => {
    devtoCalls.push({ url, init });
    return {
      ok: true,
      status: 201,
      text: async () =>
        JSON.stringify({
          id: 4242,
          url: 'https://dev.to/demo/devlog-4242',
          published: false,
        }),
    };
  };
  const devtoLive = await publishGlobalPlatform({
    platform: 'devto',
    formatted,
    apiKey: 'devto_live_key_1234',
    published: false,
    dryRun: false,
    fetchImpl: mockDevtoFetch,
  });
  assert.equal(devtoLive.ok, true);
  assert.equal(devtoLive.dryRun, false);
  assert.equal(devtoLive.id, 4242);
  assert.equal(devtoLive.url, 'https://dev.to/demo/devlog-4242');
  assert.equal(devtoCalls.length, 1);
  assert.equal(devtoCalls[0].url, 'https://dev.to/api/articles');
  assert.equal(devtoCalls[0].init.headers['api-key'], 'devto_live_key_1234');

  // Dev.to execute without key rejects cleanly
  const prevDevto = process.env.DEVTO_API_KEY;
  delete process.env.DEVTO_API_KEY;
  try {
    await assert.rejects(
      () => publishGlobalPlatform({ platform: 'devto', formatted, dryRun: false }),
      /DEVTO_API_KEY/
    );
  } finally {
    if (prevDevto !== undefined) process.env.DEVTO_API_KEY = prevDevto;
  }

  // 2. Bluesky dry-run (masks appPassword & returns intentUrl)
  const bskyDry = await publishGlobalPlatform({
    platform: 'bluesky',
    formatted,
    handle: 'maker.bsky.social',
    appPassword: 'abcd-efgh-ijkl-mnop',
    dryRun: true,
  });
  assert.equal(bskyDry.ok, true);
  assert.equal(bskyDry.dryRun, true);
  assert.ok(bskyDry.intentUrl.startsWith('https://bsky.app/intent/compose?text='));
  assert.equal(bskyDry.requests.length, 2);
  assert.equal(bskyDry.requests[0].body.password, 'abc***mnop');

  // Bluesky execute with 2-step ATProto mock fetch
  const bskyCalls = [];
  const mockBskyFetch = async (url, init) => {
    bskyCalls.push({ url, init, parsedBody: JSON.parse(init.body) });
    if (url.endsWith('com.atproto.server.createSession')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            did: 'did:plc:demo123456',
            accessJwt: 'jwt_mock_access_token',
          }),
      };
    }
    if (url.endsWith('com.atproto.repo.createRecord')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            uri: 'at://did:plc:demo123456/app.bsky.feed.post/3lbxyz999',
            cid: 'bafyreimockcid',
          }),
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const bskyLive = await publishGlobalPlatform({
    platform: 'bluesky',
    formatted,
    handle: 'maker.bsky.social',
    appPassword: 'app-password-secret',
    dryRun: false,
    fetchImpl: mockBskyFetch,
  });
  assert.equal(bskyLive.ok, true);
  assert.equal(bskyLive.dryRun, false);
  assert.equal(bskyLive.uri, 'at://did:plc:demo123456/app.bsky.feed.post/3lbxyz999');
  assert.equal(bskyLive.url, 'https://bsky.app/profile/maker.bsky.social/post/3lbxyz999');
  assert.equal(bskyCalls.length, 2);
  assert.equal(bskyCalls[0].url, 'https://bsky.social/xrpc/com.atproto.server.createSession');
  assert.equal(bskyCalls[1].url, 'https://bsky.social/xrpc/com.atproto.repo.createRecord');
  assert.equal(bskyCalls[1].init.headers.Authorization, 'Bearer jwt_mock_access_token');
  assert.equal(bskyCalls[1].parsedBody.repo, 'did:plc:demo123456');
  assert.equal(bskyCalls[1].parsedBody.collection, 'app.bsky.feed.post');

  // 3. Zero-key intent platforms (X, Reddit, LinkedIn) never crash without API keys
  for (const dryFlag of [true, false]) {
    const xRes = await publishGlobalPlatform({ platform: 'x', formatted, dryRun: dryFlag });
    assert.equal(xRes.ok, true);
    assert.equal(xRes.mode, 'web_intent');
    assert.ok(xRes.intentUrl.startsWith('https://twitter.com/intent/tweet?text='));
    assert.ok(xRes.thread.includes('---'));

    const rdRes = await publishGlobalPlatform({ platform: 'reddit', formatted, dryRun: dryFlag });
    assert.equal(rdRes.ok, true);
    assert.equal(rdRes.mode, 'web_intent');
    assert.ok(rdRes.submitUrl.startsWith('https://www.reddit.com/submit?type=TEXT&title='));
    assert.deepEqual(rdRes.suggestedSubreddits, ['r/SideProject', 'r/indiehackers', 'r/programming']);

    const liRes = await publishGlobalPlatform({ platform: 'linkedin', formatted, dryRun: dryFlag });
    assert.equal(liRes.ok, true);
    assert.equal(liRes.mode, 'web_intent');
    assert.ok(liRes.intentUrl.includes('linkedin.com'));
    assert.ok(liRes.content.includes('#BuildInPublic'));
  }
});

test('writeDevlogBundle writes 5 global markdown files and preview.html overseas tab with valid vm.Script and base64 deduplication', () => {
  const tmpOut = mkdtempSync(join(tmpdir(), 'dsh-global-ui-'));
  try {
    const ctx = makeContext();
    const formatted = formatMultiPlatformDevlog(ctx, { style: 'big_fat_fish' });
    const bundle = writeDevlogBundle(ctx, formatted, { outputDir: tmpOut });

    // All 5 global markdown files exist and are registered in files & bundle.json
    const manifest = JSON.parse(readFileSync(bundle.files.manifest, 'utf8'));
    for (const key of ['x', 'reddit', 'linkedin', 'bluesky', 'devto']) {
      assert.ok(bundle.files[key], `files.${key} must be registered`);
      assert.ok(existsSync(bundle.files[key]), `${key}.md must exist on disk`);
      assert.equal(manifest.files[key], bundle.files[key]);
    }
    const devtoFile = readFileSync(bundle.files.devto, 'utf8');
    assert.ok(devtoFile.startsWith('---\ntitle:'));

    // preview.html checks
    const html = readFileSync(bundle.files.preview, 'utf8');
    assert.ok(html.includes("switchTab('global')"));
    assert.ok(html.includes('🌍 海外平台'));
    assert.ok(html.includes('data-section="global"'));
    assert.ok(html.includes('id="x-text"'));
    assert.ok(html.includes('id="x-extra"'));
    assert.ok(html.includes('id="bluesky-text"'));
    assert.ok(html.includes('id="reddit-title"'));
    assert.ok(html.includes('id="reddit-text"'));
    assert.ok(html.includes('id="linkedin-text"'));
    assert.ok(html.includes('id="devto-text"'));
    assert.ok(html.includes('发到 X ↗'));
    assert.ok(html.includes('发到 Bluesky ↗'));
    assert.ok(html.includes('发到 Reddit ↗'));
    assert.ok(html.includes('/280 chars'));
    assert.ok(html.includes('/300 chars'));
    assert.ok(html.includes('/3000 chars'));
    assert.ok(html.includes('syncGlobalIntentLinks()'));

    // Validate inline JS syntax via vm.Script
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'preview.html must contain inline <script>');
    assert.doesNotThrow(() => new vm.Script(scriptMatch[1]), 'inline script must parse cleanly with vm.Script');

    // Mascot deduplication remains intact
    const b64Matches = html.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/g) || [];
    assert.equal(b64Matches.length, 4, 'must keep 4 deduplicated mascot data URIs');
    assert.ok(Buffer.byteLength(html, 'utf8') < 12 * 1024 * 1024, 'preview.html size must stay slim (< 12 MiB)');
  } finally {
    rmSync(tmpOut, { recursive: true, force: true });
  }
});

test('config supports & masks devtoApiKey, blueskyHandle, blueskyAppPassword, and index.js keeps exactly 6 DSH tools', () => {
  assert.ok(CONFIG_KEYS.includes('devtoApiKey'));
  assert.ok(CONFIG_KEYS.includes('blueskyHandle'));
  assert.ok(CONFIG_KEYS.includes('blueskyAppPassword'));
  assert.ok(SECRET_CONFIG_KEYS.includes('devtoApiKey'));
  assert.ok(SECRET_CONFIG_KEYS.includes('blueskyAppPassword'));

  const validation = validateConfigPatch({
    devtoApiKey: 'devto_secret_987654',
    blueskyHandle: 'indie.bsky.social',
    blueskyAppPassword: 'xxxx-yyyy-zzzz-1234',
  });
  assert.equal(validation.valid, true);

  const masked = maskConfigSecrets({
    ...DEFAULT_CONFIG,
    devtoApiKey: 'devto_secret_987654',
    blueskyHandle: 'indie.bsky.social',
    blueskyAppPassword: 'xxxx-yyyy-zzzz-1234',
  });
  assert.equal(masked.devtoApiKey, 'dev***7654');
  assert.equal(masked.blueskyAppPassword, 'xxx***1234');
  assert.equal(masked.blueskyHandle, 'indie.bsky.social');

  // Verify DSH plugin still registers exact 6 tools
  const registered = [];
  const cleanup = apply({
    tools: {
      register(spec) {
        registered.push(spec.name);
        return () => {};
      },
    },
  });
  try {
    assert.deepEqual(registered, [
      'devlog_collect_context',
      'devlog_generate_bundle',
      'devlog_publish_github',
      'devlog_save_draft',
      'devlog_send_work_report',
      'devlog_generate_image',
    ]);
  } finally {
    cleanup();
  }
});

test('CLI publish-global dry-run auto-discovers latest bundle across all 5 global platforms, updates --help and doctor', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-global-cli-'));
  try {
    // --help lists publish-global
    const helpRes = runCli(['--help'], { cwd: tmpDir });
    assert.equal(helpRes.status, 0);
    assert.ok(helpRes.stdout.includes('publish-global'));
    assert.ok(helpRes.stdout.includes('--published'));

    // doctor includes global_platforms check and passes
    const docRes = runCli(['doctor', '--repo', process.cwd(), '--json'], { cwd: tmpDir });
    assert.equal(docRes.status, 0);
    const docJson = JSON.parse(docRes.stdout);
    assert.equal(docJson.ok, true);
    assert.ok(docJson.checks.some((c) => c.id === 'global_platforms'));

    // Generate bundle first
    const outDir = join(tmpDir, 'out');
    const genRes = runCli(
      [
        'generate',
        '--repo',
        tmpDir,
        '--name',
        'GlobalDemo',
        '--out',
        outDir,
        '--highlight',
        'Shipped global overseas platform publishing',
        '--json',
      ],
      { cwd: tmpDir }
    );
    assert.equal(genRes.status, 0);
    const genJson = JSON.parse(genRes.stdout);
    assert.ok(existsSync(genJson.files.x));
    assert.ok(existsSync(genJson.files.devto));

    // publish-global dry-run auto-discovers latest bundle for all 5 platforms
    for (const platform of SUPPORTED_GLOBAL_PLATFORMS) {
      const res = runCli(['publish-global', '--platform', platform, '--out', outDir], {
        cwd: tmpDir,
        env: {
          DEVTO_API_KEY: 'devto_cli_secret_4321',
          BLUESKY_HANDLE: 'cli.bsky.social',
          BLUESKY_APP_PASSWORD: 'cli-pass-secret-8765',
        },
      });
      assert.equal(res.status, 0, `publish-global --platform ${platform} failed: ${res.stderr}`);
      const parsed = JSON.parse(res.stdout);
      assert.equal(parsed.ok, true);
      assert.equal(parsed.dryRun, true);
      assert.equal(parsed.platform, platform);
      if (platform === 'devto') {
        assert.equal(parsed.published, false);
        assert.equal(parsed.request.headers['api-key'], 'dev***4321');
      }
      if (platform === 'bluesky') {
        assert.equal(parsed.requests[0].body.password, 'cli***8765');
      }
    }

    // Explicit --bundle and --published flag on devto dry-run
    const pubFlagRes = runCli(
      ['publish-global', '--platform', 'devto', '--bundle', genJson.bundleDir, '--published'],
      { cwd: tmpDir }
    );
    assert.equal(pubFlagRes.status, 0);
    const pubFlagJson = JSON.parse(pubFlagRes.stdout);
    assert.equal(pubFlagJson.published, true);
    assert.equal(pubFlagJson.request.body.article.published, true);

    // Invalid platform fails with friendly CliError
    const badRes = runCli(['publish-global', '--platform', 'mastodon', '--out', outDir], {
      cwd: tmpDir,
    });
    assert.equal(badRes.status, 1);
    assert.ok(badRes.stderr.includes('❌ Unsupported global platform'));
    assert.ok(badRes.stderr.includes('💡 Try:'));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
