import {
  collectGitContext,
  collectMultiRepoContext,
  discoverGitRepos,
} from './git-context.js';
import { formatMultiPlatformDevlog } from './formatter.js';
import { publishToGitHub, writeDevlogBundle } from './publisher.js';
import {
  publishGlobalPlatform,
  SUPPORTED_GLOBAL_PLATFORMS,
} from './global-publisher.js';
import { savePlatformDraft } from './draft-automation.js';
import { formatWorkReport, sendWorkReport } from './work-report.js';
import {
  buildAllPlatformImagePrompts,
  buildImagePrompt,
  generateVisualImage,
} from './image-gen.js';
import { loadConfig, saveConfig } from './config.js';
import { normalizeEditionId, resolveStyle } from './styles.js';
import { mergeAiSummary, summarizeWithAI } from './ai-summarizer.js';

export const name = 'dsh-plugin-devlog-poster';
export const inject = ['tools'];

function hasMultiRepoArgs(args = {}) {
  const hasScanDirs = Array.isArray(args.scanDirs)
    ? args.scanDirs.length > 0
    : typeof args.scanDirs === 'string' && args.scanDirs.trim().length > 0;
  const hasRepos = Array.isArray(args.repos)
    ? args.repos.length > 0
    : typeof args.repos === 'string' && args.repos.trim().length > 0;
  return hasScanDirs || hasRepos;
}

function resolveToolContext(args = {}, defaultSince) {
  if (hasMultiRepoArgs(args)) {
    return collectMultiRepoContext({
      scanDirs: args.scanDirs,
      repos: args.repos,
      since: args.since || defaultSince || '24 hours ago',
      maxCommitsPerRepo: args.maxCommits || 6,
      maxDepth: args.maxDepth ?? 2,
      projectName: args.projectName,
      highlights: args.highlights,
      pitfalls: args.pitfalls,
      nextSteps: args.nextSteps,
    });
  }
  return collectGitContext(defaultSince ? { ...args, since: args.since || defaultSince } : args);
}

function renderCollectContext(value) {
  const commits = value?.commits || [];
  const stats = value?.stats || { filesChanged: 0, insertions: 0, deletions: 0 };
  const topSubjects = commits
    .slice(0, 3)
    .map((c) => {
      const ref = c.sha || c.hash || '';
      const label = c.displaySubject || (c.project ? `[${c.project}] ${c.subject}` : c.subject);
      return `  - \`${ref}\` ${label}`.trimEnd();
    });

  const lines = [
    `### 📦 Git 上下文已采集 · ${value?.projectName || 'unknown'}`,
    value?.isMultiRepo
      ? `- **多仓库汇总**：扫描 ${value.scannedRepoCount ?? 0} 个仓库，活跃 ${value.activeRepoCount ?? 0} 个（${(value.projects || []).map((p) => `\`${p.shortName}\``).join('、') || '无'}）`
      : `- **分支**：\`${value?.branch || 'main'}\`${value?.isGitRepo === false ? '（非 Git 仓库，将使用手动要点）' : ''}`,
    `- **近期提交**：${commits.length} 条 · 改动 ${stats.filesChanged} 个文件（+${stats.insertions} / -${stats.deletions}）`,
  ];

  if (topSubjects.length > 0) {
    lines.push('- **最新提交摘要**：', ...topSubjects);
  } else {
    lines.push('- **提示**：当前时间窗口内暂无提交，建议在生成时补充 `highlights` 或放宽 `since`（如 `"7 days ago"`）。');
  }

  lines.push('', '👉 **下一步**：调用 `devlog_generate_bundle` 一键生成四平台文案、4 图轮播套图与 `preview.html`。');
  return lines.join('\n');
}

