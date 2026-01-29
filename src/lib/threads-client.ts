/**
 * Threads API client.
 * Uses Instagram's GraphQL API which Threads is built on top of.
 */

import type {
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
} from './threads-client-types.js';

// Threads API base URL
const THREADS_API_URL = 'https://www.threads.net/api/graphql';

// Document IDs for Threads GraphQL queries (these may need updates)
// These are reverse-engineered from the Threads web app
const DOC_IDS = {
  // User queries
  userByUsername: '23996318473300828', // Get user profile by username
  userData: '9360915773983802', // Get current user data

  // Post queries
  threadDetail: '6529829603744567', // Get single thread/post
  threadReplies: '6684830921547925', // Get replies to a thread

  // Feed queries
  homeTimeline: '7846151975432989', // Home feed
  userThreads: '6232751443445612', // User's threads/posts

  // Engagement queries
  likedThreads: '9360047727362754', // User's liked posts
  savedThreads: '6354918684616234', // User's saved/bookmarked posts

  // Social queries
  followers: '7707543692631249', // User's followers
  following: '7050524464970894', // User's following

  // Search
  searchThreads: '6529829603744567', // Search threads
} as const;

// Default user agent
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// LSD token (app-specific token, may need periodic updates)
const DEFAULT_LSD = 'AVqbxe3J_YA';

export class ThreadsClient {
  private csrfToken: string;
  private userId: string | null;
  private cookieHeader: string;
  private userAgent: string;
  private timeoutMs?: number;

  constructor(options: ThreadsClientOptions) {
    if (!options.cookies.sessionId || !options.cookies.csrfToken) {
      throw new Error('Both sessionId and csrfToken cookies are required');
    }

    this.csrfToken = options.cookies.csrfToken;
    this.userId = options.cookies.userId;
    this.cookieHeader = options.cookies.cookieHeader ?? '';
    this.userAgent = USER_AGENT;
    this.timeoutMs = options.timeoutMs;
  }

