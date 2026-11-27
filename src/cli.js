#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectGitContext } from './git-context.js';
import { formatMultiPlatformDevlog } from './formatter.js';
import { publishToGitHub, writeDevlogBundle } from './publisher.js';
import { DRAFT_PLATFORMS, savePlatformDraft } from './draft-automation.js';
import {
  formatWorkReport,
  sendWorkReport,
  SUPPORTED_REPORT_CHANNELS,
} from './work-report.js';
import {
  generateVisualImage,
  PLATFORM_IMAGE_PRESETS,
  SUPPORTED_IMAGE_PROVIDERS,
} from './image-gen.js';
import {
  getAiKeyStatus,
  mergeAiSummary,
  summarizeWithAI,
  SUPPORTED_AI_PROVIDERS,
} from './ai-summarizer.js';
import {
  CONFIG_KEYS,
  inspectConfig,
  loadConfig,
  normalizeStyleId,
  resetConfig,
  saveConfig,
  validateConfigPatch,
} from './config.js';
import { AVAILABLE_STYLES, MODEL_STYLES } from './styles.js';

const PACKAGE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const VALUE_FLAGS = new Map([
  ['--repo', 'repoPath'],
  ['--name', 'projectName'],
  ['--title', 'title'],
  ['--style', 'style'],
  ['--since', 'since'],
  ['--out', 'outputDir'],
  ['--mode', 'mode'],
  ['--tag', 'tag'],
  ['--gh-repo', 'ghRepo'],
  ['--platform', 'platform'],
  ['--bundle', 'bundleDir'],
  ['--profile-dir', 'profileDir'],
  ['--channel', 'channel'],
  ['--endpoint', 'endpoint'],
  ['--token', 'token'],
  ['--group-id', 'groupId'],
  ['--user-id', 'userId'],
  ['--period', 'period'],
  ['--provider', 'provider'],
  ['--model', 'model'],
  ['--api-key', 'apiKey'],
  ['--output', 'outputPath'],
  ['--hero-image', 'heroImagePath'],
  ['--ai-provider', 'aiProvider'],
  ['--ai-model', 'aiModel'],
  ['--ai-endpoint', 'aiEndpoint'],
  ['--ai-api-key', 'aiApiKey'],
]);

const ARRAY_FLAGS = new Map([
  ['--highlight', 'highlights'],
  ['--pitfall', 'pitfalls'],
  ['--next', 'nextSteps'],
]);

const BOOLEAN_FLAGS = new Map([
  ['--ai', 'ai'],
  ['--execute', 'execute'],
  ['--open', 'open'],
  ['--local', 'local'],
  ['--json', 'json'],
  ['--help', 'help'],
  ['-h', 'help'],
  ['--version', 'version'],
  ['-v', 'version'],
]);

export class CliError extends Error {
  constructor(message, hint = '') {
    super(message);
    this.name = 'CliError';
    this.hint = hint;
  }
}

function getPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function parseArgs(argv) {
  let command = 'generate';
  let rest = argv;

  if (argv.length > 0) {
    const first = argv[0];
    if (first === '--help' || first === '-h' || first === 'help') {
      command = 'help';
      rest = argv.slice(1);
    } else if (first === '--version' || first === '-v' || first === 'version') {
      command = 'version';
      rest = argv.slice(1);
    } else if (!first.startsWith('-')) {
      command = first;
      rest = argv.slice(1);
    }
  }

  const opts = {
    highlights: [],
    pitfalls: [],
    nextSteps: [],
    positionals: [],
    unknownFlags: [],
  };

  for (let i = 0; i < rest.length; i++) {
    const raw = rest[i];
    let token = raw;
    let inlineValue;
    let hasInlineValue = false;

    if (raw.startsWith('--') && raw.includes('=')) {
      const eqIdx = raw.indexOf('=');
      token = raw.slice(0, eqIdx);
      inlineValue = raw.slice(eqIdx + 1);
      hasInlineValue = true;
    }

    if (BOOLEAN_FLAGS.has(token)) {
      const key = BOOLEAN_FLAGS.get(token);
      if (key === 'execute') {
        opts.dryRun = false;
      } else {
        opts[key] = true;
      }
      continue;
    }

    if (VALUE_FLAGS.has(token) || ARRAY_FLAGS.has(token)) {
      let val;
      if (hasInlineValue) {
        val = inlineValue;
      } else {
        const next = rest[i + 1];
        if (next === undefined || next.startsWith('--')) {
          throw new CliError(
            `Missing value for flag ${token}`,
            `Pass a value right after ${token}, e.g. ${token} <value> (run with --help for examples)`
          );
        }
        val = next;
        i++;
      }

      if (ARRAY_FLAGS.has(token)) {
        opts[ARRAY_FLAGS.get(token)].push(val);
      } else {
        opts[VALUE_FLAGS.get(token)] = val;
      }
      continue;
    }

    if (raw.startsWith('-')) {
      opts.unknownFlags.push(token);
    } else {
      opts.positionals.push(raw);
    }
  }

  return { command, opts };
}

