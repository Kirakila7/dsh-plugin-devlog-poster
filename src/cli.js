#!/usr/bin/env node
import { collectGitContext } from './git-context.js';
import { formatMultiPlatformDevlog } from './formatter.js';
import { publishToGitHub, writeDevlogBundle } from './publisher.js';
import { savePlatformDraft } from './draft-automation.js';
import { formatWorkReport, sendWorkReport } from './work-report.js';
import { generateVisualImage } from './image-gen.js';

function parseArgs(argv) {
  const [command = 'generate', ...rest] = argv;
  const opts = {
    highlights: [],
    pitfalls: [],
    nextSteps: [],
  };

  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    const next = rest[i + 1];
    switch (token) {
      case '--repo':
        opts.repoPath = next;
        i++;
        break;
      case '--name':
        opts.projectName = next;
        i++;
        break;
      case '--title':
        opts.title = next;
        i++;
        break;
      case '--style':
        opts.style = next;
        i++;
        break;
      case '--since':
        opts.since = next;
        i++;
        break;
      case '--out':
        opts.outputDir = next;
        i++;
        break;
      case '--highlight':
        opts.highlights.push(next);
        i++;
        break;
      case '--pitfall':
        opts.pitfalls.push(next);
        i++;
        break;
      case '--next':
        opts.nextSteps.push(next);
        i++;
        break;
      case '--mode':
        opts.mode = next;
        i++;
        break;
      case '--tag':
        opts.tag = next;
        i++;
        break;
      case '--gh-repo':
        opts.ghRepo = next;
        i++;
        break;
      case '--platform':
        opts.platform = next;
        i++;
        break;
      case '--bundle':
        opts.bundleDir = next;
        i++;
        break;
      case '--profile-dir':
        opts.profileDir = next;
        i++;
        break;
      case '--channel':
        opts.channel = next;
        i++;
        break;
      case '--endpoint':
        opts.endpoint = next;
        i++;
        break;
      case '--token':
        opts.token = next;
        i++;
        break;
      case '--group-id':
        opts.groupId = next;
        i++;
        break;
      case '--user-id':
        opts.userId = next;
        i++;
        break;
      case '--period':
        opts.period = next;
        i++;
        break;
      case '--provider':
        opts.provider = next;
        i++;
        break;
      case '--model':
        opts.model = next;
        i++;
        break;
      case '--api-key':
        opts.apiKey = next;
        i++;
        break;
      case '--output':
        opts.outputPath = next;
        i++;
        break;
      case '--execute':
        opts.dryRun = false;
        break;
      default:
        break;
    }
  }

  return { command, opts };
}

async function main() {
  const { command, opts } = parseArgs(process.argv.slice(2));

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(`dsh-plugin-devlog-poster CLI

Usage:
  devlog-poster generate [--repo <path>] [--name <project>] [--style big_fat_fish|gemini|chatgpt|claude]
                         [--since "24 hours ago"] [--highlight "..."] [--pitfall "..."] [--next "..."] [--out out]
  devlog-poster publish-github [--mode devlog_file|release] [--tag v0.3.0] [--execute]
  devlog-poster save-draft --platform xiaohongshu|bilibili|douyin --bundle <bundleDir> [--execute]
  devlog-poster send-report --channel feishu|dingtalk|wecom|slack|discord|qq_onebot [--period daily|weekly] [--endpoint <url>] [--group-id <id>] [--execute]
  devlog-poster generate-image --platform xiaohongshu|bilibili|douyin|github --provider openai|gemini|volcengine|custom_openai|svg_fallback [--style big_fat_fish] [--execute]
`);
    return;
  }

  if (command === 'generate-image') {
    const context = collectGitContext({
      repoPath: opts.repoPath || process.cwd(),
      projectName: opts.projectName,
      since: opts.since || '24 hours ago',
      highlights: opts.highlights,
      pitfalls: opts.pitfalls,
      nextSteps: opts.nextSteps,
    });
    const result = await generateVisualImage({
      context,
      platform: opts.platform || 'xiaohongshu',
      style: opts.style || 'big_fat_fish',
      provider: opts.provider || 'openai',
      model: opts.model,
      endpoint: opts.endpoint,
      apiKey: opts.apiKey,
      outputPath: opts.outputPath,
      dryRun: opts.dryRun !== false,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'send-report') {
    const period = opts.period === 'weekly' ? 'weekly' : 'daily';
    const context = collectGitContext({
      repoPath: opts.repoPath || process.cwd(),
      projectName: opts.projectName,
      since: opts.since || (period === 'weekly' ? '7 days ago' : '24 hours ago'),
      highlights: opts.highlights,
      pitfalls: opts.pitfalls,
      nextSteps: opts.nextSteps,
    });
    const report = formatWorkReport(context, { period, title: opts.title });
    const result = await sendWorkReport({
      channel: opts.channel || 'feishu',
      endpoint: opts.endpoint,
      token: opts.token,
      groupId: opts.groupId,
      userId: opts.userId,
      report,
      dryRun: opts.dryRun !== false,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'save-draft') {
    if (!opts.bundleDir) {
      console.error('Missing required flag: --bundle <bundleDir>');
      process.exitCode = 1;
      return;
    }
    const result = await savePlatformDraft({
      platform: opts.platform || 'xiaohongshu',
      bundleDir: opts.bundleDir,
      profileDir: opts.profileDir,
      dryRun: opts.dryRun !== false,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const context = collectGitContext({
    repoPath: opts.repoPath || process.cwd(),
    projectName: opts.projectName,
    since: opts.since || '24 hours ago',
    highlights: opts.highlights,
    pitfalls: opts.pitfalls,
    nextSteps: opts.nextSteps,
  });

  const formatted = formatMultiPlatformDevlog(context, {
    title: opts.title,
    style: opts.style || 'big_fat_fish',
  });

  if (command === 'generate') {
    const { bundleDir, files } = writeDevlogBundle(context, formatted, {
      outputDir: opts.outputDir || 'out',
    });
    console.log(`✅ Devlog bundle generated: ${bundleDir}`);
    console.log(`   - Preview UI : ${files.preview}`);
    console.log(`   - GitHub     : ${files.github}`);
    console.log(`   - 小红书     : ${files.xiaohongshu}`);
    console.log(`   - B站        : ${files.bilibili}`);
    console.log(`   - 抖音       : ${files.douyin}`);
    console.log(`   - 3:4 Card   : ${files.cardVertical}`);
    console.log(`   - 16:9 Card  : ${files.cardHorizontal}`);
    return;
  }

  if (command === 'publish-github') {
    const result = publishToGitHub({
      mode: opts.mode || 'devlog_file',
      repoPath: opts.repoPath || process.cwd(),
      repo: opts.ghRepo,
      tag: opts.tag,
      title: formatted.platforms.github.title,
      body: formatted.platforms.github.content,
      dryRun: opts.dryRun !== false,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error(`Unknown command: ${command}. Run with --help for usage.`);
  process.exitCode = 1;
}

main();
