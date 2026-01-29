/**
 * yarn - CLI for Threads
 * Library exports.
 */

// Re-export the main client
export { ThreadsClient } from './lib/threads-client.js';

// Re-export types
export type {
  ThreadsClientOptions,
  UserData,
  PostData,
  PostMedia,
  WhoamiResult,
  GetUserResult,
  GetPostResult,
  GetPostsResult,
  FeedResult,
  SearchResult,
  FollowListResult,
} from './lib/threads-client-types.js';

// Re-export cookies utilities
export {
  resolveCredentials,
  extractCookiesFromSafari,
  extractCookiesFromChrome,
  extractCookiesFromFirefox,
} from './lib/cookies.js';

export type {
  ThreadsCookies,
  CookieExtractionResult,
  CookieSource,
} from './lib/cookies.js';

// Re-export config utilities
export { loadConfig, getConfigDir, getConfigPath } from './lib/config.js';
export type { YarnConfig } from './lib/config.js';
