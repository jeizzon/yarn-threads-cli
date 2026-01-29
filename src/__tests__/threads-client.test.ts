/**
 * Tests for src/lib/threads-client.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThreadsClient } from '../lib/threads-client.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createMockResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  } as Response;
}

function createClient(overrides?: Partial<{ sessionId: string; csrfToken: string; userId: string; timeoutMs?: number }>) {
  return new ThreadsClient({
    cookies: {
      sessionId: overrides?.sessionId ?? 'test-session',
      csrfToken: overrides?.csrfToken ?? 'test-csrf',
      userId: overrides?.userId ?? 'test-user',
      cookieHeader: `sessionid=${overrides?.sessionId ?? 'test-session'}; csrftoken=${overrides?.csrfToken ?? 'test-csrf'}`,
      source: 'test',
    },
    timeoutMs: overrides?.timeoutMs,
  });
}

describe('ThreadsClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('throws when sessionId is missing', () => {
      expect(() => new ThreadsClient({
        cookies: {
          sessionId: null,
          csrfToken: 'test-csrf',
          userId: null,
          cookieHeader: null,
          source: null,
        },
      })).toThrow('sessionId');
    });

    it('throws when csrfToken is missing', () => {
      expect(() => new ThreadsClient({
        cookies: {
          sessionId: 'test-session',
          csrfToken: null,
          userId: null,
          cookieHeader: null,
          source: null,
        },
      })).toThrow('csrfToken');
    });

    it('creates client with valid credentials', () => {
      const client = createClient();
      expect(client).toBeInstanceOf(ThreadsClient);
    });
  });

  describe('whoami', () => {
    it('returns user data on success', async () => {
      const mockUserData = {
        user: {
          pk: '12345',
          username: 'testuser',
          full_name: 'Test User',
          biography: 'Test bio',
          follower_count: 100,
          following_count: 50,
          is_private: false,
          is_verified: true,
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockUserData));

      const client = createClient();
      const result = await client.whoami();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.user.id).toBe('12345');
        expect(result.user.username).toBe('testuser');
        expect(result.user.fullName).toBe('Test User');
        expect(result.user.followerCount).toBe(100);
        expect(result.user.isVerified).toBe(true);
      }
    });

    it('returns error on HTTP failure', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ error: 'Unauthorized' }, false, 401));

      const client = createClient();
      const result = await client.whoami();

      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    });

    it('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const client = createClient();
      const result = await client.whoami();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('getUserByUsername', () => {
    it('strips @ from username', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ data: {} }));

      const client = createClient();
      await client.getUserByUsername('@testuser');

      expect(mockFetch).toHaveBeenCalled();
      const callBody = mockFetch.mock.calls[0][1].body;
      expect(callBody).toContain('testuser');
      expect(callBody).not.toContain('@');
    });

    it('returns user data on success', async () => {
      const mockResponse = {
        data: {
          user: {
            pk: '67890',
            username: 'otheruser',
            full_name: 'Other User',
            biography: 'Another bio',
          },
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getUserByUsername('otheruser');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.user.username).toBe('otheruser');
      }
    });

    it('returns error when user not found', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ data: null }));

      const client = createClient();
      const result = await client.getUserByUsername('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('getPost', () => {
    it('returns post data on success', async () => {
      const mockResponse = {
        data: {
          containing_thread: {
            thread_items: [
              {
                post: {
                  pk: 'post123',
                  code: 'ABC123',
                  caption: { text: 'Hello world!' },
                  user: {
                    pk: 'user123',
                    username: 'poster',
                    full_name: 'The Poster',
                  },
                  taken_at: 1700000000,
                  like_count: 42,
                  text_post_app_info: {
                    direct_reply_count: 5,
                    repost_count: 3,
                  },
                },
              },
            ],
          },
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getPost('ABC123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.post.code).toBe('ABC123');
        expect(result.post.text).toBe('Hello world!');
        expect(result.post.likeCount).toBe(42);
        expect(result.post.replyCount).toBe(5);
      }
    });

    it('returns error when post not found', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ data: null }));

      const client = createClient();
      const result = await client.getPost('NOTFOUND');

      expect(result.success).toBe(false);
    });
  });

  describe('getReplies', () => {
    it('returns replies with pagination cursor', async () => {
      const mockResponse = {
        data: {
          thread_items: [
            { post: { pk: 'reply1', code: 'R1', caption: { text: 'Reply 1' }, user: { username: 'u1' } } },
            { post: { pk: 'reply2', code: 'R2', caption: { text: 'Reply 2' }, user: { username: 'u2' } } },
          ],
          page_info: { end_cursor: 'cursor123' },
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getReplies('POST123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.posts.length).toBe(2);
        expect(result.nextCursor).toBe('cursor123');
      }
    });

    it('passes cursor for pagination', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ data: { thread_items: [] } }));

      const client = createClient();
      await client.getReplies('POST123', 'existingCursor');

      const callBody = mockFetch.mock.calls[0][1].body;
      expect(callBody).toContain('existingCursor');
    });
  });

  describe('getUserPosts', () => {
    it('returns user posts', async () => {
      const mockResponse = {
        data: {
          threads: [
            { post: { pk: 'p1', code: 'C1', caption: { text: 'Post 1' }, user: { username: 'theuser' } } },
          ],
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getUserPosts('theuser');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.posts.length).toBe(1);
      }
    });

    it('strips @ from username', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ data: { threads: [] } }));

      const client = createClient();
      await client.getUserPosts('@theuser');

      const callBody = mockFetch.mock.calls[0][1].body;
      expect(callBody).toContain('theuser');
      expect(callBody).not.toContain('@theuser');
    });
  });

  describe('getHomeFeed', () => {
    it('returns feed posts', async () => {
      const mockResponse = {
        data: {
          threads: [
            { post: { pk: 'f1', code: 'FC1', caption: { text: 'Feed Post' }, user: { username: 'someone' } } },
          ],
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getHomeFeed();

      expect(result.success).toBe(true);
    });
  });

  describe('getLikedPosts', () => {
    it('returns liked posts', async () => {
      const mockResponse = {
        data: {
          threads: [
            { post: { pk: 'l1', code: 'LC1', caption: { text: 'Liked Post' }, user: { username: 'liked' } } },
          ],
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getLikedPosts();

      expect(result.success).toBe(true);
    });
  });

  describe('getSavedPosts', () => {
    it('returns saved posts', async () => {
      const mockResponse = {
        data: {
          threads: [
            { post: { pk: 's1', code: 'SC1', caption: { text: 'Saved Post' }, user: { username: 'saved' } } },
          ],
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getSavedPosts();

      expect(result.success).toBe(true);
    });
  });

  describe('getFollowers', () => {
    it('returns followers list', async () => {
      const mockResponse = {
        data: {
          users: [
            { pk: 'u1', username: 'follower1', full_name: 'Follower One' },
            { pk: 'u2', username: 'follower2', full_name: 'Follower Two' },
          ],
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getFollowers('user123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.users.length).toBe(2);
        expect(result.users[0].username).toBe('follower1');
      }
    });
  });

  describe('getFollowing', () => {
    it('returns following list', async () => {
      const mockResponse = {
        data: {
          users: [
            { pk: 'f1', username: 'following1', full_name: 'Following One' },
          ],
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getFollowing('user123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.users.length).toBe(1);
      }
    });
  });

  describe('search', () => {
    it('returns search results', async () => {
      const mockResponse = {
        data: {
          threads: [
            { post: { pk: 'sr1', code: 'SRC1', caption: { text: 'Search result' }, user: { username: 'found' } } },
          ],
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.search('test query');

      expect(result.success).toBe(true);
    });

    it('passes cursor for pagination', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ data: { threads: [] } }));

      const client = createClient();
      await client.search('query', 'nextPage');

      const callBody = mockFetch.mock.calls[0][1].body;
      expect(callBody).toContain('nextPage');
    });
  });

  describe('error handling', () => {
    it('handles GraphQL errors in response', async () => {
      const mockResponse = {
        data: null,
        errors: [{ message: 'Rate limited' }, { message: 'Try again later' }],
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.whoami();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limited');
    });

    it('handles timeout with AbortError', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      const client = createClient({ timeoutMs: 1000 });
      const result = await client.whoami();

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('handles unknown errors', async () => {
      mockFetch.mockRejectedValue('Unknown error type');

      const client = createClient();
      const result = await client.whoami();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown');
    });
  });

  describe('data parsing', () => {
    it('parses post with carousel media', async () => {
      const mockResponse = {
        data: {
          containing_thread: {
            thread_items: [
              {
                post: {
                  pk: 'carousel123',
                  code: 'CAR123',
                  caption: { text: 'Carousel post' },
                  user: { username: 'mediauser' },
                  carousel_media: [
                    {
                      media_type: 1,
                      image_versions2: {
                        candidates: [{ url: 'https://img1.jpg', width: 1080, height: 1080 }],
                      },
                    },
                    {
                      media_type: 2,
                      image_versions2: {
                        candidates: [{ url: 'https://thumb.jpg', width: 720, height: 720 }],
                      },
                      video_versions: [{ url: 'https://video.mp4' }],
                    },
                  ],
                },
              },
            ],
          },
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getPost('CAR123');

      expect(result.success).toBe(true);
      if (result.success && result.post.media) {
        expect(result.post.media.length).toBe(2);
        expect(result.post.media[0].type).toBe('image');
        expect(result.post.media[1].type).toBe('video');
        expect(result.post.media[1].videoUrl).toBe('https://video.mp4');
      }
    });

    it('parses post with single image', async () => {
      const mockResponse = {
        data: {
          containing_thread: {
            thread_items: [
              {
                post: {
                  pk: 'img123',
                  code: 'IMG123',
                  caption: { text: 'Image post' },
                  user: { username: 'imguser' },
                  media_type: 1,
                  image_versions2: {
                    candidates: [{ url: 'https://single.jpg', width: 800, height: 600 }],
                  },
                },
              },
            ],
          },
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getPost('IMG123');

      expect(result.success).toBe(true);
      if (result.success && result.post.media) {
        expect(result.post.media.length).toBe(1);
        expect(result.post.media[0].url).toBe('https://single.jpg');
      }
    });

    it('handles Unix timestamp in seconds', async () => {
      const mockResponse = {
        data: {
          containing_thread: {
            thread_items: [
              {
                post: {
                  pk: 't1',
                  code: 'T1',
                  caption: { text: 'Test' },
                  user: { username: 'u' },
                  taken_at: 1700000000, // Unix timestamp in seconds
                },
              },
            ],
          },
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getPost('T1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.post.createdAt).toContain('2023');
      }
    });

    it('handles ISO date string', async () => {
      const mockResponse = {
        data: {
          containing_thread: {
            thread_items: [
              {
                post: {
                  pk: 't2',
                  code: 'T2',
                  caption: { text: 'Test' },
                  user: { username: 'u' },
                  timestamp: '2024-01-15T10:30:00Z',
                },
              },
            ],
          },
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getPost('T2');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.post.createdAt).toBe('2024-01-15T10:30:00Z');
      }
    });

    it('handles next_cursor pagination format', async () => {
      const mockResponse = {
        data: {
          threads: [],
          next_cursor: 'alt_cursor_format',
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getHomeFeed();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.nextCursor).toBe('alt_cursor_format');
      }
    });

    it('handles edges format for post list', async () => {
      const mockResponse = {
        data: {
          edges: [
            { node: { pk: 'e1', code: 'E1', caption: { text: 'Edge 1' }, user: { username: 'eu' } } },
          ],
        },
      };

      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const client = createClient();
      const result = await client.getHomeFeed();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.posts.length).toBe(1);
      }
    });

    it('handles empty/null data gracefully', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ data: {} }));

      const client = createClient();
      const result = await client.getHomeFeed();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.posts).toEqual([]);
      }
    });
  });
});
