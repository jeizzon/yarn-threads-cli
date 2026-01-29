/**
 * User commands - about, user-posts, following, followers.
 */

import type { Command } from 'commander';
import type { CliContext, CredentialsOptions } from '../cli/shared.js';
import { ThreadsClient } from '../lib/threads-client.js';
import type { PostData, UserData } from '../lib/threads-client-types.js';

interface UserCmdOpts {
  jsonFull?: boolean;
  cursor?: string;
  maxPages?: string;
  all?: boolean;
}

export function registerUserCommands(program: Command, ctx: CliContext): void {
  // about command
  program
    .command('about')
    .description('Get user profile information')
    .argument('<handle>', 'Username or @handle')
    .option('--json-full', 'Include raw API response in JSON output')
    .action(async (handle: string, cmdOpts: UserCmdOpts) => {
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

      // Fetch user
      const result = await client.getUserByUsername(handle);

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      // Output
      if (output.json) {
        ctx.json(cmdOpts.jsonFull ? result.user._raw : result.user);
        return;
      }

      ctx.printUser(result.user, { showRaw: cmdOpts.jsonFull });
    });

  // user-posts command
  program
    .command('user-posts')
    .description("Get a user's posts/threads")
    .argument('<handle>', 'Username or @handle')
    .option('--json-full', 'Include raw API response in JSON output')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--max-pages <n>', 'Maximum number of pages to fetch')
    .option('--all', 'Fetch all pages')
    .action(async (handle: string, cmdOpts: UserCmdOpts) => {
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

      // Fetch posts with pagination
      const maxPages = cmdOpts.maxPages ? parseInt(cmdOpts.maxPages, 10) : cmdOpts.all ? 100 : 1;
      let cursor = cmdOpts.cursor;
      const allPosts: PostData[] = [];
      let pageCount = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = await client.getUserPosts(handle, cursor);

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
        console.log(ctx.colors.muted('No posts found.'));
        return;
      }

      console.log(ctx.colors.section(`Posts by @${handle.replace(/^@/, '')} (${allPosts.length}):`));
      console.log('');
      ctx.printPosts(allPosts, { showRaw: cmdOpts.jsonFull });
    });

  // following command
  program
    .command('following')
    .description("Get a user's following list")
    .argument('<handle>', 'Username or @handle')
    .option('--json-full', 'Include raw API response in JSON output')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--max-pages <n>', 'Maximum number of pages to fetch')
    .option('--all', 'Fetch all pages')
    .action(async (handle: string, cmdOpts: UserCmdOpts) => {
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

      // First get user ID from username
      const userResult = await client.getUserByUsername(handle);
      if (!userResult.success) {
        console.error(`${ctx.p('err')}${userResult.error}`);
        process.exit(1);
      }

      // Fetch following with pagination
      const maxPages = cmdOpts.maxPages ? parseInt(cmdOpts.maxPages, 10) : cmdOpts.all ? 100 : 1;
      let cursor = cmdOpts.cursor;
      const allUsers: UserData[] = [];
      let pageCount = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = await client.getFollowing(userResult.user.id, cursor);

        if (!result.success) {
          console.error(`${ctx.p('err')}${result.error}`);
          if (allUsers.length === 0) {
            process.exit(1);
          }
          break;
        }

        allUsers.push(...result.users);
        pageCount++;

        if (!result.nextCursor || pageCount >= maxPages) {
          break;
        }

        cursor = result.nextCursor;
      }

      // Output
      if (output.json) {
        ctx.json(cmdOpts.jsonFull ? allUsers.map((u) => u._raw) : allUsers);
        return;
      }

      if (allUsers.length === 0) {
        console.log(ctx.colors.muted('Not following anyone.'));
        return;
      }

      console.log(ctx.colors.section(`Following (${allUsers.length}):`));
      console.log('');
      ctx.printUsers(allUsers, { showRaw: cmdOpts.jsonFull });
    });

  // followers command
  program
    .command('followers')
    .description("Get a user's followers list")
    .argument('<handle>', 'Username or @handle')
    .option('--json-full', 'Include raw API response in JSON output')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--max-pages <n>', 'Maximum number of pages to fetch')
    .option('--all', 'Fetch all pages')
    .action(async (handle: string, cmdOpts: UserCmdOpts) => {
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

      // First get user ID from username
      const userResult = await client.getUserByUsername(handle);
      if (!userResult.success) {
        console.error(`${ctx.p('err')}${userResult.error}`);
        process.exit(1);
      }

      // Fetch followers with pagination
      const maxPages = cmdOpts.maxPages ? parseInt(cmdOpts.maxPages, 10) : cmdOpts.all ? 100 : 1;
      let cursor = cmdOpts.cursor;
      const allUsers: UserData[] = [];
      let pageCount = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = await client.getFollowers(userResult.user.id, cursor);

        if (!result.success) {
          console.error(`${ctx.p('err')}${result.error}`);
          if (allUsers.length === 0) {
            process.exit(1);
          }
          break;
        }

        allUsers.push(...result.users);
        pageCount++;

        if (!result.nextCursor || pageCount >= maxPages) {
          break;
        }

        cursor = result.nextCursor;
      }

      // Output
      if (output.json) {
        ctx.json(cmdOpts.jsonFull ? allUsers.map((u) => u._raw) : allUsers);
        return;
      }

      if (allUsers.length === 0) {
        console.log(ctx.colors.muted('No followers.'));
        return;
      }

      console.log(ctx.colors.section(`Followers (${allUsers.length}):`));
      console.log('');
      ctx.printUsers(allUsers, { showRaw: cmdOpts.jsonFull });
    });
}
