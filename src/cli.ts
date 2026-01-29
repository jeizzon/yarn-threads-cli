#!/usr/bin/env node

/**
 * yarn - CLI for Threads
 * Main entry point.
 */

import { createCliContext } from './cli/shared.js';
import { createProgram, resolveCliInvocation, KNOWN_COMMANDS } from './cli/program.js';

async function main(): Promise<void> {
  // Get raw arguments
  const rawArgs = process.argv.slice(2);

  // Handle `--` prefix for passthrough
  const normalizedArgs = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

  // Create CLI context
  const ctx = createCliContext(normalizedArgs);

  // Create program
  const program = createProgram(ctx);

  // Resolve invocation (handle shorthand like `yarn <url>` -> `yarn read <url>`)
  const { argv } = resolveCliInvocation(normalizedArgs, KNOWN_COMMANDS);

  // Parse and execute
  try {
    await program.parseAsync(['node', 'yarn', ...argv]);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`${ctx.p('err')}${error.message}`);
    } else {
      console.error(`${ctx.p('err')}An unexpected error occurred`);
    }
    process.exit(1);
  }
}

main();
