import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { maskSecretValue } from './config.js';

export const SUPPORTED_GLOBAL_PLATFORMS = [
  'devto',
  'bluesky',
  'x',
  'reddit',
  'linkedin',
];

const DEVTO_ARTICLES_URL = 'https://dev.to/api/articles';
const BSKY_CREATE_SESSION_URL = 'https://bsky.social/xrpc/com.atproto.server.createSession';
const BSKY_CREATE_RECORD_URL = 'https://bsky.social/xrpc/com.atproto.repo.createRecord';

function parseDevtoFrontmatter(markdown = '') {
  const text = String(markdown || '');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { meta: {}, body: text.trim() };
  }

  const meta = {};
  const lines = match[1].split(/\r?\n/);
  for (const line of lines) {
    const kv = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    const rawVal = kv[2].trim();
    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      meta[key] = rawVal
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else if (rawVal === 'true' || rawVal === 'false') {
      meta[key] = rawVal === 'true';
    } else {
      meta[key] = rawVal.replace(/^["']|["']$/g, '').replace(/\\"/g, '"');
    }
  }

  return {
    meta,
    body: text.slice(match[0].length).trim(),
  };
}

function loadPlatformData({ platform, formatted, bundleDir }) {
  if (formatted?.platforms?.[platform]) {
    return formatted.platforms[platform];
  }
  if (formatted && formatted.platform === platform && typeof formatted.content === 'string') {
    return formatted;
  }

  if (bundleDir) {
    const absDir = resolve(bundleDir);
    const manifestPath = join(absDir, 'bundle.json');
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (manifest?.formatted?.platforms?.[platform]) {
        return manifest.formatted.platforms[platform];
      }
    }
    const mdPath = join(absDir, `${platform}.md`);
    if (existsSync(mdPath)) {
      const content = readFileSync(mdPath, 'utf8').trim();
      return {
        platform,
        title: `${platform} devlog`,
        content,
      };
    }
    throw new Error(
      `Bundle manifest not found or missing "${platform}" platform data in "${absDir}".`
    );
  }

  throw new Error(
    `publishGlobalPlatform requires either \`formatted\` (with platforms.${platform}) or a valid \`bundleDir\`.`
  );
}

