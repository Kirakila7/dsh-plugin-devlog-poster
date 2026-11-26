function formatDateCN(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function pickItems(context) {
  if (context.highlights?.length > 0) return context.highlights;
  if (context.commits?.length > 0) return context.commits.slice(0, 8).map((c) => c.subject);
  return ['推进当前模块开发与联调验证'];
}

/**
 * Generate structured daily or weekly work reports in both QQ plain-text and Markdown formats.
 */
export function formatWorkReport(context, { period = 'daily', title } = {}) {
  const isWeekly = period === 'weekly';
  const periodLabel = isWeekly ? '周报' : '日报';
  const doneLabel = isWeekly ? '本周完成' : '今日完成';
  const nextLabel = isWeekly ? '下周计划' : '明日计划';
  const dateStr = formatDateCN(context.collectedAt);
  const shortName = context.projectName.split('/').pop() || context.projectName;

  const items = pickItems(context);
  const pitfalls = context.pitfalls || [];
  const nextSteps = context.nextSteps || [];
  const { filesChanged = 0, insertions = 0, deletions = 0 } = context.stats || {};
  const statsSummary =
    filesChanged > 0
      ? `改动 ${filesChanged} 个文件（+${insertions} / -${deletions} 行）`
      : `共完成 ${items.length} 项工作`;

  const reportTitle = title || `【工作${periodLabel} ${dateStr}】${shortName}`;

  // Clean plain text tailored for QQ group/private chat (no raw markdown symbols)
  const qqText = [
    reportTitle,
    `项目：${context.projectName}（分支 ${context.branch || 'main'}）`,
    `概览：${statsSummary}`,
    '',
    `一、${doneLabel}`,
    ...items.map((item, idx) => `${idx + 1}. ${item}`),
    ...(pitfalls.length > 0
      ? ['', '二、风险与卡点', ...pitfalls.map((p, idx) => `${idx + 1}. ${p}`)]
      : []),
    ...(nextSteps.length > 0
      ? [
          '',
          `${pitfalls.length > 0 ? '三' : '二'}、${nextLabel}`,
          ...nextSteps.map((n, idx) => `${idx + 1}. ${n}`),
        ]
      : []),
  ].join('\n');

  // Markdown version for Feishu / DingTalk / WeCom / Slack / Discord / Docs
  const markdown = [
    `### ${reportTitle}`,
    `- **项目**：\`${context.projectName}\` (\`${context.branch || 'main'}\`)`,
    `- **产出概览**：${statsSummary}`,
    '',
    `#### ${doneLabel}`,
    ...items.map((item) => `- ${item}`),
    ...(pitfalls.length > 0
      ? ['', '#### 风险与卡点', ...pitfalls.map((p) => `- ${p}`)]
      : []),
    ...(nextSteps.length > 0
      ? ['', `#### ${nextLabel}`, ...nextSteps.map((n) => `- [ ] ${n}`)]
      : []),
  ].join('\n');

  return {
    period: isWeekly ? 'weekly' : 'daily',
    dateStr,
    title: reportTitle,
    statsSummary,
    qqText,
    markdown,
  };
}

export const SUPPORTED_REPORT_CHANNELS = [
  'qq_onebot',
  'feishu',
  'dingtalk',
  'wecom',
  'slack',
  'discord',
];

/**
 * Build channel-specific HTTP request payload.
 */
export function buildReportWebhookRequest({
  channel = 'qq_onebot',
  endpoint,
  token,
  groupId,
  userId,
  report,
}) {
  if (!SUPPORTED_REPORT_CHANNELS.includes(channel)) {
    throw new Error(
      `Unsupported channel "${channel}". Supported: ${SUPPORTED_REPORT_CHANNELS.join(', ')}`
    );
  }
  if (!report) {
    throw new Error('Missing report object.');
  }

  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (channel === 'qq_onebot') {
    const base = (endpoint || 'http://127.0.0.1:3000').replace(/\/+$/, '');
    const isPrivate = !groupId && Boolean(userId);
    const url = isPrivate ? `${base}/send_private_msg` : `${base}/send_group_msg`;
    const body = isPrivate
      ? { user_id: Number(userId) || userId, message: report.qqText }
      : { group_id: Number(groupId) || groupId || 0, message: report.qqText };
    return { channel, url, method: 'POST', headers, body };
  }

  const url = endpoint || '';
  if (channel === 'feishu') {
    return {
      channel,
      url,
      method: 'POST',
      headers,
      body: {
        msg_type: 'text',
        content: { text: report.qqText },
      },
    };
  }

  if (channel === 'dingtalk') {
    return {
      channel,
      url,
      method: 'POST',
      headers,
      body: {
        msgtype: 'markdown',
        markdown: { title: report.title, text: report.markdown },
      },
    };
  }

  if (channel === 'wecom') {
    return {
      channel,
      url,
      method: 'POST',
      headers,
      body: {
        msgtype: 'markdown',
        markdown: { content: report.markdown },
      },
    };
  }

  if (channel === 'slack') {
    return {
      channel,
      url,
      method: 'POST',
      headers,
      body: { text: report.qqText },
    };
  }

  // discord
  return {
    channel,
    url,
    method: 'POST',
    headers,
    body: { content: report.markdown.slice(0, 1950) },
  };
}

/**
 * Send a daily/weekly work report via QQ OneBot v11 or team Webhook.
 * Defaults to dryRun=true to prevent accidental sends.
 */
export async function sendWorkReport({
  channel = 'qq_onebot',
  endpoint,
  token,
  groupId,
  userId,
  report,
  dryRun = true,
  fetchImpl = globalThis.fetch,
} = {}) {
  const req = buildReportWebhookRequest({
    channel,
    endpoint,
    token,
    groupId,
    userId,
    report,
  });

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      channel,
      url: req.url,
      body: req.body,
    };
  }

  if (!req.url) {
    throw new Error(`Endpoint URL is required when sending to "${channel}".`);
  }
  if (channel === 'qq_onebot' && !groupId && !userId) {
    throw new Error('qq_onebot requires either `groupId` or `userId` when dryRun=false.');
  }

  const res = await fetchImpl(req.url, {
    method: req.method,
    headers: req.headers,
    body: JSON.stringify(req.body),
  });
  const responseText = await res.text();

  return {
    ok: res.ok,
    dryRun: false,
    channel,
    status: res.status,
    url: req.url,
    response: responseText.slice(0, 500),
  };
}
