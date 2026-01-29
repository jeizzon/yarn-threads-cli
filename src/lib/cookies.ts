/**
 * Browser cookie extraction for Threads authentication.
 * Threads shares authentication with Instagram (both owned by Meta).
 * Delegates to @steipete/sweet-cookie for Safari/Chrome/Firefox reads.
 */

import { getCookies } from '@steipete/sweet-cookie';

export interface ThreadsCookies {
  sessionId: string | null;
  csrfToken: string | null;
  userId: string | null;
  cookieHeader: string | null;
  source: string | null;
}

export interface CookieExtractionResult {
  cookies: ThreadsCookies;
  warnings: string[];
}

export type CookieSource = 'safari' | 'chrome' | 'firefox';

// Threads/Instagram cookie names we need
const THREADS_COOKIE_NAMES = ['sessionid', 'csrftoken', 'ds_user_id'] as const;

// Try both Threads and Instagram domains (they share auth)
const THREADS_URL = 'https://www.threads.net/';
const THREADS_ORIGINS: string[] = [
  'https://www.threads.net/',
  'https://threads.net/',
  'https://www.threads.com/',
  'https://threads.com/',
  'https://www.instagram.com/',
  'https://instagram.com/',
];

const DEFAULT_COOKIE_TIMEOUT_MS = 30_000;

function normalizeValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildCookieHeader(sessionId: string, csrfToken: string, userId?: string): string {
  let header = `sessionid=${sessionId}; csrftoken=${csrfToken}`;
  if (userId) {
    header += `; ds_user_id=${userId}`;
  }
  return header;
}

function buildEmpty(): ThreadsCookies {
  return {
    sessionId: null,
    csrfToken: null,
    userId: null,
    cookieHeader: null,
    source: null,
  };
}

function readEnvCookie(
  cookies: ThreadsCookies,
  keys: readonly string[],
  field: 'sessionId' | 'csrfToken' | 'userId'
): void {
  if (cookies[field]) {
    return;
  }
  for (const key of keys) {
    const value = normalizeValue(process.env[key]);
    if (!value) {
      continue;
    }
    cookies[field] = value;
    if (!cookies.source) {
      cookies.source = `env ${key}`;
    }
    break;
  }
}

function resolveSources(
  cookieSource?: CookieSource | CookieSource[]
): CookieSource[] {
  if (Array.isArray(cookieSource)) {
    return cookieSource;
  }
  if (cookieSource) {
    return [cookieSource];
  }
  return ['safari', 'chrome', 'firefox'];
}

function labelForSource(source: CookieSource, profile?: string, profileDir?: string): string {
  if (source === 'safari') {
    return 'Safari';
  }
  if (source === 'chrome') {
    if (profileDir) {
      return `Chrome profile dir "${profileDir}"`;
    }
    return profile ? `Chrome profile "${profile}"` : 'Chrome default profile';
  }
  return profile ? `Firefox profile "${profile}"` : 'Firefox default profile';
}

function pickCookieValue(
  cookies: Array<{ name?: string; value?: string; domain?: string }>,
  name: (typeof THREADS_COOKIE_NAMES)[number]
): string | null {
  const matches = cookies.filter(
    (c) => c?.name === name && typeof c.value === 'string'
  );
  if (matches.length === 0) {
    return null;
  }

  // Prefer threads.net domain
  const threadsNetMatch = matches.find((c) =>
    (c.domain ?? '').includes('threads.net')
  );
  if (threadsNetMatch?.value) {
    return threadsNetMatch.value;
  }

  // Try threads.com domain (Meta Threads)
  const threadsComMatch = matches.find((c) =>
    (c.domain ?? '').includes('threads.com')
  );
  if (threadsComMatch?.value) {
    return threadsComMatch.value;
  }

  // Fall back to instagram.com domain (shared auth)
  const instagramMatch = matches.find((c) =>
    (c.domain ?? '').includes('instagram.com')
  );
  if (instagramMatch?.value) {
    return instagramMatch.value;
  }

  return matches[0]?.value ?? null;
}

async function readThreadsCookiesFromBrowser(options: {
  source: CookieSource;
  chromeProfile?: string;
  chromeProfileDir?: string;
  firefoxProfile?: string;
  cookieTimeoutMs?: number;
}): Promise<CookieExtractionResult> {
  const warnings: string[] = [];
  const out = buildEmpty();

  // chromeProfileDir takes precedence over chromeProfile (it's a full path)
  const effectiveChromeProfile = options.chromeProfileDir ?? options.chromeProfile;

  const { cookies, warnings: providerWarnings } = await getCookies({
    url: THREADS_URL,
    origins: THREADS_ORIGINS,
    names: [...THREADS_COOKIE_NAMES],
    browsers: [options.source],
    mode: 'merge',
    chromeProfile: effectiveChromeProfile,
    firefoxProfile: options.firefoxProfile,
    timeoutMs: options.cookieTimeoutMs,
  });
  warnings.push(...providerWarnings);

  const sessionId = pickCookieValue(cookies, 'sessionid');
  const csrfToken = pickCookieValue(cookies, 'csrftoken');
  const userId = pickCookieValue(cookies, 'ds_user_id');

  if (sessionId) {
    out.sessionId = sessionId;
  }
  if (csrfToken) {
    out.csrfToken = csrfToken;
  }
  if (userId) {
    out.userId = userId;
  }

  if (out.sessionId && out.csrfToken) {
    out.cookieHeader = buildCookieHeader(out.sessionId, out.csrfToken, out.userId ?? undefined);
    out.source = labelForSource(
      options.source,
      options.source === 'chrome'
        ? options.chromeProfile
        : options.firefoxProfile,
      options.source === 'chrome'
        ? options.chromeProfileDir
        : undefined
    );
    return { cookies: out, warnings };
  }

  if (options.source === 'safari') {
    warnings.push(
      'No Threads/Instagram cookies found in Safari. Make sure you are logged into threads.net or instagram.com in Safari.'
    );
  } else if (options.source === 'chrome') {
    warnings.push(
      'No Threads/Instagram cookies found in Chrome. Make sure you are logged into threads.net or instagram.com in Chrome.'
    );
  } else {
    warnings.push(
      'No Threads/Instagram cookies found in Firefox. Make sure you are logged into threads.net or instagram.com in Firefox and the profile exists.'
    );
  }

  return { cookies: out, warnings };
}

