# @rmdes/indiekit-syndicator-bluesky

Bluesky syndicator for [Indiekit](https://getindiekit.com) with full support for likes, reposts, bookmarks, and quote posts using the AT Protocol.

## Features

- Syndicates notes, articles, and photos to Bluesky
- Native likes and reposts for Bluesky URLs
- External like/repost support (syndicates as posts with link cards)
- Automatic rich text facet detection (@mentions, #hashtags, URLs)
- Open Graph link card embeds with thumbnail generation
- Image compression and upload (up to 4 images per post)
- Smart URL handling (removes URLs shown in OG cards from text)
- Quote posts with optional images

## Installation

```bash
npm install @rmdes/indiekit-syndicator-bluesky
```

## Requirements

- Bluesky account
- Bluesky app password (generate at Settings → App Passwords in the Bluesky app)

## Usage

Add to your Indiekit configuration:

```js
export default {
  plugins: ["@rmdes/indiekit-syndicator-bluesky"],
  "@rmdes/indiekit-syndicator-bluesky": {
    handle: "yourhandle.bsky.social",
    checked: true,
  },
};
```

Set your app password as an environment variable:

```bash
export BLUESKY_PASSWORD="your-app-password"
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `handle` | string | `""` | Your Bluesky handle (without the @) |
| `password` | string | `process.env.BLUESKY_PASSWORD` | Bluesky app password |
| `profileUrl` | string | `"https://bsky.app/profile"` | Bluesky profile URL base |
| `serviceUrl` | string | `"https://bsky.social"` | Bluesky service URL |
| `includePermalink` | boolean | `false` | Always append permalink to post text |
| `syndicateExternalLikes` | boolean | `true` | Syndicate likes of external URLs as posts with link cards |
| `syndicateExternalReposts` | boolean | `true` | Syndicate reposts of external URLs as posts with link cards |
| `checked` | boolean | `false` | Pre-check syndicator in Indiekit UI |

## Post Type Support

### Regular Posts (Notes, Articles, Photos)

Text posts, articles with links, and photo posts are syndicated to Bluesky as regular posts. The plugin automatically:
- Converts HTML content to plain text
- Detects and creates rich text facets (@mentions, #hashtags, links)
- Compresses and uploads up to 4 photos
- Creates Open Graph link cards for external URLs
- Generates default thumbnails if no OG image exists

### Likes

- **Bluesky URLs**: Creates a native Bluesky like
- **External URLs**: Creates a post with a link card showing the liked content (if `syndicateExternalLikes: true`)

### Reposts

- **Bluesky URLs (no content)**: Creates a native Bluesky repost
- **Bluesky URLs (with content)**: Creates a quote post with your commentary
- **External URLs**: Creates a post with a link card showing the reposted content (if `syndicateExternalReposts: true`)

### Bookmarks

Creates a post with a link card showing the bookmarked URL, plus your commentary and permalink.

## How It Works

The plugin uses the AT Protocol (`@atproto/api`) to:

1. Authenticate with your Bluesky account
2. Upload and compress images (if any)
3. Build post text with automatic facet detection
4. Fetch Open Graph metadata for link cards
5. Create the appropriate post type (post, like, repost, quote)
6. Return the syndicated post URL

## Text Handling

Bluesky has a 300-character limit. The plugin:
- Converts HTML to plain text
- Removes URLs that will be shown in OG cards (to save space)
- Appends your blog permalink (for webmentions)
- Truncates if needed, preserving the permalink

## Image Handling

Images are automatically:
- Fetched from your site
- Compressed to under 1MB (Bluesky limit)
- Uploaded to Bluesky
- Limited to 4 per post (Bluesky limit)

## Link Card Embeds

For posts with external URLs (articles, bookmarks, likes of external URLs), the plugin:
1. Fetches Open Graph metadata (title, description, image)
2. Uploads the OG image as a thumbnail
3. If no OG image exists, generates a default thumbnail with the title text
4. Creates a link card embed

## Environment Variables

- `BLUESKY_PASSWORD` - Your Bluesky app password (required)

## Known Limitations

- Maximum 4 photos per post (Bluesky limit)
- Maximum 1MB per image (Bluesky limit, enforced via compression)
- Maximum 300 characters per post (Bluesky limit)
- App passwords expire if unused for 90+ days

## License

MIT
