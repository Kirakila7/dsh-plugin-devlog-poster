import { resolveStyle } from './styles.js';

function pickBulletPoints(context) {
  if (context.highlights?.length > 0) {
    return context.highlights;
  }
  if (context.commits?.length > 0) {
    return context.commits.slice(0, 5).map((c) => c.subject);
  }
  return ['完成了阶段性原型搭建与核心流程验证'];
}

function formatDateCN(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function buildTagList(baseTags, projectName) {
  const shortProject = projectName.includes('/')
    ? projectName.split('/').pop()
    : projectName;
  const cleanProject = shortProject.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '');
  const tags = [...baseTags];
  if (cleanProject) tags.unshift(`#${cleanProject}`);
  return [...new Set(tags)];
}

/**
 * Generate tailored devlog copy for GitHub, Xiaohongshu, Bilibili, and Douyin.
 * Supported styles: big_fat_fish (default) | gemini | chatgpt | claude
 */
export function formatMultiPlatformDevlog(context, options = {}) {
  const dateStr = formatDateCN(context.collectedAt);
  const shortName = context.projectName.split('/').pop() || context.projectName;
  const theme = resolveStyle(options.style);

  const title =
    options.title || `${theme.emoji} ${context.projectName} 更新日志 (${dateStr})`;

  const points = pickBulletPoints(context);
  const pitfalls = context.pitfalls || [];
  const nextSteps = context.nextSteps || [];
  const { filesChanged = 0, insertions = 0, deletions = 0 } = context.stats || {};
  const statsLine =
    filesChanged > 0
      ? `改动 ${filesChanged} 个文件（+${insertions} / -${deletions} 行）`
      : `完成 ${points.length} 项核心更新`;

  // 1. GitHub (Release Notes / Changelog / DEVLOG.md)
  const githubBody = [
    `## ${title}`,
    '',
    theme.githubLead(context.branch || 'main', statsLine),
    '',
    '### ✨ What Changed',
    ...points.map((p) => `- ${p}`),
    ...(pitfalls.length > 0
      ? ['', '### 🫧 踩坑与修正', ...pitfalls.map((p) => `- ${p}`)]
      : []),
    ...(nextSteps.length > 0
      ? ['', '### 🧭 Next Up', ...nextSteps.map((p) => `- [ ] ${p}`)]
      : []),
    ...(context.commits?.length > 0
      ? [
          '',
          '### 📦 Commits',
          ...context.commits.map((c) => `- \`${c.sha}\` ${c.subject} (${c.date})`),
        ]
      : []),
  ].join('\n');

  // 2. Xiaohongshu (小红书图文更新日志)
  const xhsTitle = options.xhsTitle || theme.xhsTitle(shortName);
  const xhsTags = buildTagList(theme.xhsTags, context.projectName);
  const xhsBody = [
    xhsTitle,
    '',
    theme.xhsOpening(shortName, statsLine),
    '',
    '📌 本次更新：',
    ...points.map((p, i) => `${i + 1}. ${p}`),
    ...(pitfalls.length > 0
      ? ['', '⚠️ 踩到的坑：', ...pitfalls.map((p) => `- ${p}`)]
      : []),
    ...(nextSteps.length > 0
      ? ['', '🧭 下一步计划：', ...nextSteps.map((p) => `- ${p}`)]
      : []),
    '',
    theme.xhsClosing,
    '',
    xhsTags.join(' '),
  ].join('\n');

  // 3. Bilibili (B站图文动态 + 60s 口播大纲)
  const biliTitle = theme.biliTitle(dateStr, shortName);
  const biliTags = buildTagList(theme.biliTags, context.projectName);
  const biliDynamic = [
    biliTitle,
    '',
    theme.biliOpening(statsLine),
    ...points.map((p) => `${theme.bulletIcon} ${p}`),
    ...(pitfalls.length > 0
      ? ['', '🔧 顺手填了几个坑：', ...pitfalls.map((p) => `• ${p}`)]
      : []),
    ...(nextSteps.length > 0
      ? ['', '🚀 下一站：', ...nextSteps.map((p) => `→ ${p}`)]
      : []),
    '',
    theme.biliClosing,
    biliTags.join(' '),
  ].join('\n');

  const biliVideoOutline = [
    `【60秒口播大纲 · ${theme.name}｜${shortName}】`,
    `0-5s 开场钩子：今天用 ${theme.name} 模式把 ${shortName} 推进了一版，直接看更新。`,
    `5-35s 核心更新：${points.slice(0, 3).join('；')}。`,
    pitfalls.length > 0
      ? `35-50s 踩坑实录：中途卡在「${pitfalls[0]}」，最后这样解决的。`
      : `35-50s 改动总览：这波总共${statsLine}。`,
    `50-60s 互动收尾：想看「${nextSteps[0] || '下一版实机演示'}」的可以三连蹲一下！`,
  ].join('\n');

  // 4. Douyin (抖音图文笔记 + 30s 快节奏口播)
  const douyinTitle = theme.douyinTitle(shortName, dateStr);
  const douyinTags = buildTagList(theme.douyinTags, context.projectName);
  const douyinBody = [
    douyinTitle,
    '',
    ...points.slice(0, 3).map((p) => `${theme.bulletIcon} ${p}`),
    ...(pitfalls.length > 0 ? [`⚠️ 避坑：${pitfalls[0]}`] : []),
    '',
    `今日改动：${statsLine}`,
    theme.douyinClosing,
    '',
    douyinTags.join(' '),
  ].join('\n');

  const douyinScript = [
    `【30秒快节奏口播 · ${theme.name}】`,
    `今天把 ${shortName} 又推了一版：核心做了「${points[0]}」。`,
    points[1] ? `顺手还搞定了「${points[1]}」。` : `总共${statsLine}。`,
    `最折腾的坑是：${pitfalls[0] || '怎么把流程收口成真正好用的闭环'}。`,
    `下期直接上实机演示，点个关注不迷路。`,
  ].join('\n');

  return {
    meta: {
      title,
      dateStr,
      projectName: context.projectName,
      statsLine,
      style: theme.id,
      styleName: theme.name,
    },
    platforms: {
      github: {
        platform: 'github',
        label: 'GitHub',
        title,
        content: githubBody,
      },
      xiaohongshu: {
        platform: 'xiaohongshu',
        label: '小红书',
        title: xhsTitle,
        content: xhsBody,
      },
      bilibili: {
        platform: 'bilibili',
        label: 'B站',
        title: biliTitle,
        content: biliDynamic,
        videoOutline: biliVideoOutline,
      },
      douyin: {
        platform: 'douyin',
        label: '抖音',
        title: douyinTitle,
        content: douyinBody,
        videoScript: douyinScript,
      },
    },
  };
}
