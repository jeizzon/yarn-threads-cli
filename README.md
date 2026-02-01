# yarn-threads-cli

A fast, lightweight CLI for [Threads](https://threads.net) — read posts, browse profiles, search users, and more from your terminal.

```bash
yarn-threads whoami
# Jeizzon Mendes @jeizzon.mp4
# ✅ Authenticated successfully

yarn-threads about zuck
# Mark Zuckerberg @zuck
# ✔️ Verified
# 📋 Mostly superintelligence and MMA takes
# 5,444,367 followers | 460 following

yarn-threads user-posts zuck
# Posts by @zuck (15):
# Today we're establishing a new top-level initiative called Meta Compute...
```

## Features

- **Post, reply, quote** — Create posts, reply to threads, quote existing posts
- **Read posts** — Fetch any thread by URL or shortcode
- **Browse profiles** — View user info, posts, followers, following
- **Search users** — Find accounts by name or handle
- **View likes** — See your liked posts
- **Replies** — Get reply threads for any post
- **Cookie-based auth** — Uses your existing browser session (no OAuth needed)
- **Multiple output formats** — Human-friendly, plain text, or JSON

## Installation

```bash
npm install -g yarn-threads-cli
```

### From Source

```bash
git clone https://github.com/jeizzon/yarn-threads-cli.git
cd yarn-threads-cli
npm install
npm run build
npm link
```

## Authentication

yarn-threads-cli uses cookies from your browser to authenticate with Threads. You must be logged into Threads in your browser.

### Option 1: Chrome Profile (Recommended)

```bash
# Use default Chrome profile
yarn-threads whoami

# Use a specific Chrome profile directory
yarn-threads --chrome-profile-dir "/path/to/chrome/profile/Default" whoami

# Use Chrome profile by name
yarn-threads --chrome-profile "Profile 1" whoami
```

### Option 2: Firefox Profile

```bash
yarn-threads --firefox-profile "default-release" whoami
```

### Option 3: Manual Cookies

```bash
yarn-threads --session-id "YOUR_SESSION_ID" --csrf-token "YOUR_CSRF_TOKEN" whoami
```

Or via environment variables:
```bash
export THREADS_SESSION_ID="..."
export THREADS_CSRF_TOKEN="..."
yarn-threads whoami
```

### Cookie Extraction

The CLI automatically extracts cookies from Safari, Chrome, and Firefox. On macOS, it uses the system keychain to decrypt Chrome cookies.

## Commands

### `whoami` — Show authenticated user

```bash
yarn-threads whoami
yarn-threads whoami --json
```

### `about <handle>` — Get user profile

```bash
yarn-threads about zuck
yarn-threads about @mosseri
yarn-threads about 314216 --json  # by user ID
```

### `user-posts <handle>` — Get user's posts

```bash
yarn-threads user-posts zuck
yarn-threads user-posts mosseri --limit 5
```

### `read <url-or-code>` — Fetch a single post

```bash
yarn-threads read https://www.threads.net/@zuck/post/DTa3-B1EbTp
yarn-threads read DTa3-B1EbTp  # shortcode only
yarn-threads read 3812345678901234567  # post ID
```

### `replies <url-or-code>` — Get replies to a post

```bash
yarn-threads replies https://www.threads.net/@zuck/post/DTa3-B1EbTp
yarn-threads replies DTa3-B1EbTp --limit 10
```

### `thread <url-or-code>` — Full thread (post + replies)

```bash
yarn-threads thread https://www.threads.net/@zuck/post/DTa3-B1EbTp
```

### `search <query>` — Search for users

```bash
yarn-threads search "design"
yarn-threads search "AI" --limit 20
```

> **Note:** Search returns users, not posts (Instagram API limitation).

### `likes` — Get your liked posts

```bash
yarn-threads likes
yarn-threads likes --limit 50
```

### `followers <handle>` — Get user's followers

```bash
yarn-threads followers zuck
yarn-threads followers zuck --limit 100
```

### `following <handle>` — Get user's following list

```bash
yarn-threads following zuck
yarn-threads following jeizzon.mp4 --limit 50
```

### `post <text>` — Create a new post

```bash
yarn-threads post "Hello from the terminal!"
yarn-threads post "Only friends can reply" --reply-control accounts_you_follow
yarn-threads post "Mentioned only" --reply-control mentioned_only
```

**Reply control options:**
- `everyone` (default) — Anyone can reply
- `accounts_you_follow` — Only accounts you follow can reply
- `mentioned_only` — Only mentioned accounts can reply

### `reply <url-or-code> <text>` — Reply to a post

```bash
yarn-threads reply https://www.threads.net/@zuck/post/DTa3-B1EbTp "Great post!"
yarn-threads reply DTa3-B1EbTp "Nice one"  # shortcode
```

### `quote <url-or-code> <text>` — Quote a post

```bash
yarn-threads quote https://www.threads.net/@zuck/post/DTa3-B1EbTp "This is important"
yarn-threads quote DTa3-B1EbTp "Thoughts on this:"
```

## Output Formats

### Default (Human-Friendly)

```bash
yarn-threads about zuck
```

### Plain (No Emoji, No Color)

```bash
yarn-threads about zuck --plain
```

### JSON

```bash
yarn-threads about zuck --json
```

## Configuration

Create `~/.config/yarn/config.json5`:

```json5
{
  // Chrome profile directory (full path)
  chromeProfileDir: "/Users/you/.clawdbot/browser/clawd/user-data/Default",
  
  // Or Chrome profile name
  chromeProfile: "Default",
  
  // Firefox profile name
  firefoxProfile: "default-release",
  
  // Request timeout (ms)
  timeoutMs: 30000,
  
  // Cookie extraction timeout (ms)
  cookieTimeoutMs: 5000,
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `THREADS_SESSION_ID` | Session cookie value |
| `THREADS_CSRF_TOKEN` | CSRF token cookie value |
| `THREADS_USER_ID` | User ID cookie value |
| `NO_COLOR` | Disable colored output |

## Current Limitations

### Unavailable Commands

| Command | Status | Reason |
|---------|--------|--------|
| `home` | ❌ | Home timeline requires app-level authentication |
| `saved` | ❌ | Saved posts endpoint not publicly accessible |

### Search Limitations

- **Search returns users only** — The Instagram mobile API doesn't expose post search. Use the Threads web app for searching posts.

### Rate Limits

- The Instagram API may rate-limit requests if you make too many in a short period.
- If you encounter errors, wait a few minutes before retrying.

### Cookie Expiration

- Session cookies expire periodically. If authentication fails, log into Threads in your browser again.

## How It Works

yarn-threads-cli uses the Instagram mobile API (`i.instagram.com`) with your browser session cookies. This is the same API that the Threads mobile app uses.

**Why not the official Threads API?**

The [official Threads API](https://developers.facebook.com/docs/threads) requires:
- Meta developer app registration
- OAuth flow for authentication
- Access token management

The cookie-based approach works with your existing browser session — no app registration needed.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

## Credits

Inspired by [bird](https://github.com/steipete/bird-cli) (Twitter/X CLI) and [threads-api](https://github.com/junhoyeo/threads-api).

## License

MIT
