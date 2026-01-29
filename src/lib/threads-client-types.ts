/**
 * Type definitions for the Threads API client.
 */

import type { ThreadsCookies } from './cookies.js';

// Client options
export interface ThreadsClientOptions {
  cookies: ThreadsCookies;
  timeoutMs?: number;
}

// Result types using discriminated unions
export type SimpleResult =
  | { success: true }
  | { success: false; error: string };

export type ResultWithId =
  | { success: true; id: string }
  | { success: false; error: string };

// User data
export interface UserData {
  id: string;
  username: string;
  fullName: string;
  bio?: string;
  bioLinks?: Array<{ url: string; title?: string }>;
  profilePicUrl?: string;
  followerCount?: number;
  followingCount?: number;
  threadCount?: number;
  isPrivate?: boolean;
  isVerified?: boolean;
  _raw?: unknown;
}

export type GetUserResult =
  | { success: true; user: UserData }
  | { success: false; error: string };

// Post/Thread data
export interface PostMedia {
  type: 'image' | 'video' | 'carousel';
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  videoUrl?: string;
}

export interface PostData {
  id: string;
  code: string; // Short code for URL
  text: string;
  textLinks?: Array<{ start: number; end: number; url: string }>;
  author: {
    id: string;
    username: string;
    fullName: string;
    profilePicUrl?: string;
    isVerified?: boolean;
  };
  createdAt: string;
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
  quotedPost?: PostData;
  media?: PostMedia[];
  isReply?: boolean;
  replyToPostId?: string;
  _raw?: unknown;
}

export type GetPostResult =
  | { success: true; post: PostData }
  | { success: false; error: string };

export type GetPostsResult =
  | { success: true; posts: PostData[]; nextCursor?: string }
  | { success: false; error: string; posts?: PostData[]; nextCursor?: string };

// Feed/timeline results
export type FeedResult =
  | { success: true; posts: PostData[]; nextCursor?: string }
  | { success: false; error: string };

// Search results
export type SearchResult =
  | { success: true; posts: PostData[]; nextCursor?: string }
  | { success: false; error: string };

export type UserSearchResult =
  | { success: true; users: UserData[]; nextCursor?: string }
  | { success: false; error: string };

// Following/Followers results
export type FollowListResult =
  | { success: true; users: UserData[]; nextCursor?: string }
  | { success: false; error: string };

// Whoami result
export type WhoamiResult =
  | { success: true; user: UserData }
  | { success: false; error: string };
