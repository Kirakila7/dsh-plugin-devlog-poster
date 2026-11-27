import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';

import {
  CONFIG_KEYS,
  DEFAULT_CONFIG,
  inspectConfig,
  loadConfig,
  maskConfigSecrets,
  normalizeStyleId,
  resetConfig,
  saveConfig,
  validateConfigPatch,
} from '../src/config.js';
import {
  CliError,
  findLatestBundle,
  openInBrowser,
  parseArgs,
  resolveCliStyle,
} from '../src/cli.js';
import { apply } from '../src/index.js';

const NODE_BIN = process.execPath;
const CLI_PATH = resolve(process.cwd(), 'src/cli.js');

function runCli(args = [], { cwd = process.cwd(), env = {} } = {}) {
  try {
    const stdout = execFileSync(NODE_BIN, [CLI_PATH, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, DEVLOG_POSTER_NO_OPEN: '1', ...env },
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

test('config validation, style aliases, secret masking, local save & reset', () => {
  assert.ok(CONFIG_KEYS.includes('defaultStyle'));
  assert.ok(CONFIG_KEYS.includes('reportEndpoint'));
  assert.ok(CONFIG_KEYS.includes('imageApiKey'));

  assert.equal(normalizeStyleId('fish'), 'big_fat_fish');
  assert.equal(normalizeStyleId('HAKIMI'), 'gemini');
  assert.equal(normalizeStyleId('gpt'), 'chatgpt');
  assert.equal(normalizeStyleId('claude'), 'claude');
  assert.equal(normalizeStyleId('unknown_style'), null);

  const okCheck = validateConfigPatch({ defaultStyle: 'gpt', imageProvider: 'volcengine' });
  assert.equal(okCheck.valid, true);
  assert.equal(okCheck.normalized.defaultStyle, 'chatgpt');

  const badKey = validateConfigPatch({ bogusKey: '123' });
  assert.equal(badKey.valid, false);
  assert.ok(badKey.errors[0].includes('Unknown config key'));

  const badChannel = validateConfigPatch({ defaultReportChannel: 'telegram' });
  assert.equal(badChannel.valid, false);
  assert.ok(badChannel.errors[0].includes('Invalid defaultReportChannel'));

  const masked = maskConfigSecrets({
    ...DEFAULT_CONFIG,
    reportToken: 'tok_supersecret_9999',
    imageApiKey: 'sk-1234567890abcd',
  });
  assert.equal(masked.reportToken, 'tok***9999');
  assert.equal(masked.imageApiKey, 'sk-***abcd');

  const tmpRepo = mkdtempSync(join(tmpdir(), 'dsh-ux-cfg-'));
  try {
    const globalPath = join(tmpRepo, 'global-config.json');
    saveConfig({ defaultStyle: 'gemini', imageApiKey: 'sk-abcdef123456' }, { configPath: globalPath });
    saveConfig({ defaultStyle: 'claude' }, { local: true, repoPath: tmpRepo, validate: true });

    const info = inspectConfig({ globalPath, repoPath: tmpRepo });
    assert.equal(info.sources.globalExists, true);
    assert.equal(info.sources.localExists, true);
    assert.equal(info.config.defaultStyle, 'claude');
    assert.equal(info.maskedConfig.imageApiKey, 'sk-***3456');

    const resetRes = resetConfig({ local: true, repoPath: tmpRepo });
    assert.equal(resetRes.existed, true);
    assert.equal(existsSync(info.sources.localPath), false);

    const afterReset = loadConfig({ globalPath, repoPath: tmpRepo });
    assert.equal(afterReset.defaultStyle, 'gemini');
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('parseArgs supports zero-arg defaults, leading flags, --flag=val, unknown warnings & missing value errors', () => {
  const zero = parseArgs([]);
  assert.equal(zero.command, 'generate');

  const leading = parseArgs(['--open', '--style=hakimi', '--unknown-flag']);
  assert.equal(leading.command, 'generate');
  assert.equal(leading.opts.open, true);
  assert.equal(leading.opts.style, 'hakimi');
  assert.deepEqual(leading.opts.unknownFlags, ['--unknown-flag']);

  assert.equal(resolveCliStyle('fish'), 'big_fat_fish');
  assert.throws(() => resolveCliStyle('nope'), CliError);
  assert.throws(() => parseArgs(['generate', '--style']), CliError);
});

test('openInBrowser uses platform-appropriate detached spawn and handles errors non-fatally', () => {
  const calls = [];
  let unrefCalled = false;
  const fakeSpawn = (cmd, args, options) => {
    calls.push({ cmd, args, options });
    const emitter = new EventEmitter();
    emitter.unref = () => {
      unrefCalled = true;
    };
    return emitter;
  };

  const prevNoOpen = process.env.DEVLOG_POSTER_NO_OPEN;
  delete process.env.DEVLOG_POSTER_NO_OPEN;
  try {
    const mac = openInBrowser('/tmp/preview.html', { platform: 'darwin', spawnImpl: fakeSpawn });
    assert.equal(mac.ok, true);
    assert.equal(calls[0].cmd, 'open');
    assert.deepEqual(calls[0].args, ['/tmp/preview.html']);
    assert.equal(calls[0].options.detached, true);
    assert.equal(unrefCalled, true);

    const lin = openInBrowser('/tmp/preview.html', { platform: 'linux', spawnImpl: fakeSpawn });
    assert.equal(lin.ok, true);
    assert.equal(calls[1].cmd, 'xdg-open');

    const win = openInBrowser('/tmp/preview.html', { platform: 'win32', spawnImpl: fakeSpawn });
    assert.equal(win.ok, true);
    assert.equal(calls[2].cmd, 'cmd');
    assert.deepEqual(calls[2].args, ['/c', 'start', '', '/tmp/preview.html']);
  } finally {
    if (prevNoOpen !== undefined) process.env.DEVLOG_POSTER_NO_OPEN = prevNoOpen;
  }
});

test('CLI generate, --json, doctor, config, auto-discovered save-draft, savedCfg wiring & friendly errors', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-ux-cli-'));
  try {
    // 1. --help includes all key commands and flags
    const helpRes = runCli(['--help'], { cwd: tmpDir });
    assert.equal(helpRes.status, 0);
    assert.ok(helpRes.stdout.includes('doctor'));
    assert.ok(helpRes.stdout.includes('--open'));
    assert.ok(helpRes.stdout.includes('config reset'));

    // 2. doctor --json passes on Node >= 20 with built-in mascots
    const docRes = runCli(['doctor', '--repo', process.cwd(), '--json'], { cwd: tmpDir });
    assert.equal(docRes.status, 0);
    const docJson = JSON.parse(docRes.stdout);
    assert.equal(docJson.ok, true);
    assert.ok(docJson.checks.some((c) => c.id === 'node' && c.status === 'ok'));
    assert.ok(docJson.checks.some((c) => c.id === 'mascots' && c.status === 'ok'));

    // 3. config set --local validates and persists, and send-report/generate-image honor savedCfg
    const badCfg = runCli(['config', 'set', 'nonexistentKey', 'foo', '--local'], { cwd: tmpDir });
    assert.equal(badCfg.status, 1);
    assert.ok(badCfg.stderr.includes('❌'));
    assert.ok(!badCfg.stderr.includes('at main'));

    assert.equal(
      runCli(['config', 'set', 'defaultStyle', 'hakimi', '--local'], { cwd: tmpDir }).status,
      0
    );
    assert.equal(
      runCli(['config', 'set', 'defaultReportChannel', 'discord', '--local'], { cwd: tmpDir }).status,
      0
    );
    assert.equal(
      runCli(['config', 'set', 'reportEndpoint', 'https://discord.example/hook', '--local'], {
        cwd: tmpDir,
      }).status,
      0
    );
    assert.equal(
      runCli(['config', 'set', 'imageProvider', 'volcengine', '--local'], { cwd: tmpDir }).status,
      0
    );
    assert.equal(
      runCli(['config', 'set', 'imageApiKey', 'ark-secret-123456', '--local'], { cwd: tmpDir }).status,
      0
    );

    const cfgShow = runCli(['config', 'show', '--json'], { cwd: tmpDir });
    assert.equal(cfgShow.status, 0);
    const cfgParsed = JSON.parse(cfgShow.stdout);
    assert.equal(cfgParsed.config.defaultStyle, 'gemini');
    assert.equal(cfgParsed.config.imageApiKey, 'ark***3456');
    assert.equal(cfgParsed.sources.localExists, true);

    // send-report picks up savedCfg.defaultReportChannel & savedCfg.reportEndpoint
    const reportRes = runCli(['send-report', '--repo', tmpDir], { cwd: tmpDir });
    assert.equal(reportRes.status, 0);
    const reportJson = JSON.parse(reportRes.stdout);
    assert.equal(reportJson.channel, 'discord');
    assert.equal(reportJson.url, 'https://discord.example/hook');
    assert.equal(reportJson.dryRun, true);

    // generate-image picks up savedCfg.defaultStyle & savedCfg.imageProvider
    const imgRes = runCli(['generate-image', '--repo', tmpDir], { cwd: tmpDir });
    assert.equal(imgRes.status, 0);
    const imgJson = JSON.parse(imgRes.stdout);
    assert.equal(imgJson.provider, 'volcengine');
    assert.equal(imgJson.promptSpec.style, 'gemini');

    // 4. save-draft without bundle fails with actionable hint
    const noBundle = runCli(['save-draft', '--platform', 'xiaohongshu', '--out', join(tmpDir, 'out')], {
      cwd: tmpDir,
    });
    assert.equal(noBundle.status, 1);
    assert.ok(noBundle.stderr.includes('❌'));
    assert.ok(noBundle.stderr.includes('💡 Try:'));

    // 5. generate human output has style, summary, and Next Steps; --json returns clean JSON
    const outDir = join(tmpDir, 'out');
    const genHuman = runCli(
      ['generate', '--repo', tmpDir, '--name', 'DemoApp', '--out', outDir, '--highlight', 'Shipped UX'],
      { cwd: tmpDir }
    );
    assert.equal(genHuman.status, 0);
    assert.ok(genHuman.stdout.includes('👉 Next Steps:'));
    assert.ok(genHuman.stdout.includes('哈基米'));

    const latest = findLatestBundle(outDir);
    assert.ok(latest && existsSync(join(latest, 'bundle.json')));

    // save-draft auto-discovers latest bundle when --bundle is omitted
    const draftRes = runCli(['save-draft', '--platform', 'xiaohongshu', '--out', outDir], {
      cwd: tmpDir,
    });
    assert.equal(draftRes.status, 0);
    const draftJson = JSON.parse(draftRes.stdout);
    assert.equal(draftJson.ok, true);
    assert.equal(draftJson.dryRun, true);
    assert.equal(draftJson.platform, 'xiaohongshu');

    // generate --json with style alias
    const genJsonRes = runCli(
      ['generate', '--repo', tmpDir, '--style', 'gpt', '--out', outDir, '--json', '--open'],
      { cwd: tmpDir }
    );
    assert.equal(genJsonRes.status, 0);
    const genJson = JSON.parse(genJsonRes.stdout);
    assert.equal(genJson.ok, true);
    assert.equal(genJson.style, 'chatgpt');
    assert.ok(existsSync(genJson.files.preview));

    // invalid style prints friendly error without stack trace
    const badStyle = runCli(['generate', '--style', 'not_a_style'], { cwd: tmpDir });
    assert.equal(badStyle.status, 1);
    assert.ok(badStyle.stderr.includes('❌ Invalid style'));
    assert.ok(badStyle.stderr.includes('💡 Try:'));
    assert.ok(!badStyle.stderr.includes('Error:'));

    // config reset --local cleans up
    const resetCli = runCli(['config', 'reset', '--local'], { cwd: tmpDir });
    assert.equal(resetCli.status, 0);
    assert.equal(existsSync(join(tmpDir, '.devlog-poster.json')), false);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('all 6 DSH Agent tool output.render handlers return structured Markdown with next actions', () => {
  const registered = [];
  const cleanup = apply({
    tools: {
      register(spec) {
        registered.push(spec);
        return () => {};
      },
    },
  });

  try {
    assert.equal(registered.length, 6);
    const byName = Object.fromEntries(registered.map((t) => [t.name, t]));

    const cOut = byName.devlog_collect_context.output.render({}, {
      projectName: 'demo',
      branch: 'main',
      isGitRepo: true,
      commits: [{ hash: 'abc1234', subject: 'feat: polish UX' }],
      stats: { filesChanged: 2, insertions: 40, deletions: 5 },
    })[0].text;
    assert.ok(cOut.includes('### 📦'));
    assert.ok(cOut.includes('devlog_generate_bundle'));

    const gOut = byName.devlog_generate_bundle.output.render({}, {
      bundleDir: '/tmp/bundle',
      meta: { style: 'gemini', statsLine: '改动 2 个文件' },
      files: { preview: '/tmp/bundle/preview.html', slides: ['p1', 'p2', 'p3', 'p4'] },
    })[0].text;
    assert.ok(gOut.includes('### ✅'));
    assert.ok(gOut.includes('preview.html'));
    assert.ok(gOut.includes('4 张轮播套图'));

    const pOut = byName.devlog_publish_github.output.render({}, {
      dryRun: true,
      mode: 'release',
      tag: 'v0.5.2',
      command: 'gh release create v0.5.2',
    })[0].text;
    assert.ok(pOut.includes('[DRY RUN]'));
    assert.ok(pOut.includes('dryRun: false'));

    const dErrOut = byName.devlog_save_draft.output.render({}, {
      ok: false,
      dryRun: false,
      error: 'PLAYWRIGHT_NOT_INSTALLED',
      message: 'Playwright not installed',
    })[0].text;
    assert.ok(dErrOut.includes('npm install playwright'));

    const rOut = byName.devlog_send_work_report.output.render({}, {
      dryRun: true,
      channel: 'feishu',
      url: '',
      report: { period: 'daily', title: '【工作日报】demo', statsSummary: '完成 2 项' },
    })[0].text;
    assert.ok(rOut.includes('[DRY RUN]'));
    assert.ok(rOut.includes('endpoint'));

    const iOut = byName.devlog_generate_image.output.render({}, {
      dryRun: true,
      provider: 'openai',
      model: 'gpt-image-1',
      promptSpec: {
        label: '小红书封面',
        styleName: '大肥鱼',
        aspectRatio: '3:4',
        size: '1024x1365',
        prompt: 'Topic: demo\nStyle: chibi',
      },
    })[0].text;
    assert.ok(iOut.includes('[DRY RUN]'));
    assert.ok(iOut.includes('gpt-image-1'));
  } finally {
    cleanup();
  }
});

test('README.md has balanced code fences, 30s quick start, 2x2 mascot table, and Zipzipipe credit', () => {
  const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');
  const fenceCount = (readme.match(/^```/gm) || []).length;
  assert.equal(fenceCount % 2, 0, 'README code fences must be balanced');
  assert.ok(readme.includes('30 秒快速上手'));
  assert.ok(readme.includes('generate --open'));
  assert.ok(readme.includes('doctor'));
  assert.ok(readme.includes('./assets/mascots/big_fat_fish.png'));
  assert.ok(readme.includes('./assets/mascots/gemini.png'));
  assert.ok(readme.includes('./assets/mascots/chatgpt.png'));
  assert.ok(readme.includes('./assets/mascots/claude.png'));
  assert.ok(readme.includes('Zipzipipe'));
});
