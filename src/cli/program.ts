/**
 * Commander.js program setup and command registration.
 */

import { Command } from 'commander';
import type { CliContext } from './shared.js';

// Import command registrations
import { registerWhoamiCommand } from '../commands/whoami.js';
import { registerReadCommands } from '../commands/read.js';
import { registerFeedCommands } from '../commands/feed.js';
import { registerUserCommands } from '../commands/user.js';
import { registerSearchCommand } from '../commands/search.js';

// Known commands for argument resolution
export const KNOWN_COMMANDS = new Set([
  'whoami',
  'read',
  'replies',
  'thread',
  'home',
  'likes',
  'saved',
  'search',
  'about',
  'user-posts',
  'following',
  'followers',
  'help',
]);

/**
 * Create the Commander program with all commands registered.
 */
export function createProgram(ctx: CliContext): Command {
  const program = new Command();

  program
    .name('yarn-threads')
    .description('CLI for Threads')
    .version('0.1.0');

  // Global options
  program
    .option('--session-id <token>', 'Threads sessionid cookie')
    .option('--csrf-token <token>', 'Threads csrftoken cookie')
    .option('--user-id <id>', 'Threads ds_user_id cookie')
    .option(
      '--chrome-profile <name>',
      'Chrome profile name',
      ctx.config.chromeProfile
    )
    .option(
      '--chrome-profile-dir <path>',
      'Chrome/Chromium profile directory or cookie DB path',
      ctx.config.chromeProfileDir
    )
    .option(
      '--firefox-profile <name>',
      'Firefox profile name',
      ctx.config.firefoxProfile
    )
    .option('--cookie-timeout <ms>', 'Cookie extraction timeout')
    .option('--timeout <ms>', 'Request timeout')
    .option('--json', 'Output as JSON')
    .option('--plain', 'Plain output (stable, no emoji, no color)')
    .option('--no-emoji', 'Disable emoji output')
    .option('--no-color', 'Disable ANSI colors (or set NO_COLOR env)');

  // Hook to apply output config from command
  program.hook('preAction', (_thisCommand, actionCommand) => {
    ctx.applyOutputFromCommand(actionCommand);
  });

  // Register all commands
  registerWhoamiCommand(program, ctx);
  registerReadCommands(program, ctx);
  registerFeedCommands(program, ctx);
  registerUserCommands(program, ctx);
  registerSearchCommand(program, ctx);

  // Custom help header
  program.addHelpText('beforeAll', `
${ctx.colors.banner('yarn')} - CLI for Threads
`);

  return program;
}

/**
 * Resolve CLI invocation, handling shorthand like `yarn <url>` -> `yarn read <url>`.
 */
export function resolveCliInvocation(
  argv: string[],
  knownCommands: Set<string>
): { argv: string[]; showHelp: boolean } {
  // No arguments - show help
  if (argv.length === 0) {
    return { argv: ['--help'], showHelp: true };
  }

  const firstArg = argv[0];

  // If first arg is a known command or starts with -, pass through
  if (knownCommands.has(firstArg) || firstArg.startsWith('-')) {
    return { argv, showHelp: false };
  }

  // Check if first arg looks like a Threads URL or post code
  const threadsUrlPattern =
    /^(?:https?:\/\/)?(?:www\.)?threads\.net\//;

  if (threadsUrlPattern.test(firstArg) || /^[A-Za-z0-9_-]+$/.test(firstArg)) {
    // Assume it's a post URL/code - expand to `read <arg>`
    return { argv: ['read', ...argv], showHelp: false };
  }

  // Pass through as-is
  return { argv, showHelp: false };
}
