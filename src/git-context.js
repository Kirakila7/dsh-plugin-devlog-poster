import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

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