export function resolveCliStyle(rawStyle, fallbackStyle = 'big_fat_fish') {
  if (!rawStyle) {
    return normalizeStyleId(fallbackStyle) || 'big_fat_fish';
  }
  const normalized = normalizeStyleId(rawStyle);
  if (!normalized) {
    throw new CliError(
      `Invalid style "${rawStyle}". Valid styles: ${AVAILABLE_STYLES.join(', ')} (aliases: fish, hakimi, gpt)`,
      `node src/cli.js generate --style big_fat_fish`
    );
  }
  return normalized;
}

export function findLatestBundle(outputDir = 'out') {
  const absOut = resolve(outputDir);
  if (!existsSync(absOut)) return null;

  let entries;
  try {
    entries = readdirSync(absOut, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidateDir = join(absOut, entry.name);
    const manifestPath = join(candidateDir, 'bundle.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const mtimeMs = statSync(manifestPath).mtimeMs;
      candidates.push({ dir: candidateDir, name: entry.name, mtimeMs });
    } catch {
      // Ignore unreadable entries
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
  return candidates[0].dir;
}

export function getOpenPreviewCommand(filePath, platform = process.platform) {
  if (platform === 'darwin') return `open "${filePath}"`;
  if (platform === 'win32') return `start "" "${filePath}"`;
  return `xdg-open "${filePath}"`;
}

export function openInBrowser(filePath, { platform = process.platform, spawnImpl = spawn } = {}) {
  if (process.env.DEVLOG_POSTER_NO_OPEN === '1') {
    return { attempted: false, ok: true, skipped: true };
  }

  let cmd;
  let args;
  if (platform === 'darwin') {
    cmd = 'open';
    args = [filePath];
  } else if (platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', filePath];
  } else {
    cmd = 'xdg-open';
    args = [filePath];
  }

  try {
    const child = spawnImpl(cmd, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', (err) => {
      console.error(
        `⚠️  Could not open browser automatically (${err.message}). Open manually: ${filePath}`
      );
    });
    if (typeof child.unref === 'function') child.unref();
    return { attempted: true, ok: true, command: cmd, args };
  } catch (err) {
    return { attempted: true, ok: false, error: err.message };
  }
}

function getHelpText() {
  const version = getPackageVersion();
  return `dsh-plugin-devlog-poster CLI (v${version})
Zero-dependency Build-in-Public devlog, 4-slide carousel & work report toolkit.

Usage:
  devlog-poster [generate] [options]
  devlog-poster doctor [--repo <path>] [--json]
  devlog-poster publish-github [--mode devlog_file|release] [--tag <tag>] [--gh-repo <owner/repo>] [--execute]
  devlog-poster save-draft [--platform xiaohongshu|bilibili|douyin] [--bundle <dir>] [--profile-dir <dir>] [--execute]
  devlog-poster send-report [--channel feishu|dingtalk|wecom|slack|discord|qq_onebot] [--period daily|weekly] [--ai] [--endpoint <url>] [--token <tok>] [--group-id <id>] [--user-id <id>] [--execute]
  devlog-poster generate-image [--platform xiaohongshu|bilibili|douyin|github] [--provider openai|gemini|volcengine|custom_openai|svg_fallback] [--style <id>] [--model <name>] [--endpoint <url>] [--api-key <key>] [--output <file>] [--execute]
  devlog-poster config show [--repo <path>] [--json]
  devlog-poster config set <key> <value> [--local] [--repo <path>]
  devlog-poster config reset [--local] [--repo <path>]

Common Generate Options:
  --open                       Open preview.html in default browser after generating
  --ai                         Auto-summarize git log & diff via LLM (falls back to git commits if no key)
  --ai-provider <id>           auto (default) | deepseek | openai | gemini | anthropic | custom_openai
  --ai-model <name>            Override AI summarizer model name
  --ai-endpoint <url>          Override AI summarizer HTTP endpoint
  --ai-api-key <key>           Override AI summarizer API key
  --style <id>                 big_fat_fish (default) | gemini | chatgpt | claude
                               (aliases: fish, hakimi, gpt)
  --repo <path>                Local git repository path (default: cwd)
  --name <project>             Override display project name
  --title <text>               Override devlog title
  --since <window>             Git log window (default: "24 hours ago")
  --highlight <text>           Add highlight bullet (repeatable)
  --pitfall <text>             Add pitfall/lesson bullet (repeatable)
  --next <text>                Add next-step bullet (repeatable)
  --hero-image <path>          Optional PNG/JPG hero illustration overlay
  --out <dir>                  Output directory (default: config.outputDir or "out")
  --json                       Emit machine-readable JSON output (generate / doctor / config show)
  --execute                    Actually publish / send / save draft / call API (default is safe dry-run)

Quick Examples:
  node src/cli.js generate --open
  node src/cli.js generate --ai --open
  node src/cli.js doctor
  node src/cli.js config set defaultStyle gemini --local
  node src/cli.js save-draft --platform xiaohongshu
`;
}

async function runDoctor(opts, savedCfg) {
  const repoPath = opts.repoPath || process.cwd();
  const checks = [];

  // 1. Node.js >= 20
  const nodeVersion = process.versions.node;
  const nodeMajor = Number(nodeVersion.split('.')[0]);
  checks.push({
    id: 'node',
    label: 'Node.js >= 20',
    status: nodeMajor >= 20 ? 'ok' : 'error',
    detail: `v${nodeVersion}`,
    hint: nodeMajor >= 20 ? '' : 'Upgrade to Node.js 20 or newer (https://nodejs.org/)',
  });

  // 2. Git repo & recent commits
  const gitCtx = collectGitContext({ repoPath, since: '7 days ago' });
  if (!gitCtx.isGitRepo) {
    checks.push({
      id: 'git',
      label: 'Git repository',
      status: 'warn',
      detail: `Not a git repo (${repoPath})`,
      hint: 'Run inside a git repo or pass --repo <path> / --highlight "..."',
    });
  } else if (gitCtx.commits.length === 0) {
    checks.push({
      id: 'git',
      label: 'Git repository',
      status: 'warn',
      detail: `branch "${gitCtx.branch}" · 0 commits in last 7 days`,
      hint: 'Pass --since "30 days ago" or --highlight "..." to enrich devlog bullets',
    });
  } else {
    checks.push({
      id: 'git',
      label: 'Git repository',
      status: 'ok',
      detail: `branch "${gitCtx.branch}" · ${gitCtx.commits.length} commits in last 7 days (+${gitCtx.stats.insertions}/-${gitCtx.stats.deletions})`,
      hint: '',
    });
  }

  // 3. Built-in 4 mascot PNGs
  const missingMascots = AVAILABLE_STYLES.filter(
    (styleId) => !existsSync(join(PACKAGE_ROOT, 'assets', 'mascots', `${styleId}.png`))
  );
  checks.push({
    id: 'mascots',
    label: 'Built-in 4 mascot PNGs',
    status: missingMascots.length === 0 ? 'ok' : 'error',
    detail:
      missingMascots.length === 0
        ? `4/4 ready (${AVAILABLE_STYLES.join(', ')})`
        : `Missing: ${missingMascots.join(', ')}`,
    hint:
      missingMascots.length === 0
        ? ''
        : 'Reinstall package or restore assets/mascots/*.png',
  });

  // 4. Config & credentials readiness
  const inspected = inspectConfig({ repoPath });
  const activeStyle = normalizeStyleId(savedCfg.defaultStyle) || 'big_fat_fish';
  const sourceLabels = [];
  if (inspected.sources.globalExists) sourceLabels.push('global');
  if (inspected.sources.localExists) sourceLabels.push('local');
  checks.push({
    id: 'config',
    label: 'Configuration',
    status: 'ok',
    detail: `style=${activeStyle}, out=${savedCfg.outputDir || 'out'}, sources=${sourceLabels.length ? sourceLabels.join('+') : 'defaults'}`,
    hint: sourceLabels.length
      ? ''
      : 'Optional: node src/cli.js config set defaultStyle big_fat_fish',
  });

  // 5. Work report webhook readiness (optional)
  const reportChannel = savedCfg.defaultReportChannel || 'feishu';
  const hasReportTarget =
    reportChannel === 'qq_onebot'
      ? Boolean(savedCfg.qqGroupId || savedCfg.qqUserId)
      : Boolean(savedCfg.reportEndpoint);
  checks.push({
    id: 'webhook',
    label: `Work report (${reportChannel})`,
    status: hasReportTarget ? 'ok' : 'warn',
    detail: hasReportTarget ? 'configured' : 'not configured (dry-run still works)',
    hint: hasReportTarget
      ? ''
      : reportChannel === 'qq_onebot'
        ? 'node src/cli.js config set qqGroupId <group_id>'
        : 'node src/cli.js config set reportEndpoint <webhook_url>',
  });

  // 6. AI summarizer (--ai) key readiness (optional)
  const aiStatus = getAiKeyStatus({ config: savedCfg });
  checks.push({
    id: 'ai_summarizer',
    label: `AI summarizer (--ai / ${aiStatus.provider || aiStatus.requestedProvider})`,
    status: aiStatus.configured ? 'ok' : 'warn',
    detail: aiStatus.configured
      ? `ready (${aiStatus.provider}/${aiStatus.model} via ${aiStatus.source})`
      : 'no API key (optional; --ai falls back to git commits, or use Antigravity/Codex/Claude Code skill)',
    hint: aiStatus.configured
      ? ''
      : 'export DEEPSEEK_API_KEY=<key> (or OPENAI_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY)',
  });

  // 7. Image API key readiness (optional)
  const provider = savedCfg.imageProvider || 'openai';
  const envKeyName =
    provider === 'gemini'
      ? 'GEMINI_API_KEY'
      : provider === 'volcengine'
        ? 'ARK_API_KEY'
        : 'OPENAI_API_KEY';
  const hasImageKey =
    provider === 'svg_fallback' || Boolean(savedCfg.imageApiKey || process.env[envKeyName]);
  checks.push({
    id: 'image_api',
    label: `Image provider (${provider})`,
    status: hasImageKey ? 'ok' : 'warn',
    detail: hasImageKey
      ? 'ready'
      : `no API key (${envKeyName} / config.imageApiKey not set; prompt dry-run & local SVG cards work)`,
    hint: hasImageKey ? '' : `export ${envKeyName}=<your_key> or use --provider svg_fallback`,
  });

  // 7. GitHub CLI (optional)
  const ghBin = savedCfg.ghBin || 'gh';
  let ghDetail = 'not installed (optional, needed for publish-github --mode release --execute)';
  let ghStatus = 'warn';
  try {
    const out = execFileSync(ghBin, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    ghDetail = out.split('\n')[0] || 'installed';
    ghStatus = 'ok';
  } catch {
    // optional
  }
  checks.push({
    id: 'gh',
    label: 'GitHub CLI (gh)',
    status: ghStatus,
    detail: ghDetail,
    hint: ghStatus === 'ok' ? '' : 'Install https://cli.github.com/ and run `gh auth login`',
  });

  // 8. Playwright (optional)
  let pwStatus = 'warn';
  let pwDetail = 'not installed (optional, needed for save-draft --execute)';
  try {
    const pw = await import('playwright');
    if (pw?.chromium) {
      pwStatus = 'ok';
      pwDetail = 'installed (browser draft automation available)';
    }
  } catch {
    // optional
  }
  checks.push({
    id: 'playwright',
    label: 'Playwright (optional)',
    status: pwStatus,
    detail: pwDetail,
    hint: pwStatus === 'ok' ? '' : 'npm install playwright && npx playwright install chromium',
  });

  const hasError = checks.some((c) => c.status === 'error');
  const summary = {
    ok: !hasError,
    repoPath: resolve(repoPath),
    checks,
  };

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`🩺 dsh-plugin-devlog-poster doctor (v${getPackageVersion()})`);
    console.log(`   Workspace: ${summary.repoPath}\n`);
    for (const c of checks) {
      const icon = c.status === 'ok' ? '✅' : c.status === 'warn' ? '⚠️ ' : '❌';
      console.log(` ${icon} ${c.label}: ${c.detail}`);
      if (c.hint) {
        console.log(`      💡 ${c.hint}`);
      }
    }
    console.log('');
    if (hasError) {
      console.log('❌ Blocking issues found above. Fix ❌ items before running generate.');
    } else {
      console.log('✅ Core environment is ready! Try: node src/cli.js generate --open');
    }
  }

  if (hasError) {
    process.exitCode = 1;
  }
}

function handleConfigCommand(opts) {
  const repoPath = opts.repoPath || process.cwd();
  const [subCmd = 'show', key, ...valueParts] = opts.positionals;
  const value = valueParts.join(' ');

  if (subCmd === 'show') {
    const info = inspectConfig({ repoPath });
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            config: info.maskedConfig,
            sources: info.sources,
          },
          null,
          2
        )
      );
      return;
    }
    console.log('⚙️  Resolved Configuration (secrets masked):');
    console.log(JSON.stringify(info.maskedConfig, null, 2));
    console.log('\n📁 Config Sources:');
    console.log(
      `   - Global : ${info.sources.globalPath} (${info.sources.globalExists ? 'exists' : 'not created yet'})`
    );
    console.log(
      `   - Local  : ${info.sources.localPath} (${info.sources.localExists ? 'exists' : 'not created yet'})`
    );
    console.log('\n💡 Next: node src/cli.js config set <key> <value> [--local]');
    console.log(`   Valid keys: ${CONFIG_KEYS.join(', ')}`);
    return;
  }

  if (subCmd === 'set') {
    if (!key || !value) {
      throw new CliError(
        'config set requires both <key> and <value>.',
        `node src/cli.js config set defaultStyle gemini [--local]\nValid keys: ${CONFIG_KEYS.join(', ')}`
      );
    }
    const validation = validateConfigPatch({ [key]: value });
    if (!validation.valid) {
      throw new CliError(
        validation.errors.join('; '),
        `node src/cli.js config show`
      );
    }
    const saved = saveConfig(validation.normalized, {
      local: Boolean(opts.local),
      repoPath,
    });
    const scopeLabel = saved.local ? 'project-local' : 'global';
    console.log(
      `✅ Saved ${key}=${validation.normalized[key]} (${scopeLabel}) -> ${saved.configPath}`
    );
    return;
  }

  if (subCmd === 'reset') {
    const res = resetConfig({ local: Boolean(opts.local), repoPath });
    const scopeLabel = res.local ? 'project-local' : 'global';
    if (res.existed) {
      console.log(`✅ Reset ${scopeLabel} config (removed ${res.configPath}).`);
    } else {
      console.log(`ℹ️  No ${scopeLabel} config file found at ${res.configPath}; already using defaults.`);
    }
    return;
  }

  throw new CliError(
    `Unknown config subcommand "${subCmd}". Use: show | set | reset`,
    'node src/cli.js config show'
  );
}

