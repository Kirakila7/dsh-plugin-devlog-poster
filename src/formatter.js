import { resolveEdition, resolveStyle } from './styles.js';

function pickBulletPoints(context) {
  if (context.highlights?.length > 0) {
    return context.highlights;
  }
  if (context.isMultiRepo && context.projects?.length > 0) {
    const picked = [];
    const maxTotal = 6;
    let round = 0;
    while (picked.length < maxTotal) {
      let addedInRound = false;
      for (const proj of context.projects) {
        const commit = proj.commits?.[round];
        if (commit) {
          const name = proj.shortName || proj.projectName;
          picked.push(`[${name}] ${commit.subject}`);
          addedInRound = true;
          if (picked.length >= maxTotal) break;
        }
      }
      if (!addedInRound) break;
      round += 1;
    }
    if (picked.length > 0) return picked;
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

function formatDateISO(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function clampText(text, maxLen) {
  const clean = String(text || '').trim();
  if (clean.length <= maxLen && [...clean].length <= maxLen) return clean;
  if (maxLen <= 1) return clean.slice(0, Math.max(0, maxLen));
  let out = '';
  for (const ch of clean) {
    const candidate = out + ch;
    if (candidate.length + 1 > maxLen || [...candidate].length + 1 > maxLen) {
      break;
    }
    out = candidate;
  }
  return `${out.trimEnd()}…`;
}

function fitMicroPost({ lead, body, tags, maxLen }) {
  const cleanLead = String(lead || '').trim();
  const cleanBody = String(body || '').trim();
  const cleanTags = String(tags || '').trim();

  const full = [cleanLead, cleanBody, cleanTags].filter(Boolean).join('\n\n');
  if (full.length <= maxLen && [...full].length <= maxLen) {
    return full;
  }

  const singleLine = [cleanLead, cleanBody, cleanTags].filter(Boolean).join(' ');
  if (singleLine.length <= maxLen && [...singleLine].length <= maxLen) {
    return singleLine;
  }

  const fixedOverhead =
    cleanLead.length +
    (cleanTags ? cleanTags.length + 2 : 0) +
    (cleanBody ? 2 : 0);
  const availableForBody = maxLen - fixedOverhead;

  if (cleanBody && availableForBody >= 24) {
    const fittedBody = clampText(cleanBody, availableForBody);
    const assembled = [cleanLead, fittedBody, cleanTags].filter(Boolean).join('\n');
    if (assembled.length <= maxLen && [...assembled].length <= maxLen) {
      return assembled;
    }
  }

  const withoutTags = [cleanLead, cleanBody].filter(Boolean).join(' ');
  const tagBudget = cleanTags ? cleanTags.length + 1 : 0;
  if (cleanTags && maxLen - tagBudget >= 40) {
    const head = clampText(withoutTags, maxLen - tagBudget);
    const assembled = `${head} ${cleanTags}`;
    if (assembled.length <= maxLen && [...assembled].length <= maxLen) {
      return assembled;
    }
  }

  return clampText(singleLine, maxLen);
}

function escapeYamlString(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ')
    .trim();
}

const GLOBAL_STYLE_VOICES = {
  big_fat_fish: {
    xLead: (proj, stats) => `🐳 Shipping ${proj} (${stats}):`,
    bskyLead: (proj, stats) => `🐳 Devlog for ${proj} (${stats}) — notebook open:`,
    redditIntro: (proj, stats, repoNote) =>
      `Sharing today's build-in-public log for **${proj}**${repoNote} (${stats}). I keep an honest notebook of what actually shipped and what tripped me up along the way.`,
    linkedinOpening: (proj, stats, repoNote) =>
      `Build-in-public reflection on **${proj}**${repoNote} (${stats}). Keeping an honest engineering notebook as the tool evolves:`,
    devtoIntro: (proj, stats, repoNote) =>
      `Welcome back to the **${proj}** build log${repoNote}. Today's iteration covered **${stats}** — here is a grounded breakdown of what shipped, what broke, and what comes next.`,
    outroTone: 'Always happy to compare notes or hear how others approach similar workflows.',
  },
  gemini: {
    xLead: (proj, stats) => `✦ Fresh drop on ${proj} (${stats})!`,
    bskyLead: (proj, stats) => `✦ Upbeat devlog for ${proj} (${stats})!`,
    redditIntro: (proj, stats, repoNote) =>
      `Just wrapped a lively sprint on **${proj}**${repoNote} (${stats}) and wanted to share the real progress (plus the bugs we squashed) with fellow builders.`,
    linkedinOpening: (proj, stats, repoNote) =>
      `Energetic shipping update on **${proj}**${repoNote} (${stats}) — turning rapid experiments into smooth developer ergonomics:`,
    devtoIntro: (proj, stats, repoNote) =>
      `Fresh sprint notes from **${proj}**${repoNote}! This round clocked in at **${stats}**, focusing on fast iteration and sharper developer UX.`,
    outroTone: 'What are you shipping this week? Always love trading ideas and feedback.',
  },
  chatgpt: {
    xLead: (proj, stats) => `🟢 ${proj} delivery log (${stats}):`,
    bskyLead: (proj, stats) => `🟢 Structured update on ${proj} (${stats}):`,
    redditIntro: (proj, stats, repoNote) =>
      `Here is a structured, no-fluff recap of today's delivery on **${proj}**${repoNote} (${stats}), focused on concrete changes and lessons learned.`,
    linkedinOpening: (proj, stats, repoNote) =>
      `Structured engineering recap on **${proj}**${repoNote} (${stats}). Focused on concrete deliverables and reliable execution:`,
    devtoIntro: (proj, stats, repoNote) =>
      `Here is a concise, structured changelog for **${proj}**${repoNote} (${stats}), detailing deliverables, debugging takeaways, and next milestones.`,
    outroTone: 'Open to technical critique, edge-case reports, or architecture feedback.',
  },
  claude: {
    xLead: (proj, stats) => `✴ Engineering notes on ${proj} (${stats}):`,
    bskyLead: (proj, stats) => `✴ Quiet engineering log for ${proj} (${stats}):`,
    redditIntro: (proj, stats, repoNote) =>
      `Sharing some deliberate engineering notes from working on **${proj}**${repoNote} (${stats}) — including the trade-offs and rough edges along the way.`,
    linkedinOpening: (proj, stats, repoNote) =>
      `Thoughtful engineering notes from iterating on **${proj}**${repoNote} (${stats}). Slowing down to examine the trade-offs paid off:`,
    devtoIntro: (proj, stats, repoNote) =>
      `A calm, deliberate engineering log for **${proj}**${repoNote} (${stats}), documenting not just what shipped, but the design trade-offs behind it.`,
    outroTone: 'Would genuinely value thoughtful perspectives on the trade-offs here.',
  },
  office: {
    xLead: (proj, stats) => `📋 ${proj} daily engineering brief (${stats}):`,
    bskyLead: (proj, stats) => `📋 ${proj} progress summary (${stats}):`,
    redditIntro: (proj, stats, repoNote) =>
      `Daily engineering report for **${proj}**${repoNote} (${stats}), summarizing key deliverables, blockers resolved, and next milestones.`,
    linkedinOpening: (proj, stats, repoNote) =>
      `Engineering progress update for **${proj}**${repoNote} (${stats}). Key deliverables and takeaways from this cycle:`,
    devtoIntro: (proj, stats, repoNote) =>
      `Structured engineering progress brief for **${proj}**${repoNote} (${stats}), covering shipped work, risks addressed, and upcoming tasks.`,
    outroTone: 'Feedback and technical discussion are welcome.',
  },
};

function buildTagList(baseTags, projectName, projects = null) {
  const tags = [...baseTags];
  if (Array.isArray(projects) && projects.length > 0) {
    const projectTags = projects
      .slice(0, 2)
      .map((p) => {
        const raw = p.shortName || p.projectName || '';
        const clean = raw.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '');
        return clean ? `#${clean}` : '';
      })
      .filter(Boolean);
    if (projectTags.length > 0) {
      tags.unshift(...projectTags);
      return [...new Set(tags)];
    }
  }
  const shortProject = projectName.includes('/')
    ? projectName.split('/').pop()
    : projectName;
  const cleanProject = shortProject.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '');
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
  const editionObj = resolveEdition(
    options.edition || (options.style === 'office' ? 'office' : 'community')
  );
  const theme = resolveStyle(options.style, { edition: editionObj.id });
  const isMultiRepo = Boolean(context.isMultiRepo && context.projects?.length > 0);
  const projects = isMultiRepo ? context.projects : null;

  const title =
    options.title ||
    (editionObj.id === 'office'
      ? `📋 ${context.projectName} 工作日报 (${dateStr})`
      : `${theme.emoji} ${context.projectName} 更新日志 (${dateStr})`);

  const points = pickBulletPoints(context);
  const pitfalls = context.pitfalls || [];
  const nextSteps = context.nextSteps || [];
  const { filesChanged = 0, insertions = 0, deletions = 0 } = context.stats || {};
  const statsLine =
    filesChanged > 0
      ? `改动 ${filesChanged} 个文件（+${insertions} / -${deletions} 行）`
      : `完成 ${points.length} 项核心更新`;

  // 1. GitHub (Release Notes / Changelog / DEVLOG.md)
  const githubChangedLines = isMultiRepo
    ? context.highlights?.length > 0
      ? [
          ...context.highlights.map((p) => `- ${p}`),
          '',
          '### 🧩 Projects',
          ...context.projects.flatMap((proj) => [
            `#### [${proj.shortName || proj.projectName}] (\`${proj.branch || 'main'}\` · ${proj.stats?.filesChanged || 0} files, +${proj.stats?.insertions || 0}/-${proj.stats?.deletions || 0})`,
            ...(proj.commits || []).map((c) => `- ${c.subject}`),
          ]),
        ]
      : context.projects.flatMap((proj) => [
          `#### [${proj.shortName || proj.projectName}] (\`${proj.branch || 'main'}\` · ${proj.stats?.filesChanged || 0} files, +${proj.stats?.insertions || 0}/-${proj.stats?.deletions || 0})`,
          ...(proj.commits || []).map((c) => `- ${c.subject}`),
        ])
    : points.map((p) => `- ${p}`);

  const githubCommitsLines = isMultiRepo
    ? context.projects.flatMap((proj) =>
        (proj.commits || []).length > 0
          ? [
              `#### [${proj.shortName || proj.projectName}]`,
              ...proj.commits.map((c) => `- \`${c.sha}\` ${c.subject} (${c.date})`),
            ]
          : []
      )
    : (context.commits || []).map((c) => `- \`${c.sha}\` ${c.subject} (${c.date})`);

  const isOffice = editionObj.id === 'office';

  const githubBody = [
    `## ${title}`,
    '',
    theme.githubLead(context.branch || 'main', statsLine),
    '',
    isOffice ? '### 📋 Summary of Changes' : '### ✨ What Changed',
    ...githubChangedLines,
    ...(pitfalls.length > 0
      ? ['', isOffice ? '### ⚠️ Risks & Resolutions' : '### 🫧 踩坑与修正', ...pitfalls.map((p) => `- ${p}`)]
      : []),
    ...(nextSteps.length > 0
      ? ['', isOffice ? '### 📌 Next Actions' : '### 🧭 Next Up', ...nextSteps.map((p) => `- [ ] ${p}`)]
      : []),
    ...(githubCommitsLines.length > 0
      ? ['', '### 📦 Commits', ...githubCommitsLines]
      : []),
  ].join('\n');

  // 2. Xiaohongshu (小红书图文更新日志)
  const xhsTitle = options.xhsTitle || theme.xhsTitle(shortName);
  const xhsTags = buildTagList(theme.xhsTags, context.projectName, projects);
  const xhsBody = [
    xhsTitle,
    '',
    theme.xhsOpening(shortName, statsLine),
    '',
    isOffice ? '📌 核心交付：' : '📌 本次更新：',
    ...points.map((p, i) => `${i + 1}. ${p}`),
    ...(pitfalls.length > 0
      ? ['', isOffice ? '⚠️ 风险与卡点：' : '⚠️ 踩到的坑：', ...pitfalls.map((p) => `- ${p}`)]
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
  const biliTags = buildTagList(theme.biliTags, context.projectName, projects);
  const biliDynamic = [
    biliTitle,
    '',
    theme.biliOpening(statsLine),
    ...points.map((p) => `${theme.bulletIcon} ${p}`),
    ...(pitfalls.length > 0
      ? ['', isOffice ? '⚠️ 风险与处理：' : '🔧 顺手填了几个坑：', ...pitfalls.map((p) => `• ${p}`)]
      : []),
    ...(nextSteps.length > 0
      ? ['', isOffice ? '📌 下一步计划：' : '🚀 下一站：', ...nextSteps.map((p) => `→ ${p}`)]
      : []),
    '',
    theme.biliClosing,
    biliTags.join(' '),
  ].join('\n');

  const biliVideoOutline = isOffice
    ? [
        `【60秒汇报大纲 · ${theme.name}｜${shortName}】`,
        `0-5s 概览：同步 ${shortName} 本周期研发进展（${statsLine}）。`,
        `5-35s 核心交付：${points.slice(0, 3).join('；')}。`,
        pitfalls.length > 0
          ? `35-50s 风险与处理：重点解决了「${pitfalls[0]}」。`
          : `35-50s 变更统计：本周期共${statsLine}。`,
        `50-60s 下步计划：下一阶段将重点推进「${nextSteps[0] || '既定迭代排期'}」。`,
      ].join('\n')
    : [
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
  const douyinTags = buildTagList(theme.douyinTags, context.projectName, projects);
  const douyinBody = [
    douyinTitle,
    '',
    ...points.slice(0, 3).map((p) => `${theme.bulletIcon} ${p}`),
    ...(pitfalls.length > 0 ? [`${isOffice ? '⚠️ 风险：' : '⚠️ 避坑：'}${pitfalls[0]}`] : []),
    '',
    `今日改动：${statsLine}`,
    theme.douyinClosing,
    '',
    douyinTags.join(' '),
  ].join('\n');

  const douyinScript = isOffice
    ? [
        `【30秒进度速报 · ${theme.name}】`,
        `同步 ${shortName} 今日研发进展：核心完成「${points[0]}」。`,
        points[1] ? `同步推进了「${points[1]}」。` : `本周期共计${statsLine}。`,
        pitfalls.length > 0
          ? `重点风险处理：${pitfalls[0]}。`
          : `当前无阻塞性风险。`,
        `下一阶段计划：${nextSteps[0] || '按排期推进后续交付'}。`,
      ].join('\n')
    : [
        `【30秒快节奏口播 · ${theme.name}】`,
        `今天把 ${shortName} 又推了一版：核心做了「${points[0]}」。`,
        points[1] ? `顺手还搞定了「${points[1]}」。` : `总共${statsLine}。`,
        `最折腾的坑是：${pitfalls[0] || '怎么把流程收口成真正好用的闭环'}。`,
        `下期直接上实机演示，点个关注不迷路。`,
      ].join('\n');

  // 5-9. Overseas / Global Platforms (X, Reddit, LinkedIn, Bluesky, Dev.to)
  const dateIso = formatDateISO(context.collectedAt);
  const voice = GLOBAL_STYLE_VOICES[theme.id] || GLOBAL_STYLE_VOICES.big_fat_fish;
  const activeRepoCount = isMultiRepo
    ? (context.activeRepoCount ?? context.projects.length)
    : 1;
  const multiRepoNames = isMultiRepo
    ? context.projects.map((p) => p.shortName || p.projectName).filter(Boolean)
    : [];
  const multiRepoNoteEn = isMultiRepo
    ? ` across ${activeRepoCount} active repo${activeRepoCount === 1 ? '' : 's'} (${multiRepoNames.slice(0, 3).join(', ')})`
    : '';
  const enStatsCompact =
    filesChanged > 0
      ? `${filesChanged} file${filesChanged === 1 ? '' : 's'}, +${insertions}/-${deletions}`
      : `${points.length} update${points.length === 1 ? '' : 's'}`;
  const enStatsLine =
    filesChanged > 0
      ? `${filesChanged} file${filesChanged === 1 ? '' : 's'} changed (+${insertions} / -${deletions} lines)`
      : `${points.length} key update${points.length === 1 ? '' : 's'} shipped`;

  // 5. X (Twitter) — single post <= 280 chars + 3-4 tweet thread + intentUrl
  const xLead = voice.xLead(
    isMultiRepo ? `${shortName} (${activeRepoCount} repos)` : shortName,
    enStatsCompact
  );
  const xSummaryBody =
    points.length > 1
      ? `• ${points[0]}\n• ${points[1]}`
      : points[0];
  const xContent = fitMicroPost({
    lead: xLead,
    body: xSummaryBody,
    tags: '#BuildInPublic #Devlog',
    maxLen: 280,
  });
  const xThreadTweets = [
    clampText(
      `1/4 ${xLead} ${points[0]} #BuildInPublic`,
      280
    ),
    clampText(
      `2/4 What shipped${isMultiRepo ? ` (${multiRepoNames.slice(0, 3).join(', ')})` : ''}: ${points
        .slice(0, 3)
        .map((p) => `• ${p}`)
        .join(' ')}`,
      280
    ),
    clampText(
      pitfalls.length > 0
        ? `3/4 Real snag & fix: ${pitfalls[0]}`
        : `3/4 Diff snapshot: ${enStatsLine}${multiRepoNoteEn}. Keeping changes focused and verifiable.`,
      280
    ),
    clampText(
      `4/4 Next up: ${nextSteps[0] || 'refining developer UX & shipping the next milestone'}. ${voice.outroTone} #Devlog #IndieHackers`,
      280
    ),
  ];
  const xThread = xThreadTweets.join('\n\n---\n\n');
  const xIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(xContent)}`;

  // 6. Reddit — authentic non-promotional English show-off Markdown post
  const redditSuggestedSubreddits = ['r/SideProject', 'r/indiehackers', 'r/programming'];
  const redditTitle = clampText(
    `${shortName} devlog (${dateIso}): ${points[0]}`,
    180
  );
  const redditProjectBreakdown = isMultiRepo
    ? [
        '',
        '### Breakdown by repository',
        ...context.projects.flatMap((proj) => [
          `- **${proj.shortName || proj.projectName}** (\`${proj.branch || 'main'}\` · ${proj.stats?.filesChanged || 0} files, +${proj.stats?.insertions || 0}/-${proj.stats?.deletions || 0})`,
          ...(proj.commits || []).slice(0, 3).map((c) => `  - ${c.subject}`),
        ]),
      ]
    : [];
  const redditBody = [
    voice.redditIntro(shortName, enStatsLine, multiRepoNoteEn),
    '',
    '### What shipped',
    ...points.map((p) => `- ${p}`),
    ...redditProjectBreakdown,
    ...(pitfalls.length > 0
      ? ['', '### What broke & lessons learned', ...pitfalls.map((p) => `- ${p}`)]
      : []),
    ...(nextSteps.length > 0
      ? ['', "### What's next", ...nextSteps.map((p) => `- ${p}`)]
      : []),
    '',
    voice.outroTone,
  ].join('\n');
  const redditSubmitUrl = `https://www.reddit.com/submit?type=TEXT&title=${encodeURIComponent(redditTitle)}&text=${encodeURIComponent(clampText(redditBody, 1200))}`;

  // 7. LinkedIn — crisp engineering reflection post
  const linkedinTitle = `${shortName} Engineering Devlog (${dateIso})`;
  const linkedinBody = [
    voice.linkedinOpening(shortName, enStatsLine, multiRepoNoteEn),
    '',
    'Key progress:',
    ...points.slice(0, 5).map((p) => `• ${p}`),
    ...(isMultiRepo
      ? [
          '',
          `Active repositories (${activeRepoCount}): ${multiRepoNames.join(', ')}`,
        ]
      : []),
    ...(pitfalls.length > 0
      ? ['', 'Engineering lesson:', ...pitfalls.slice(0, 2).map((p) => `→ ${p}`)]
      : []),
    ...(nextSteps.length > 0
      ? ['', 'Next milestone:', ...nextSteps.slice(0, 2).map((p) => `– ${p}`)]
      : []),
    '',
    voice.outroTone,
    '',
    '#BuildInPublic #SoftwareEngineering #Devlog #OpenSource',
  ].join('\n');

  // 8. Bluesky — concise English post strictly <= 300 chars + intentUrl
  const bskyLead = voice.bskyLead(
    isMultiRepo ? `${shortName} (${activeRepoCount} repos)` : shortName,
    enStatsCompact
  );
  const bskyBodyParts = [points[0]];
  if (pitfalls.length > 0) {
    bskyBodyParts.push(`Lesson: ${pitfalls[0]}`);
  } else if (points[1]) {
    bskyBodyParts.push(`+ ${points[1]}`);
  }
  const blueskyContent = fitMicroPost({
    lead: bskyLead,
    body: bskyBodyParts.join('\n'),
    tags: '#BuildInPublic #Devlog',
    maxLen: 300,
  });
  const blueskyIntentUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(blueskyContent)}`;

  // 9. Dev.to — complete English Markdown devlog with YAML frontmatter
  const devtoTags = ['buildinpublic', 'devlog', 'opensource', 'ai'];
  const devtoTitle = `${shortName} Devlog (${dateIso}): ${clampText(points[0], 72)}`;
  const devtoDescription = clampText(
    `${shortName} engineering update (${enStatsLine}): ${points.slice(0, 2).join('; ')}`,
    155
  );
  const devtoCommitsLines = isMultiRepo
    ? context.projects.flatMap((proj) =>
        (proj.commits || []).length > 0
          ? [
              `### ${proj.shortName || proj.projectName}`,
              ...proj.commits.map((c) => `- \`${c.sha}\` ${c.subject} (${c.date})`),
            ]
          : []
      )
    : (context.commits || []).map((c) => `- \`${c.sha}\` ${c.subject} (${c.date})`);

  const devtoBody = [
    '---',
    `title: "${escapeYamlString(devtoTitle)}"`,
    'published: false',
    `description: "${escapeYamlString(devtoDescription)}"`,
    `tags: [${devtoTags.join(', ')}]`,
    '---',
    '',
    `# ${devtoTitle}`,
    '',
    voice.devtoIntro(shortName, enStatsLine, multiRepoNoteEn),
    '',
    '## What Shipped',
    ...points.map((p) => `- ${p}`),
    ...(isMultiRepo
      ? [
          '',
          '### Repository Breakdown',
          ...context.projects.flatMap((proj) => [
            `#### ${proj.shortName || proj.projectName} (\`${proj.branch || 'main'}\` · ${proj.stats?.filesChanged || 0} files, +${proj.stats?.insertions || 0}/-${proj.stats?.deletions || 0})`,
            ...(proj.commits || []).map((c) => `- ${c.subject}`),
          ]),
        ]
      : []),
    ...(pitfalls.length > 0
      ? ['', '## Pitfalls & Lessons Learned', ...pitfalls.map((p) => `- ${p}`)]
      : []),
    ...(nextSteps.length > 0
      ? ['', "## What's Next", ...nextSteps.map((p) => `- [ ] ${p}`)]
      : []),
    ...(devtoCommitsLines.length > 0
      ? ['', '## Recent Commits', ...devtoCommitsLines]
      : []),
    '',
    '---',
    '',
    voice.outroTone,
  ].join('\n');

  return {
    meta: {
      title,
      dateStr,
      projectName: context.projectName,
      statsLine,
      edition: editionObj.id,
      editionName: editionObj.name,
      style: theme.id,
      styleName: theme.name,
      copyPrompt: theme.copyPrompt,
      ...(isMultiRepo
        ? {
            isMultiRepo: true,
            activeRepoCount: context.activeRepoCount ?? context.projects.length,
            scannedRepoCount: context.scannedRepoCount ?? context.projects.length,
          }
        : {}),
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
      x: {
        platform: 'x',
        label: 'X (Twitter)',
        title: `${shortName} (${dateIso})`,
        content: xContent,
        thread: xThread,
        intentUrl: xIntentUrl,
      },
      reddit: {
        platform: 'reddit',
        label: 'Reddit',
        title: redditTitle,
        content: redditBody,
        suggestedSubreddits: redditSuggestedSubreddits,
        submitUrl: redditSubmitUrl,
      },
      linkedin: {
        platform: 'linkedin',
        label: 'LinkedIn',
        title: linkedinTitle,
        content: linkedinBody,
      },
      bluesky: {
        platform: 'bluesky',
        label: 'Bluesky',
        title: `${shortName} (${dateIso})`,
        content: blueskyContent,
        intentUrl: blueskyIntentUrl,
      },
      devto: {
        platform: 'devto',
        label: 'Dev.to',
        title: devtoTitle,
        tags: devtoTags,
        content: devtoBody,
      },
    },
  };
}