  /**
   * Fetch with optional timeout support.
   */
  private async fetchWithTimeout(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    if (!this.timeoutMs || this.timeoutMs <= 0) {
      return fetch(url, init);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get base headers for API requests.
   */
  private getBaseHeaders(): Record<string, string> {
    return {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'content-type': 'application/x-www-form-urlencoded',
      cookie: this.cookieHeader,
      origin: 'https://www.threads.net',
      referer: 'https://www.threads.net/',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'user-agent': this.userAgent,
      'x-asbd-id': '129477',
      'x-csrftoken': this.csrfToken,
      'x-fb-friendly-name': 'BarcelonaProfileRootQuery',
      'x-fb-lsd': DEFAULT_LSD,
      'x-ig-app-id': '238260118697367', // Threads app ID
    };
  }

  /**
   * Make a GraphQL request to the Threads API.
   */
  private async graphqlRequest(
    docId: string,
    variables: Record<string, unknown>,
    friendlyName?: string
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const headers = this.getBaseHeaders();
    if (friendlyName) {
      headers['x-fb-friendly-name'] = friendlyName;
    }

    const body = new URLSearchParams({
      lsd: DEFAULT_LSD,
      variables: JSON.stringify(variables),
      doc_id: docId,
    });

    try {
      const response = await this.fetchWithTimeout(THREADS_API_URL, {
        method: 'POST',
        headers,
        body: body.toString(),
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
        };
      }

      const data = (await response.json()) as Record<string, unknown>;

      // Check for GraphQL errors
      const errors = data.errors as Array<{ message?: string }> | undefined;
      if (errors && errors.length > 0) {
        const errorMsg = errors
          .map((e) => e.message ?? 'Unknown error')
          .join('; ');
        return { success: false, error: errorMsg };
      }

      return { success: true, data: data.data };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return { success: false, error: 'Request timed out' };
        }
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Unknown error' };
    }
  }

  /**
   * Get the current authenticated user's info (whoami).
   */
  async whoami(): Promise<WhoamiResult> {
    // If we have a userId from cookies, try to get that user's info
    if (this.userId) {
      const variables = {
        userID: this.userId,
      };

      const result = await this.graphqlRequest(
        DOC_IDS.userData,
        variables,
        'BarcelonaProfileRootQuery'
      );

      if (!result.success) {
        return { success: false, error: result.error ?? 'Failed to get user data' };
      }

      const user = this.parseUserData(result.data);
      if (user) {
        return { success: true, user };
      }
    }

    // Fallback: try to get user data via Instagram API endpoint
    try {
      const response = await this.fetchWithTimeout(
        'https://www.threads.net/api/v1/accounts/current_user/',
        {
          method: 'GET',
          headers: {
            ...this.getBaseHeaders(),
            'content-type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: Unable to fetch current user`,
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      const userData = (data.user ?? data) as Record<string, unknown>;

      return {
        success: true,
        user: {
          id: String(userData.pk ?? userData.id ?? 'unknown'),
          username: String(userData.username ?? 'unknown'),
          fullName: String(userData.full_name ?? userData.fullName ?? ''),
          bio: userData.biography ? String(userData.biography) : userData.bio ? String(userData.bio) : undefined,
          profilePicUrl: userData.profile_pic_url ? String(userData.profile_pic_url) : userData.profilePicUrl ? String(userData.profilePicUrl) : undefined,
          followerCount: typeof userData.follower_count === 'number' ? userData.follower_count : typeof userData.followerCount === 'number' ? userData.followerCount : undefined,
          followingCount: typeof userData.following_count === 'number' ? userData.following_count : typeof userData.followingCount === 'number' ? userData.followingCount : undefined,
          isPrivate: userData.is_private === true || userData.isPrivate === true,
          isVerified: userData.is_verified === true || userData.isVerified === true,
          _raw: data,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get user profile by username.
   */
  async getUserByUsername(username: string): Promise<GetUserResult> {
    // Remove @ if present
    const cleanUsername = username.replace(/^@/, '');

    const variables = {
      username: cleanUsername,
    };

    const result = await this.graphqlRequest(
      DOC_IDS.userByUsername,
      variables,
      'BarcelonaProfileRootQuery'
    );

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get user' };
    }

    const user = this.parseUserData(result.data);
    if (user) {
      return { success: true, user };
    }

    return { success: false, error: 'User not found' };
  }

  /**
   * Get a single post/thread by its code (from URL).
   */
  async getPost(postCode: string): Promise<GetPostResult> {
    const variables = {
      postID: postCode,
    };

    const result = await this.graphqlRequest(
      DOC_IDS.threadDetail,
      variables,
      'BarcelonaPostPageQuery'
    );

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get post' };
    }

    const post = this.parsePostData(result.data);
    if (post) {
      return { success: true, post };
    }

    return { success: false, error: 'Post not found' };
  }

  /**
   * Get replies to a post.
   */
  async getReplies(
    postCode: string,
    cursor?: string
  ): Promise<GetPostsResult> {
    const variables: Record<string, unknown> = {
      postID: postCode,
    };
    if (cursor) {
      variables.cursor = cursor;
    }

    const result = await this.graphqlRequest(
      DOC_IDS.threadReplies,
      variables,
      'BarcelonaPostRepliesTabQuery'
    );

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get replies' };
    }

    const { posts, nextCursor } = this.parsePostList(result.data);
    return { success: true, posts, nextCursor };
  }

  /**
   * Get user's posts/threads.
   */
  async getUserPosts(
    username: string,
    cursor?: string
  ): Promise<GetPostsResult> {
    const cleanUsername = username.replace(/^@/, '');

    const variables: Record<string, unknown> = {
      username: cleanUsername,
    };
    if (cursor) {
      variables.cursor = cursor;
    }

    const result = await this.graphqlRequest(
      DOC_IDS.userThreads,
      variables,
      'BarcelonaProfileThreadsTabQuery'
    );

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get user posts' };
    }

    const { posts, nextCursor } = this.parsePostList(result.data);
    return { success: true, posts, nextCursor };
  }

  /**
   * Get home feed.
   */
  async getHomeFeed(cursor?: string): Promise<FeedResult> {
    const variables: Record<string, unknown> = {};
    if (cursor) {
      variables.cursor = cursor;
    }

    const result = await this.graphqlRequest(
      DOC_IDS.homeTimeline,
      variables,
      'BarcelonaHomeTimelineQuery'
    );

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get home feed' };
    }

    const { posts, nextCursor } = this.parsePostList(result.data);
    return { success: true, posts, nextCursor };
  }

  /**
   * Get user's liked posts.
   */
  async getLikedPosts(cursor?: string): Promise<FeedResult> {
    const variables: Record<string, unknown> = {};
    if (cursor) {
      variables.cursor = cursor;
    }

    const result = await this.graphqlRequest(
      DOC_IDS.likedThreads,
      variables,
      'BarcelonaLikedPostsQuery'
    );

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get liked posts' };
    }

    const { posts, nextCursor } = this.parsePostList(result.data);
    return { success: true, posts, nextCursor };
  }

  /**
   * Get user's saved/bookmarked posts.
   */
  async getSavedPosts(cursor?: string): Promise<FeedResult> {
    const variables: Record<string, unknown> = {};
    if (cursor) {
      variables.cursor = cursor;
    }

    const result = await this.graphqlRequest(
      DOC_IDS.savedThreads,
      variables,
      'BarcelonaSavedPostsQuery'
    );

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get saved posts' };
    }

    const { posts, nextCursor } = this.parsePostList(result.data);
    return { success: true, posts, nextCursor };
  }

  /**
   * Get user's followers.
   */
  async getFollowers(
    userId: string,
    cursor?: string
  ): Promise<FollowListResult> {
    const variables: Record<string, unknown> = {
      userID: userId,
    };
    if (cursor) {
      variables.cursor = cursor;
    }

    const result = await this.graphqlRequest(
      DOC_IDS.followers,
      variables,
      'BarcelonaFollowersQuery'
    );

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get followers' };
    }

    const { users, nextCursor } = this.parseUserList(result.data);
    return { success: true, users, nextCursor };
  }