function renderGenerateBundle(value) {
  const theme = resolveStyle(value?.meta?.style || 'big_fat_fish');
  const slideCount = value?.files?.slides?.length || 0;
  const lines = [
    `### ✅ Devlog 发布包已生成 · ${theme.emoji} ${theme.name}`,
    `- **预览工作台**：\`${value?.files?.preview || ''}\``,
    `- **输出目录**：\`${value?.bundleDir || ''}\``,
  ];

  if (value?.meta?.statsLine) {
    lines.push(`- **改动概览**：${value.meta.statsLine}`);
  }
  if (value?.aiSummary?.ok) {
    lines.push(`- **AI 摘要**：已通过 \`${value.aiSummary.provider}/${value.aiSummary.model}\` 自动提炼`);
  } else if (value?.aiSummary && value.aiSummary.ok === false) {
    lines.push(`- **AI 摘要回退**：${value.aiSummary.message || value.aiSummary.reason}（已平滑回退到 Git 提交记录）`);
  }

  lines.push(
    `- **已就绪产物**：GitHub / 小红书 / B站 / 抖音 4 平台文案 · 工作日报（纯文本 + Markdown）· 双比例封面卡（3:4 & 16:9）· ${slideCount} 张轮播套图（P1~P4）`,
    '',
    '👉 **下一步建议**：',
    '1. 在浏览器打开 `preview.html`（支持实时切换 4 套 AI 娘风格、复制文案与一键导出 PNG）。',
    '2. 需要发布到仓库可调用 `devlog_publish_github`；需要填入小红书/B站/抖音草稿箱可调用 `devlog_save_draft`。'
  );
  return lines.join('\n');
}

function renderPublishGithub(value) {
  if (value?.dryRun) {
    const targetLine =
      value.mode === 'release'
        ? `- **将执行命令**：\`${value.command || ''}\``
        : `- **目标文件**：\`${value.target || ''}\``;
    return [
      `### 🧪 [DRY RUN] GitHub 发布预览（${value.mode}）`,
      targetLine,
      ...(value.tag ? [`- **Release Tag**：\`${value.tag}\`（${value.title || value.tag}）`] : []),
      '',
      '👉 **下一步**：确认无误后，传入 `dryRun: false` 正式执行发布。',
    ].join('\n');
  }

  return [
    `### 🚀 GitHub 发布完成（${value?.mode || 'devlog_file'}）`,
    `- **发布结果**：\`${value?.url || value?.target || 'ok'}\``,
    ...(value?.tag ? [`- **Release Tag**：\`${value.tag}\``] : []),
  ].join('\n');
}

function renderSaveDraft(value) {
  if (value?.dryRun) {
    const steps = (value.steps || []).map((s, idx) => `${idx + 1}. ${s}`);
    return [
      `### 🧪 [DRY RUN] 自动存草稿计划 · ${value.label || value.platform}`,
      `- **创作者页面**：${value.url || ''}`,
      ...(value.title ? [`- **草稿标题**：${value.title}`] : []),
      ...(value.pngPath ? [`- **卡片 PNG 路径**：\`${value.pngPath}\``] : []),
      '- **安全策略**：仅自动填表并尝试存草稿，**永不自动点击发布**。',
      ...(steps.length > 0 ? ['', '**执行步骤**：', ...steps] : []),
      '',
      '👉 **下一步**：确认后传入 `dryRun: false` 启动独立浏览器填表。',
    ].join('\n');
  }

  if (value?.ok) {
    const notes = (value.notes || []).map((n) => `- ${n}`);
    return [
      `### ✅ 草稿已填入 · ${value.platform}`,
      `- **页面地址**：${value.url || ''}`,
      `- **自动点击存草稿**：${value.savedDraft ? '已点击' : '未检测到按钮（请在浏览器中手动保存）'}`,
      ...(value.renderedPng ? [`- **已渲染卡片**：\`${value.renderedPng}\``] : []),
      ...(notes.length > 0 ? ['', '**执行记录**：', ...notes] : []),
      '',
      '👉 **下一步**：请在已打开的浏览器窗口中人工复核后点击发布。',
    ].join('\n');
  }

  const isMissingPlaywright = value?.error === 'PLAYWRIGHT_NOT_INSTALLED';
  return [
    `### ⚠️ 浏览器自动存草稿暂不可用（${value?.error || 'ERROR'}）`,
    `- **原因**：${value?.message || value?.error || '未知错误'}`,
    ...(isMissingPlaywright
      ? [
          '',
          '**安装可选依赖后重试**：',
          '```bash',
          'npm install playwright && npx playwright install chromium',
          '```',
        ]
      : []),
    '',
    '👉 **替代方案**：可直接打开 bundle 内的 `preview.html`，一键复制正文并导出 PNG 手动发布。',
  ].join('\n');
}

