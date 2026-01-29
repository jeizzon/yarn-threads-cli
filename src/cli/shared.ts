/**
 * Centralized CLI context providing consistent access to output configuration,
 * credentials resolution, and various helpers.
 */

import type { Command } from 'commander';
import {
  type OutputConfig,
  resolveOutputConfig,
  getStatusPrefix,
  getLabelPrefix,
  colors,
  jsonOutput,
  formatNumber,
  formatDate,
  truncate,
  hyperlink,
} from '../lib/output.js';
import { loadConfig, type YarnConfig } from '../lib/config.js';
import {
  resolveCredentials,
  type CookieExtractionResult,
} from '../lib/cookies.js';
import type { PostData, UserData } from '../lib/threads-client-types.js';

export interface CredentialsOptions {
  sessionId?: string;
  csrfToken?: string;
  userId?: string;
  chromeProfile?: string;
  firefoxProfile?: string;
  cookieTimeout?: string | number;
}

export interface CliContext {
  isTty: boolean;
  getOutput: () => OutputConfig;

  // Color functions
  colors: typeof colors;

  // Status prefix (ok, warn, err, info, hint)
  p: (kind: 'ok' | 'warn' | 'err' | 'info' | 'hint') => string;

  // Label prefix (url, date, source, etc.)
  l: (
    kind:
      | 'url'
      | 'date'
      | 'source'
      | 'credentials'
      | 'user'
      | 'userId'
      | 'followers'
      | 'following'
      | 'posts'
      | 'bio'
  ) => string;

  // Configuration
  config: YarnConfig;

  // Apply output config from command
  applyOutputFromCommand: (command: Command) => void;

  // Resolve timeout from options
  resolveTimeoutFromOptions: (options: { timeout?: string | number }) => number | undefined;

  // Resolve credentials
  resolveCredentialsFromOptions: (opts: CredentialsOptions) => Promise<CookieExtractionResult>;

  // Output helpers
  json: (data: unknown) => void;
  formatNumber: (n: number) => string;
  formatDate: (dateStr: string) => string;
  truncate: (text: string, maxLen: number) => string;
  hyperlink: (url: string, text?: string) => string;

  // Post/User display helpers
  printPost: (post: PostData, opts?: { showRaw?: boolean }) => void;
  printPosts: (posts: PostData[], opts?: { showRaw?: boolean }) => void;
  printUser: (user: UserData, opts?: { showRaw?: boolean }) => void;
  printUsers: (users: UserData[], opts?: { showRaw?: boolean }) => void;

  // URL helpers
  extractPostCode: (postIdOrUrl: string) => string;
  getPostUrl: (code: string, username?: string) => string;
  getUserUrl: (username: string) => string;
}

/**
 * Create the CLI context from command line arguments.
 */
