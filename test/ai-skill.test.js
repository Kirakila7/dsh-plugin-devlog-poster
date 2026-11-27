import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  AI_PROVIDER_DEFAULTS,
  AUTO_DETECT_ORDER,
  SUPPORTED_AI_PROVIDERS,
  buildAiProviderRequest,
  buildSummaryPrompts,
  collectRichDiffContext,
  detectAiProvider,
  extractProviderText,
  getAiKeyStatus,
  mergeAiSummary,
  parseSummaryJson,
  summarizeWithAI,
} from '../src/ai-summarizer.js';
import {
  CONFIG_KEYS,
  DEFAULT_CONFIG,
  SECRET_CONFIG_KEYS,
  maskConfigSecrets,
  validateConfigPatch,
} from '../src/config.js';
import { parseArgs } from '../src/cli.js';
import { MODEL_STYLES } from '../src/styles.js';
import { apply, summarizeWithAI as indexSummarizeWithAI } from '../src/index.js';

const NODE_BIN = process.execPath;
const CLI_PATH = resolve(process.cwd(), 'src/cli.js');
const SKILL_PATH = resolve(process.cwd(), 'skills/devlog-poster/SKILL.md');

function cleanAiEnv(extra = {}) {
  const env = { ...process.env, DEVLOG_POSTER_NO_OPEN: '1' };
  delete env.DEEPSEEK_API_KEY;
  delete env.OPENAI_API_KEY;
  delete env.GEMINI_API_KEY;
  delete env.ANTHROPIC_API_KEY;
  return { ...env, ...extra };
}

