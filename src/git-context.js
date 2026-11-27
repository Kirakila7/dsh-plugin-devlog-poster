import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const IGNORED_SCAN_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'build',
  '.next',
  '.cache',
  'vendor',
  '.venv',
  '__pycache__',
]);

const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

function expandHome(rawPath) {
  if (rawPath === '~') return homedir();
  if (rawPath.startsWith('~/')) return join(homedir(), rawPath.slice(2));
  return rawPath;
}

/**
 * Normalize a comma-separated string or array of paths into resolved absolute paths.
 */
export function normalizePathList(input) {
  if (!input) return [];
  const rawItems = Array.isArray(input) ? input : [input];
  const out = [];
  for (const item of rawItems) {
    if (typeof item !== 'string') continue;
    for (const part of item.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      out.push(resolve(expandHome(trimmed)));
    }
  }
  return out;
}

function hasGitMarker(dirPath) {
  try {
    const st = statSync(join(dirPath, '.git'));
    return st.isDirectory() || st.isFile();
  } catch {
    return false;
  }
}

function canonicalPathKey(targetPath) {
  try {
    return realpathSync(targetPath);
  } catch {
    return resolve(targetPath);
  }
}

function runGit(repoPath, args) {
  try {
    return execFileSync('git', ['-C', repoPath, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function parseShortstat(statText) {
  const filesMatch = statText.match(/(\d+)\s+files?\s+changed/);
  const insMatch = statText.match(/(\d+)\s+insertions?\(\+\)/);
  const delMatch = statText.match(/(\d+)\s+deletions?\(-\)/);
  return {
    filesChanged: filesMatch ? Number(filesMatch[1]) : 0,
    insertions: insMatch ? Number(insMatch[1]) : 0,
    deletions: delMatch ? Number(delMatch[1]) : 0,
  };
}

function normalizeRepoName(remoteUrl, repoPath) {
  if (remoteUrl) {
    const cleaned = remoteUrl.replace(/\.git$/, '');
    const match = cleaned.match(/[:/]([^/:]+\/[^/:]+)$/);
    if (match) return match[1];
  }
  return basename(repoPath);
}

/**
 * Collect git commit history and diff stats from a local repository.
 */
export function collectGitContext({
  repoPath = process.cwd(),
  since = '24 hours ago',
  maxCommits = 10,
  projectName,
  highlights = [],
  pitfalls = [],
  nextSteps = [],
} = {}) {
  const isGitRepo = runGit(repoPath, ['rev-parse', '--is-inside-work-tree']) === 'true';

  if (!isGitRepo) {
    return {
      isGitRepo: false,
      repoPath,
      projectName: projectName || basename(repoPath),
      branch: 'local',
      since,
      commits: [],
      stats: { filesChanged: 0, insertions: 0, deletions: 0 },
      changedFiles: [],
      highlights: Array.isArray(highlights) ? highlights : [],
      pitfalls: Array.isArray(pitfalls) ? pitfalls : [],
      nextSteps: Array.isArray(nextSteps) ? nextSteps : [],
      collectedAt: new Date().toISOString(),
    };
  }

  const branch = runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'main';
  const remoteUrl = runGit(repoPath, ['remote', 'get-url', 'origin']);
  const detectedName = normalizeRepoName(remoteUrl, repoPath);

  const logFormat = '%h%x1f%ad%x1f%an%x1f%s';
  let rawLog = runGit(repoPath, [
    'log',
    `--since=${since}`,
    `-n`,
    String(maxCommits),
    '--date=short',
    `--pretty=format:${logFormat}`,
  ]);

  // Fallback to latest commits if the time window is empty.
  if (!rawLog) {
    rawLog = runGit(repoPath, [
      'log',
      '-n',
      String(Math.min(maxCommits, 5)),
      '--date=short',
      `--pretty=format:${logFormat}`,
    ]);
  }

  const commits = rawLog
    ? rawLog.split('\n').map((line) => {
        const [sha, date, author, subject] = line.split('\x1f');
        return { sha, date, author, subject };
      })
    : [];

  let stats = { filesChanged: 0, insertions: 0, deletions: 0 };
  let changedFiles = [];

  if (commits.length > 0) {
    const oldest = commits[commits.length - 1].sha;
    const parentExists = runGit(repoPath, ['rev-parse', '--verify', `${oldest}^`]);
    const range = parentExists ? `${oldest}^..HEAD` : oldest;

    const shortstat = runGit(repoPath, ['diff', '--shortstat', range]);
    stats = parseShortstat(shortstat);

    const filesRaw = runGit(repoPath, ['diff', '--name-only', range]);
    changedFiles = filesRaw ? filesRaw.split('\n').filter(Boolean).slice(0, 20) : [];
  }

  return {
    isGitRepo: true,
    repoPath,
    projectName: projectName || detectedName,
    branch,
    since,
    commits,
    stats,
    changedFiles,
    highlights: Array.isArray(highlights) ? highlights : [],
    pitfalls: Array.isArray(pitfalls) ? pitfalls : [],
    nextSteps: Array.isArray(nextSteps) ? nextSteps : [],
    collectedAt: new Date().toISOString(),
  };
}

/**
 * Discover local git repositories from explicit repo paths and/or parent scan directories.
 * Supports both standard `.git` directories and `.git` worktree pointer files.
 */
export function discoverGitRepos({ scanDirs = [], repos = [], maxDepth = 2 } = {}) {
  const depthLimit = Math.max(
    0,
    Number.isFinite(Number(maxDepth)) ? Math.floor(Number(maxDepth)) : 2
  );
  const seen = new Set();
  const discovered = [];

  function addRepo(candidatePath) {
    const resolved = resolve(candidatePath);
    const key = canonicalPathKey(resolved);
    if (seen.has(key)) return;
    seen.add(key);
    discovered.push(resolved);
  }

  for (const explicitRepo of normalizePathList(repos)) {
    try {
      if (!existsSync(explicitRepo) || !statSync(explicitRepo).isDirectory()) continue;
    } catch {
      continue;
    }
    if (
      hasGitMarker(explicitRepo) ||
      runGit(explicitRepo, ['rev-parse', '--is-inside-work-tree']) === 'true'
    ) {
      addRepo(explicitRepo);
    }
  }

  function walk(dirPath, depth) {
    try {
      if (!statSync(dirPath).isDirectory()) return;
    } catch {
      return;
    }

    if (hasGitMarker(dirPath)) {
      addRepo(dirPath);
      return;
    }

    if (depth >= depthLimit) return;

    let entries;
    try {
      entries = readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (IGNORED_SCAN_DIRS.has(entry.name)) continue;
      walk(join(dirPath, entry.name), depth + 1);
    }
  }

  for (const rootDir of normalizePathList(scanDirs)) {
    walk(rootDir, 0);
  }

  return discovered;
}

/**
 * Collect and aggregate git commits and diff stats strictly within `--since` across multiple repositories.
 * Only repositories with commits in the requested time window are included as active projects.
 */
export function collectMultiRepoContext({
  scanDirs = [],
  repos = [],
  since = '24 hours ago',
  maxCommitsPerRepo = 6,
  maxDepth = 2,
  projectName,
  highlights = [],
  pitfalls = [],
  nextSteps = [],
} = {}) {
  const discoveredRepos = discoverGitRepos({ scanDirs, repos, maxDepth });
  const perRepoLimit = Math.max(1, Number(maxCommitsPerRepo) || 6);
  const logFormat = '%h%x1f%ad%x1f%an%x1f%s%x1f%ct';

  const activeProjectsWithTs = [];

  for (const repoPath of discoveredRepos) {
    const isWorkTree = runGit(repoPath, ['rev-parse', '--is-inside-work-tree']) === 'true';
    if (!isWorkTree) continue;

    // Strictly filter by --since (no fallback to stale commits outside the window)
    const rawLog = runGit(repoPath, [
      'log',
      `--since=${since}`,
      '-n',
      String(perRepoLimit),
      '--date=short',
      `--pretty=format:${logFormat}`,
    ]);
    if (!rawLog) continue;

    const parsedCommits = rawLog
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, date, author, subject, tsRaw] = line.split('\x1f');
        return { sha, date, author, subject, _ts: Number(tsRaw) || 0 };
      });
    if (parsedCommits.length === 0) continue;

    const branch = runGit(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'main';
    const remoteUrl = runGit(repoPath, ['remote', 'get-url', 'origin']);
    const detectedName = normalizeRepoName(remoteUrl, repoPath);
    const shortName = detectedName.includes('/')
      ? detectedName.split('/').pop() || basename(repoPath)
      : detectedName || basename(repoPath);

    const oldest = parsedCommits[parsedCommits.length - 1].sha;
    const parentExists = Boolean(runGit(repoPath, ['rev-parse', '--verify', `${oldest}^`]));
    const range = parentExists ? `${oldest}^..HEAD` : `${EMPTY_TREE_SHA}..HEAD`;

    const shortstat = runGit(repoPath, ['diff', '--shortstat', range]);
    const stats = parseShortstat(shortstat);

    const filesRaw = runGit(repoPath, ['diff', '--name-only', range]);
    const changedFiles = filesRaw ? filesRaw.split('\n').filter(Boolean).slice(0, 20) : [];

    const latestTs = parsedCommits[0]?._ts || 0;
    const repoCommits = parsedCommits.map(({ _ts, ...c }) => ({
      ...c,
      project: shortName,
    }));

    activeProjectsWithTs.push({
      projectName: detectedName,
      shortName,
      repoPath,
      branch,
      commits: repoCommits,
      stats,
      changedFiles,
      _latestTs: latestTs,
    });
  }

  activeProjectsWithTs.sort(
    (a, b) => b._latestTs - a._latestTs || a.shortName.localeCompare(b.shortName)
  );

  const projects = activeProjectsWithTs.map(({ _latestTs, ...proj }) => proj);

  const stats = projects.reduce(
    (acc, proj) => {
      acc.filesChanged += proj.stats.filesChanged || 0;
      acc.insertions += proj.stats.insertions || 0;
      acc.deletions += proj.stats.deletions || 0;
      return acc;
    },
    { filesChanged: 0, insertions: 0, deletions: 0 }
  );

  const commits = [];
  const changedFiles = [];
  for (const proj of projects) {
    for (const c of proj.commits) {
      commits.push({
        ...c,
        project: proj.shortName,
        projectName: proj.projectName,
        displaySubject: `[${proj.shortName}] ${c.subject}`,
      });
    }
    for (const file of proj.changedFiles) {
      if (changedFiles.length < 30) {
        changedFiles.push(`${proj.shortName}/${file}`);
      }
    }
  }

  const normalizedScanDirs = normalizePathList(scanDirs);
  const resolvedProjectName =
    projectName ||
    (projects.length > 0
      ? `多项目开发汇总 (${projects.length} 个仓库)`
      : '多项目开发汇总 (0 个活跃仓库)');

  return {
    isMultiRepo: true,
    isGitRepo: projects.length > 0,
    repoPath: projects[0]?.repoPath || discoveredRepos[0] || normalizedScanDirs[0] || process.cwd(),
    scannedRepoCount: discoveredRepos.length,
    activeRepoCount: projects.length,
    projects,
    projectName: resolvedProjectName,
    branch: 'multi',
    since,
    commits,
    stats,
    changedFiles,
    highlights: Array.isArray(highlights) ? highlights : [],
    pitfalls: Array.isArray(pitfalls) ? pitfalls : [],
    nextSteps: Array.isArray(nextSteps) ? nextSteps : [],
    collectedAt: new Date().toISOString(),
  };
}