function inferErrorHint(err, command) {
  if (err instanceof CliError) return err.hint;
  const msg = String(err?.message || '');
  if (msg.includes('Endpoint URL is required')) {
    return 'Pass --endpoint <webhook_url> or save once with: node src/cli.js config set reportEndpoint <webhook_url>';
  }
  if (msg.includes('qq_onebot requires')) {
    return 'Pass --group-id <id> (or --user-id <id>), or run: node src/cli.js config set qqGroupId <id>';
  }
  if (msg.includes('API key required for provider')) {
    const match = msg.match(/provider "([^"]+)"/);
    const provider = match?.[1] || 'openai';
    const envVar =
      provider === 'gemini'
        ? 'GEMINI_API_KEY'
        : provider === 'volcengine'
          ? 'ARK_API_KEY'
          : 'OPENAI_API_KEY';
    return `Set ${envVar}=<key>, pass --api-key <key>, or run with --provider svg_fallback`;
  }
  if (msg.includes('Bundle manifest not found')) {
    return 'Generate a bundle first: node src/cli.js generate';
  }
  if (msg.includes('ENOENT') && command === 'publish-github') {
    return 'Install GitHub CLI (https://cli.github.com/) and run `gh auth login`, or use --mode devlog_file';
  }
  return 'Run `node src/cli.js --help` or `node src/cli.js doctor` to inspect your setup';
}

