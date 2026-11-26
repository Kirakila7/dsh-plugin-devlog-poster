import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  apply,
  name,
  inject,
  collectGitContext,
  formatMultiPlatformDevlog,
  writeDevlogBundle,
  publishToGitHub,
  savePlatformDraft,
} from '../src/index.js';
import { AVAILABLE_STYLES } from '../src/styles.js';

test('DSH Cordis plugin exports name, inject, and registers 4 tools cleanly', async () => {
  assert.equal(name, 'dsh-plugin-devlog-poster');
  assert.deepEqual(inject, ['tools']);

  const registered = [];
  let disposedCount = 0;

  const mockCtx = {
    tools: {
      register(tool) {
        registered.push(tool);
        return () => {
          disposedCount += 1;
        };
      },
    },
  };

  const cleanup = apply(mockCtx);
  assert.equal(registered.length, 4);
  assert.deepEqual(
    registered.map((t) => t.name),
    [
      'devlog_collect_context',
      'devlog_generate_bundle',
      'devlog_publish_github',
      'devlog_save_draft',
    ]
  );

  // Execute generate tool through registered spec
  const tmpOut = mkdtempSync(join(tmpdir(), 'dsh-devlog-tool-'));
  try {
    const genTool = registered.find((t) => t.name === 'devlog_generate_bundle');
    const result = await genTool.execute({
      projectName: 'Kirakila7/Nekofans',
      highlights: ['完成了 3D 会客厅双向轮盘评审', '打通 DSH 四平台 Devlog 一键生成'],
      pitfalls: ['上下文槽位容易误触，改用固定方位 + 双向回合'],
      nextSteps: ['接入小红书/B站浏览器自动存草稿'],
      outputDir: tmpOut,
    });

    assert.ok(existsSync(result.files.preview));
    assert.ok(existsSync(result.files.cardVertical));
    assert.ok(existsSync(result.files.cardHorizontal));
    const previewHtml = readFileSync(result.files.preview, 'utf8');
    assert.ok(previewHtml.includes('switchStyle('));
    assert.ok(previewHtml.includes('window.__DEVLOG_VARIANTS__'));
    assert.ok(previewHtml.includes('data-style="big_fat_fish"'));
    assert.ok(previewHtml.includes('data-style="gemini"'));
    assert.ok(previewHtml.includes('data-style="chatgpt"'));
    assert.ok(previewHtml.includes('data-style="claude"'));

    // Test v2 savePlatformDraft dry-run across Xiaohongshu, Bilibili, Douyin
    for (const platform of ['xiaohongshu', 'bilibili', 'douyin']) {
      const draftPlan = await savePlatformDraft({
        platform,
        bundleDir: result.bundleDir,
        dryRun: true,
      });
      assert.equal(draftPlan.ok, true);
      assert.equal(draftPlan.dryRun, true);
      assert.equal(draftPlan.platform, platform);
      assert.ok(draftPlan.steps.length >= 4);
    }
  } finally {
    rmSync(tmpOut, { recursive: true, force: true });
  }

  cleanup();
  assert.equal(disposedCount, 4);
});

test('collectGitContext reads commits and diff stats from a real git repository', () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'dsh-devlog-repo-'));
  try {
    execFileSync('git', ['init'], { cwd: tmpRepo, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmpRepo });
    execFileSync('git', ['config', 'user.name', 'Test Dev'], { cwd: tmpRepo });
    execFileSync('sh', ['-c', 'echo "hello world" > README.md'], { cwd: tmpRepo });
    execFileSync('git', ['add', 'README.md'], { cwd: tmpRepo });
    execFileSync('git', ['commit', '-m', 'feat: init devlog poster v1'], {
      cwd: tmpRepo,
      stdio: 'ignore',
    });

    const ctx = collectGitContext({ repoPath: tmpRepo, projectName: 'Kirakila7/forkira' });
    assert.equal(ctx.isGitRepo, true);
    assert.equal(ctx.projectName, 'Kirakila7/forkira');
    assert.equal(ctx.commits.length, 1);
    assert.equal(ctx.commits[0].subject, 'feat: init devlog poster v1');

    const formatted = formatMultiPlatformDevlog(ctx);
    assert.ok(formatted.platforms.github.content.includes('feat: init devlog poster v1'));

    const bundle = writeDevlogBundle(ctx, formatted, { outputDir: join(tmpRepo, 'out') });
    const previewHtml = readFileSync(bundle.files.preview, 'utf8');
    assert.ok(previewHtml.includes('一键复制正文'));
    assert.ok(previewHtml.includes('导出 PNG'));
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('publishToGitHub supports dry-run and real DEVLOG.md append', () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-devlog-pub-'));
  try {
    const dry = publishToGitHub({
      mode: 'devlog_file',
      repoPath: tmpDir,
      body: '## Devlog Test\n- Shipped v1',
      dryRun: true,
    });
    assert.equal(dry.dryRun, true);
    assert.equal(existsSync(join(tmpDir, 'DEVLOG.md')), false);

    const real = publishToGitHub({
      mode: 'devlog_file',
      repoPath: tmpDir,
      body: '## Devlog Test\n- Shipped v1',
      dryRun: false,
    });
    assert.equal(real.dryRun, false);
    assert.ok(readFileSync(join(tmpDir, 'DEVLOG.md'), 'utf8').includes('Shipped v1'));

    const relDry = publishToGitHub({
      mode: 'release',
      repoPath: tmpDir,
      repo: 'Kirakila7/dsh-plugin-devlog-poster',
      tag: 'v0.1.0',
      title: 'v0.1.0',
      body: 'Initial release',
      dryRun: true,
    });
    assert.equal(relDry.dryRun, true);
    assert.ok(relDry.command.includes('gh release create v0.1.0'));
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('supports big_fat_fish, gemini, chatgpt, and claude styles end-to-end', () => {
  assert.deepEqual(AVAILABLE_STYLES, ['big_fat_fish', 'gemini', 'chatgpt', 'claude']);
  const tmpOut = mkdtempSync(join(tmpdir(), 'dsh-devlog-styles-'));
  try {
    const ctx = collectGitContext({
      repoPath: tmpOut,
      projectName: 'Kirakila7/dsh-plugin-devlog-poster',
      highlights: ['新增大肥鱼 / Gemini / ChatGPT / Claude 四套模型风格'],
      pitfalls: ['不同平台文案节奏差异大，拆分独立模板'],
    });
    for (const style of AVAILABLE_STYLES) {
      const formatted = formatMultiPlatformDevlog(ctx, { style });
      assert.equal(formatted.meta.style, style);
      const written = writeDevlogBundle(ctx, formatted, { outputDir: join(tmpOut, style) });
      const svgV = readFileSync(written.files.cardVertical, 'utf8');
      assert.ok(svgV.includes('<svg'));
      assert.ok(svgV.includes(formatted.meta.styleName));
    }
  } finally {
    rmSync(tmpOut, { recursive: true, force: true });
  }
});
