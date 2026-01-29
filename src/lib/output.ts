/**
 * Output formatting utilities
 */
import kleur from 'kleur';

export interface OutputConfig {
  plain: boolean;
  emoji: boolean;
  color: boolean;
  hyperlinks: boolean;
  json: boolean;
}

export function resolveOutputConfig(
  argv: string[],
  env: NodeJS.ProcessEnv,
  isTty: boolean
): OutputConfig {
  const hasNoColorEnv = Object.hasOwn(env, 'NO_COLOR') || env.TERM === 'dumb';
  const defaultColor = isTty && !hasNoColorEnv;

  const json = argv.includes('--json');
  const plain = argv.includes('--plain');
  const emoji = !plain && !json && !argv.includes('--no-emoji');
  const color = !plain && !json && !argv.includes('--no-color') && defaultColor;
  const hyperlinks = !plain && !json && isTty;

  // Configure kleur based on settings
  kleur.enabled = color;

  return { plain, emoji, color, hyperlinks, json };
}

// Status prefixes
type StatusKind = 'ok' | 'warn' | 'err' | 'info' | 'hint';

const STATUS_EMOJI: Record<StatusKind, string> = {
  ok: '\u2705 ',
  warn: '\u26a0\ufe0f  ',
  err: '\u274c ',
  info: '\u2139\ufe0f  ',
  hint: '\U0001f4a1 ',
};

const STATUS_PLAIN: Record<StatusKind, string> = {
  ok: '[ok] ',
  warn: '[warn] ',
  err: '[err] ',
  info: '[info] ',
  hint: '[hint] ',
};

const STATUS_TEXT: Record<StatusKind, string> = {
  ok: 'OK: ',
  warn: 'WARN: ',
  err: 'ERROR: ',
  info: 'INFO: ',
  hint: 'HINT: ',
};

export function getStatusPrefix(
  kind: StatusKind,
  config: OutputConfig
): string {
  if (config.plain) return STATUS_PLAIN[kind];
  if (config.emoji) return STATUS_EMOJI[kind];
  return STATUS_TEXT[kind];
}

// Label prefixes
type LabelKind =
  | 'url'
  | 'date'
  | 'source'
  | 'credentials'
  | 'user'
  | 'userId'
  | 'followers'
  | 'following'
  | 'posts'
  | 'bio';

const LABEL_EMOJI: Record<LabelKind, string> = {
  url: '\U0001f517 ',
  date: '\U0001f4c5 ',
  source: '\U0001f50d ',
  credentials: '\U0001f510 ',
  user: '\U0001f464 ',
  userId: '\U0001f194 ',
  followers: '\U0001f465 ',
  following: '\u27a1\ufe0f  ',
  posts: '\U0001f4dd ',
  bio: '\U0001f4cb ',
};

const LABEL_PLAIN: Record<LabelKind, string> = {
  url: 'URL: ',
  date: 'DATE: ',
  source: 'SOURCE: ',
  credentials: 'CREDENTIALS: ',
  user: 'USER: ',
  userId: 'ID: ',
  followers: 'FOLLOWERS: ',
  following: 'FOLLOWING: ',
  posts: 'POSTS: ',
  bio: 'BIO: ',
};

export function getLabelPrefix(kind: LabelKind, config: OutputConfig): string {
  if (config.plain) return LABEL_PLAIN[kind];
  if (config.emoji) return LABEL_EMOJI[kind];
  return LABEL_PLAIN[kind];
}

// Hyperlink support (OSC 8)
export function hyperlink(
  url: string,
  text?: string,
  config?: OutputConfig
): string {
  const displayText = text ?? url;
  if (!config?.hyperlinks) return displayText;

  // Escape any escape sequences in URL and text
  const safeUrl = url.replaceAll('\x1b', '').replaceAll('\x07', '');
  const safeText = displayText.replaceAll('\x1b', '').replaceAll('\x07', '');

  return `\x1b]8;;${safeUrl}\x07${safeText}\x1b]8;;\x07`;
}

// Color helpers (wrapped for consistent API)
export const colors = {
  banner: (s: string) => kleur.bold().cyan(s),
  subtitle: (s: string) => kleur.dim(s),
  section: (s: string) => kleur.bold().yellow(s),
  bullet: (s: string) => kleur.cyan(s),
  command: (s: string) => kleur.green(s),
  option: (s: string) => kleur.yellow(s),
  argument: (s: string) => kleur.magenta(s),
  description: (s: string) => kleur.white(s),
  muted: (s: string) => kleur.dim(s),
  accent: (s: string) => kleur.cyan(s),
  error: (s: string) => kleur.red(s),
  success: (s: string) => kleur.green(s),
  warning: (s: string) => kleur.yellow(s),
  username: (s: string) => kleur.bold().blue(s),
  handle: (s: string) => kleur.cyan(s),
};

// JSON output helper
export function jsonOutput(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

// Format numbers with locale
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

// Format date
export function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
}

// Truncate text
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}
