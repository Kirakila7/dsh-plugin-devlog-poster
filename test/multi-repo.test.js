import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  collectGitContext,
  collectMultiRepoContext,
  discoverGitRepos,
} from '../src/git-context.js';
import { formatWorkReport } from '../src/work-report.js';
import { formatMultiPlatformDevlog } from '../src/formatter.js';
import { collectMultiRepoDiffContext, summarizeWithAI } from '../src/ai-summarizer.js';
import { CONFIG_KEYS, DEFAULT_CONFIG, validateConfigPatch } from '../src/config.js';
import {
  apply,
  collectMultiRepoContext as indexCollectMultiRepoContext,
  discoverGitRepos as indexDiscoverGitRepos,
} from '../src/index.js';

const NODE_BIN = process.execPath;
const CLI_PATH = resolve(process.cwd(), 'src/cli.js');

function git(cwd, args, env = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function initRepo(repoDir, commits = []) {
  mkdirSync(repoDir, { recursive: true });
  git(repoDir, ['init', '-b', 'main']);
  git(repoDir, ['config', 'user.name', 'Test Dev']);
  git(repoDir, ['config', 'user.email', 'test@example.com']);

  for (const commit of commits) {
    for (const [relPath, content] of Object.entries(commit.files || {})) {
      const fullPath = join(repoDir, relPath);
      mkdirSync(join(fullPath, '..'), { recursive: true });
      writeFileSync(fullPath, content, 'utf8');
    }
    git(repoDir, ['add', '.']);
    const env = commit.date
      ? { GIT_AUTHOR_DATE: commit.date, GIT_COMMITTER_DATE: commit.date }
      : {};
    git(repoDir, ['commit', '-m', commit.message], env);
  }
}

function runCli(args = [], { cwd = process.cwd(), env = {} } = {}) {
  const cleanEnv = { ...process.env, DEVLOG_POSTER_NO_OPEN: '1', ...env };
  delete cleanEnv.DEEPSEEK_API_KEY;
  delete cleanEnv.OPENAI_API_KEY;
  delete cleanEnv.GEMINI_API_KEY;
  delete cleanEnv.ANTHROPIC_API_KEY;
  try {
    const stdout = execFileSync(NODE_BIN, [CLI_PATH, ...args], {
      cwd,
      encoding: 'utf8',
      env: cleanEnv,
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

function createMultiRepoFixture() {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'dsh-multi-repo-'));
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

  const repoAlpha = join(tmpRoot, 'alpha-api');
  initRepo(repoAlpha, [
    {
      message: 'feat(api): add rate limiter middleware',
      files: {
        'src/limiter.js': 'export const limit = 100;\nexport function check() { return true; }\n',
        'README.md': '# alpha-api\n',
      },
    },
    {
      message: 'fix(api): handle empty request header cleanly',
      files: {
        'src/limiter.js':
          'export const limit = 120;\nexport function check(h) { return Boolean(h); }\n',
      },
    },
  ]);

  const repoBeta = join(tmpRoot, 'beta-web');
  initRepo(repoBeta, [
    {
      message: 'feat(ui): build dashboard activity cards',
      files: {
        'src/Card.js': 'export function Card() { return "ok"; }\n// line2\n// line3\n',
      },
    },
  ]);

  const repoStale = join(tmpRoot, 'gamma-legacy');
  initRepo(repoStale, [
    {
      message: 'chore: old archived commit from 10 days ago',
      date: tenDaysAgo,
      files: {
        'legacy.txt': 'old content\n',
      },
    },
  ]);

  // Non-git folder
  const plainDir = join(tmpRoot, 'notes-plain');
  mkdirSync(plainDir, { recursive: true });
  writeFileSync(join(plainDir, 'todo.md'), '# Notes\n', 'utf8');

  // Ignored directory containing a fake .git folder
  const ignoredNested = join(tmpRoot, 'node_modules', 'fake-pkg', '.git');
  mkdirSync(ignoredNested, { recursive: true });

  return { tmpRoot, repoAlpha, repoBeta, repoStale, plainDir };
}

test('discoverGitRepos finds git repos (including worktree .git files), deduplicates, and ignores node_modules & non-git dirs', () => {
  const { tmpRoot, repoAlpha, repoBeta, repoStale } = createMultiRepoFixture();
  try {
    const discovered = discoverGitRepos({ scanDirs: [tmpRoot], maxDepth: 2 });
    assert.equal(discovered.length, 3);
    assert.ok(discovered.includes(repoAlpha));
    assert.ok(discovered.includes(repoBeta));
    assert.ok(discovered.includes(repoStale));
    assert.ok(!discovered.some((p) => p.includes('notes-plain')));
    assert.ok(!discovered.some((p) => p.includes('node_modules')));

    // Comma-separated string + duplicate explicit repos should deduplicate cleanly
    const deduped = discoverGitRepos({
      scanDirs: `${tmpRoot}, ${tmpRoot}`,
      repos: `${repoAlpha},${repoBeta}`,
    });
    assert.equal(deduped.length, 3);

    // Worktree pointer `.git` file is also recognized
    const worktreeDir = join(tmpRoot, 'delta-worktree');
    mkdirSync(worktreeDir, { recursive: true });
    writeFileSync(join(worktreeDir, '.git'), `gitdir: ${join(repoAlpha, '.git')}\n`, 'utf8');
    const withWorktree = discoverGitRepos({ scanDirs: [tmpRoot], maxDepth: 2 });
    assert.equal(withWorktree.length, 4);
    assert.ok(withWorktree.includes(worktreeDir));

    // maxDepth=0 on parent directory (non-git) returns empty
    const shallow = discoverGitRepos({ scanDirs: [tmpRoot], maxDepth: 0 });
    assert.equal(shallow.length, 0);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('collectMultiRepoContext includes only active repos, sums stats accurately, and preserves per-project grouping', () => {
  const { tmpRoot, repoAlpha, repoBeta, repoStale } = createMultiRepoFixture();
  try {
    const ctx = collectMultiRepoContext({
      scanDirs: [tmpRoot],
      since: '24 hours ago',
    });

    assert.equal(ctx.isMultiRepo, true);
    assert.equal(ctx.isGitRepo, true);
    assert.equal(ctx.branch, 'multi');
    assert.equal(ctx.scannedRepoCount, 3);
    assert.equal(ctx.activeRepoCount, 2);
    assert.equal(ctx.projects.length, 2);

    const names = ctx.projects.map((p) => p.shortName).sort();
    assert.deepEqual(names, ['alpha-api', 'beta-web']);
    assert.ok(!ctx.projects.some((p) => p.shortName === 'gamma-legacy'));
    assert.ok(ctx.projectName.includes('2'));

    // Verify stats sum matches per-project sum
    const sumFiles = ctx.projects.reduce((s, p) => s + p.stats.filesChanged, 0);
    const sumIns = ctx.projects.reduce((s, p) => s + p.stats.insertions, 0);
    const sumDel = ctx.projects.reduce((s, p) => s + p.stats.deletions, 0);
    assert.equal(ctx.stats.filesChanged, sumFiles);
    assert.equal(ctx.stats.insertions, sumIns);
    assert.equal(ctx.stats.deletions, sumDel);
    assert.equal(ctx.stats.filesChanged, 3); // alpha: 2 files, beta: 1 file
    assert.equal(ctx.stats.insertions, 6); // alpha: 3 lines total, beta: 3 lines

    // Verify commits and changedFiles tagging
    assert.equal(ctx.commits.length, 3);
    assert.ok(ctx.commits.every((c) => c.project && c.displaySubject.startsWith(`[${c.project}] `)));
    assert.ok(ctx.changedFiles.includes('alpha-api/src/limiter.js'));
    assert.ok(ctx.changedFiles.includes('beta-web/src/Card.js'));

    // Single-repo collectGitContext remains unchanged (falls back to old commit on stale repo)
    const staleSingle = collectGitContext({ repoPath: repoStale, since: '24 hours ago' });
    assert.equal(staleSingle.isGitRepo, true);
    assert.equal(staleSingle.isMultiRepo, undefined);
    assert.equal(staleSingle.commits.length, 1);

    // Per-project grouping in formatWorkReport (plain text & markdown)
    const dailyReport = formatWorkReport(ctx, { period: 'daily' });
    assert.ok(dailyReport.qqText.includes('[alpha-api]'));
    assert.ok(dailyReport.qqText.includes('[beta-web]'));
    assert.ok(dailyReport.qqText.includes('feat(api): add rate limiter middleware'));
    assert.ok(dailyReport.qqText.includes('feat(ui): build dashboard activity cards'));
    assert.ok(!dailyReport.qqText.includes('gamma-legacy'));
    assert.ok(dailyReport.markdown.includes('**[alpha-api]**'));
    assert.ok(dailyReport.markdown.includes('**[beta-web]**'));

    // Explicit highlights are still honored alongside multi-repo projects
    const withHighlights = formatWorkReport(
      { ...ctx, highlights: ['统一上线跨项目监控看板'] },
      { period: 'weekly' }
    );
    assert.ok(withHighlights.qqText.includes('本周完成'));
    assert.ok(withHighlights.qqText.includes('1. 统一上线跨项目监控看板'));
    assert.ok(withHighlights.qqText.includes('[alpha-api]'));
    assert.ok(withHighlights.markdown.includes('- 统一上线跨项目监控看板'));
    assert.ok(withHighlights.markdown.includes('**[beta-web]**'));

    // Per-project grouping in formatMultiPlatformDevlog
    const devlog = formatMultiPlatformDevlog(ctx, { style: 'big_fat_fish' });
    assert.equal(devlog.meta.isMultiRepo, true);
    assert.equal(devlog.meta.activeRepoCount, 2);
    assert.ok(devlog.platforms.github.content.includes('#### [alpha-api]'));
    assert.ok(devlog.platforms.github.content.includes('#### [beta-web]'));
    assert.ok(devlog.platforms.xiaohongshu.content.includes('[alpha-api]'));
    assert.ok(devlog.platforms.xiaohongshu.content.includes('[beta-web]'));
    assert.ok(devlog.platforms.bilibili.content.includes('[alpha-api]'));
    assert.ok(devlog.platforms.douyin.content.includes('['));

    // Explicit repos mode works identically
    const explicitCtx = collectMultiRepoContext({
      repos: [repoAlpha, repoBeta, repoStale],
      since: '24 hours ago',
    });
    assert.equal(explicitCtx.scannedRepoCount, 3);
    assert.equal(explicitCtx.activeRepoCount, 2);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('AI summarizer collects bounded multi-repo git log --stat within 6000-char cap', async () => {
  const { tmpRoot } = createMultiRepoFixture();
  try {
    const ctx = collectMultiRepoContext({ scanDirs: [tmpRoot], since: '24 hours ago' });
    const diffCtx = collectMultiRepoDiffContext({
      projects: ctx.projects,
      since: '24 hours ago',
      maxLogChars: 6000,
    });
    assert.equal(diffCtx.isGitRepo, true);
    assert.equal(diffCtx.isMultiRepo, true);
    assert.ok(diffCtx.logStat.length <= 6000);
    assert.ok(diffCtx.logStat.includes('[alpha-api]'));
    assert.ok(diffCtx.logStat.includes('[beta-web]'));

    const dryRes = await summarizeWithAI({
      context: ctx,
      since: '24 hours ago',
      dryRun: true,
      env: {},
    });
    assert.equal(dryRes.ok, true);
    assert.equal(dryRes.dryRun, true);
    assert.ok(dryRes.diffContext.logStat.length <= 6000);
    assert.ok(dryRes.prompts.userPrompt.includes('活跃仓库（2 个）'));
    assert.ok(dryRes.prompts.userPrompt.includes('[alpha-api]'));
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('config validates watchDirs and watchRepos (comma-separated string and string array) and index.js exposes multi-repo tools', async () => {
  assert.equal(DEFAULT_CONFIG.watchDirs, '');
  assert.equal(DEFAULT_CONFIG.watchRepos, '');
  assert.ok(CONFIG_KEYS.includes('watchDirs'));
  assert.ok(CONFIG_KEYS.includes('watchRepos'));

  const strCheck = validateConfigPatch({
    watchDirs: ' /tmp/a , /tmp/b ',
    watchRepos: '/tmp/r1,/tmp/r2',
  });
  assert.equal(strCheck.valid, true);
  assert.equal(strCheck.normalized.watchDirs, '/tmp/a,/tmp/b');
  assert.equal(strCheck.normalized.watchRepos, '/tmp/r1,/tmp/r2');

  const arrCheck = validateConfigPatch({
    watchDirs: ['/tmp/a', ' /tmp/b '],
    watchRepos: ['/tmp/r1'],
  });
  assert.equal(arrCheck.valid, true);
  assert.deepEqual(arrCheck.normalized.watchDirs, ['/tmp/a', '/tmp/b']);

  const badCheck = validateConfigPatch({ watchDirs: 12345 });
  assert.equal(badCheck.valid, false);
  assert.ok(badCheck.errors[0].includes('Invalid watchDirs'));

  assert.equal(typeof indexDiscoverGitRepos, 'function');
  assert.equal(typeof indexCollectMultiRepoContext, 'function');

  const { tmpRoot } = createMultiRepoFixture();
  const outDir = join(tmpRoot, 'tool-out');
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

    assert.ok(byName.devlog_collect_context.parameters.scanDirs);
    assert.ok(byName.devlog_collect_context.parameters.repos);
    assert.ok(byName.devlog_generate_bundle.parameters.scanDirs);
    assert.ok(byName.devlog_generate_bundle.parameters.repos);
    assert.ok(byName.devlog_send_work_report.parameters.scanDirs);
    assert.ok(byName.devlog_send_work_report.parameters.repos);

    const collected = await byName.devlog_collect_context.execute({
      scanDirs: [tmpRoot],
      since: '24 hours ago',
    });
    assert.equal(collected.isMultiRepo, true);
    assert.equal(collected.activeRepoCount, 2);
    const rendered = byName.devlog_collect_context.output.render({}, collected)[0].text;
    assert.ok(rendered.includes('多仓库汇总'));
    assert.ok(rendered.includes('alpha-api'));

    const bundle = await byName.devlog_generate_bundle.execute({
      scanDirs: [tmpRoot],
      since: '24 hours ago',
      outputDir: outDir,
    });
    assert.equal(bundle.meta.isMultiRepo, true);
    assert.ok(existsSync(bundle.files.preview));
    assert.ok(bundle.platforms.github.content.includes('#### [alpha-api]'));

    const reportRes = await byName.devlog_send_work_report.execute({
      scanDirs: [tmpRoot],
      period: 'daily',
      channel: 'feishu',
    });
    assert.equal(reportRes.dryRun, true);
    assert.ok(reportRes.report.qqText.includes('[alpha-api]'));
    assert.ok(reportRes.report.qqText.includes('[beta-web]'));
  } finally {
    cleanup();
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('CLI generate --scan-dir, send-report --scan-dir, config set watchDirs + --all-watched & doctor work end-to-end', () => {
  const { tmpRoot } = createMultiRepoFixture();
  const cfgDir = mkdtempSync(join(tmpdir(), 'dsh-multi-cfg-'));
  const outDir = join(cfgDir, 'out');
  const cliOpts = { cwd: cfgDir, env: { HOME: cfgDir } };
  try {
    // --help includes multi-repo flags
    const helpRes = runCli(['--help'], cliOpts);
    assert.equal(helpRes.status, 0);
    assert.ok(helpRes.stdout.includes('--scan-dir'));
    assert.ok(helpRes.stdout.includes('--repos'));
    assert.ok(helpRes.stdout.includes('--all-watched'));
    assert.ok(helpRes.stdout.includes('--max-depth'));

    // --all-watched with no watchDirs/watchRepos fails cleanly with hint
    const emptyWatched = runCli(['generate', '--all-watched', '--repo', cfgDir], cliOpts);
    assert.equal(emptyWatched.status, 1);
    assert.ok(emptyWatched.stderr.includes('❌'));
    assert.ok(emptyWatched.stderr.includes('watchDirs'));

    // Invalid --max-depth fails cleanly with hint
    const badDepth = runCli(['generate', '--scan-dir', tmpRoot, '--max-depth', '-1'], cliOpts);
    assert.equal(badDepth.status, 1);
    assert.ok(badDepth.stderr.includes('--max-depth'));

    // 1. generate --scan-dir <tmpRoot> --json
    const genRes = runCli(
      ['generate', '--scan-dir', tmpRoot, '--out', outDir, '--json'],
      cliOpts
    );
    assert.equal(genRes.status, 0, genRes.stderr);
    const genJson = JSON.parse(genRes.stdout);
    assert.equal(genJson.ok, true);
    assert.equal(genJson.isMultiRepo, true);
    assert.equal(genJson.scannedRepoCount, 3);
    assert.equal(genJson.activeRepoCount, 2);
    assert.ok(existsSync(genJson.files.github));
    const githubMd = readFileSync(genJson.files.github, 'utf8');
    assert.ok(githubMd.includes('#### [alpha-api]'));
    assert.ok(githubMd.includes('#### [beta-web]'));
    assert.ok(!githubMd.includes('gamma-legacy'));

    // 2. send-report --scan-dir <tmpRoot> --period daily
    const reportRes = runCli(
      ['send-report', '--scan-dir', tmpRoot, '--period', 'daily', '--channel', 'feishu'],
      cliOpts
    );
    assert.equal(reportRes.status, 0, reportRes.stderr);
    const reportJson = JSON.parse(reportRes.stdout);
    assert.equal(reportJson.ok, true);
    assert.equal(reportJson.dryRun, true);
    assert.equal(reportJson.multiRepo.activeRepoCount, 2);
    assert.ok(reportJson.body.content.text.includes('[alpha-api]'));
    assert.ok(reportJson.body.content.text.includes('[beta-web]'));
    assert.ok(!reportJson.body.content.text.includes('gamma-legacy'));

    // 3. config set watchDirs --local + doctor + --all-watched
    const setRes = runCli(
      ['config', 'set', 'watchDirs', tmpRoot, '--local', '--repo', cfgDir],
      cliOpts
    );
    assert.equal(setRes.status, 0, setRes.stderr);

    const docRes = runCli(['doctor', '--repo', cfgDir, '--json'], cliOpts);
    assert.equal(docRes.status, 0, docRes.stderr);
    const docJson = JSON.parse(docRes.stdout);
    const multiCheck = docJson.checks.find((c) => c.id === 'multi_repo');
    assert.ok(multiCheck, 'doctor must report multi_repo check');
    assert.ok(multiCheck.detail.includes('1 dir(s)'));
    assert.ok(multiCheck.detail.includes('3 git repos discovered'));

    const watchedGen = runCli(
      ['generate', '--repo', cfgDir, '--all-watched', '--out', outDir, '--json'],
      cliOpts
    );
    assert.equal(watchedGen.status, 0, watchedGen.stderr);
    const watchedGenJson = JSON.parse(watchedGen.stdout);
    assert.equal(watchedGenJson.isMultiRepo, true);
    assert.equal(watchedGenJson.activeRepoCount, 2);

    const watchedReport = runCli(
      ['send-report', '--repo', cfgDir, '--all-watched', '--period', 'daily', '--channel', 'feishu'],
      cliOpts
    );
    assert.equal(watchedReport.status, 0, watchedReport.stderr);
    const watchedReportJson = JSON.parse(watchedReport.stdout);
    assert.equal(watchedReportJson.multiRepo.activeRepoCount, 2);
    assert.ok(watchedReportJson.body.content.text.includes('[alpha-api]'));
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
    rmSync(cfgDir, { recursive: true, force: true });
  }
});