function renderSendWorkReport(value) {
  const periodLabel = value?.report?.period === 'weekly' ? '周报' : '日报';
  if (value?.dryRun) {
    const hasEndpoint = Boolean(value?.url);
    return [
      `### 🧪 [DRY RUN] 工作${periodLabel}推送预览 · ${value?.channel || 'feishu'}`,
      ...(value?.report?.title ? [`- **标题**：${value.report.title}`] : []),
      ...(value?.report?.statsSummary ? [`- **概览**：${value.report.statsSummary}`] : []),
      `- **目标端点**：${hasEndpoint ? `\`${value.url}\`` : '⚠️ 未配置 endpoint'}`,
      '',
      hasEndpoint
        ? '👉 **下一步**：确认内容无误后，传入 `dryRun: false` 正式发送。'
        : '👉 **下一步**：请传入 `endpoint`（或先配置 `reportEndpoint`）后再设置 `dryRun: false` 发送。',
    ].join('\n');
  }

  const icon = value?.ok ? '✅' : '⚠️';
  return [
    `### ${icon} 工作${periodLabel}已推送 · ${value?.channel || 'feishu'}`,
    `- **HTTP 状态**：${value?.status ?? 'unknown'}`,
    `- **目标端点**：\`${value?.url || ''}\``,
    ...(value?.report?.title ? [`- **标题**：${value.report.title}`] : []),
  ].join('\n');
}

function renderGenerateImage(value) {
  const spec = value?.promptSpec || {};
  if (value?.dryRun) {
    const snippet = (spec.prompt || '').split('\n').slice(0, 2).join(' ');
    return [
      `### 🧪 [DRY RUN] 视觉封面生图预览 · ${spec.label || value?.platform || ''}`,
      `- **风格**：${spec.styleName || spec.style || 'big_fat_fish'}`,
      `- **规格**：${spec.aspectRatio || ''}（${spec.size || ''}）`,
      `- **模型通道**：\`${value?.provider || 'openai'}\` / \`${value?.model || 'default'}\``,
      ...(snippet ? [`- **Prompt 预览**：${snippet}`] : []),
      '',
      '👉 **下一步**：传入 `dryRun: false`（并配置对应 API Key）正式出图，或直接复制 Prompt 到任意生图工具。',
    ].join('\n');
  }

  return [
    `### 🎨 视觉封面已生成 · ${value?.provider}/${value?.model}`,
    `- **输出位置**：\`${value?.savedPath || value?.imageUrl || 'ok'}\``,
    ...(spec.aspectRatio ? [`- **规格**：${spec.label || ''} (${spec.aspectRatio})`] : []),
    '',
    '👉 **下一步**：可将生成图片路径传入 `devlog_generate_bundle` 的 `heroImagePath` 参数叠加合成封面卡片。',
  ].join('\n');
}

