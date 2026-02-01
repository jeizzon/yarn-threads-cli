/**
 * Threads API client.
 * Uses Instagram's mobile API (i.instagram.com) for reliable access.
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
  UserSearchResult,
  FollowListResult,
  PublishOptions,
  PublishResult,
  ReplyControl,
} from './threads-client-types.js';

// Instagram mobile API base URL
const INSTAGRAM_API_URL = 'https://i.instagram.com';

// Mobile app user agent (Barcelona = Threads codename)
const MOBILE_USER_AGENT = 'Barcelona 337.0.0.29.118 Android';

export class ThreadsClient {
  private csrfToken: string;
  private cookieHeader: string;
  private timeoutMs?: number;

  constructor(options: ThreadsClientOptions) {
    if (!options.cookies.sessionId || !options.cookies.csrfToken) {
      throw new Error('Both sessionId and csrfToken cookies are required');
    }

    this.csrfToken = options.cookies.csrfToken;
    this.cookieHeader = options.cookies.cookieHeader ?? '';
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
   * Get Instagram mobile API headers.
   */
  private getInstagramHeaders(): Record<string, string> {
    return {
      cookie: this.cookieHeader,
      'x-csrftoken': this.csrfToken,
      'x-ig-app-id': '238260118697367',
      'user-agent': MOBILE_USER_AGENT,
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
    };
  }

  /**
   * Make a request to Instagram mobile API.
   */
  private async instagramApiRequest(
    endpoint: string,
    options: { method?: 'GET' | 'POST'; body?: URLSearchParams | string } = {}
  ): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
    const headers = this.getInstagramHeaders();
    const method = options.method ?? 'GET';
    
    const fetchOptions: RequestInit = {
      method,
      headers,
    };
    
    if (options.body) {
      fetchOptions.body = options.body.toString();
      headers['content-type'] = 'application/x-www-form-urlencoded';
    }

    try {
      const response = await this.fetchWithTimeout(
        `${INSTAGRAM_API_URL}${endpoint}`,
        fetchOptions
      );

      if (!response.ok) {
        const text = await response.text();
        return {
          success: false,
          error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
        };
      }

      const text = await response.text();
      
      // Check for HTML (auth issue)
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
        return {
          success: false,
          error: 'Got HTML instead of JSON - likely an auth/session issue',
        };
      }

      const data = JSON.parse(text) as Record<string, unknown>;
      
      if (data.status !== 'ok' && data.status !== undefined) {
        return {
          success: false,
          error: data.message ? String(data.message) : `Status: ${data.status}`,
        };
      }

      return { success: true, data };
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
    const result = await this.instagramApiRequest('/api/v1/accounts/current_user/');
    
    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get user' };
    }

    const userData = result.data?.user as Record<string, unknown> | undefined;
    if (!userData) {
      return { success: false, error: 'No user data in response' };
    }

    return {
      success: true,
      user: this.parseInstagramUser(userData, result.data),
    };
  }

  /**
   * Get user profile by username.
   * Uses Instagram mobile API: search for user, then fetch full info.
   */
  async getUserByUsername(username: string): Promise<GetUserResult> {
    // Remove @ if present
    const cleanUsername = username.replace(/^@/, '');

    // First, search for the user to get their userId
    const searchResult = await this.instagramApiRequest(
      `/api/v1/users/search/?q=${encodeURIComponent(cleanUsername)}`
    );

    if (!searchResult.success) {
      return { success: false, error: searchResult.error ?? 'Search failed' };
    }

    const users = searchResult.data?.users as Array<Record<string, unknown>> | undefined;
    if (!users || users.length === 0) {
      return { success: false, error: 'User not found' };
    }

    // Find exact username match
    const matchedUser = users.find(
      (u) => String(u.username).toLowerCase() === cleanUsername.toLowerCase()
    );
    
    if (!matchedUser) {
      return { success: false, error: `User @${cleanUsername} not found` };
    }

    const userId = String(matchedUser.pk ?? matchedUser.id);

    // Now get full user info
    const infoResult = await this.instagramApiRequest(`/api/v1/users/${userId}/info/`);
    
    if (!infoResult.success) {
      // Fall back to the search result if info fetch fails
      return {
        success: true,
        user: this.parseInstagramUser(matchedUser, searchResult.data),
      };
    }

    const userData = infoResult.data?.user as Record<string, unknown> | undefined;
    if (!userData) {
      // Fall back to search result
      return {
        success: true,
        user: this.parseInstagramUser(matchedUser, searchResult.data),
      };
    }

    return {
      success: true,
      user: this.parseInstagramUser(userData, infoResult.data),
    };
  }

  /**
   * Get a single post/thread by its code (from URL).
   * Uses Instagram mobile API: GET /api/v1/media/{media_id}/info/
   * The shortcode needs to be converted to media_id first.
   */
  async getPost(postCode: string): Promise<GetPostResult> {
    // Convert shortcode to media_id
    const mediaId = this.shortcodeToMediaId(postCode);
    
    const result = await this.instagramApiRequest(`/api/v1/media/${mediaId}/info/`);

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get post' };
    }

    const items = result.data?.items as Array<Record<string, unknown>> | undefined;
    if (!items || items.length === 0) {
      return { success: false, error: 'Post not found' };
    }

    const postData = items[0];
    return {
      success: true,
      post: this.parseInstagramPost(postData, result.data),
    };
  }

  /**
   * Convert Instagram shortcode to media_id.
   * Instagram uses base64-like encoding for shortcodes.
   */
  private shortcodeToMediaId(shortcode: string): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let mediaId = BigInt(0);
    
    for (const char of shortcode) {
      const index = alphabet.indexOf(char);
      if (index === -1) continue;
      mediaId = mediaId * BigInt(64) + BigInt(index);
    }
    
    return mediaId.toString();
  }

  /**
   * Get replies to a post.
   * Uses Instagram mobile API: GET /api/v1/text_feed/{postId}/replies/
   * Note: postCode needs to be converted to postId (media_id)
   */
  async getReplies(
    postCode: string,
    cursor?: string
  ): Promise<GetPostsResult> {
    // First get the post to obtain the media_id
    const postResult = await this.getPost(postCode);
    if (!postResult.success) {
      return { success: false, error: postResult.error };
    }

    const postId = postResult.post.id;
    let endpoint = `/api/v1/text_feed/${postId}/replies/`;
    if (cursor) {
      endpoint += `?paging_token=${encodeURIComponent(cursor)}`;
    }

    const result = await this.instagramApiRequest(endpoint);

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get replies' };
    }

    // Parse replies from the response
    const posts = this.parseRepliesResponse(result.data);
    const nextCursor = result.data?.paging_tokens 
      ? String((result.data.paging_tokens as Record<string, unknown>).downward ?? '')
      : undefined;
    
    return { success: true, posts, nextCursor: nextCursor || undefined };
  }
  
  /**
   * Parse replies from Instagram API response.
   * Replies have a different structure than regular threads.
   */
  private parseRepliesResponse(data: Record<string, unknown> | undefined): PostData[] {
    const posts: PostData[] = [];
    
    if (!data) return posts;
    
    // Replies are in reply_threads array
    const replyThreads = data.reply_threads as Array<Record<string, unknown>> | undefined;
    
    if (Array.isArray(replyThreads)) {
      for (const thread of replyThreads) {
        const threadItems = thread.thread_items as Array<Record<string, unknown>> | undefined;
        if (threadItems && threadItems.length > 0) {
          const postData = threadItems[0].post as Record<string, unknown> | undefined;
          if (postData) {
            posts.push(this.parseInstagramPost(postData, thread));
          }
        }
      }
    }
    
    return posts;
  }

  /**
   * Get user's posts/threads.
   * Uses Instagram mobile API: GET /api/v1/text_feed/{userId}/profile/
   */
  async getUserPosts(
    username: string,
    cursor?: string
  ): Promise<GetPostsResult> {
    const cleanUsername = username.replace(/^@/, '');

    // First, get user ID from username
    const userResult = await this.getUserByUsername(cleanUsername);
    if (!userResult.success) {
      return { success: false, error: userResult.error };
    }

    const userId = userResult.user.id;
    let endpoint = `/api/v1/text_feed/${userId}/profile/`;
    if (cursor) {
      endpoint += `?max_id=${encodeURIComponent(cursor)}`;
    }

    const result = await this.instagramApiRequest(endpoint);
    
    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get user posts' };
    }

    const { posts, nextCursor } = this.parseInstagramThreadList(result.data);
    return { success: true, posts, nextCursor };
  }

  /**
   * Get home feed.
   * Note: Instagram mobile API home feed endpoint is not publicly accessible.
   * This attempts the text_feed endpoint which may require additional auth.
   */
  async getHomeFeed(cursor?: string): Promise<FeedResult> {
    // Try the Threads-specific timeline endpoint
    let endpoint = '/api/v1/text_feed/timeline/';
    if (cursor) {
      endpoint += `?max_id=${encodeURIComponent(cursor)}`;
    }

    const result = await this.instagramApiRequest(endpoint);

    if (!result.success) {
      // Fall back error message
      return { 
        success: false, 
        error: 'Home feed is not available via mobile API. Use the web interface instead.' 
      };
    }

    const { posts, nextCursor } = this.parseInstagramThreadList(result.data);
    return { success: true, posts, nextCursor };
  }

  /**
   * Get user's liked posts.
   * Uses Instagram mobile API: GET /api/v1/feed/liked/
   */
  async getLikedPosts(cursor?: string): Promise<FeedResult> {
    let endpoint = '/api/v1/feed/liked/';
    if (cursor) {
      endpoint += `?max_id=${encodeURIComponent(cursor)}`;
    }

    const result = await this.instagramApiRequest(endpoint);

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get liked posts' };
    }

    const { posts, nextCursor } = this.parseInstagramThreadList(result.data);
    return { success: true, posts, nextCursor };
  }

  /**
   * Get user's saved/bookmarked posts.
   * Note: The saved posts endpoint is not reliably available via Instagram mobile API.
   */
  async getSavedPosts(_cursor?: string): Promise<FeedResult> {
    return { 
      success: false, 
      error: 'Saved posts are not available via mobile API. Use the web interface instead.' 
    };
  }

  /**
   * Get user's followers.
   * Uses Instagram mobile API: GET /api/v1/friendships/{userId}/followers/
   */
  async getFollowers(
    userId: string,
    cursor?: string
  ): Promise<FollowListResult> {
    let endpoint = `/api/v1/friendships/${userId}/followers/`;
    if (cursor) {
      endpoint += `?max_id=${encodeURIComponent(cursor)}`;
    }

    const result = await this.instagramApiRequest(endpoint);

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get followers' };
    }

    const users = result.data?.users as Array<Record<string, unknown>> | undefined;
    const nextCursor = result.data?.next_max_id ? String(result.data.next_max_id) : undefined;

    if (!users) {
      return { success: true, users: [], nextCursor };
    }

    const parsedUsers = users.map((u) => this.parseInstagramUser(u, result.data));
    return { success: true, users: parsedUsers, nextCursor };
  }

  /**
   * Get user's following.
   * Uses Instagram mobile API: GET /api/v1/friendships/{userId}/following/
   */
  async getFollowing(
    userId: string,
    cursor?: string
  ): Promise<FollowListResult> {
    let endpoint = `/api/v1/friendships/${userId}/following/`;
    if (cursor) {
      endpoint += `?max_id=${encodeURIComponent(cursor)}`;
    }

    const result = await this.instagramApiRequest(endpoint);

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to get following' };
    }

    const users = result.data?.users as Array<Record<string, unknown>> | undefined;
    const nextCursor = result.data?.next_max_id ? String(result.data.next_max_id) : undefined;

    if (!users) {
      return { success: true, users: [], nextCursor };
    }

    const parsedUsers = users.map((u) => this.parseInstagramUser(u, result.data));
    return { success: true, users: parsedUsers, nextCursor };
  }

  /**
   * Search users (Instagram mobile API doesn't have thread search, only user search).
   * Uses Instagram mobile API: GET /api/v1/users/search/?q={query}
   */
  async search(query: string, _cursor?: string): Promise<UserSearchResult> {
    const result = await this.instagramApiRequest(
      `/api/v1/users/search/?q=${encodeURIComponent(query)}`
    );

    if (!result.success) {
      return { success: false, error: result.error ?? 'Search failed' };
    }

    const users = result.data?.users as Array<Record<string, unknown>> | undefined;
    if (!users) {
      return { success: true, users: [] };
    }

    const parsedUsers = users.map((u) => this.parseInstagramUser(u, result.data));
    return { success: true, users: parsedUsers };
  }

  // ============ Publish Methods ============

  /**
   * Get the current user's ID (needed for publishing).
   * Cached after first call.
   */
  private cachedUserId: string | null = null;

  private async getUserId(): Promise<string | null> {
    if (this.cachedUserId) {
      return this.cachedUserId;
    }

    const whoami = await this.whoami();
    if (whoami.success) {
      this.cachedUserId = whoami.user.id;
      return this.cachedUserId;
    }

    return null;
  }

  /**
   * Generate a random device ID for Android.
   */
  private generateDeviceId(): string {
    return `android-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Convert reply control enum to API value.
   */
  private replyControlToValue(control: ReplyControl): number {
    switch (control) {
      case 'everyone':
        return 0;
      case 'accounts_you_follow':
        return 1;
      case 'mentioned_only':
        return 2;
      default:
        return 0;
    }
  }

  /**
   * Publish a new text post/thread.
   * Uses Instagram mobile API: POST /api/v1/media/configure_text_only_post/
   */
  async publish(options: PublishOptions): Promise<PublishResult> {
    const userId = await this.getUserId();
    if (!userId) {
      return { success: false, error: 'Could not get user ID. Please check your authentication.' };
    }

    const deviceId = this.generateDeviceId();
    const uploadId = Date.now().toString();
    const timezoneOffset = new Date().getTimezoneOffset() * -60; // Convert to seconds

    const replyControlValue = this.replyControlToValue(options.replyControl ?? 'everyone');

    // Build the payload
    const payload: Record<string, unknown> = {
      publish_mode: 'text_post',
      text_post_app_info: JSON.stringify({
        reply_control: replyControlValue,
      }),
      timezone_offset: timezoneOffset.toString(),
      source_type: '4',
      caption: options.text,
      _uid: userId,
      device_id: deviceId,
      upload_id: uploadId,
      device: {
        manufacturer: 'OnePlus',
        model: 'ONEPLUS+A3010',
        android_version: 25,
        android_release: '7.1.1',
      },
    };

    // Add reply target if this is a reply
    if (options.replyToPostId) {
      payload.text_post_app_info = JSON.stringify({
        reply_control: replyControlValue,
        reply_id: options.replyToPostId,
      });
    }

    // Add quote target if this is a quote post
    if (options.quotedPostId) {
      payload.text_post_app_info = JSON.stringify({
        reply_control: replyControlValue,
        quoted_post_id: options.quotedPostId,
      });
    }

    // Build signed body (Instagram API format)
    const payloadJson = JSON.stringify(payload);
    const signedBody = `SIGNATURE.${payloadJson}`;

    const body = new URLSearchParams();
    body.append('signed_body', signedBody);

    const result = await this.instagramApiRequest(
      '/api/v1/media/configure_text_only_post/',
      { method: 'POST', body }
    );

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to publish post' };
    }

    // Extract post ID from response
    const media = result.data?.media as Record<string, unknown> | undefined;
    if (!media) {
      return { success: false, error: 'No media data in response' };
    }

    const postId = String(media.pk ?? media.id ?? '');
    const code = media.code ? String(media.code) : undefined;

    if (!postId) {
      return { success: false, error: 'Could not extract post ID from response' };
    }

    return { success: true, postId, code };
  }

  /**
   * Publish a reply to an existing post.
   * Convenience method that calls publish() with replyToPostId.
   */
  async reply(postCode: string, text: string, replyControl?: ReplyControl): Promise<PublishResult> {
    // Get the post to retrieve its media ID
    const postResult = await this.getPost(postCode);
    if (!postResult.success) {
      return { success: false, error: `Could not find post: ${postResult.error}` };
    }

    return this.publish({
      text,
      replyControl,
      replyToPostId: postResult.post.id,
    });
  }

  /**
   * Publish a quote post.
   * Convenience method that calls publish() with quotedPostId.
   */
  async quote(postCode: string, text: string, replyControl?: ReplyControl): Promise<PublishResult> {
    // Get the post to retrieve its media ID
    const postResult = await this.getPost(postCode);
    if (!postResult.success) {
      return { success: false, error: `Could not find post: ${postResult.error}` };
    }

    return this.publish({
      text,
      replyControl,
      quotedPostId: postResult.post.id,
    });
  }

  // ============ Data Parsing Helpers ============

  /**
   * Parse user from Instagram mobile API response.
   */
  private parseInstagramUser(userData: Record<string, unknown>, raw?: unknown): UserData {
    const textPostAppInfo = userData.text_post_app_info as Record<string, unknown> | undefined;
    
    return {
      id: String(userData.pk ?? userData.id ?? ''),
      username: String(userData.username ?? ''),
      fullName: String(userData.full_name ?? ''),
      bio: userData.biography ? String(userData.biography) : undefined,
      profilePicUrl: userData.profile_pic_url ? String(userData.profile_pic_url) : undefined,
      followerCount: typeof userData.follower_count === 'number' ? userData.follower_count : undefined,
      followingCount: typeof userData.following_count === 'number' ? userData.following_count : undefined,
      threadCount: typeof textPostAppInfo?.thread_count === 'number' ? textPostAppInfo.thread_count : undefined,
      isPrivate: userData.is_private === true,
      isVerified: userData.is_verified === true,
      _raw: raw,
    };
  }

  /**
   * Parse a list of threads from Instagram mobile API response.
   */
  private parseInstagramThreadList(data: Record<string, unknown> | undefined): {
    posts: PostData[];
    nextCursor?: string;
  } {
    const posts: PostData[] = [];
    
    if (!data) {
      return { posts };
    }

    // Instagram API returns threads in different structures
    const threads = data.threads ?? data.items ?? data.medias ?? [];
    
    if (Array.isArray(threads)) {
      for (const thread of threads) {
        const t = thread as Record<string, unknown>;
        // Threads can have thread_items array (nested posts) or be direct posts
        const threadItems = t.thread_items as Array<Record<string, unknown>> | undefined;
        
        if (threadItems && threadItems.length > 0) {
          // Get the main post from thread_items
          const mainPost = threadItems[0].post as Record<string, unknown> | undefined;
          if (mainPost) {
            posts.push(this.parseInstagramPost(mainPost, thread));
          }
        } else if (t.post) {
          // Direct post object
          posts.push(this.parseInstagramPost(t.post as Record<string, unknown>, thread));
        } else if (t.pk || t.code) {
          // The thread itself is a post
          posts.push(this.parseInstagramPost(t, thread));
        }
      }
    }

    // Extract pagination cursor
    const nextCursor = data.next_max_id 
      ? String(data.next_max_id) 
      : data.paging_tokens 
        ? String((data.paging_tokens as Record<string, unknown>).downward ?? '')
        : undefined;

    return { posts, nextCursor: nextCursor || undefined };
  }

  /**
   * Parse post from Instagram mobile API response.
   */
  private parseInstagramPost(postData: Record<string, unknown>, raw?: unknown): PostData {
    const user = (postData.user ?? {}) as Record<string, unknown>;
    const caption = (postData.caption ?? {}) as Record<string, unknown>;
    const textPostAppInfo = postData.text_post_app_info as Record<string, unknown> | undefined;

    return {
      id: String(postData.pk ?? postData.id ?? ''),
      code: String(postData.code ?? ''),
      text: String(caption.text ?? postData.text ?? ''),
      author: {
        id: String(user.pk ?? user.id ?? ''),
        username: String(user.username ?? ''),
        fullName: String(user.full_name ?? ''),
        profilePicUrl: user.profile_pic_url ? String(user.profile_pic_url) : undefined,
        isVerified: user.is_verified === true,
      },
      createdAt: this.parseTimestamp(postData.taken_at ?? postData.timestamp),
      likeCount: typeof postData.like_count === 'number' ? postData.like_count : undefined,
      replyCount: typeof textPostAppInfo?.direct_reply_count === 'number' 
        ? textPostAppInfo.direct_reply_count 
        : undefined,
      repostCount: typeof textPostAppInfo?.repost_count === 'number' 
        ? textPostAppInfo.repost_count 
        : undefined,
      media: this.parseMedia(postData),
      _raw: raw,
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
  UserSearchResult,
  FollowListResult,
  PublishOptions,
  PublishResult,
  ReplyControl,
} from './threads-client-types.js';