  /**
   * Get user's following.
   */
  async getFollowing(
    userId: string,
    cursor?: string
  ): Promise<FollowListResult> {
    const variables: Record<string, unknown> = {
      userID: userId,
    };
    if (cursor) {
      variables.cursor = cursor;
    }

    const result = await this.graphqlRequest(
      DOC_IDS.following,
      variables,
      'BarcelonaFollowingQuery'
    );

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get following' };
    }

    const { users, nextCursor } = this.parseUserList(result.data);
    return { success: true, users, nextCursor };
  }

  /**
   * Search threads.
   */
  async search(query: string, cursor?: string): Promise<SearchResult> {
    const variables: Record<string, unknown> = {
      query,
    };
    if (cursor) {
      variables.cursor = cursor;
    }

    const result = await this.graphqlRequest(
      DOC_IDS.searchThreads,
      variables,
      'BarcelonaSearchQuery'
    );

    if (!result.success) {
      return { success: false, error: result.error ?? 'Search failed' };
    }

    const { posts, nextCursor } = this.parsePostList(result.data);
    return { success: true, posts, nextCursor };
  }

  // ============ Data Parsing Helpers ============

  /**
   * Parse user data from GraphQL response.
   */
  private parseUserData(data: unknown): UserData | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    // Navigate through common response structures
    const d = data as Record<string, unknown>;
    const dData = d.data as Record<string, unknown> | undefined;
    const barcelonaProfile = d.barcelona_profile as Record<string, unknown> | undefined;
    const userData =
      d.user ??
      dData?.user ??
      barcelonaProfile?.user ??
      d;

    if (!userData || typeof userData !== 'object') {
      return null;
    }

    const u = userData as Record<string, unknown>;

    return {
      id: String(u.pk ?? u.id ?? u.user_id ?? ''),
      username: String(u.username ?? ''),
      fullName: String(u.full_name ?? u.fullName ?? ''),
      bio: u.biography ? String(u.biography) : u.bio ? String(u.bio) : undefined,
      profilePicUrl: u.profile_pic_url
        ? String(u.profile_pic_url)
        : u.profilePicUrl
          ? String(u.profilePicUrl)
          : undefined,
      followerCount:
        typeof u.follower_count === 'number'
          ? u.follower_count
          : typeof u.followerCount === 'number'
            ? u.followerCount
            : undefined,
      followingCount:
        typeof u.following_count === 'number'
          ? u.following_count
          : typeof u.followingCount === 'number'
            ? u.followingCount
            : undefined,
      threadCount: (() => {
        const textPostAppInfo = u.text_post_app_info as Record<string, unknown> | undefined;
        return typeof textPostAppInfo?.thread_count === 'number'
          ? textPostAppInfo.thread_count
          : undefined;
      })(),
      isPrivate: u.is_private === true || u.isPrivate === true,
      isVerified: u.is_verified === true || u.isVerified === true,
      _raw: data,
    };
  }

  /**
   * Parse post data from GraphQL response.
   */
  private parsePostData(data: unknown): PostData | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const d = data as Record<string, unknown>;
    const dData = d.data as Record<string, unknown> | undefined;
    const containingThread = d.containing_thread as Record<string, unknown> | undefined;
    const threadItems = containingThread?.thread_items as Array<Record<string, unknown>> | undefined;
    const postData =
      d.post ??
      d.thread ??
      dData?.post ??
      threadItems?.[0]?.post ??
      d;

    if (!postData || typeof postData !== 'object') {
      return null;
    }

    const p = postData as Record<string, unknown>;
    const user = (p.user ?? p.owner ?? {}) as Record<string, unknown>;
    const caption = (p.caption ?? {}) as Record<string, unknown>;

    return {
      id: String(p.pk ?? p.id ?? ''),
      code: String(p.code ?? p.shortcode ?? ''),
      text: String(caption.text ?? p.text ?? p.caption ?? ''),
      author: {
        id: String(user.pk ?? user.id ?? ''),
        username: String(user.username ?? ''),
        fullName: String(user.full_name ?? user.fullName ?? ''),
        profilePicUrl: user.profile_pic_url
          ? String(user.profile_pic_url)
          : undefined,
        isVerified: user.is_verified === true,
      },
      createdAt: this.parseTimestamp(p.taken_at ?? p.timestamp ?? p.createdAt),
      likeCount:
        typeof p.like_count === 'number'
          ? p.like_count
          : typeof p.likeCount === 'number'
            ? p.likeCount
            : undefined,
      replyCount: (() => {
        const textPostAppInfo = p.text_post_app_info as Record<string, unknown> | undefined;
        if (typeof textPostAppInfo?.direct_reply_count === 'number') {
          return textPostAppInfo.direct_reply_count;
        }
        return typeof p.replyCount === 'number' ? p.replyCount : undefined;
      })(),
      repostCount: (() => {
        const textPostAppInfo = p.text_post_app_info as Record<string, unknown> | undefined;
        if (typeof textPostAppInfo?.repost_count === 'number') {
          return textPostAppInfo.repost_count;
        }
        return typeof p.repostCount === 'number' ? p.repostCount : undefined;
      })(),
      media: this.parseMedia(p),
      _raw: data,
    };
  }

  /**
   * Parse media from post data.
   */
  private parseMedia(postData: Record<string, unknown>): PostMedia[] | undefined {
    const media: PostMedia[] = [];

    // Handle carousel media
    const carouselMedia = postData.carousel_media as unknown[] | undefined;
    if (Array.isArray(carouselMedia)) {
      for (const item of carouselMedia) {
        const m = item as Record<string, unknown>;
        const imageVersions = m.image_versions2 as Record<string, unknown> | undefined;
        const candidates = imageVersions?.candidates as Array<{ url?: string; width?: number; height?: number }> | undefined;

        if (candidates?.[0]) {
          const videoVersions = m.video_versions as Array<{ url?: string }> | undefined;
          media.push({
            type: m.media_type === 2 ? 'video' : 'image',
            url: String(candidates[0].url ?? ''),
            width: candidates[0].width,
            height: candidates[0].height,
            videoUrl: videoVersions?.[0]?.url ? String(videoVersions[0].url) : undefined,
          });
        }
      }
      return media.length > 0 ? media : undefined;
    }

    // Handle single image/video
    const imageVersions = postData.image_versions2 as Record<string, unknown> | undefined;
    const candidates = imageVersions?.candidates as Array<{ url?: string; width?: number; height?: number }> | undefined;

    if (candidates?.[0]) {
      const videoVersions = postData.video_versions as Array<{ url?: string }> | undefined;
      media.push({
        type: postData.media_type === 2 ? 'video' : 'image',
        url: String(candidates[0].url ?? ''),
        width: candidates[0].width,
        height: candidates[0].height,
        videoUrl: videoVersions?.[0]?.url ? String(videoVersions[0].url) : undefined,
      });
      return media;
    }

    return undefined;
  }

  /**
   * Parse timestamp from various formats.
   */
  private parseTimestamp(value: unknown): string {
    if (typeof value === 'number') {
      // Unix timestamp (seconds)
      return new Date(value * 1000).toISOString();
    }
    if (typeof value === 'string') {
      return value;
    }
    return new Date().toISOString();
  }

  /**
   * Parse a list of posts from GraphQL response.
   */
  private parsePostList(data: unknown): {
    posts: PostData[];
    nextCursor?: string;
  } {
    const posts: PostData[] = [];
    let nextCursor: string | undefined;

    if (!data || typeof data !== 'object') {
      return { posts };
    }

    const d = data as Record<string, unknown>;
    const dData = d.data as Record<string, unknown> | undefined;

    // Try various response structures
    const items =
      d.threads ??
      d.items ??
      d.edges ??
      d.thread_items ??
      dData?.threads ??
      [];

    if (Array.isArray(items)) {
      for (const item of items) {
        const i = item as Record<string, unknown>;
        const postData = i.node ?? i.post ?? i.thread ?? i;
        const post = this.parsePostData(postData);
        if (post) {
          posts.push(post);
        }
      }
    }

    // Extract cursor for pagination
    const pageInfo = d.page_info as Record<string, unknown> | undefined;
    if (pageInfo?.end_cursor) {
      nextCursor = String(pageInfo.end_cursor);
    } else if (d.next_cursor) {
      nextCursor = String(d.next_cursor);
    }

    return { posts, nextCursor };
  }

  /**
   * Parse a list of users from GraphQL response.
   */
  private parseUserList(data: unknown): {
    users: UserData[];
    nextCursor?: string;
  } {
    const users: UserData[] = [];
    let nextCursor: string | undefined;

    if (!data || typeof data !== 'object') {
      return { users };
    }

    const d = data as Record<string, unknown>;

    const items = d.users ?? d.items ?? d.edges ?? [];

    if (Array.isArray(items)) {
      for (const item of items) {
        const i = item as Record<string, unknown>;
        const userData = i.node ?? i.user ?? i;
        const user = this.parseUserData(userData);
        if (user) {
          users.push(user);
        }
      }
    }

    // Extract cursor
    const pageInfo = d.page_info as Record<string, unknown> | undefined;
    if (pageInfo?.end_cursor) {
      nextCursor = String(pageInfo.end_cursor);
    } else if (d.next_cursor) {
      nextCursor = String(d.next_cursor);
    }

    return { users, nextCursor };
  }
}

// Export types
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
} from './threads-client-types.js';