async function maybeEnrichContextWithAI({
  opts,
  savedCfg,
  context,
  repoPath,
  since,
  style = 'big_fat_fish',
  mode = 'devlog',
  silentStdout = false,
}) {
  if (!opts.ai) {
    return { context, title: opts.title, aiSummary: null };
  }

  const aiProvider = String(opts.aiProvider || savedCfg.aiProvider || 'auto').trim().toLowerCase();
  if (!SUPPORTED_AI_PROVIDERS.includes(aiProvider)) {
    throw new CliError(
      `Unsupported AI provider "${aiProvider}". Valid: ${SUPPORTED_AI_PROVIDERS.join(', ')}`,
      'node src/cli.js generate --ai --ai-provider deepseek'
    );
  }

  const aiRes = await summarizeWithAI({
    context,
    repoPath,
    since,
    style,
    mode,
    provider: aiProvider,
    model: opts.aiModel || savedCfg.aiModel || undefined,
    endpoint: opts.aiEndpoint || savedCfg.aiEndpoint || undefined,
    apiKey: opts.aiApiKey || savedCfg.aiApiKey || undefined,
  });

  if (aiRes.ok && aiRes.summary) {
    const merged = mergeAiSummary(
      {
        title: opts.title,
        highlights: context.highlights,
        pitfalls: context.pitfalls,
        nextSteps: context.nextSteps,
      },
      aiRes.summary
    );
    const enrichedContext = {
      ...context,
      highlights: merged.highlights,
      pitfalls: merged.pitfalls,
      nextSteps: merged.nextSteps,
    };
    if (!silentStdout) {
      console.log(
        `🤖 AI summary generated via ${aiRes.provider}/${aiRes.model} (${merged.highlights.length} highlights · ${merged.pitfalls.length} pitfalls · ${merged.nextSteps.length} next)`
      );
    }
    return {
      context: enrichedContext,
      title: merged.title,
      aiSummary: {
        requested: true,
        ok: true,
        provider: aiRes.provider,
        model: aiRes.model,
      },
    };
  }

  const logNotice = silentStdout ? console.error : console.log;
  logNotice(
    `⚠️  AI summary fallback (${aiRes.reason || 'UNAVAILABLE'}): ${aiRes.message} Continuing with git commits.`
  );
  if (aiRes.hint) {
    logNotice(`💡 Try: ${aiRes.hint}`);
  }
  return {
    context,
    title: opts.title,
    aiSummary: {
      requested: true,
      ok: false,
      provider: aiRes.provider,
      reason: aiRes.reason,
      message: aiRes.message,
      hint: aiRes.hint,
    },
  };
}

