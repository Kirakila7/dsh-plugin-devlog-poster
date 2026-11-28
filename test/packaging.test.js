import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const EXPECTED_VERSION = '0.9.0';

function readJson(relPath) {
  const fullPath = resolve(ROOT, relPath);
  assert.ok(existsSync(fullPath), `${relPath} must exist`);
  return JSON.parse(readFileSync(fullPath, 'utf8'));
}

test('all packaging JSON manifests parse cleanly and share version 0.8.0', () => {
  const pkg = readJson('package.json');
  const agyPlugin = readJson('plugin.json');
  const codexPlugin = readJson('.codex-plugin/plugin.json');
  const screenshots = readJson('screenshots.json');

  // Version parity across manifests
  assert.equal(pkg.version, EXPECTED_VERSION);
  assert.equal(agyPlugin.version, EXPECTED_VERSION);
  assert.equal(codexPlugin.version, EXPECTED_VERSION);

  // screenshots.json valid array of existing assets
  assert.ok(Array.isArray(screenshots) && screenshots.length === 4);
  for (const shot of screenshots) {
    assert.equal(typeof shot, 'string');
    assert.ok(existsSync(resolve(ROOT, shot)), `screenshot asset must exist: ${shot}`);
  }

  // Antigravity root plugin.json schema
  assert.equal(agyPlugin.name, 'devlog-poster');
  assert.equal(typeof agyPlugin.displayName, 'string');
  assert.ok(agyPlugin.displayName.length > 0);
  assert.equal(typeof agyPlugin.description, 'string');
  assert.ok(agyPlugin.description.length > 20);
  assert.equal(agyPlugin.license, 'MIT');
  assert.ok(
    typeof agyPlugin.repository === 'string'
      ? agyPlugin.repository.startsWith('https://github.com/Kirakila7/dsh-plugin-devlog-poster')
      : agyPlugin.repository?.url?.startsWith('https://github.com/Kirakila7/dsh-plugin-devlog-poster')
  );
  assert.ok(Array.isArray(agyPlugin.suggestedPrompts));
  assert.equal(agyPlugin.suggestedPrompts.length, 3);
  for (const prompt of agyPlugin.suggestedPrompts) {
    assert.equal(typeof prompt, 'string');
    assert.ok(prompt.trim().length > 0);
  }

  // OpenAI Codex .codex-plugin/plugin.json schema
  assert.equal(codexPlugin.name, 'devlog-poster');
  assert.equal(typeof codexPlugin.description, 'string');
  assert.ok(codexPlugin.description.length > 20);
  assert.equal(codexPlugin.skills, './skills/');
  assert.ok(codexPlugin.interface?.displayName);
  assert.ok(existsSync(resolve(ROOT, 'skills/devlog-poster/SKILL.md')));
  assert.equal(codexPlugin.license, 'MIT');
  assert.ok(Array.isArray(codexPlugin.keywords) && codexPlugin.keywords.length > 0);
  assert.ok(
    typeof codexPlugin.repository === 'string'
      ? codexPlugin.repository.startsWith('https://github.com/Kirakila7/dsh-plugin-devlog-poster')
      : codexPlugin.repository?.url?.startsWith('https://github.com/Kirakila7/dsh-plugin-devlog-poster')
  );
});

test('package.json files, keywords, dsh.bundle, and zero runtime dependencies are complete', () => {
  const pkg = readJson('package.json');

  assert.equal(pkg.dependencies, undefined, 'package.json must maintain zero runtime dependencies');
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml');

  const requiredFiles = [
    'src',
    'assets',
    'skills',
    'plugin.json',
    '.codex-plugin',
    'cordis.patch.yml',
    'screenshots.json',
    'README.md',
  ];
  assert.ok(Array.isArray(pkg.files));
  for (const entry of requiredFiles) {
    assert.ok(pkg.files.includes(entry), `package.json files must include "${entry}"`);
  }

  const requiredKeywords = ['antigravity-plugin', 'codex-plugin', 'agent-skill'];
  assert.ok(Array.isArray(pkg.keywords));
  for (const kw of requiredKeywords) {
    assert.ok(pkg.keywords.includes(kw), `package.json keywords must include "${kw}"`);
  }
});

test('zero personal path leaks across distribution docs and manifests', () => {
  const filesToAudit = [
    'skills/devlog-poster/SKILL.md',
    'README.md',
    'plugin.json',
    '.codex-plugin/plugin.json',
  ];

  const unixPersonalPath = /\/Users\//;
  const winPersonalPath = /[A-Za-z]:\\Users\\/;

  for (const relPath of filesToAudit) {
    const content = readFileSync(resolve(ROOT, relPath), 'utf8');
    assert.ok(!unixPersonalPath.test(content), `${relPath} must not contain /Users/ paths`);
    assert.ok(!winPersonalPath.test(content), `${relPath} must not contain Windows Users paths`);
  }
});

test('SKILL.md uses portable 3-tier CLI resolution and README documents all 4 ecosystems', () => {
  const skill = readFileSync(resolve(ROOT, 'skills/devlog-poster/SKILL.md'), 'utf8');
  const cmdIdx = skill.indexOf('DEVLOG_CMD=(devlog-poster)');
  const localIdx = skill.indexOf('DEVLOG_CMD=(node ./src/cli.js)');
  const npxIdx = skill.indexOf('DEVLOG_CMD=(npx -y github:Kirakila7/dsh-plugin-devlog-poster)');

  assert.ok(cmdIdx >= 0, 'SKILL.md must check globally linked devlog-poster first');
  assert.ok(localIdx > cmdIdx, 'SKILL.md must fall back to node ./src/cli.js second');
  assert.ok(npxIdx > localIdx, 'SKILL.md must fall back to npx -y github:Kirakila7/dsh-plugin-devlog-poster third');

  const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');
  assert.ok(readme.includes('dsh plugin --profile web add github:Kirakila7/dsh-plugin-devlog-poster'));
  assert.ok(readme.includes('npx skills add Kirakila7/dsh-plugin-devlog-poster'));
  assert.ok(readme.includes('agy plugin install'));
  assert.ok(readme.includes('.codex-plugin/plugin.json'));
});
