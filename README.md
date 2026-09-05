# @rmdes/indiekit-syndicator-bluesky

Bluesky syndicator for [Indiekit](https://getindiekit.com) with full support for likes, reposts, bookmarks, replies, and quote posts using the AT Protocol.

## Features

- Syndicates notes, articles, and photos to Bluesky
- Native likes and reposts for Bluesky URLs
- Threaded replies to Bluesky posts
- External like/repost support (syndicates as posts with link cards)
- Automatic rich text facet detection (@mentions, #hashtags, URLs)
- Open Graph link card embeds that reuse your site's pre-generated OG images
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

### Likes

- **Bluesky URLs**: Creates a native Bluesky like
- **External URLs**: Creates a post with a link card showing the liked content (if `syndicateExternalLikes: true`)

### Reposts

- **Bluesky URLs (no content)**: Creates a native Bluesky repost
- **Bluesky URLs (with content)**: Creates a quote post with your commentary
- **External URLs**: Creates a post with a link card showing the reposted content (if `syndicateExternalReposts: true`)

### Bookmarks

Creates a post with a link card showing the bookmarked URL, plus your commentary and permalink.

### Replies

A post whose `in-reply-to` is a Bluesky URL is syndicated as a genuine threaded reply,
appearing under the original post rather than as a standalone post that merely links to it.

The plugin fetches the parent post over the AT Protocol to obtain the `uri` and `cid` that
Bluesky's reply reference requires, then sets both `parent` and `root`. If the post you are
replying to is itself a reply, its existing `root` is reused, so your reply joins the
original thread instead of starting a new one.

Two details worth knowing:

- **Only Bluesky URLs thread.** The URL is matched by looking for `bsky.app` or `bluesky`
  in it. Replying to a Mastodon post, or to anything else, syndicates as an ordinary post.
- **Only regular posts thread.** Likes, reposts, and bookmarks are dispatched before reply
  resolution happens, so an `in-reply-to` alongside a `like-of` or `bookmark-of` is ignored.

If the parent cannot be resolved — deleted post, changed handle, rate limit — the error is
raised rather than swallowed. Indiekit marks the target as failed and the post can be
retried, instead of silently publishing an unthreaded reply. (Before v1.0.21 it did the
latter.)

## How It Works

The plugin uses the AT Protocol (`@atproto/api`) to:

1. Authenticate with your Bluesky account
2. Upload and compress images (if any)
3. Build post text with automatic facet detection
4. Fetch Open Graph metadata for link cards
5. Resolve the reply reference when replying to a Bluesky post
6. Create the appropriate post type (post, reply, like, repost, quote)
7. Return the syndicated post URL

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

Any post without photos gets a link card. The card points at the post's external URL
(the article, bookmark, or liked page) when there is one, and at the post's own permalink
when there isn't — so a plain note still shows a card linking back to your site.

Photos always win: a post with images embeds those instead, and no link card is shown.

The card's title and description always come from fetching that URL and reading its
`og:title` / `og:description`, falling back to `<title>` and `<meta name="description">`.

The thumbnail is sourced in two tiers:

1. **Your own posts** — the plugin uploads `<your-site>/og/<slug>.png`, the Open Graph
   image your site has already generated. It derives `<slug>` from the URL path, handling
   both `/notes/2026/02/18/slug` and `/content/type/2026-02-18-slug/`. This requires
   Indiekit's `publication.me` to be set, which it normally is.
2. **Everything else** — the page's own `og:image`.

If neither yields an image, the card ships without a thumbnail and Bluesky renders it as a
text-only card. The plugin does not generate a thumbnail of its own; it did until v1.0.22,
and the result was worse than what a site's own OG pipeline produces.

A missing `/og/<slug>.png` is safe: the upload is rejected unless the response is both OK
and an actual image, so a site that answers with an HTML 404 page falls through to tier 2
rather than uploading the error page as a thumbnail.

## Environment Variables

- `BLUESKY_PASSWORD` - Your Bluesky app password (required)

## Known Limitations

- Maximum 4 photos per post (Bluesky limit)
- Maximum 1MB per image (Bluesky limit, enforced via compression)
- Maximum 300 characters per post (Bluesky limit)
- App passwords expire if unused for 90+ days

## License

MIT