export async function extractCookiesFromSafari(): Promise<CookieExtractionResult> {
  return readThreadsCookiesFromBrowser({ source: 'safari' });
}

export async function extractCookiesFromChrome(
  profile?: string,
  profileDir?: string
): Promise<CookieExtractionResult> {
  return readThreadsCookiesFromBrowser({ source: 'chrome', chromeProfile: profile, chromeProfileDir: profileDir });
}

export async function extractCookiesFromFirefox(
  profile?: string
): Promise<CookieExtractionResult> {
  return readThreadsCookiesFromBrowser({ source: 'firefox', firefoxProfile: profile });
}

/**
 * Resolve Threads credentials from multiple sources.
 * Priority: CLI args > environment variables > browsers (ordered).
 */
export async function resolveCredentials(options: {
  sessionId?: string;
  csrfToken?: string;
  userId?: string;
  cookieSource?: CookieSource | CookieSource[];
  chromeProfile?: string;
  chromeProfileDir?: string;
  firefoxProfile?: string;
  cookieTimeoutMs?: number;
}): Promise<CookieExtractionResult> {
  const warnings: string[] = [];
  const cookies = buildEmpty();
  const cookieTimeoutMs =
    typeof options.cookieTimeoutMs === 'number' &&
    Number.isFinite(options.cookieTimeoutMs) &&
    options.cookieTimeoutMs > 0
      ? options.cookieTimeoutMs
      : process.platform === 'darwin'
        ? DEFAULT_COOKIE_TIMEOUT_MS
        : undefined;

  // 1. CLI arguments take precedence
  if (options.sessionId) {
    cookies.sessionId = options.sessionId;
    cookies.source = 'CLI argument';
  }
  if (options.csrfToken) {
    cookies.csrfToken = options.csrfToken;
    if (!cookies.source) {
      cookies.source = 'CLI argument';
    }
  }
  if (options.userId) {
    cookies.userId = options.userId;
    if (!cookies.source) {
      cookies.source = 'CLI argument';
    }
  }

  // 2. Environment variables
  readEnvCookie(cookies, ['THREADS_SESSION_ID', 'INSTAGRAM_SESSION_ID', 'SESSION_ID'], 'sessionId');
  readEnvCookie(cookies, ['THREADS_CSRF_TOKEN', 'INSTAGRAM_CSRF_TOKEN', 'CSRF_TOKEN'], 'csrfToken');
  readEnvCookie(cookies, ['THREADS_USER_ID', 'INSTAGRAM_USER_ID', 'DS_USER_ID'], 'userId');

  // If we have the required cookies, return early
  if (cookies.sessionId && cookies.csrfToken) {
    cookies.cookieHeader = buildCookieHeader(
      cookies.sessionId,
      cookies.csrfToken,
      cookies.userId ?? undefined
    );
    return { cookies, warnings };
  }

  // 3. Try browser extraction
  const sourcesToTry = resolveSources(options.cookieSource);
  for (const source of sourcesToTry) {
    const res = await readThreadsCookiesFromBrowser({
      source,
      chromeProfile: options.chromeProfile,
      chromeProfileDir: options.chromeProfileDir,
      firefoxProfile: options.firefoxProfile,
      cookieTimeoutMs,
    });
    warnings.push(...res.warnings);
    if (res.cookies.sessionId && res.cookies.csrfToken) {
      return { cookies: res.cookies, warnings };
    }
  }

  // Provide helpful error messages
  if (!cookies.sessionId) {
    warnings.push(
      'Missing sessionid - provide via --session-id, THREADS_SESSION_ID env var, or login to threads.net in Safari/Chrome/Firefox'
    );
  }
  if (!cookies.csrfToken) {
    warnings.push(
      'Missing csrftoken - provide via --csrf-token, THREADS_CSRF_TOKEN env var, or login to threads.net in Safari/Chrome/Firefox'
    );
  }

  if (cookies.sessionId && cookies.csrfToken) {
    cookies.cookieHeader = buildCookieHeader(
      cookies.sessionId,
      cookies.csrfToken,
      cookies.userId ?? undefined
    );
  }

  return { cookies, warnings };
}