async function safeParseJson(res) {
  const text = typeof res.text === 'function' ? await res.text() : '';
  if (!text) {
    return typeof res.json === 'function' ? await res.json().catch(() => ({})) : {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function deriveBlueskyPostUrl(handle, uri) {
  if (!uri || typeof uri !== 'string') return null;
  const parts = uri.split('/');
  const rkey = parts[parts.length - 1];
  if (!rkey || !handle) return null;
  return `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${encodeURIComponent(rkey)}`;
}

/**
 * Publish or preview a devlog for overseas platforms:
 * - devto: Official Dev.to Articles API (defaults to published: false draft & dryRun: true)
 * - bluesky: Official ATProto createSession -> createRecord (plus zero-key intentUrl)
 * - x / reddit / linkedin: Zero-key web intent / ready-to-post copy helper (never crashes without API key)
 */
export async function publishGlobalPlatform({
  platform,
  formatted,
  bundleDir,
  apiKey,
  handle,
  appPassword,
  published = false,
  dryRun = true,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedPlatform = String(platform || '').trim().toLowerCase();
  if (!SUPPORTED_GLOBAL_PLATFORMS.includes(normalizedPlatform)) {
    throw new Error(
      `Unsupported global platform "${platform}". Supported: ${SUPPORTED_GLOBAL_PLATFORMS.join(', ')}`
    );
  }

  const data = loadPlatformData({
    platform: normalizedPlatform,
    formatted,
    bundleDir,
  });

  if (normalizedPlatform === 'devto') {
    const resolvedKey = apiKey || process.env.DEVTO_API_KEY || '';
    const parsed = parseDevtoFrontmatter(data.content || '');
    const title = data.title || parsed.meta.title || 'Devlog Update';
    const tags = Array.isArray(data.tags) && data.tags.length > 0
      ? data.tags
      : Array.isArray(parsed.meta.tags) && parsed.meta.tags.length > 0
        ? parsed.meta.tags
        : ['buildinpublic', 'devlog', 'opensource', 'ai'];
    const bodyMarkdown = parsed.body || String(data.content || '').trim();
    const isPublished = Boolean(published);

    const payload = {
      article: {
        title,
        published: isPublished,
        body_markdown: bodyMarkdown,
        tags: tags.slice(0, 4),
        ...(parsed.meta.description ? { description: parsed.meta.description } : {}),
      },
    };

    if (dryRun !== false) {
      return {
        ok: true,
        dryRun: true,
        platform: 'devto',
        mode: 'api',
        published: isPublished,
        hasCredentials: Boolean(resolvedKey),
        request: {
          url: DEVTO_ARTICLES_URL,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': resolvedKey ? maskSecretValue(resolvedKey) : '(missing DEVTO_API_KEY)',
          },
          body: payload,
        },
        instructions: resolvedKey
          ? `Dry-run preview ready (${isPublished ? 'published' : 'draft'}). Pass dryRun=false / --execute to post to Dev.to.`
          : 'Set DEVTO_API_KEY (or run `config set devtoApiKey <key>`) and pass --execute to create a Dev.to draft.',
      };
    }

    if (!resolvedKey) {
      throw new Error(
        'DEVTO_API_KEY is required when publishing to Dev.to with dryRun=false (pass apiKey, set DEVTO_API_KEY, or run config set devtoApiKey <key>).'
      );
    }

    const res = await fetchImpl(DEVTO_ARTICLES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': resolvedKey,
      },
      body: JSON.stringify(payload),
    });
    const resData = await safeParseJson(res);
    if (!res.ok) {
      throw new Error(
        `Dev.to publish failed (${res.status}): ${JSON.stringify(resData)}`
      );
    }

    return {
      ok: true,
      dryRun: false,
      platform: 'devto',
      mode: 'api',
      published: Boolean(resData?.published ?? isPublished),
      status: res.status,
      id: resData?.id ?? null,
      url: resData?.url || null,
      data: resData,
    };
  }

  if (normalizedPlatform === 'bluesky') {
    const resolvedHandle = handle || process.env.BLUESKY_HANDLE || '';
    const resolvedPassword = appPassword || process.env.BLUESKY_APP_PASSWORD || '';
    const text = String(data.content || '').trim();
    const intentUrl =
      data.intentUrl ||
      `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
    const createdAt = new Date().toISOString();

    if (dryRun !== false) {
      return {
        ok: true,
        dryRun: true,
        platform: 'bluesky',
        mode: 'atproto',
        hasCredentials: Boolean(resolvedHandle && resolvedPassword),
        intentUrl,
        content: text,
        charCount: [...text].length,
        requests: [
          {
            step: 'createSession',
            url: BSKY_CREATE_SESSION_URL,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: {
              identifier: resolvedHandle || '(missing BLUESKY_HANDLE)',
              password: resolvedPassword
                ? maskSecretValue(resolvedPassword)
                : '(missing BLUESKY_APP_PASSWORD)',
            },
          },
          {
            step: 'createRecord',
            url: BSKY_CREATE_RECORD_URL,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ***',
            },
            body: {
              repo: resolvedHandle || '<did>',
              collection: 'app.bsky.feed.post',
              record: {
                $type: 'app.bsky.feed.post',
                text,
                createdAt,
              },
            },
          },
        ],
        instructions:
          resolvedHandle && resolvedPassword
            ? 'Dry-run preview ready. Pass dryRun=false / --execute to publish via ATProto, or open intentUrl in your browser.'
            : 'Open intentUrl in your browser for zero-key posting, or set BLUESKY_HANDLE & BLUESKY_APP_PASSWORD and pass --execute.',
      };
    }

    if (!resolvedHandle || !resolvedPassword) {
      throw new Error(
        'BLUESKY_HANDLE and BLUESKY_APP_PASSWORD are required when publishing to Bluesky with dryRun=false (or open intentUrl in your browser for zero-key posting).'
      );
    }

    const sessionRes = await fetchImpl(BSKY_CREATE_SESSION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: resolvedHandle,
        password: resolvedPassword,
      }),
    });
    const sessionData = await safeParseJson(sessionRes);
    if (!sessionRes.ok || !sessionData?.accessJwt || !sessionData?.did) {
      throw new Error(
        `Bluesky createSession failed (${sessionRes.status}): ${JSON.stringify(sessionData)}`
      );
    }

    const recordPayload = {
      repo: sessionData.did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text,
        createdAt,
      },
    };

    const recordRes = await fetchImpl(BSKY_CREATE_RECORD_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.accessJwt}`,
      },
      body: JSON.stringify(recordPayload),
    });
    const recordData = await safeParseJson(recordRes);
    if (!recordRes.ok) {
      throw new Error(
        `Bluesky createRecord failed (${recordRes.status}): ${JSON.stringify(recordData)}`
      );
    }

    return {
      ok: true,
      dryRun: false,
      platform: 'bluesky',
      mode: 'atproto',
      status: recordRes.status,
      uri: recordData?.uri || null,
      cid: recordData?.cid || null,
      url: deriveBlueskyPostUrl(resolvedHandle, recordData?.uri),
      intentUrl,
      data: recordData,
    };
  }

  if (normalizedPlatform === 'x') {
    const content = String(data.content || '').trim();
    const intentUrl =
      data.intentUrl ||
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(content)}`;
    return {
      ok: true,
      dryRun: Boolean(dryRun),
      platform: 'x',
      mode: 'web_intent',
      intentUrl,
      content,
      thread: data.thread || '',
      charCount: [...content].length,
      instructions:
        'Zero-key publishing ready: open intentUrl in your browser to post the prefilled tweet, or paste the thread tweets one by one.',
    };
  }

  if (normalizedPlatform === 'reddit') {
    const title = String(data.title || 'Devlog Update').trim();
    const content = String(data.content || '').trim();
    const suggestedSubreddits =
      Array.isArray(data.suggestedSubreddits) && data.suggestedSubreddits.length > 0
        ? data.suggestedSubreddits
        : ['r/SideProject', 'r/indiehackers', 'r/programming'];
    const submitUrl =
      data.submitUrl ||
      `https://www.reddit.com/submit?type=TEXT&title=${encodeURIComponent(title)}`;
    return {
      ok: true,
      dryRun: Boolean(dryRun),
      platform: 'reddit',
      mode: 'web_intent',
      submitUrl,
      intentUrl: submitUrl,
      title,
      content,
      suggestedSubreddits,
      instructions: `Zero-key publishing ready: open submitUrl to compose your Reddit post, pick a community (${suggestedSubreddits.join(', ')}), and paste the Markdown body if needed.`,
    };
  }

  // linkedin
  const title = String(data.title || 'Engineering Devlog').trim();
  const content = String(data.content || '').trim();
  const intentUrl = 'https://www.linkedin.com/feed/?shareActive=true';
  return {
    ok: true,
    dryRun: Boolean(dryRun),
    platform: 'linkedin',
    mode: 'web_intent',
    intentUrl,
    title,
    content,
    charCount: [...content].length,
    instructions:
      'Zero-key publishing ready: copy the LinkedIn post content and open intentUrl (LinkedIn composer) to paste and share.',
  };
}
