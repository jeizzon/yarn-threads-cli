/**
 * Read commands - read a post, get replies, get full thread.
 */

import type { Command } from 'commander';
import type { CliContext, CredentialsOptions } from '../cli/shared.js';
import { ThreadsClient } from '../lib/threads-client.js';
import type { PostData } from '../lib/threads-client-types.js';

interface ReadCmdOpts {
  jsonFull?: boolean;
  cursor?: string;
  maxPages?: string;
  all?: boolean;
}

export function registerReadCommands(program: Command, ctx: CliContext): void {
  // read command
  program
    .command('read')
    .description('Fetch a single thread/post')
    .argument('<url-or-code>', 'Threads post URL or short code')
    .option('--json-full', 'Include raw API response in JSON output')
    .action(async (urlOrCode: string, cmdOpts: ReadCmdOpts) => {
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

      // Extract post code from URL
      const postCode = ctx.extractPostCode(urlOrCode);

      // Create client and fetch
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts as { timeout?: string | number });
      const client = new ThreadsClient({ cookies, timeoutMs });

      const result = await client.getPost(postCode);

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      // Output
      if (output.json) {
        ctx.json(cmdOpts.jsonFull ? result.post._raw : result.post);
        return;
      }

      ctx.printPost(result.post, { showRaw: cmdOpts.jsonFull });
    });

  // replies command
  program
    .command('replies')
    .description('Get replies to a thread/post')
    .argument('<url-or-code>', 'Threads post URL or short code')
    .option('--json-full', 'Include raw API response in JSON output')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--max-pages <n>', 'Maximum number of pages to fetch')
    .option('--all', 'Fetch all pages')
    .action(async (urlOrCode: string, cmdOpts: ReadCmdOpts) => {
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

      // Extract post code from URL
      const postCode = ctx.extractPostCode(urlOrCode);

      // Create client and fetch
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts as { timeout?: string | number });
      const client = new ThreadsClient({ cookies, timeoutMs });

      // Pagination handling
      const maxPages = cmdOpts.maxPages ? parseInt(cmdOpts.maxPages, 10) : cmdOpts.all ? 100 : 1;
      let cursor = cmdOpts.cursor;
      const allPosts: PostData[] = [];
      let pageCount = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = await client.getReplies(postCode, cursor);

        if (!result.success) {
          console.error(`${ctx.p('err')}${result.error}`);
          if (allPosts.length === 0) {
            process.exit(1);
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

      // Output
      if (output.json) {
        ctx.json(cmdOpts.jsonFull ? allPosts.map((p) => p._raw) : allPosts);
        return;
      }

      if (allPosts.length === 0) {
        console.log(ctx.colors.muted('No replies found.'));
        return;
      }

      console.log(ctx.colors.section(`Replies (${allPosts.length}):`));
      console.log('');
      ctx.printPosts(allPosts, { showRaw: cmdOpts.jsonFull });
    });

  // thread command - get original post + replies
  program
    .command('thread')
    .description('Get full thread (post + replies)')
    .argument('<url-or-code>', 'Threads post URL or short code')
    .option('--json-full', 'Include raw API response in JSON output')
    .option('--cursor <cursor>', 'Pagination cursor for replies')
    .option('--max-pages <n>', 'Maximum number of reply pages to fetch')
    .option('--all', 'Fetch all reply pages')
    .action(async (urlOrCode: string, cmdOpts: ReadCmdOpts) => {
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

      // Extract post code from URL
      const postCode = ctx.extractPostCode(urlOrCode);

      // Create client
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts as { timeout?: string | number });
      const client = new ThreadsClient({ cookies, timeoutMs });

      // Fetch original post
      const postResult = await client.getPost(postCode);

      if (!postResult.success) {
        console.error(`${ctx.p('err')}${postResult.error}`);
        process.exit(1);
      }

      // Fetch replies
      const maxPages = cmdOpts.maxPages ? parseInt(cmdOpts.maxPages, 10) : cmdOpts.all ? 100 : 1;
      let cursor = cmdOpts.cursor;
      const allReplies: PostData[] = [];
      let pageCount = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const repliesResult = await client.getReplies(postCode, cursor);

        if (!repliesResult.success) {
          console.error(`${ctx.p('warn')}Failed to fetch some replies: ${repliesResult.error}`);
          break;
        }

        allReplies.push(...repliesResult.posts);
        pageCount++;

        if (!repliesResult.nextCursor || pageCount >= maxPages) {
          break;
        }

        cursor = repliesResult.nextCursor;
      }

      // Output
      if (output.json) {
        const data = {
          post: cmdOpts.jsonFull ? postResult.post._raw : postResult.post,
          replies: cmdOpts.jsonFull ? allReplies.map((p) => p._raw) : allReplies,
        };
        ctx.json(data);
        return;
      }

      console.log(ctx.colors.section('Original Post:'));
      console.log('');
      ctx.printPost(postResult.post);

      if (allReplies.length > 0) {
        console.log(ctx.colors.section(`Replies (${allReplies.length}):`));
        console.log('');
        ctx.printPosts(allReplies);
      } else {
        console.log(ctx.colors.muted('No replies.'));
      }
    });
}
