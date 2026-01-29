/**
 * Dynamic doc_id extraction and caching for Threads GraphQL API.
 * Doc IDs change frequently, so we extract them from the Threads web app.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

const CACHE_DIR = join(homedir(), '.config', 'yarn');
const CACHE_FILE = join(CACHE_DIR, 'doc-ids.json');
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Fallback doc_ids if extraction fails (may be stale)
const FALLBACK_DOC_IDS: DocIds = {
  userByUsername: '23996318473300828',
  userData: '9360915773983802',
  threadDetail: '6529829603744567',
  threadReplies: '6684830921547925',
  homeTimeline: '7846151975432989',
  userThreads: '6232751443445612',
  likedThreads: '9360047727362754',
  savedThreads: '6354918684616234',
  followers: '7707543692631249',
  following: '7050524464970894',
  searchThreads: '6529829603744567',
};

export interface DocIds {
  userByUsername: string;
  userData: string;
  threadDetail: string;
  threadReplies: string;
  homeTimeline: string;
  userThreads: string;
  likedThreads: string;
  savedThreads: string;
  followers: string;
  following: string;
  searchThreads: string;
}

interface CachedDocIds {
  docIds: DocIds;
  timestamp: number;
  lsdToken?: string;
}

/**
 * Extract doc_ids from Threads web app JavaScript bundles.
 */
async function extractDocIdsFromWeb(): Promise<{ docIds: Partial<DocIds>; lsdToken?: string }> {
  const docIds: Partial<DocIds> = {};
  let lsdToken: string | undefined;

  try {
    // Fetch the Threads homepage
    const response = await fetch('https://www.threads.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // Extract LSD token
    const lsdMatch = html.match(/"LSD",\[\],\{"token":"([^"]+)"/);
    if (lsdMatch) {
      lsdToken = lsdMatch[1];
    }

    // Find JavaScript bundle URLs
    const scriptMatches = html.matchAll(/src="(https:\/\/static\.cdninstagram\.com\/rsrc\.php\/[^"]+\.js)"/g);
    const scriptUrls = Array.from(scriptMatches).map(m => m[1]).slice(0, 10); // Limit to first 10 scripts

    // Known query name to doc_id mappings we're looking for
    const queryMappings: Record<string, keyof DocIds> = {
      'BarcelonaProfileRootQuery': 'userByUsername',
      'BarcelonaProfileThreadsTabQuery': 'userThreads',
      'BarcelonaProfileRepliesTabQuery': 'threadReplies',
      'BarcelonaPostPageQuery': 'threadDetail',
      'BarcelonaFeedTimelineQuery': 'homeTimeline',
      'BarcelonaSearchResultsQuery': 'searchThreads',
    };

    // Search each script for doc_ids
    for (const url of scriptUrls) {
      try {
        const scriptResponse = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        });
        
        if (!scriptResponse.ok) continue;
        
        const scriptContent = await scriptResponse.text();

        // Look for patterns like: "doc_id":"1234567890"
        // or: queryId:"1234567890"
        // often near query names
        for (const [queryName, docIdKey] of Object.entries(queryMappings)) {
          // Pattern: queryName followed by doc_id within ~500 chars
          const pattern = new RegExp(queryName + '[\\s\\S]{0,500}(?:doc_id|queryId)["\']?\\s*[:\\/]\\s*["\']?(\\d{15,20})', 'i');
          const match = scriptContent.match(pattern);
          if (match && match[1]) {
            docIds[docIdKey] = match[1];
          }
        }

        // Also try reverse: doc_id followed by query name
        const docIdMatches = scriptContent.matchAll(/(?:doc_id|queryId)["\']?\s*[:\\/]\s*["']?(\d{15,20})/g);
        for (const match of docIdMatches) {
          const docId = match[1];
          // Check if any query name is nearby (within 200 chars before or after)
          const idx = match.index ?? 0;
          const context = scriptContent.slice(Math.max(0, idx - 200), idx + 200);
          
          for (const [queryName, docIdKey] of Object.entries(queryMappings)) {
            if (context.includes(queryName) && !docIds[docIdKey]) {
              docIds[docIdKey] = docId;
            }
          }
        }
      } catch {
        // Skip failed script fetches
        continue;
      }
    }

    return { docIds, lsdToken };
  } catch (error) {
    console.error('Failed to extract doc_ids from web:', error);
    return { docIds: {} };
  }
}

/**
 * Load cached doc_ids if they exist and are fresh.
 */
async function loadCachedDocIds(): Promise<CachedDocIds | null> {
  try {
    const data = await readFile(CACHE_FILE, 'utf-8');
    const cached = JSON.parse(data) as CachedDocIds;
    
    // Check if cache is still fresh
    if (Date.now() - cached.timestamp < CACHE_MAX_AGE_MS) {
      return cached;
    }
  } catch {
    // Cache doesn't exist or is invalid
  }
  return null;
}

/**
 * Save doc_ids to cache.
 */
async function saveCachedDocIds(docIds: DocIds, lsdToken?: string): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    const cached: CachedDocIds = {
      docIds,
      timestamp: Date.now(),
      lsdToken,
    };
    await writeFile(CACHE_FILE, JSON.stringify(cached, null, 2));
  } catch (error) {
    console.error('Failed to cache doc_ids:', error);
  }
}

/**
 * Get doc_ids, either from cache or by extracting from web.
 */
export async function getDocIds(forceRefresh = false): Promise<{ docIds: DocIds; lsdToken?: string }> {
  // Try cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = await loadCachedDocIds();
    if (cached) {
      return { docIds: cached.docIds, lsdToken: cached.lsdToken };
    }
  }

  // Extract from web
  console.error('🔄 Refreshing Threads API doc_ids...');
  const { docIds: extracted, lsdToken } = await extractDocIdsFromWeb();

  // Merge with fallbacks for any missing IDs
  const merged: DocIds = { ...FALLBACK_DOC_IDS };
  for (const [key, value] of Object.entries(extracted)) {
    if (value) {
      merged[key as keyof DocIds] = value;
    }
  }

  // Cache the result
  await saveCachedDocIds(merged, lsdToken);

  const extractedCount = Object.keys(extracted).length;
  if (extractedCount > 0) {
    console.error(`✅ Extracted ${extractedCount} fresh doc_ids`);
  } else {
    console.error('⚠️  Could not extract doc_ids, using fallbacks (may be stale)');
  }

  return { docIds: merged, lsdToken };
}

/**
 * Clear the doc_id cache (forces refresh on next use).
 */
export async function clearDocIdCache(): Promise<void> {
  try {
    const { unlink } = await import('fs/promises');
    await unlink(CACHE_FILE);
  } catch {
    // File doesn't exist, that's fine
  }
}