function createToolSpecs(runtimeConfig = {}) {
  const config = { ...loadConfig(), ...runtimeConfig };
  const defaultOutputDir = config.outputDir || 'out';

  return [
    {
      name: 'devlog_collect_context',
      description:
        'Collect recent git commits, diff stats, and changed files from a local repository as structured Build-in-Public devlog material.',
      parameters: {
        repoPath: {
          type: 'string',
          required: false,
          description: 'Local git repository path (defaults to current working directory).',
        },
        since: {
          type: 'string',
          required: false,
          description: 'Git log time window, e.g. "24 hours ago" or "7 days ago".',
        },
        maxCommits: {
          type: 'number',
          required: false,
          description: 'Maximum number of commits to include (default: 10).',
        },
        projectName: {
          type: 'string',
          required: false,
          description: 'Optional display name override for the project.',
        },
        scanDirs: {
          type: 'array',
          required: false,
          description:
            'Optional parent directories to scan for active git repos (accepts array or comma-separated string).',
        },
        repos: {
          type: 'array',
          required: false,
          description:
            'Optional explicit git repository paths to aggregate (accepts array or comma-separated string).',
        },
        maxDepth: {
          type: 'number',
          required: false,
          description: 'Max scan depth when using scanDirs (default: 2).',
        },
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [
          {
            type: 'text',
            text: renderCollectContext(value),
          },
        ],
      },
      async execute(args = {}) {
        return resolveToolContext(args);
      },
    },
    {
      name: 'devlog_generate_bundle',
      description:
        'Generate tailored Devlog copy for GitHub, Xiaohongshu, Bilibili, and Douyin, render 3:4 & 16:9 SVG cards, and write an interactive preview.html bundle.',
      parameters: {
        repoPath: {
          type: 'string',
          required: false,
          description: 'Local git repository path.',
        },
        scanDirs: {
          type: 'array',
          required: false,
          description:
            'Optional parent directories to scan for active git repos (enables multi-project aggregation).',
        },
        repos: {
          type: 'array',
          required: false,
          description:
            'Optional explicit git repository paths to aggregate (enables multi-project aggregation).',
        },
        maxDepth: {
          type: 'number',
          required: false,
          description: 'Max scan depth when using scanDirs (default: 2).',
        },
        projectName: {
          type: 'string',
          required: false,
          description: 'Optional project display name.',
        },
        title: {
          type: 'string',
          required: false,
          description: 'Optional devlog title.',
        },
        edition: {
          type: 'string',
          required: false,
          description:
            'Edition mode: "community" (default, 二次元工作日报图文) | "office" (极简商务办公版).',
        },
        style: {
          type: 'string',
          required: false,
          description:
            'Visual & copy persona style: "big_fat_fish" (default) | "gemini" | "chatgpt" | "claude".',
        },
        since: {
          type: 'string',
          required: false,
          description: 'Git log window (default: "24 hours ago").',
        },
        highlights: {
          type: 'array',
          required: false,
          description: 'Key progress highlights distilled from the current DSH session.',
        },
        pitfalls: {
          type: 'array',
          required: false,
          description: 'Real pitfalls or debugging lessons to make the devlog authentic.',
        },
        nextSteps: {
          type: 'array',
          required: false,
          description: 'Upcoming milestones for the next iteration.',
        },
        outputDir: {
          type: 'string',
          required: false,
          description: 'Directory to write the output bundle (default: "out").',
        },
        heroImagePath: {
          type: 'string',
          required: false,
          description: 'Optional AI-generated PNG/JPG hero illustration to composite behind card typography.',
        },
        useAiSummary: {
          type: 'boolean',
          required: false,
          description:
            'Optionally invoke external AI summarizer on git log & diff to auto-fill highlights/pitfalls/nextSteps (gracefully falls back if no API key).',
        },
        aiProvider: {
          type: 'string',
          required: false,
          description: 'AI summarizer provider: auto | deepseek | openai | gemini | anthropic | custom_openai.',
        },
        aiModel: {
          type: 'string',
          required: false,
          description: 'Optional AI summarizer model override.',
        },
        aiEndpoint: {
          type: 'string',
          required: false,
          description: 'Optional AI summarizer HTTP endpoint override.',
        },
        aiApiKey: {
          type: 'string',
          required: false,
          description: 'Optional AI summarizer API key override.',
        },
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [
          {
            type: 'text',
            text: renderGenerateBundle(value),
          },
        ],
      },
      async execute(args = {}) {
        const edition =
          normalizeEditionId(args.edition || config.defaultEdition) || 'community';
        const style =
          edition === 'office'
            ? 'office'
            : args.style || config.defaultStyle || 'big_fat_fish';
        let context = resolveToolContext(args);
        let title = args.title;
        let aiSummary = null;

        if (args.useAiSummary) {
          aiSummary = await summarizeWithAI({
            context,
            repoPath: args.repoPath || context.repoPath,
            since: args.since || context.since,
            style,
            mode: edition === 'office' ? 'report' : 'devlog',
            provider: args.aiProvider || config.aiProvider || 'auto',
            model: args.aiModel || config.aiModel || undefined,
            endpoint: args.aiEndpoint || config.aiEndpoint || undefined,
            apiKey: args.aiApiKey || config.aiApiKey || undefined,
          });
          if (aiSummary.ok && aiSummary.summary) {
            const merged = mergeAiSummary(
              {
                title,
                highlights: context.highlights,
                pitfalls: context.pitfalls,
                nextSteps: context.nextSteps,
              },
              aiSummary.summary
            );
            context = {
              ...context,
              highlights: merged.highlights,
              pitfalls: merged.pitfalls,
              nextSteps: merged.nextSteps,
            };
            title = merged.title;
          }
        }

        const formatted = formatMultiPlatformDevlog(context, {
          title,
          xhsTitle: args.xhsTitle,
          style,
          edition,
        });
        const written = writeDevlogBundle(context, formatted, {
          outputDir: args.outputDir || defaultOutputDir,
          heroImagePath: args.heroImagePath,
        });
        return {
          ...written,
          meta: formatted.meta,
          platforms: formatted.platforms,
          ...(aiSummary ? { aiSummary } : {}),
        };
      },
    },
    {
      name: 'devlog_publish_github',
      description:
        'Publish generated devlog to GitHub (append to DEVLOG.md or create a GitHub Release via gh CLI). Defaults to dryRun=true.',
      parameters: {
        mode: {
          type: 'string',
          required: false,
          description: '"devlog_file" (append to DEVLOG.md) or "release" (gh release create).',
        },
        repoPath: {
          type: 'string',
          required: false,
          description: 'Local repository path.',
        },
        repo: {
          type: 'string',
          required: false,
          description: 'Optional GitHub owner/repo for release mode.',
        },
        tag: {
          type: 'string',
          required: false,
          description: 'Release tag name (for release mode).',
        },
        title: {
          type: 'string',
          required: false,
          description: 'Release title (for release mode).',
        },
        body: {
          type: 'string',
          required: true,
          description: 'Markdown devlog content to publish.',
        },
        dryRun: {
          type: 'boolean',
          required: false,
          description: 'Preview without mutating files or remote releases (default: true).',
        },
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [
          {
            type: 'text',
            text: renderPublishGithub(value),
          },
        ],
      },
      async execute(args) {
        return publishToGitHub({
          ...args,
          ghBin: config.ghBin || 'gh',
        });
      },
    },
    {
      name: 'devlog_save_draft',
      description:
        'Fill Xiaohongshu, Bilibili, or Douyin creator page with generated copy & PNG card using an isolated Playwright browser and save as draft (never auto-publishes). Defaults to dryRun=true.',
      parameters: {
        platform: {
          type: 'string',
          required: true,
          description: 'Target platform: "xiaohongshu" | "bilibili" | "douyin".',
        },
        bundleDir: {
          type: 'string',
          required: true,
          description: 'Path to the bundle directory produced by devlog_generate_bundle.',
        },
        profileDir: {
          type: 'string',
          required: false,
          description: 'Optional persistent Chromium profile directory to reuse login sessions.',
        },
        dryRun: {
          type: 'boolean',
          required: false,
          description: 'Preview execution plan without launching Chromium (default: true).',
        },
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [
          {
            type: 'text',
            text: renderSaveDraft(value),
          },
        ],
      },
      async execute(args) {
        return savePlatformDraft({
          ...args,
          profileDir: args.profileDir || config.browserProfileDir,
        });
      },
    },
    {
      name: 'devlog_send_work_report',
      description:
        'Generate a structured daily/weekly work report from local git context and send via Webhook (Feishu, DingTalk, WeCom, Slack, Discord, or QQ OneBot v11). Defaults to dryRun=true.',
      parameters: {
        repoPath: {
          type: 'string',
          required: false,
          description: 'Local git repository path.',
        },
        scanDirs: {
          type: 'array',
          required: false,
          description:
            'Optional parent directories to scan for active git repos (enables multi-project work report).',
        },
        repos: {
          type: 'array',
          required: false,
          description:
            'Optional explicit git repository paths to aggregate (enables multi-project work report).',
        },
        maxDepth: {
          type: 'number',
          required: false,
          description: 'Max scan depth when using scanDirs (default: 2).',
        },
        projectName: {
          type: 'string',
          required: false,
          description: 'Optional display name for the project.',
        },
        period: {
          type: 'string',
          required: false,
          description: '"daily" (default, last 24h) or "weekly" (last 7d).',
        },
        since: {
          type: 'string',
          required: false,
          description: 'Custom git log window (overrides default daily/weekly window).',
        },
        highlights: {
          type: 'array',
          required: false,
          description: 'Completed tasks / deliverables.',
        },
        pitfalls: {
          type: 'array',
          required: false,
          description: 'Blockers or risks.',
        },
        nextSteps: {
          type: 'array',
          required: false,
          description: 'Next day / next week plan.',
        },
        channel: {
          type: 'string',
          required: false,
          description:
            'Target channel: "feishu" | "dingtalk" | "wecom" | "slack" | "discord" | "qq_onebot" (default: "feishu").',
        },
        endpoint: {
          type: 'string',
          required: false,
          description: 'Webhook URL or OneBot HTTP base URL.',
        },
        token: {
          type: 'string',
          required: false,
          description: 'Optional Bearer token for OneBot/authenticated webhooks.',
        },
        groupId: {
          type: 'string',
          required: false,
          description: 'QQ group ID (for qq_onebot channel).',
        },
        userId: {
          type: 'string',
          required: false,
          description: 'QQ user ID for private message (for qq_onebot channel).',
        },
        dryRun: {
          type: 'boolean',
          required: false,
          description: 'Preview payload without sending HTTP request (default: true).',
        },
        useAiSummary: {
          type: 'boolean',
          required: false,
          description:
            'Optionally invoke external AI summarizer on git log & diff to auto-fill report items (gracefully falls back if no API key).',
        },
        aiProvider: {
          type: 'string',
          required: false,
          description: 'AI summarizer provider: auto | deepseek | openai | gemini | anthropic | custom_openai.',
        },
        aiModel: {
          type: 'string',
          required: false,
          description: 'Optional AI summarizer model override.',
        },
        aiEndpoint: {
          type: 'string',
          required: false,
          description: 'Optional AI summarizer HTTP endpoint override.',
        },
        aiApiKey: {
          type: 'string',
          required: false,
          description: 'Optional AI summarizer API key override.',
        },
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [
          {
            type: 'text',
            text: renderSendWorkReport(value),
          },
        ],
      },
      async execute(args = {}) {
        const period = args.period === 'weekly' ? 'weekly' : 'daily';
        const since = args.since || (period === 'weekly' ? '7 days ago' : '24 hours ago');
        let context = resolveToolContext(args, since);
        let title = args.title;
        let aiSummary = null;

        if (args.useAiSummary) {
          aiSummary = await summarizeWithAI({
            context,
            repoPath: args.repoPath || context.repoPath,
            since,
            style: args.style || 'office',
            mode: 'report',
            provider: args.aiProvider || config.aiProvider || 'auto',
            model: args.aiModel || config.aiModel || undefined,
            endpoint: args.aiEndpoint || config.aiEndpoint || undefined,
            apiKey: args.aiApiKey || config.aiApiKey || undefined,
          });
          if (aiSummary.ok && aiSummary.summary) {
            const merged = mergeAiSummary(
              {
                title,
                highlights: context.highlights,
                pitfalls: context.pitfalls,
                nextSteps: context.nextSteps,
              },
              aiSummary.summary
            );
            context = {
              ...context,
              highlights: merged.highlights,
              pitfalls: merged.pitfalls,
              nextSteps: merged.nextSteps,
            };
            title = merged.title;
          }
        }

        const report = formatWorkReport(context, { period, title });
        const sent = await sendWorkReport({
          channel: args.channel || config.defaultReportChannel || 'feishu',
          endpoint: args.endpoint || config.reportEndpoint,
          token: args.token || config.reportToken,
          groupId: args.groupId || config.qqGroupId,
          userId: args.userId || config.qqUserId,
          report,
          dryRun: args.dryRun !== false,
        });
        return { ...sent, report, ...(aiSummary ? { aiSummary } : {}) };
      },
    },
    {
      name: 'devlog_generate_image',
      description:
        'Build platform-adapted image generation prompt (Xiaohongshu / Bilibili / Douyin / GitHub) bound to a model style, and optionally invoke an image model provider (openai / gemini / volcengine / custom_openai / svg_fallback). Defaults to dryRun=true.',
      parameters: {
        repoPath: {
          type: 'string',
          required: false,
          description: 'Local git repository path.',
        },
        projectName: {
          type: 'string',
          required: false,
          description: 'Project display name.',
        },
        highlights: {
          type: 'array',
          required: false,
          description: 'Key devlog milestone highlights to visualize.',
        },
        platform: {
          type: 'string',
          required: false,
          description: 'Target platform preset: "xiaohongshu" | "bilibili" | "douyin" | "github".',
        },
        style: {
          type: 'string',
          required: false,
          description: 'Model style: "big_fat_fish" | "gemini" | "chatgpt" | "claude".',
        },
        provider: {
          type: 'string',
          required: false,
          description:
            'Image model provider: "openai" | "gemini" | "volcengine" | "custom_openai" | "svg_fallback".',
        },
        model: {
          type: 'string',
          required: false,
          description: 'Optional model override (e.g. gpt-image-1, imagen-3.0-generate-002, doubao-seedream-3-0-t2i-250415).',
        },
        endpoint: {
          type: 'string',
          required: false,
          description: 'Optional custom API endpoint URL.',
        },
        apiKey: {
          type: 'string',
          required: false,
          description: 'Optional API key (falls back to OPENAI_API_KEY / GEMINI_API_KEY / ARK_API_KEY).',
        },
        outputPath: {
          type: 'string',
          required: false,
          description: 'Optional PNG file output path when dryRun=false.',
        },
        dryRun: {
          type: 'boolean',
          required: false,
          description: 'Preview prompt & provider request without spending credits (default: true).',
        },
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [
          {
            type: 'text',
            text: renderGenerateImage(value),
          },
        ],
      },
      async execute(args = {}) {
        const context = collectGitContext(args);
        return generateVisualImage({
          context,
          platform: args.platform || 'xiaohongshu',
          style: args.style || config.defaultStyle || 'big_fat_fish',
          provider: args.provider || config.imageProvider || 'openai',
          model: args.model || config.imageModel,
          endpoint: args.endpoint || config.imageEndpoint,
          apiKey: args.apiKey || config.imageApiKey,
          outputPath: args.outputPath,
          dryRun: args.dryRun !== false,
        });
      },
    },
  ];
}

/**
 * Cordis / DeepSeek Harness plugin entrypoint.
 */
export function apply(ctx, config = {}) {
  const toolSpecs = createToolSpecs(config);
  const disposers = [];

  if (ctx?.tools?.register) {
    for (const spec of toolSpecs) {
      const dispose = ctx.tools.register(spec);
      if (typeof dispose === 'function') disposers.push(dispose);
    }
  }

  return () => {
    for (const dispose of disposers) dispose();
  };
}

export {
  collectGitContext,
  collectMultiRepoContext,
  discoverGitRepos,
  formatMultiPlatformDevlog,
  writeDevlogBundle,
  publishToGitHub,
  publishGlobalPlatform,
  SUPPORTED_GLOBAL_PLATFORMS,
  savePlatformDraft,
  formatWorkReport,
  sendWorkReport,
  buildImagePrompt,
  buildAllPlatformImagePrompts,
  generateVisualImage,
  summarizeWithAI,
  loadConfig,
  saveConfig,
};
