/**
 * Post commands - create new posts, replies, and quote posts.
 */

import type { Command } from 'commander';
import type { CliContext, CredentialsOptions } from '../cli/shared.js';
import { ThreadsClient } from '../lib/threads-client.js';
import type { ReplyControl } from '../lib/threads-client-types.js';

interface PostCmdOpts {
  replyControl?: string;
}

export function registerPostCommands(program: Command, ctx: CliContext): void {
  // post command - create a new text post
  program
    .command('post')
    .description('Create a new text post')
    .argument('<text>', 'Text content of the post')
    .option(
      '--reply-control <mode>',
      'Who can reply: everyone, accounts_you_follow, mentioned_only',
      'everyone'
    )
    .action(async (text: string, cmdOpts: PostCmdOpts) => {
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

      // Validate reply control
      const validReplyControls = ['everyone', 'accounts_you_follow', 'mentioned_only'];
      const replyControl = (cmdOpts.replyControl ?? 'everyone') as ReplyControl;
      if (!validReplyControls.includes(replyControl)) {
        console.error(
          `${ctx.p('err')}Invalid reply control. Use: ${validReplyControls.join(', ')}`
        );
        process.exit(1);
      }

      // Create client and publish
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts as { timeout?: string | number });
      const client = new ThreadsClient({ cookies, timeoutMs });

      const result = await client.publish({ text, replyControl });

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      // Output
      if (output.json) {
        ctx.json({
          success: true,
          postId: result.postId,
          code: result.code,
          url: result.code ? `https://www.threads.net/t/${result.code}` : undefined,
        });
        return;
      }

      console.log(`${ctx.p('ok')}Post created successfully!`);
      console.log(`${ctx.l('url')}Post ID: ${result.postId}`);
      if (result.code) {
        console.log(`${ctx.l('url')}${ctx.hyperlink(`https://www.threads.net/t/${result.code}`)}`);
      }
    });

  // reply command - reply to an existing post
  program
    .command('reply')
    .description('Reply to an existing post')
    .argument('<url-or-code>', 'Threads post URL or short code to reply to')
    .argument('<text>', 'Text content of the reply')
    .option(
      '--reply-control <mode>',
      'Who can reply: everyone, accounts_you_follow, mentioned_only',
      'everyone'
    )
    .action(async (urlOrCode: string, text: string, cmdOpts: PostCmdOpts) => {
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

      // Validate reply control
      const validReplyControls = ['everyone', 'accounts_you_follow', 'mentioned_only'];
      const replyControl = (cmdOpts.replyControl ?? 'everyone') as ReplyControl;
      if (!validReplyControls.includes(replyControl)) {
        console.error(
          `${ctx.p('err')}Invalid reply control. Use: ${validReplyControls.join(', ')}`
        );
        process.exit(1);
      }

      // Create client and reply
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts as { timeout?: string | number });
      const client = new ThreadsClient({ cookies, timeoutMs });

      const result = await client.reply(postCode, text, replyControl);

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      // Output
      if (output.json) {
        ctx.json({
          success: true,
          postId: result.postId,
          code: result.code,
          url: result.code ? `https://www.threads.net/t/${result.code}` : undefined,
          replyTo: urlOrCode,
        });
        return;
      }

      console.log(`${ctx.p('ok')}Reply posted successfully!`);
      console.log(`${ctx.l('url')}Post ID: ${result.postId}`);
      if (result.code) {
        console.log(`${ctx.l('url')}${ctx.hyperlink(`https://www.threads.net/t/${result.code}`)}`);
      }
    });

  // quote command - quote an existing post
  program
    .command('quote')
    .description('Quote an existing post')
    .argument('<url-or-code>', 'Threads post URL or short code to quote')
    .argument('<text>', 'Text content of your quote post')
    .option(
      '--reply-control <mode>',
      'Who can reply: everyone, accounts_you_follow, mentioned_only',
      'everyone'
    )
    .action(async (urlOrCode: string, text: string, cmdOpts: PostCmdOpts) => {
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

      // Validate reply control
      const validReplyControls = ['everyone', 'accounts_you_follow', 'mentioned_only'];
      const replyControl = (cmdOpts.replyControl ?? 'everyone') as ReplyControl;
      if (!validReplyControls.includes(replyControl)) {
        console.error(
          `${ctx.p('err')}Invalid reply control. Use: ${validReplyControls.join(', ')}`
        );
        process.exit(1);
      }

      // Create client and quote
      const timeoutMs = ctx.resolveTimeoutFromOptions(opts as { timeout?: string | number });
      const client = new ThreadsClient({ cookies, timeoutMs });

      const result = await client.quote(postCode, text, replyControl);

      if (!result.success) {
        console.error(`${ctx.p('err')}${result.error}`);
        process.exit(1);
      }

      // Output
      if (output.json) {
        ctx.json({
          success: true,
          postId: result.postId,
          code: result.code,
          url: result.code ? `https://www.threads.net/t/${result.code}` : undefined,
          quoted: urlOrCode,
        });
        return;
      }

      console.log(`${ctx.p('ok')}Quote post created successfully!`);
      console.log(`${ctx.l('url')}Post ID: ${result.postId}`);
      if (result.code) {
        console.log(`${ctx.l('url')}${ctx.hyperlink(`https://www.threads.net/t/${result.code}`)}`);
      }
    });
}
