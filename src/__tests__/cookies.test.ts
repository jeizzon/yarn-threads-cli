/**
 * Tests for src/lib/cookies.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @steipete/sweet-cookie before importing cookies
vi.mock('@steipete/sweet-cookie', () => ({
  getCookies: vi.fn(),
}));

import {
  resolveCredentials,
  extractCookiesFromSafari,
  extractCookiesFromChrome,
  extractCookiesFromFirefox,
  type ThreadsCookies,
  type CookieSource,
} from '../lib/cookies.js';
import { getCookies } from '@steipete/sweet-cookie';

const mockGetCookies = vi.mocked(getCookies);

describe('cookies', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    // Reset env vars
    process.env = { ...originalEnv };
    delete process.env.THREADS_SESSION_ID;
    delete process.env.THREADS_CSRF_TOKEN;
    delete process.env.THREADS_USER_ID;
    delete process.env.INSTAGRAM_SESSION_ID;
    delete process.env.INSTAGRAM_CSRF_TOKEN;
    delete process.env.SESSION_ID;
    delete process.env.CSRF_TOKEN;
    delete process.env.DS_USER_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveCredentials', () => {
    it('returns CLI arguments when provided', async () => {
      const result = await resolveCredentials({
        sessionId: 'test-session',
        csrfToken: 'test-csrf',
        userId: 'test-user',
      });

      expect(result.cookies.sessionId).toBe('test-session');
      expect(result.cookies.csrfToken).toBe('test-csrf');
      expect(result.cookies.userId).toBe('test-user');
      expect(result.cookies.source).toBe('CLI argument');
      expect(result.cookies.cookieHeader).toContain('sessionid=test-session');
    });

    it('uses environment variables when CLI args not provided', async () => {
      process.env.THREADS_SESSION_ID = 'env-session';
      process.env.THREADS_CSRF_TOKEN = 'env-csrf';
      process.env.THREADS_USER_ID = 'env-user';

      const result = await resolveCredentials({});

      expect(result.cookies.sessionId).toBe('env-session');
      expect(result.cookies.csrfToken).toBe('env-csrf');
      expect(result.cookies.userId).toBe('env-user');
      expect(result.cookies.source).toContain('env');
    });

    it('falls back to INSTAGRAM_* env vars', async () => {
      process.env.INSTAGRAM_SESSION_ID = 'ig-session';
      process.env.INSTAGRAM_CSRF_TOKEN = 'ig-csrf';

      const result = await resolveCredentials({});

      expect(result.cookies.sessionId).toBe('ig-session');
      expect(result.cookies.csrfToken).toBe('ig-csrf');
    });

    it('falls back to generic env var names', async () => {
      process.env.SESSION_ID = 'generic-session';
      process.env.CSRF_TOKEN = 'generic-csrf';

      const result = await resolveCredentials({});

      expect(result.cookies.sessionId).toBe('generic-session');
      expect(result.cookies.csrfToken).toBe('generic-csrf');
    });

    it('CLI args take precedence over env vars', async () => {
      process.env.THREADS_SESSION_ID = 'env-session';
      process.env.THREADS_CSRF_TOKEN = 'env-csrf';

      const result = await resolveCredentials({
        sessionId: 'cli-session',
        csrfToken: 'cli-csrf',
      });

      expect(result.cookies.sessionId).toBe('cli-session');
      expect(result.cookies.csrfToken).toBe('cli-csrf');
    });

    it('tries browser extraction when env/CLI insufficient', async () => {
      mockGetCookies.mockResolvedValue({
        cookies: [
          { name: 'sessionid', value: 'browser-session', domain: '.threads.net' },
          { name: 'csrftoken', value: 'browser-csrf', domain: '.threads.net' },
          { name: 'ds_user_id', value: 'browser-user', domain: '.threads.net' },
        ],
        warnings: [],
      });

      const result = await resolveCredentials({});

      expect(mockGetCookies).toHaveBeenCalled();
      expect(result.cookies.sessionId).toBe('browser-session');
      expect(result.cookies.csrfToken).toBe('browser-csrf');
    });

    it('tries multiple browser sources in order', async () => {
      mockGetCookies
        .mockResolvedValueOnce({ cookies: [], warnings: ['Safari: no cookies'] })
        .mockResolvedValueOnce({
          cookies: [
            { name: 'sessionid', value: 'chrome-session', domain: '.threads.net' },
            { name: 'csrftoken', value: 'chrome-csrf', domain: '.threads.net' },
          ],
          warnings: [],
        });

      const result = await resolveCredentials({});

      expect(mockGetCookies).toHaveBeenCalledTimes(2);
      expect(result.cookies.sessionId).toBe('chrome-session');
    });

    it('adds warnings when credentials not found', async () => {
      mockGetCookies.mockResolvedValue({ cookies: [], warnings: ['No cookies found'] });

      const result = await resolveCredentials({});

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('sessionid') || w.includes('Missing'))).toBe(true);
    });

    it('respects cookieSource option', async () => {
      mockGetCookies.mockResolvedValue({ cookies: [], warnings: [] });

      await resolveCredentials({ cookieSource: 'chrome' });

      // Should only try chrome, not safari/firefox
      expect(mockGetCookies).toHaveBeenCalledTimes(1);
      const callArgs = mockGetCookies.mock.calls[0][0];
      expect(callArgs.browsers).toContain('chrome');
    });

    it('respects cookieSource array option', async () => {
      mockGetCookies.mockResolvedValue({ cookies: [], warnings: [] });

      await resolveCredentials({ cookieSource: ['firefox', 'chrome'] });

      expect(mockGetCookies).toHaveBeenCalledTimes(2);
    });

    it('builds correct cookie header', async () => {
      const result = await resolveCredentials({
        sessionId: 'sess123',
        csrfToken: 'csrf456',
        userId: 'user789',
      });

      expect(result.cookies.cookieHeader).toBe('sessionid=sess123; csrftoken=csrf456; ds_user_id=user789');
    });

    it('builds cookie header without userId if not provided', async () => {
      const result = await resolveCredentials({
        sessionId: 'sess123',
        csrfToken: 'csrf456',
      });

      expect(result.cookies.cookieHeader).toBe('sessionid=sess123; csrftoken=csrf456');
      expect(result.cookies.cookieHeader).not.toContain('ds_user_id');
    });
  });

  describe('extractCookiesFromSafari', () => {
    it('calls getCookies with safari browser', async () => {
      mockGetCookies.mockResolvedValue({
        cookies: [
          { name: 'sessionid', value: 'safari-session', domain: '.threads.net' },
          { name: 'csrftoken', value: 'safari-csrf', domain: '.threads.net' },
        ],
        warnings: [],
      });

      const result = await extractCookiesFromSafari();

      expect(mockGetCookies).toHaveBeenCalledWith(
        expect.objectContaining({
          browsers: ['safari'],
        })
      );
      expect(result.cookies.sessionId).toBe('safari-session');
    });

    it('adds warning when no cookies found', async () => {
      mockGetCookies.mockResolvedValue({ cookies: [], warnings: [] });

      const result = await extractCookiesFromSafari();

      expect(result.warnings.some((w) => w.includes('Safari'))).toBe(true);
    });
  });

  describe('extractCookiesFromChrome', () => {
    it('calls getCookies with chrome browser', async () => {
      mockGetCookies.mockResolvedValue({
        cookies: [
          { name: 'sessionid', value: 'chrome-session', domain: '.threads.net' },
          { name: 'csrftoken', value: 'chrome-csrf', domain: '.threads.net' },
        ],
        warnings: [],
      });

      await extractCookiesFromChrome();

      expect(mockGetCookies).toHaveBeenCalledWith(
        expect.objectContaining({
          browsers: ['chrome'],
        })
      );
    });

    it('passes profile to getCookies', async () => {
      mockGetCookies.mockResolvedValue({ cookies: [], warnings: [] });

      await extractCookiesFromChrome('Profile 1');

      expect(mockGetCookies).toHaveBeenCalledWith(
        expect.objectContaining({
          chromeProfile: 'Profile 1',
        })
      );
    });
  });

  describe('extractCookiesFromFirefox', () => {
    it('calls getCookies with firefox browser', async () => {
      mockGetCookies.mockResolvedValue({
        cookies: [
          { name: 'sessionid', value: 'ff-session', domain: '.threads.net' },
          { name: 'csrftoken', value: 'ff-csrf', domain: '.threads.net' },
        ],
        warnings: [],
      });

      await extractCookiesFromFirefox();

      expect(mockGetCookies).toHaveBeenCalledWith(
        expect.objectContaining({
          browsers: ['firefox'],
        })
      );
    });

    it('passes profile to getCookies', async () => {
      mockGetCookies.mockResolvedValue({ cookies: [], warnings: [] });

      await extractCookiesFromFirefox('default-release');

      expect(mockGetCookies).toHaveBeenCalledWith(
        expect.objectContaining({
          firefoxProfile: 'default-release',
        })
      );
    });
  });

  describe('cookie domain preference', () => {
    it('prefers threads.net cookies over instagram.com', async () => {
      mockGetCookies.mockResolvedValue({
        cookies: [
          { name: 'sessionid', value: 'ig-session', domain: '.instagram.com' },
          { name: 'sessionid', value: 'threads-session', domain: '.threads.net' },
          { name: 'csrftoken', value: 'csrf', domain: '.threads.net' },
        ],
        warnings: [],
      });

      const result = await extractCookiesFromSafari();

      expect(result.cookies.sessionId).toBe('threads-session');
    });

    it('falls back to instagram.com cookies if threads.net not available', async () => {
      mockGetCookies.mockResolvedValue({
        cookies: [
          { name: 'sessionid', value: 'ig-session', domain: '.instagram.com' },
          { name: 'csrftoken', value: 'ig-csrf', domain: '.instagram.com' },
        ],
        warnings: [],
      });

      const result = await extractCookiesFromSafari();

      expect(result.cookies.sessionId).toBe('ig-session');
    });
  });

  describe('edge cases', () => {
    it('handles empty string values as missing', async () => {
      process.env.THREADS_SESSION_ID = '';
      process.env.THREADS_CSRF_TOKEN = '   ';

      mockGetCookies.mockResolvedValue({ cookies: [], warnings: [] });

      const result = await resolveCredentials({});

      expect(result.cookies.sessionId).toBeNull();
      expect(result.cookies.csrfToken).toBeNull();
    });

    it('handles undefined cookie values', async () => {
      mockGetCookies.mockResolvedValue({
        cookies: [
          { name: 'sessionid', value: undefined as unknown as string, domain: '.threads.net' },
          { name: 'csrftoken', value: 'csrf', domain: '.threads.net' },
        ],
        warnings: [],
      });

      const result = await extractCookiesFromSafari();

      // Should not crash, sessionId should be null
      expect(result.cookies.csrfToken).toBe('csrf');
    });

    it('handles cookies with missing name field', async () => {
      mockGetCookies.mockResolvedValue({
        cookies: [
          { value: 'orphan-value', domain: '.threads.net' } as { name?: string; value: string; domain: string },
          { name: 'sessionid', value: 'sess', domain: '.threads.net' },
          { name: 'csrftoken', value: 'csrf', domain: '.threads.net' },
        ],
        warnings: [],
      });

      const result = await extractCookiesFromSafari();

      expect(result.cookies.sessionId).toBe('sess');
    });

    it('handles custom cookieTimeoutMs option', async () => {
      mockGetCookies.mockResolvedValue({ cookies: [], warnings: [] });

      await resolveCredentials({ cookieTimeoutMs: 60000 });

      expect(mockGetCookies).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMs: 60000,
        })
      );
    });
  });
});
