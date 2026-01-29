/**
 * Feed commands - home feed, likes, saved/bookmarks.
 */

import type { Command } from 'commander';
import type { CliContext, CredentialsOptions } from '../cli/shared.js';
import { ThreadsClient } from '../lib/threads-client.js';
import type { PostData } from '../lib/threads-client-types.js';

interface FeedCmdOpts {
  jsonFull?: boolean;
  cursor?: string;
  maxPages?: string;
  all?: boolean;
}

async function fetchPaginatedFeed(
  client: ThreadsClient,
  fetchFn: (cursor?: string) => ReturnType<typeof client.getHomeFeed>,
  opts: FeedCmdOpts,
  ctx: CliContext
): Promise<{ posts: PostData[]; success: boolean }> {
  const maxPages = opts.maxPages ? parseInt(opts.maxPages, 10) : opts.all ? 100 : 1;
  let cursor = opts.cursor;
  const allPosts: PostData[] = [];
  let pageCount = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await fetchFn(cursor);

    if (!result.success) {
      console.error(`${ctx.p('err')}${result.error}`);
      if (allPosts.length === 0) {
        return { posts: [], success: false };
      }
      break;
    }

    allPosts.push(...result.posts);
    pageCount++;

    if (!result.nextCursor || pageCount >= maxPages) {
      break;
    }

    cursor = result.nextCursor;
  }

  return { posts: allPosts, success: true };
}

export function registerFeedCommands(program: Command, ctx: CliContext): void {
  // home command
  program
    .command('home')
    .description('Get your home feed')
    .option('--json-full', 'Include raw API response in JSON output')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--max-pages <n>', 'Maximum number of pages to fetch')
    .option('--all', 'Fetch all pages')
    .action(async (cmdOpts: FeedCmdOpts) => {
      const opts = program.opts() as CredentialsOptions;
      const output = ctx.getOutput();

      // Resolve credentials
      const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(opts);
      for (const warning of warnings) {
        console.error(`${ctx.p('warn')}${warning}`);
      }

      if (!cookies.sessionId || !cookies.csrfToken) {
        console.error(`${ctx.p('err')}Missing required credentials`);
        process.exit(1);
      }

      if (cookies.source) {
        console.error(`${ctx.l('source')}${cookies.source}`);
      }

      // Create client
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts as { timeout?: string | number });
      const client = new ThreadsClient({ cookies, timeoutMs });

      // Fetch feed
      const { posts, success } = await fetchPaginatedFeed(
        client,
        (cursor) => client.getHomeFeed(cursor),
        cmdOpts,
        ctx
      );

      if (!success && posts.length === 0) {
        process.exit(1);
      }

      // Output
      if (output.json) {
        ctx.json(cmdOpts.jsonFull ? posts.map((p) => p._raw) : posts);
        return;
      }

      if (posts.length === 0) {
        console.log(ctx.colors.muted('No posts in feed.'));
        return;
      }

      console.log(ctx.colors.section(`Home Feed (${posts.length} posts):`));
      console.log('');
      ctx.printPosts(posts, { showRaw: cmdOpts.jsonFull });
    });

  // likes command
  program
    .command('likes')
    .description('Get your liked posts')
    .option('--json-full', 'Include raw API response in JSON output')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--max-pages <n>', 'Maximum number of pages to fetch')
    .option('--all', 'Fetch all pages')
    .action(async (cmdOpts: FeedCmdOpts) => {
      const opts = program.opts() as CredentialsOptions;
      const output = ctx.getOutput();

      // Resolve credentials
      const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(opts);
      for (const warning of warnings) {
        console.error(`${ctx.p('warn')}${warning}`);
      }

      if (!cookies.sessionId || !cookies.csrfToken) {
        console.error(`${ctx.p('err')}Missing required credentials`);
        process.exit(1);
      }

      if (cookies.source) {
        console.error(`${ctx.l('source')}${cookies.source}`);
      }

      // Create client
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts as { timeout?: string | number });
      const client = new ThreadsClient({ cookies, timeoutMs });

      // Fetch liked posts
      const { posts, success } = await fetchPaginatedFeed(
        client,
        (cursor) => client.getLikedPosts(cursor),
        cmdOpts,
        ctx
      );

      if (!success && posts.length === 0) {
        process.exit(1);
      }

      // Output
      if (output.json) {
        ctx.json(cmdOpts.jsonFull ? posts.map((p) => p._raw) : posts);
        return;
      }

      if (posts.length === 0) {
        console.log(ctx.colors.muted('No liked posts.'));
        return;
      }

      console.log(ctx.colors.section(`Liked Posts (${posts.length}):`));
      console.log('');
      ctx.printPosts(posts, { showRaw: cmdOpts.jsonFull });
    });

  // saved command
  program
    .command('saved')
    .description('Get your saved/bookmarked posts')
    .option('--json-full', 'Include raw API response in JSON output')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--max-pages <n>', 'Maximum number of pages to fetch')
    .option('--all', 'Fetch all pages')
    .action(async (cmdOpts: FeedCmdOpts) => {
      const opts = program.opts() as CredentialsOptions;
      const output = ctx.getOutput();

      // Resolve credentials
      const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(opts);
      for (const warning of warnings) {
        console.error(`${ctx.p('warn')}${warning}`);
      }

      if (!cookies.sessionId || !cookies.csrfToken) {
        console.error(`${ctx.p('err')}Missing required credentials`);
        process.exit(1);
      }

      if (cookies.source) {
        console.error(`${ctx.l('source')}${cookies.source}`);
      }

      // Create client
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts as { timeout?: string | number });
      const client = new ThreadsClient({ cookies, timeoutMs });

      // Fetch saved posts
      const { posts, success } = await fetchPaginatedFeed(
        client,
        (cursor) => client.getSavedPosts(cursor),
        cmdOpts,
        ctx
      );

      if (!success && posts.length === 0) {
        process.exit(1);
      }

      // Output
      if (output.json) {
        ctx.json(cmdOpts.jsonFull ? posts.map((p) => p._raw) : posts);
        return;
      }

      if (posts.length === 0) {
        console.log(ctx.colors.muted('No saved posts.'));
        return;
      }

      console.log(ctx.colors.section(`Saved Posts (${posts.length}):`));
      console.log('');
      ctx.printPosts(posts, { showRaw: cmdOpts.jsonFull });
    });
}