function runCli(args = [], { cwd = process.cwd(), env = {} } = {}) {
  try {
    const stdout = execFileSync(NODE_BIN, [CLI_PATH, ...args], {
      cwd,
      encoding: 'utf8',
      env: cleanAiEnv(env),
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

test('SKILL.md has valid YAML frontmatter, zero-cost agent workflow, 4 styles, aliases & Zipzipipe credit; package.json includes skills', () => {
  assert.ok(existsSync(SKILL_PATH), 'skills/devlog-poster/SKILL.md must exist');
  const content = readFileSync(SKILL_PATH, 'utf8');

  // Valid YAML frontmatter delimiters
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(fmMatch, 'SKILL.md must start with YAML frontmatter');
  const frontmatter = fmMatch[1];
  assert.match(frontmatter, /^name:\s*devlog-poster$/m);
  assert.match(frontmatter, /^description:/m);
  assert.ok(frontmatter.includes('Build-in-Public'));
  assert.ok(frontmatter.includes('开发日志'));
  assert.ok(frontmatter.includes('工作日报'));

  // Zero-cost reasoning workflow & CLI fallback path
  assert.ok(content.includes('Antigravity'));
  assert.ok(content.includes('Codex'));
  assert.ok(content.includes('Claude Code'));
  assert.ok(content.includes('git log'));
  assert.ok(content.includes('git diff --stat'));
  assert.ok(content.includes('devlog-poster'));
  assert.ok(content.includes('node ./src/cli.js'));
  assert.ok(content.includes('npx -y github:Kirakila7/dsh-plugin-devlog-poster'));
  assert.ok(!/\/Users\//.test(content), 'SKILL.md must not leak personal /Users/ paths');
  assert.ok(!/[A-Za-z]:\\Users\\/.test(content), 'SKILL.md must not leak personal Windows user paths');
  assert.ok(content.includes('--open'));
  assert.ok(content.includes('publish-github'));
  assert.ok(content.includes('save-draft'));
  assert.ok(content.includes('send-report'));
  assert.ok(content.includes('dry-run') || content.includes('dryRun'));

  // All 4 AI-girl styles + aliases + Zipzipipe attribution
  for (const token of ['big_fat_fish', 'gemini', 'chatgpt', 'claude', 'fish', 'hakimi', 'gpt', 'Zipzipipe']) {
    assert.ok(content.includes(token), `SKILL.md should document "${token}"`);
  }

  // package.json includes "skills" in files and has zero runtime dependencies
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
  assert.ok(Array.isArray(pkg.files) && pkg.files.includes('skills'));
  assert.equal(pkg.dependencies, undefined);
});

test('AI provider auto-detection follows DEEPSEEK -> OPENAI -> GEMINI -> ANTHROPIC priority', () => {
  assert.deepEqual(AUTO_DETECT_ORDER, ['deepseek', 'openai', 'gemini', 'anthropic']);
  assert.deepEqual(SUPPORTED_AI_PROVIDERS, [
    'auto',
    'deepseek',
    'openai',
    'gemini',
    'anthropic',
    'custom_openai',
  ]);

  // Empty env -> unconfigured
  const none = detectAiProvider({ provider: 'auto', env: {} });
  assert.equal(none.valid, true);
  assert.equal(none.configured, false);
  assert.equal(none.resolvedProvider, null);

  // All 4 set -> picks deepseek first
  const all = detectAiProvider({
    provider: 'auto',
    env: {
      DEEPSEEK_API_KEY: 'ds-key',
      OPENAI_API_KEY: 'oa-key',
      GEMINI_API_KEY: 'gm-key',
      ANTHROPIC_API_KEY: 'an-key',
    },
  });
  assert.equal(all.resolvedProvider, 'deepseek');
  assert.equal(all.apiKey, 'ds-key');

  // Without deepseek -> picks openai
  const second = detectAiProvider({
    provider: 'auto',
    env: { OPENAI_API_KEY: 'oa-key', GEMINI_API_KEY: 'gm-key', ANTHROPIC_API_KEY: 'an-key' },
  });
  assert.equal(second.resolvedProvider, 'openai');

  // Without deepseek/openai -> picks gemini
  const third = detectAiProvider({
    provider: 'auto',
    env: { GEMINI_API_KEY: 'gm-key', ANTHROPIC_API_KEY: 'an-key' },
  });
  assert.equal(third.resolvedProvider, 'gemini');

  // Only anthropic -> picks anthropic
  const fourth = detectAiProvider({
    provider: 'auto',
    env: { ANTHROPIC_API_KEY: 'an-key' },
  });
  assert.equal(fourth.resolvedProvider, 'anthropic');

  // Invalid provider
  const invalid = detectAiProvider({ provider: 'bogus', env: {} });
  assert.equal(invalid.valid, false);

  // Key status helper for doctor
  const status = getAiKeyStatus({ config: { aiProvider: 'auto' }, env: { GEMINI_API_KEY: 'AIza123' } });
  assert.equal(status.configured, true);
  assert.equal(status.provider, 'gemini');
  assert.equal(status.source, 'GEMINI_API_KEY');
});

test('buildAiProviderRequest builds valid requests for all 4 providers + custom_openai with active style copyPrompt', () => {
  const prompts = buildSummaryPrompts({
    context: {
      projectName: 'Kirakila7/demo',
      branch: 'main',
      stats: { filesChanged: 3, insertions: 80, deletions: 12 },
      commits: [{ sha: 'abc1234', date: '2026-11-27', subject: 'feat: add --ai summarizer' }],
      changedFiles: ['src/ai-summarizer.js'],
    },
    diffContext: { logStat: 'abc1234 feat: add --ai summarizer', patchSnippet: '+export function summarizeWithAI() {}' },
    style: 'gemini',
  });

  assert.equal(prompts.style, 'gemini');
  assert.ok(prompts.systemPrompt.includes(MODEL_STYLES.gemini.copyPrompt));
  assert.ok(prompts.userPrompt.includes('Kirakila7/demo'));

  // 1. DeepSeek
  const dsReq = buildAiProviderRequest({
    provider: 'deepseek',
    apiKey: 'ds-secret',
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
  });
  assert.equal(dsReq.url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(dsReq.model, 'deepseek-chat');
  assert.equal(dsReq.headers.Authorization, 'Bearer ds-secret');
  assert.equal(dsReq.body.messages[0].role, 'system');
  assert.deepEqual(dsReq.body.response_format, { type: 'json_object' });

  // 2. OpenAI
  const oaReq = buildAiProviderRequest({
    provider: 'openai',
    apiKey: 'oa-secret',
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
  });
  assert.equal(oaReq.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(oaReq.model, 'gpt-4o-mini');
  assert.equal(oaReq.headers.Authorization, 'Bearer oa-secret');

  // 3. Gemini
  const gmReq = buildAiProviderRequest({
    provider: 'gemini',
    apiKey: 'gm-secret',
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
  });
  assert.equal(
    gmReq.url,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=gm-secret'
  );
  assert.equal(gmReq.model, 'gemini-2.0-flash');
  assert.equal(gmReq.body.systemInstruction.parts[0].text, prompts.systemPrompt);
  assert.equal(gmReq.body.generationConfig.responseMimeType, 'application/json');

  // 4. Anthropic
  const anReq = buildAiProviderRequest({
    provider: 'anthropic',
    apiKey: 'an-secret',
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
  });
  assert.equal(anReq.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(anReq.model, 'claude-3-5-haiku-latest');
  assert.equal(anReq.headers['x-api-key'], 'an-secret');
  assert.equal(anReq.headers['anthropic-version'], '2023-06-01');
  assert.equal(anReq.body.system, prompts.systemPrompt);

  // 5. Custom OpenAI-compatible
  const customReq = buildAiProviderRequest({
    provider: 'custom_openai',
    model: 'qwen2.5-coder',
    endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
    apiKey: 'local-key',
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
  });
  assert.equal(customReq.url, 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(customReq.model, 'qwen2.5-coder');
  assert.equal(customReq.headers.Authorization, 'Bearer local-key');
  assert.equal(AI_PROVIDER_DEFAULTS.deepseek.model, 'deepseek-chat');
});

test('parseSummaryJson strips markdown code fences cleanly and handles edge cases', () => {
  const fenced = [
    '```json',
    '{',
    '  "title": "大肥鱼上线 AI 自动摘要",',
    '  "highlights": ["新增 --ai 自动摘要", "支持 4 家模型自动探测", "新增 --ai 自动摘要"],',
    '  "pitfalls": ["模型返回常带 Markdown 代码块包裹"],',
    '  "nextSteps": ["补充多语言提示词模板"]',
    '}',
    '```',
  ].join('\n');

  const parsed = parseSummaryJson(fenced);
  assert.equal(parsed.title, '大肥鱼上线 AI 自动摘要');
  assert.deepEqual(parsed.highlights, ['新增 --ai 自动摘要', '支持 4 家模型自动探测']);
  assert.deepEqual(parsed.pitfalls, ['模型返回常带 Markdown 代码块包裹']);
  assert.deepEqual(parsed.nextSteps, ['补充多语言提示词模板']);

  // Prose wrapped JSON
  const proseWrapped = 'Here is the JSON:\n{"highlights":["Clean parser"],"pitfalls":[],"nextSteps":[]}';
  const parsed2 = parseSummaryJson(proseWrapped);
  assert.deepEqual(parsed2.highlights, ['Clean parser']);
  assert.equal(parsed2.title, undefined);

  assert.throws(() => parseSummaryJson('not json at all'));
  assert.throws(() => parseSummaryJson('{}'));
});

test('collectRichDiffContext bounds large git diff patches cleanly', () => {
  const tmpRepo = mkdtempSync(join(tmpdir(), 'dsh-ai-diff-'));
  try {
    execFileSync('git', ['init'], { cwd: tmpRepo, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'dev@example.com'], { cwd: tmpRepo });
    execFileSync('git', ['config', 'user.name', 'Indie Dev'], { cwd: tmpRepo });
    writeFileSync(join(tmpRepo, 'big.txt'), 'line of code change\n'.repeat(600), 'utf8');
    execFileSync('git', ['add', 'big.txt'], { cwd: tmpRepo });
    execFileSync('git', ['commit', '-m', 'feat: add large module'], { cwd: tmpRepo, stdio: 'ignore' });

    const diff = collectRichDiffContext({ repoPath: tmpRepo, maxPatchChars: 500 });
    assert.equal(diff.isGitRepo, true);
    assert.ok(diff.logStat.includes('feat: add large module'));
    assert.ok(diff.patchSnippet.length <= 500);
    assert.equal(diff.truncated, true);
    assert.ok(diff.patchSnippet.endsWith('... [truncated]'));
  } finally {
    rmSync(tmpRepo, { recursive: true, force: true });
  }
});

test('summarizeWithAI supports dryRun, mock fetch end-to-end across providers, mergeAiSummary, and graceful fallback', async () => {
  const baseContext = {
    repoPath: process.cwd(),
    projectName: 'Kirakila7/dsh-plugin-devlog-poster',
    branch: 'main',
    stats: { filesChanged: 4, insertions: 120, deletions: 10 },
    commits: [{ sha: '111aaaa', date: '2026-11-27', subject: 'feat: add skill & --ai summarizer' }],
  };

  // 1. dryRun inspects prompt/request without calling fetch and masks secrets
  let fetchCalled = false;
  const dryRes = await summarizeWithAI({
    context: baseContext,
    style: 'claude',
    provider: 'gemini',
    apiKey: 'AIzaSecretKey999',
    dryRun: true,
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('should not call fetch in dryRun');
    },
  });
  assert.equal(fetchCalled, false);
  assert.equal(dryRes.ok, true);
  assert.equal(dryRes.dryRun, true);
  assert.equal(dryRes.provider, 'gemini');
  assert.ok(dryRes.prompts.systemPrompt.includes(MODEL_STYLES.claude.copyPrompt));
  assert.ok(dryRes.requestPreview.url.includes('key=***'));
  assert.ok(!dryRes.requestPreview.url.includes('AIzaSecretKey999'));

  // 2. No API key -> structured graceful fallback (never throws)
  const noKeyRes = await summarizeWithAI({
    context: baseContext,
    provider: 'auto',
    env: {},
  });
  assert.equal(noKeyRes.ok, false);
  assert.equal(noKeyRes.reason, 'NO_API_KEY');
  assert.ok(noKeyRes.hint.includes('DEEPSEEK_API_KEY'));

  // 3. Mock fetch end-to-end (DeepSeek fenced JSON + mergeAiSummary)
  const mockFetch = async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/v1/chat/completions');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'deepseek-chat');
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '```json\n{"title":"🐳 大肥鱼今日战报","highlights":["接入 --ai 自动提炼","新增多 Agent Skill"],"pitfalls":["长 diff 需截断控预算"],"nextSteps":["补齐 E2E 回归测试"]}\n```',
              },
            },
          ],
        });
      },
    };
  };

  const okRes = await summarizeWithAI({
    context: baseContext,
    style: 'big_fat_fish',
    provider: 'auto',
    env: { DEEPSEEK_API_KEY: 'ds-mock-key' },
    fetchImpl: mockFetch,
  });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.provider, 'deepseek');
  assert.equal(okRes.summary.title, '🐳 大肥鱼今日战报');
  assert.equal(okRes.summary.highlights.length, 2);

  // Merge user explicit highlight + AI summary cleanly
  const merged = mergeAiSummary(
    { highlights: ['用户手动亮点'], pitfalls: [], nextSteps: [] },
    okRes.summary
  );
  assert.equal(merged.title, '🐳 大肥鱼今日战报');
  assert.deepEqual(merged.highlights, ['用户手动亮点', '接入 --ai 自动提炼', '新增多 Agent Skill']);
  assert.deepEqual(merged.pitfalls, ['长 diff 需截断控预算']);
  assert.deepEqual(merged.nextSteps, ['补齐 E2E 回归测试']);

  // Provider text extraction for Gemini & Anthropic
  assert.equal(
    extractProviderText('gemini', { candidates: [{ content: { parts: [{ text: '{"highlights":["G"]}' }] } }] }),
    '{"highlights":["G"]}'
  );
  assert.equal(
    extractProviderText('anthropic', { content: [{ type: 'text', text: '{"highlights":["A"]}' }] }),
    '{"highlights":["A"]}'
  );

  // 4. Network error -> structured graceful fallback
  const failRes = await summarizeWithAI({
    context: baseContext,
    provider: 'openai',
    apiKey: 'sk-test',
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  assert.equal(failRes.ok, false);
  assert.equal(failRes.reason, 'FETCH_ERROR');
  assert.ok(failRes.message.includes('ECONNREFUSED'));
});

test('config validates aiProvider enum, stores AI fields, and masks aiApiKey', () => {
  assert.equal(DEFAULT_CONFIG.aiProvider, 'auto');
  assert.ok(CONFIG_KEYS.includes('aiProvider'));
  assert.ok(CONFIG_KEYS.includes('aiModel'));
  assert.ok(CONFIG_KEYS.includes('aiEndpoint'));
  assert.ok(CONFIG_KEYS.includes('aiApiKey'));
  assert.ok(SECRET_CONFIG_KEYS.includes('aiApiKey'));

  const ok = validateConfigPatch({ aiProvider: 'anthropic', aiModel: 'claude-3-5-haiku-latest' });
  assert.equal(ok.valid, true);
  assert.equal(ok.normalized.aiProvider, 'anthropic');

  const bad = validateConfigPatch({ aiProvider: 'unknown_llm' });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors[0].includes('Invalid aiProvider'));

  const masked = maskConfigSecrets({ ...DEFAULT_CONFIG, aiApiKey: 'sk-deepseek-987654' });
  assert.equal(masked.aiApiKey, 'sk-***7654');
});

