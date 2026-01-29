/**
 * Search command - search users (Instagram mobile API only supports user search).
 */

import type { Command } from 'commander';
import type { CliContext, CredentialsOptions } from '../cli/shared.js';
import { ThreadsClient } from '../lib/threads-client.js';

interface SearchCmdOpts {
  jsonFull?: boolean;
}

export function registerSearchCommand(program: Command, ctx: CliContext): void {
  program
    .command('search')
    .description('Search users on Threads')
    .argument('<query>', 'Search query (username or name)')
    .option('--json-full', 'Include raw API response in JSON output')
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

      // Fetch search results
      const result = await client.search(query);

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      const users = result.users;

      // Output
      if (output.json) {
        ctx.json(cmdOpts.jsonFull ? users.map((u) => u._raw) : users);
        return;
      }

      if (users.length === 0) {
        console.log(ctx.colors.muted('No users found.'));
        return;
      }

      console.log(ctx.colors.section(`Search results for "${query}" (${users.length} users):`));
      console.log('');
      ctx.printUsers(users, { showRaw: cmdOpts.jsonFull });
    });
}