export async function main(argv = process.argv.slice(2)) {
  const { command, opts } = parseArgs(argv);

  if (opts.help || command === 'help') {
    console.log(getHelpText());
    return;
  }

  if (opts.version || command === 'version') {
    console.log(getPackageVersion());
    return;
  }

  if (opts.unknownFlags.length > 0) {
    console.error(
      `⚠️  Warning: ignoring unknown flag(s): ${opts.unknownFlags.join(', ')} (run with --help to see supported flags)`
    );
  }

  const repoPath = opts.repoPath || process.cwd();
  const savedCfg = loadConfig({ repoPath });

  if (command === 'doctor') {
    await runDoctor(opts, savedCfg);
    return;
  }

  if (command === 'config') {
    handleConfigCommand(opts);
    return;
  }

  if (command === 'generate-image') {
    const platform = opts.platform || 'xiaohongshu';
    if (!PLATFORM_IMAGE_PRESETS[platform]) {
      throw new CliError(
        `Unsupported image platform "${platform}". Valid: ${Object.keys(PLATFORM_IMAGE_PRESETS).join(', ')}`,
        'node src/cli.js generate-image --platform xiaohongshu'
      );
    }
    const provider = opts.provider || savedCfg.imageProvider || 'openai';
    if (!SUPPORTED_IMAGE_PROVIDERS.includes(provider)) {
      throw new CliError(
        `Unsupported image provider "${provider}". Valid: ${SUPPORTED_IMAGE_PROVIDERS.join(', ')}`,
        'node src/cli.js generate-image --provider openai'
      );
    }
    const style = resolveCliStyle(opts.style, savedCfg.defaultStyle);
    const context = collectGitContext({
      repoPath,
      projectName: opts.projectName,
      since: opts.since || '24 hours ago',
      highlights: opts.highlights,
      pitfalls: opts.pitfalls,
      nextSteps: opts.nextSteps,
    });
    const result = await generateVisualImage({
      context,
      platform,
      style,
      provider,
      model: opts.model || savedCfg.imageModel || undefined,
      endpoint: opts.endpoint || savedCfg.imageEndpoint || undefined,
      apiKey: opts.apiKey || savedCfg.imageApiKey || undefined,
      outputPath: opts.outputPath,
      dryRun: opts.dryRun !== false,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'send-report') {
    const period = opts.period === 'weekly' ? 'weekly' : 'daily';
    const channel = opts.channel || savedCfg.defaultReportChannel || 'feishu';
    if (!SUPPORTED_REPORT_CHANNELS.includes(channel)) {
      throw new CliError(
        `Unsupported report channel "${channel}". Valid: ${SUPPORTED_REPORT_CHANNELS.join(', ')}`,
        'node src/cli.js send-report --channel feishu --period daily'
      );
    }
    const since = opts.since || (period === 'weekly' ? '7 days ago' : '24 hours ago');
    const rawContext = collectGitContext({
      repoPath,
      projectName: opts.projectName,
      since,
      highlights: opts.highlights,
      pitfalls: opts.pitfalls,
      nextSteps: opts.nextSteps,
    });
    const style = resolveCliStyle(opts.style, savedCfg.defaultStyle);
    const { context, title, aiSummary } = await maybeEnrichContextWithAI({
      opts,
      savedCfg,
      context: rawContext,
      repoPath,
      since,
      style,
      mode: 'report',
      silentStdout: true,
    });
    const report = formatWorkReport(context, { period, title });
    const result = await sendWorkReport({
      channel,
      endpoint: opts.endpoint || savedCfg.reportEndpoint || undefined,
      token: opts.token || savedCfg.reportToken || undefined,
      groupId: opts.groupId || savedCfg.qqGroupId || undefined,
      userId: opts.userId || savedCfg.qqUserId || undefined,
      report,
      dryRun: opts.dryRun !== false,
    });
    console.log(
      JSON.stringify(aiSummary ? { ...result, aiSummary } : result, null, 2)
    );
    return;
  }

  if (command === 'save-draft') {
    const platform = opts.platform || 'xiaohongshu';
    if (!DRAFT_PLATFORMS[platform]) {
      throw new CliError(
        `Unsupported draft platform "${platform}". Valid: ${Object.keys(DRAFT_PLATFORMS).join(', ')}`,
        'node src/cli.js save-draft --platform xiaohongshu'
      );
    }
    const outputDir = opts.outputDir || savedCfg.outputDir || 'out';
    const bundleDir = opts.bundleDir || findLatestBundle(outputDir);
    if (!bundleDir) {
      throw new CliError(
        `No generated bundle found in "${resolve(outputDir)}" and --bundle was not provided.`,
        'node src/cli.js generate'
      );
    }
    if (!opts.bundleDir && !opts.json) {
      console.error(`ℹ️  Auto-selected latest bundle: ${bundleDir}`);
    }
    const result = await savePlatformDraft({
      platform,
      bundleDir,
      profileDir: opts.profileDir || savedCfg.browserProfileDir || undefined,
      dryRun: opts.dryRun !== false,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'generate' || command === 'publish-github') {
    const style = resolveCliStyle(opts.style, savedCfg.defaultStyle);
    const since = opts.since || '24 hours ago';
    const rawContext = collectGitContext({
      repoPath,
      projectName: opts.projectName,
      since,
      highlights: opts.highlights,
      pitfalls: opts.pitfalls,
      nextSteps: opts.nextSteps,
    });

    const { context, title, aiSummary } = await maybeEnrichContextWithAI({
      opts,
      savedCfg,
      context: rawContext,
      repoPath,
      since,
      style,
      mode: 'devlog',
      silentStdout: Boolean(opts.json || command === 'publish-github'),
    });

    const formatted = formatMultiPlatformDevlog(context, {
      title,
      style,
    });

    if (command === 'generate') {
      const outputDir = opts.outputDir || savedCfg.outputDir || 'out';
      const { bundleDir, files } = writeDevlogBundle(context, formatted, {
        outputDir,
        heroImagePath: opts.heroImagePath,
      });

      let openResult = null;
      if (opts.open) {
        openResult = openInBrowser(files.preview);
        if (!openResult.ok && !opts.json) {
          console.error(
            `⚠️  Could not open browser automatically (${openResult.error}). Open manually: ${files.preview}`
          );
        }
      }

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              ok: true,
              style,
              styleName: MODEL_STYLES[style]?.name || style,
              projectName: context.projectName,
              branch: context.branch,
              commits: context.commits.length,
              stats: context.stats,
              bundleDir,
              files,
              opened: Boolean(opts.open && openResult?.ok && !openResult?.skipped),
              ...(aiSummary ? { aiSummary } : {}),
            },
            null,
            2
          )
        );
        return;
      }

      const theme = MODEL_STYLES[style] || MODEL_STYLES.big_fat_fish;
      console.log(`✅ Devlog bundle generated: ${bundleDir}`);
      console.log(
        `   Style      : ${theme.emoji} ${theme.name} (${style})`
      );
      console.log(
        `   Summary    : ${context.projectName} (${context.branch || 'main'}) · ${context.commits.length} commits · ${context.stats.filesChanged} files (+${context.stats.insertions}/-${context.stats.deletions})`
      );
      console.log(`   - Preview UI : ${files.preview}`);
      console.log(`   - GitHub     : ${files.github}`);
      console.log(`   - 小红书     : ${files.xiaohongshu}`);
      console.log(`   - B站        : ${files.bilibili}`);
      console.log(`   - 抖音       : ${files.douyin}`);
      console.log(`   - Work Daily : ${files.workDailyPlain}`);
      console.log(`   - 3:4 Card   : ${files.cardVertical}`);
      console.log(`   - 16:9 Card  : ${files.cardHorizontal}`);
      console.log(`   - Carousel   : ${files.slides.length} slides (P1~P4)`);
      console.log('');
      console.log('👉 Next Steps:');
      if (opts.open && openResult?.ok) {
        console.log('   1. Preview opened in your default browser (switch 4 AI-girl styles & export PNGs).');
      } else {
        console.log(`   1. Open preview UI : ${getOpenPreviewCommand(files.preview)}`);
      }
      console.log('   2. Preview GitHub  : node src/cli.js publish-github --mode devlog_file');
      console.log('   3. Save XHS draft  : node src/cli.js save-draft --platform xiaohongshu');
      console.log('   4. Send daily note : node src/cli.js send-report --period daily');
      return;
    }

    // publish-github
    const mode = opts.mode || 'devlog_file';
    if (mode !== 'devlog_file' && mode !== 'release') {
      throw new CliError(
        `Unsupported GitHub publish mode "${mode}". Valid: devlog_file | release`,
        'node src/cli.js publish-github --mode devlog_file'
      );
    }
    const result = publishToGitHub({
      mode,
      repoPath,
      repo: opts.ghRepo,
      tag: opts.tag,
      title: formatted.platforms.github.title,
      body: formatted.platforms.github.content,
      dryRun: opts.dryRun !== false,
      ghBin: savedCfg.ghBin || 'gh',
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  throw new CliError(
    `Unknown command: "${command}".`,
    'node src/cli.js --help'
  );
}

function isExecutedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  }
}

if (isExecutedDirectly()) {
  const cmd = process.argv[2] || 'generate';
  main().catch((err) => {
    console.error(`❌ ${err?.message || String(err)}`);
    const hint = inferErrorHint(err, cmd);
    if (hint) {
      console.error(`💡 Try: ${hint}`);
    }
    if (process.env.DEBUG === '1' || process.env.DEBUG === 'true') {
      console.error(err?.stack || err);
    }
    process.exitCode = 1;
  });
}