export function createCliContext(argv: string[]): CliContext {
  const isTty = process.stdout.isTTY ?? false;
  let outputConfig = resolveOutputConfig(argv, process.env, isTty);

  // Load config with warnings going to stderr
  const config = loadConfig((msg) => {
    console.error(`[warn] ${msg}`);
  });

  const ctx: CliContext = {
    isTty,

    getOutput: () => outputConfig,

    colors,

    p: (kind) => getStatusPrefix(kind, outputConfig),

    l: (kind) => getLabelPrefix(kind, outputConfig),

    config,

    applyOutputFromCommand: (command: Command) => {
      const opts = command.optsWithGlobals();
      outputConfig = resolveOutputConfig(
        [
          ...(opts.json ? ['--json'] : []),
          ...(opts.plain ? ['--plain'] : []),
          ...(opts.emoji === false ? ['--no-emoji'] : []),
          ...(opts.color === false ? ['--no-color'] : []),
        ],
        process.env,
        isTty
      );
    },

    resolveTimeoutFromOptions: (options) => {
      const timeout = options.timeout;
      if (timeout === undefined) {
        return config.timeoutMs;
      }
      const ms = typeof timeout === 'number' ? timeout : parseInt(timeout, 10);
      if (Number.isNaN(ms) || ms <= 0) {
        return undefined;
      }
      return ms;
    },

    resolveCredentialsFromOptions: async (opts) => {
      const cookieTimeoutMs =
        typeof opts.cookieTimeout === 'number'
          ? opts.cookieTimeout
          : typeof opts.cookieTimeout === 'string'
            ? parseInt(opts.cookieTimeout, 10)
            : config.cookieTimeoutMs;

      return resolveCredentials({
        sessionId: opts.sessionId,
        csrfToken: opts.csrfToken,
        userId: opts.userId,
        cookieSource: config.cookieSource,
        chromeProfile: opts.chromeProfile ?? config.chromeProfile,
        firefoxProfile: opts.firefoxProfile ?? config.firefoxProfile,
        cookieTimeoutMs,
      });
    },

    json: jsonOutput,
    formatNumber,
    formatDate,
    truncate,
    hyperlink: (url, text) => hyperlink(url, text, outputConfig),

    printPost: (post, opts) => {
      if (outputConfig.json) {
        console.log(JSON.stringify(opts?.showRaw ? post._raw : post, null, 2));
        return;
      }

      const output = ctx.getOutput();
      const postUrl = ctx.getPostUrl(post.code, post.author.username);

      // Author line
      const authorLine = output.color
        ? `${colors.username(post.author.fullName)} ${colors.handle(`@${post.author.username}`)}`
        : `${post.author.fullName} @${post.author.username}`;
      console.log(authorLine);

      // Date
      if (post.createdAt) {
        console.log(ctx.l('date') + formatDate(post.createdAt));
      }

      // Text content
      if (post.text) {
        console.log('');
        console.log(post.text);
      }

      // Media indicators
      if (post.media && post.media.length > 0) {
        console.log('');
        const mediaTypes = post.media.map((m) => m.type).join(', ');
        console.log(colors.muted(`[${post.media.length} ${mediaTypes}]`));
      }

      // Stats
      console.log('');
      const stats: string[] = [];
      if (post.likeCount !== undefined) {
        stats.push(`${formatNumber(post.likeCount)} likes`);
      }
      if (post.replyCount !== undefined) {
        stats.push(`${formatNumber(post.replyCount)} replies`);
      }
      if (post.repostCount !== undefined) {
        stats.push(`${formatNumber(post.repostCount)} reposts`);
      }
      if (stats.length > 0) {
        console.log(colors.muted(stats.join(' | ')));
      }

      // URL
      console.log(ctx.l('url') + ctx.hyperlink(postUrl));
      console.log('');
    },

    printPosts: (posts, opts) => {
      if (outputConfig.json) {
        console.log(
          JSON.stringify(
            opts?.showRaw ? posts.map((p) => p._raw) : posts,
            null,
            2
          )
        );
        return;
      }

      for (let i = 0; i < posts.length; i++) {
        ctx.printPost(posts[i], opts);
        if (i < posts.length - 1) {
          console.log(colors.muted('─'.repeat(40)));
          console.log('');
        }
      }
    },

    printUser: (user, opts) => {
      if (outputConfig.json) {
        console.log(JSON.stringify(opts?.showRaw ? user._raw : user, null, 2));
        return;
      }

      const output = ctx.getOutput();
      const userUrl = ctx.getUserUrl(user.username);

      // Name and handle
      const nameLine = output.color
        ? `${colors.username(user.fullName)} ${colors.handle(`@${user.username}`)}`
        : `${user.fullName} @${user.username}`;
      console.log(nameLine);

      // Verified badge
      if (user.isVerified) {
        console.log(output.emoji ? '\u2714\ufe0f Verified' : '[VERIFIED]');
      }

      // Bio
      if (user.bio) {
        console.log('');
        console.log(ctx.l('bio') + user.bio);
      }

      // Stats
      console.log('');
      const stats: string[] = [];
      if (user.followerCount !== undefined) {
        stats.push(`${formatNumber(user.followerCount)} followers`);
      }
      if (user.followingCount !== undefined) {
        stats.push(`${formatNumber(user.followingCount)} following`);
      }
      if (user.threadCount !== undefined) {
        stats.push(`${formatNumber(user.threadCount)} threads`);
      }
      if (stats.length > 0) {
        console.log(colors.muted(stats.join(' | ')));
      }

      // Private indicator
      if (user.isPrivate) {
        console.log(colors.muted('[Private account]'));
      }

      // URL
      console.log('');
      console.log(ctx.l('url') + ctx.hyperlink(userUrl, `@${user.username}`));
    },

    printUsers: (users, opts) => {
      if (outputConfig.json) {
        console.log(
          JSON.stringify(
            opts?.showRaw ? users.map((u) => u._raw) : users,
            null,
            2
          )
        );
        return;
      }

      for (let i = 0; i < users.length; i++) {
        ctx.printUser(users[i], opts);
        if (i < users.length - 1) {
          console.log('');
          console.log(colors.muted('─'.repeat(40)));
          console.log('');
        }
      }
    },

    extractPostCode: (postIdOrUrl: string): string => {
      // Check if it's a URL
      const urlPatterns = [
        /threads\.net\/@?[\w.]+\/post\/([A-Za-z0-9_-]+)/,
        /threads\.net\/t\/([A-Za-z0-9_-]+)/,
        /threads\.net\/post\/([A-Za-z0-9_-]+)/,
      ];

      for (const pattern of urlPatterns) {
        const match = postIdOrUrl.match(pattern);
        if (match?.[1]) {
          return match[1];
        }
      }

      // Assume it's a direct post code
      return postIdOrUrl;
    },

    getPostUrl: (code: string, username?: string): string => {
      if (username) {
        return `https://www.threads.net/@${username}/post/${code}`;
      }
      return `https://www.threads.net/t/${code}`;
    },

    getUserUrl: (username: string): string => {
      const cleanUsername = username.replace(/^@/, '');
      return `https://www.threads.net/@${cleanUsername}`;
    },
  };

  return ctx;
}
