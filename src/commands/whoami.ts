/**
 * whoami command - validate auth and show current user info.
 */

import type { Command } from 'commander';
import type { CliContext, CredentialsOptions } from '../cli/shared.js';
import { ThreadsClient } from '../lib/threads-client.js';

export function registerWhoamiCommand(program: Command, ctx: CliContext): void {
  program
    .command('whoami')
    .description('Show current authenticated user')
    .option('--json-full', 'Include raw API response in JSON output')
    .action(async (cmdOpts: { jsonFull?: boolean }) => {
      const opts = program.opts() as CredentialsOptions;
      const output = ctx.getOutput();

      // Resolve credentials
      const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(opts);

      // Print warnings
      for (const warning of warnings) {
        console.error(`${ctx.p('warn')}${warning}`);
      }

      // Check for required credentials
      if (!cookies.sessionId || !cookies.csrfToken) {
        console.error(`${ctx.p('err')}Missing required credentials`);
        console.error(
          `${ctx.p('hint')}Login to threads.net in your browser, or provide --session-id and --csrf-token`
        );
        process.exit(1);
      }

      // Show credential source
      if (cookies.source) {
        console.error(`${ctx.l('source')}${cookies.source}`);
      }

      // Create client
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts as { timeout?: string | number });
      const client = new ThreadsClient({ cookies, timeoutMs });

      // Get current user
      const result = await client.whoami();

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
      console.log('');
      console.log(`${ctx.p('ok')}Authenticated successfully`);
    });
}
