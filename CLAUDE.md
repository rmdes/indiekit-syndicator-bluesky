# CLAUDE.md - @rmdes/indiekit-syndicator-bluesky

## Package Overview

`@rmdes/indiekit-syndicator-bluesky` is an Indiekit plugin that syndicates posts to Bluesky using the AT Protocol. It handles text posts, photos, likes, reposts, bookmarks, and quote posts, with automatic rich text facet detection (mentions, hashtags, URLs) and Open Graph embed card generation.

**Key Capabilities:**
- Syndicates IndieWeb post types to Bluesky (notes, articles, photos)
- Native Bluesky likes/reposts for Bluesky URLs
- External like/repost syndication as posts with OG link cards
- Rich text facets (auto-detects @mentions, #hashtags, URLs)
- Image compression and upload (max 4 images, 1MB each)
- Open Graph metadata fetching and thumbnail generation
- Smart URL handling (removes URLs shown in OG cards from text)

**Version:** 1.0.9
**npm:** `@rmdes/indiekit-syndicator-bluesky`

## Architecture

### AT Protocol Integration

Built on `@atproto/api` (v0.14.0), using:
- `AtpAgent` for authentication and session management
- `RichText` class for automatic facet detection (mentions, hashtags, links)
- `app.bsky.feed.post` lexicon for creating posts
- `app.bsky.embed.images` for photo embeds
- `app.bsky.embed.external` for link card embeds
- `app.bsky.embed.record` for quote posts
- `app.bsky.embed.recordWithMedia` for quote posts with images

### Data Flow

```
JF2 properties → Bluesky.post()
  ├─ Upload photos → uploadMedia() → compress with sharp → AtpAgent.uploadBlob()
  ├─ Detect post type (like-of, repost-of, bookmark-of, regular)
  ├─ Build text → createRichText() → RichText.detectFacets()
  ├─ Fetch OG data → fetchOpenGraphData() → createExternalEmbed()
  └─ Post via AtpAgent → return syndicated URL
```

### Post Type Dispatch

| JF2 Property | Bluesky Action | Embed Type |
|--------------|----------------|------------|
| `repost-of` (Bluesky URL) + content | Quote post | `embed.record` + images |
| `repost-of` (Bluesky URL) | Native repost | (none) |
| `repost-of` (external URL) | Post with OG card | `embed.external` |
| `like-of` (Bluesky URL) | Native like | (none) |
| `like-of` (external URL) | Post with OG card | `embed.external` |
| `bookmark-of` | Post with OG card | `embed.external` |
| Regular post with photos | Post with images | `embed.images` |
| Regular post with external URL | Post with OG card | `embed.external` |
| Regular post without external URL | Post with permalink OG card | `embed.external` |

### Text Building Logic

**Two modes:**
1. **External URL exists** (article link, bookmark, etc.)
   - Remove external URL from text (shown as OG card)
   - Append permalink to original post (for webmentions)
   - Truncate to 300 chars

2. **No external URL** (note, photo post, etc.)
   - Content only (permalink shown as OG card)
   - No need to duplicate permalink in text
   - Truncate to 300 chars

Implemented in `buildPostText()` and `getExternalUrl()`.

## Key Files

### index.js

Entry point. Exports `BlueskySyndicator` class with Indiekit plugin interface:
- `constructor(options)` - Accepts configuration
- `get info()` - Returns syndicator metadata for UI
- `get environment()` - Declares required env vars
- `async syndicate(properties, publication)` - Called by Indiekit to syndicate posts
- `init(Indiekit)` - Registers plugin with Indiekit

### lib/bluesky.js

Core logic. `Bluesky` class methods:
- `post(properties, me)` - Main dispatch method
- `uploadMedia(media, me)` - Fetches and uploads images
- `postPost(richText, options)` - Creates regular posts
- `postLike(postUrl)` - Native Bluesky likes
- `postRepost(postUrl)` - Native Bluesky reposts
- `postQuotePost(postUrl, richText, images)` - Quote posts
- `createExternalEmbed(url, options)` - Fetches OG data and creates link card
- `uploadImageFromUrl(imageUrl)` - Uploads OG thumbnail images

### lib/utils.js

Utility functions:
- `createRichText(client, text)` - Wraps RichText facet detection
- `buildPostText(properties, options)` - Builds post text (main logic)
- `getExternalUrl(properties, ownDomain)` - Extracts primary URL for OG card
- `getLikePostText()` / `getRepostPostText()` / `getBookmarkPostText()` - Text builders for specific post types
- `removeUrlFromText(text, url)` - Removes URL and cleanup prefixes (Réf, via, source, →)
- `getContentText(properties)` - Extracts plain text from JF2 properties
- `htmlToStatusText(html)` - Converts HTML to plain text, appends last link
- `fetchOpenGraphData(url)` - Fetches OG title/description/image from HTML
- `generateDefaultOgImage(title, options)` - Generates PNG thumbnail from title text via SVG+sharp
- `getPostImage(buffer, mimeType)` - Compresses images to <1MB
- `constrainImage(buffer, maxBytes, quality)` - Recursive compression
- `getPostParts(url)` - Extracts DID and rkey from Bluesky URL
- `uriToPostUrl(profileUrl, uri)` - Converts AT URI to web URL

## Configuration

### Constructor Options

```js
{
  handle: "",                      // Bluesky handle (without @)
  password: process.env.BLUESKY_PASSWORD,
  profileUrl: "https://bsky.app/profile",
  serviceUrl: "https://bsky.social",
  includePermalink: false,         // Always append permalink to text
  syndicateExternalLikes: true,    // Post external likes as posts with OG cards
  syndicateExternalReposts: true,  // Post external reposts as posts with OG cards
  checked: false,                  // Pre-check in Indiekit UI
}
```

### Environment Variables

- `BLUESKY_PASSWORD` - Bluesky app password (required)

Handle must be provided via plugin config.

## Inter-Plugin Relationships

**Depends on:**
- `@indiekit/indiekit` - Core plugin API
- `@indiekit/error` - Error handling
- `@indiekit/util` - `getCanonicalUrl()`, `isSameOrigin()`

**Syndication flow:**
1. User creates post via Micropub (`@indiekit/endpoint-micropub`)
2. Post is saved with `syndicate-to[]` targeting Bluesky
3. Indiekit calls `BlueskySyndicator.syndicate(properties, publication)`
4. Plugin posts to Bluesky, returns syndicated URL
5. URL is saved as `syndication` property in post file

## Known Gotchas

### Rich Text Facet Detection

The `RichText.detectFacets()` method from `@atproto/api` MUST be called with the agent as the first parameter for mention resolution. It makes network requests to resolve handles to DIDs.

```js
const rt = new RichText({ text });
await rt.detectFacets(client); // MUST pass agent for @mention resolution
```

### Image Compression

Bluesky enforces a 1MB limit per image. The plugin uses `sharp` to compress images recursively, starting at 90% quality and reducing by 5% each iteration until under 1MB. This can be slow for large images (5-10MB+).

### AT URIs vs Web URLs

Bluesky APIs return AT URIs (`at://did:plc:abc123/app.bsky.feed.post/xyz789`). These must be converted to web URLs for storage. Use `uriToPostUrl()` to convert.

### External Like/Repost Behavior

When `syndicateExternalLikes` or `syndicateExternalReposts` is `false`, the plugin returns `undefined` instead of posting. Indiekit interprets this as "syndication not applicable" (not an error).

### OG Image Generation

If an external URL has no OG image, the plugin generates a default thumbnail using SVG + sharp. This requires:
- `sharp` with all image format dependencies installed
- Sufficient memory for SVG rasterization
- Text wrapping logic to fit titles in 4 lines max

Generation can be disabled by passing `{ generateDefaultImage: false }` to `createExternalEmbed()`.

### URL Extraction Priority

`getExternalUrl()` extracts URLs from content in this order:
1. `like-of`, `bookmark-of`, `in-reply-to` properties (if present)
2. `href` attributes in HTML content
3. Plain text URLs in HTML content
4. Plain text URLs in text content

It returns the LAST URL found (most likely to be the main link). If `ownDomain` is provided, it prefers external URLs but falls back to own-domain URLs if no external URLs exist.

### Character Limit

Bluesky enforces a 300-character limit on post text. The plugin truncates and appends "..." + permalink if needed. The truncation logic accounts for permalink length.

### Photo Limit

Bluesky supports max 4 photos per post. The plugin slices `properties.photo` to the first 4.

## Dependencies

**Core:**
- `@atproto/api` ^0.14.0 - AT Protocol SDK
- `sharp` ^0.33.0 - Image compression and SVG rasterization
- `html-to-text` ^9.0.0 - HTML to plain text conversion
- `jsdom` ^24.0.0 - HTML parsing for OG metadata

**Peer:**
- `@indiekit/indiekit` 1.x
- `@indiekit/error` ^1.0.0-beta.25
- `@indiekit/util` ^1.0.0-beta.25

## Testing Notes

Manual testing against real Bluesky API is required. No automated test suite exists.

**Test cases:**
- Note with text only
- Note with photos (1-4 images)
- Article with external URL (should create OG card)
- Like of Bluesky post (native like)
- Like of external URL (post with OG card)
- Repost of Bluesky post (native repost)
- Repost of external URL (post with OG card)
- Quote post (Bluesky URL + content)
- Bookmark with OG card
- Post with @mentions and #hashtags (check facets)
- Post with large images (check compression)
- Post with no OG image (check default generation)
