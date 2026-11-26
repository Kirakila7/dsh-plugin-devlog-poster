import { collectGitContext } from './git-context.js';
import { formatMultiPlatformDevlog } from './formatter.js';
import { publishToGitHub, writeDevlogBundle } from './publisher.js';
import { savePlatformDraft } from './draft-automation.js';
import { formatWorkReport, sendWorkReport } from './work-report.js';

export const name = 'dsh-plugin-devlog-poster';
export const inject = ['tools'];

function createToolSpecs(config = {}) {
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
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [
          {
            type: 'text',
            text: `Collected ${value.commits.length} commits for ${value.projectName} (${value.stats.filesChanged} files, +${value.stats.insertions}/-${value.stats.deletions}).`,
          },
        ],
      },
      async execute(args = {}) {
        return collectGitContext(args);
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
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [
          {
            type: 'text',
            text: `Devlog bundle ready at ${value.bundleDir}\nPreview: ${value.files.preview}`,
          },
        ],
      },
      async execute(args = {}) {
        const context = collectGitContext(args);
        const formatted = formatMultiPlatformDevlog(context, {
          title: args.title,
          xhsTitle: args.xhsTitle,
          style: args.style || config.defaultStyle || 'big_fat_fish',
        });
        const written = writeDevlogBundle(context, formatted, {
          outputDir: args.outputDir || defaultOutputDir,
        });
        return {
          ...written,
          meta: formatted.meta,
          platforms: formatted.platforms,
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
            text: value.dryRun
              ? `[DRY RUN] Ready to publish (${value.mode}): ${value.target || value.command}`
              : `Published to GitHub (${value.mode}): ${value.target || value.url}`,
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
            text: value.dryRun
              ? `[DRY RUN] Draft plan ready for ${value.label} (${value.url})`
              : value.ok
                ? `Draft filled on ${value.platform} (savedDraft=${value.savedDraft}): ${value.url}`
                : `Draft automation unavailable: ${value.message || value.error}`,
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
      },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [
          {
            type: 'text',
            text: value.dryRun
              ? `[DRY RUN] Work report ready for ${value.channel} (${value.url || 'no endpoint set'})`
              : `Work report sent to ${value.channel} (HTTP ${value.status})`,
          },
        ],
      },
      async execute(args = {}) {
        const period = args.period === 'weekly' ? 'weekly' : 'daily';
        const since = args.since || (period === 'weekly' ? '7 days ago' : '24 hours ago');
        const context = collectGitContext({ ...args, since });
        const report = formatWorkReport(context, { period, title: args.title });
        const sent = await sendWorkReport({
          channel: args.channel || config.defaultReportChannel || 'feishu',
          endpoint: args.endpoint || config.reportEndpoint,
          token: args.token || config.reportToken,
          groupId: args.groupId || config.qqGroupId,
          userId: args.userId || config.qqUserId,
          report,
          dryRun: args.dryRun !== false,
        });
        return { ...sent, report };
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
  formatMultiPlatformDevlog,
  writeDevlogBundle,
  publishToGitHub,
  savePlatformDraft,
  formatWorkReport,
  sendWorkReport,
};