test('index.js exports summarizeWithAI and supports useAiSummary gracefully without breaking 6 tools', async () => {
  assert.equal(typeof indexSummarizeWithAI, 'function');

  const registered = [];
  const cleanup = apply({
    tools: {
      register(spec) {
        registered.push(spec);
        return () => {};
      },
    },
  });

  const tmpOut = mkdtempSync(join(tmpdir(), 'dsh-ai-idx-'));
  const savedKeys = {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  try {
    assert.equal(registered.length, 6);
    const genTool = registered.find((t) => t.name === 'devlog_generate_bundle');
    const reportTool = registered.find((t) => t.name === 'devlog_send_work_report');

    assert.ok(genTool.parameters.useAiSummary);
    assert.ok(reportTool.parameters.useAiSummary);

    const genRes = await genTool.execute({
      repoPath: tmpOut,
      projectName: 'DemoAi',
      outputDir: join(tmpOut, 'out'),
      useAiSummary: true,
    });
    assert.ok(existsSync(genRes.files.preview));
    assert.equal(genRes.aiSummary.ok, false);
    assert.equal(genRes.aiSummary.reason, 'NO_API_KEY');

    const repRes = await reportTool.execute({
      repoPath: tmpOut,
      projectName: 'DemoAi',
      useAiSummary: true,
      dryRun: true,
    });
    assert.equal(repRes.ok, true);
    assert.equal(repRes.dryRun, true);
    assert.equal(repRes.aiSummary.ok, false);
  } finally {
    for (const [k, v] of Object.entries(savedKeys)) {
      if (v !== undefined) process.env[k] = v;
    }
    cleanup();
    rmSync(tmpOut, { recursive: true, force: true });
  }
});

test('CLI parses --ai flags, shows AI status in doctor, and falls back gracefully on generate --ai & send-report --ai with no key', () => {
  const parsed = parseArgs([
    'generate',
    '--ai',
    '--ai-provider',
    'deepseek',
    '--ai-model',
    'deepseek-chat',
    '--ai-endpoint',
    'https://api.deepseek.com/v1/chat/completions',
    '--ai-api-key',
    'sk-test',
  ]);
  assert.equal(parsed.opts.ai, true);
  assert.equal(parsed.opts.aiProvider, 'deepseek');
  assert.equal(parsed.opts.aiModel, 'deepseek-chat');
  assert.equal(parsed.opts.aiEndpoint, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(parsed.opts.aiApiKey, 'sk-test');

  const tmpDir = mkdtempSync(join(tmpdir(), 'dsh-ai-cli-'));
  try {
    // 1. --help mentions --ai
    const helpRes = runCli(['--help'], { cwd: tmpDir });
    assert.equal(helpRes.status, 0);
    assert.ok(helpRes.stdout.includes('--ai'));
    assert.ok(helpRes.stdout.includes('--ai-provider'));

    // 2. doctor shows AI summarizer status cleanly
    const docRes = runCli(['doctor', '--repo', process.cwd(), '--json'], { cwd: tmpDir });
    assert.equal(docRes.status, 0);
    const docJson = JSON.parse(docRes.stdout);
    assert.equal(docJson.ok, true);
    const aiCheck = docJson.checks.find((c) => c.id === 'ai_summarizer');
    assert.ok(aiCheck, 'doctor must report ai_summarizer check');
    assert.equal(aiCheck.status, 'warn');

    // doctor reports ok when an API key env var is present
    const docKeyRes = runCli(['doctor', '--repo', process.cwd(), '--json'], {
      cwd: tmpDir,
      env: { DEEPSEEK_API_KEY: 'ds-fake-key' },
    });
    assert.equal(docKeyRes.status, 0);
    const docKeyJson = JSON.parse(docKeyRes.stdout);
    const aiCheckOk = docKeyJson.checks.find((c) => c.id === 'ai_summarizer');
    assert.equal(aiCheckOk.status, 'ok');
    assert.ok(aiCheckOk.detail.includes('deepseek'));

    // 3. generate --ai with no API key falls back smoothly, prints 💡 Try:, writes full bundle, exits 0
    const outDir = join(tmpDir, 'out');
    const genRes = runCli(['generate', '--ai', '--repo', process.cwd(), '--out', outDir], { cwd: tmpDir });
    assert.equal(genRes.status, 0);
    assert.ok(genRes.stdout.includes('💡 Try:'));
    assert.ok(genRes.stdout.includes('✅ Devlog bundle generated:'));

    // 4. generate --ai --json emits valid JSON with aiSummary fallback info
    const genJsonRes = runCli(['generate', '--ai', '--json', '--repo', process.cwd(), '--out', outDir], {
      cwd: tmpDir,
    });
    assert.equal(genJsonRes.status, 0);
    const genJson = JSON.parse(genJsonRes.stdout);
    assert.equal(genJson.ok, true);
    assert.equal(genJson.aiSummary.requested, true);
    assert.equal(genJson.aiSummary.ok, false);
    assert.equal(genJson.aiSummary.reason, 'NO_API_KEY');
    assert.ok(existsSync(genJson.files.preview));

    // 5. send-report --ai with no key falls back gracefully and outputs valid JSON
    const repRes = runCli(['send-report', '--ai', '--repo', process.cwd()], { cwd: tmpDir });
    assert.equal(repRes.status, 0);
    const repJson = JSON.parse(repRes.stdout);
    assert.equal(repJson.ok, true);
    assert.equal(repJson.dryRun, true);
    assert.equal(repJson.aiSummary.ok, false);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
