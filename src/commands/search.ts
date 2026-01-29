/**
 * Search command - search threads.
 */

import type { Command } from 'commander';
import type { CliContext, CredentialsOptions } from '../cli/shared.js';
import { ThreadsClient } from '../lib/threads-client.js';
import type { PostData } from '../lib/threads-client-types.js';

interface SearchCmdOpts {
  jsonFull?: boolean;
  cursor?: string;
  maxPages?: string;
  all?: boolean;
}

export function registerSearchCommand(program: Command, ctx: CliContext): void {
  program
    .command('search')
    .description('Search threads')
    .argument('<query>', 'Search query')
    .option('--json-full', 'Include raw API response in JSON output')
    .option('--cursor <cursor>', 'Pagination cursor')
    .option('--max-pages <n>', 'Maximum number of pages to fetch')
    .option('--all', 'Fetch all pages')
    .action(async (query: string, cmdOpts: SearchCmdOpts) => {
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

      // Fetch search results with pagination
      const maxPages = cmdOpts.maxPages ? parseInt(cmdOpts.maxPages, 10) : cmdOpts.all ? 100 : 1;
      let cursor = cmdOpts.cursor;
      const allPosts: PostData[] = [];
      let pageCount = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const result = await client.search(query, cursor);

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
        console.log(ctx.colors.muted('No results found.'));
        return;
      }

      console.log(ctx.colors.section(`Search results for "${query}" (${allPosts.length}):`));
      console.log('');
      ctx.printPosts(allPosts, { showRaw: cmdOpts.jsonFull });
    });
}
