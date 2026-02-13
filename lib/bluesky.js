import { AtpAgent } from "@atproto/api";
import { getCanonicalUrl, isSameOrigin } from "@indiekit/util";

import {
  createRichText,
  getPostImage,
  getPostText,
  getLikePostText,
  getRepostPostText,
  getBookmarkPostText,
  buildPostText,
  getPostParts,
  uriToPostUrl,
  fetchOpenGraphData,
  getExternalUrl,
  generateDefaultOgImage,
  extractHtmlLinks,
  buildLinkFacets,
} from "./utils.js";

export class Bluesky {
  /**
   * @param {object} options - Syndicator options
   * @param {string} options.identifier - User identifier
   * @param {string} options.password - Password
   * @param {string} options.profileUrl - Profile URL
   * @param {string} options.serviceUrl - Service URL
   * @param {boolean} [options.includePermalink] - Include permalink in status
   * @param {boolean} [options.syndicateExternalLikes] - Syndicate likes of external URLs
   * @param {boolean} [options.syndicateExternalReposts] - Syndicate reposts of external URLs
   */
  constructor(options) {
    this.identifier = options.identifier;
    this.password = options.password;
    this.profileUrl = options.profileUrl;
    this.serviceUrl = options.serviceUrl;
    this.includePermalink = options.includePermalink || false;
    this.syndicateExternalLikes = options.syndicateExternalLikes !== false; // Default true
    this.syndicateExternalReposts = options.syndicateExternalReposts !== false; // Default true
  }

  /**
   * Initialise AT Protocol client
   * @access private
   * @returns {Promise<AtpAgent>} AT Protocol agent
   */
  async #client() {
    const { identifier, password, serviceUrl } = this;
    const agent = new AtpAgent({ service: serviceUrl });
    await agent.login({ identifier, password });
    return agent;
  }

  /**
   * Get a post
   * @param {string} postUrl - URL of post to like
   * @returns {Promise<object>} Bluesky post record
   */
  async getPost(postUrl) {
    const client = await this.#client();
    const postParts = getPostParts(postUrl);
    return await client.getPost({
      repo: postParts.did,
      rkey: postParts.rkey,
    });
  }

  /**
   * Post a like
   * @param {string} postUrl - URL of post to like
   * @returns {Promise<string>} Bluesky post URL
   */
  async postLike(postUrl) {
    const client = await this.#client();
    const post = await this.getPost(postUrl);
    const like = await client.like(post.uri, post.cid);
    return uriToPostUrl(this.profileUrl, like.uri);
  }

  /**
   * Post a repost
   * @param {string} postUrl - URL of post to repost
   * @returns {Promise<string>} Bluesky post URL
   */
  async postRepost(postUrl) {
    const client = await this.#client();
    const post = await this.getPost(postUrl);
    const repost = await client.repost(post.uri, post.cid);
    return uriToPostUrl(this.profileUrl, repost.uri);
  }

  /**
   * Post a quote post
   * @param {string} postUrl - URL of post to quote
   * @param {object} richText - Rich text
   * @param {Array} [images] - Images
   * @returns {Promise<string>} Bluesky post URL
   */
  async postQuotePost(postUrl, richText, images) {
    const client = await this.#client();
    const post = await this.getPost(postUrl);

    const record = {
      $type: "app.bsky.embed.record",
      record: { uri: post.uri, cid: post.cid },
    };

    const media = {
      $type: "app.bsky.embed.images",
      images,
    };

    const recordWithMedia = {
      $type: "app.bsky.embed.recordWithMedia",
      record,
      media,
    };

    const embed = images?.length > 0 ? recordWithMedia : record;

    const postData = {
      $type: "app.bsky.feed.post",
      text: richText.text,
      facets: richText.facets,
      createdAt: new Date().toISOString(),
      embed,
    };

    const quotePost = await client.post(postData);
    return uriToPostUrl(this.profileUrl, quotePost.uri);
  }

  /**
   * Upload image from URL (for OG thumbnails)
   * @param {string} imageUrl - URL of image to upload
   * @returns {Promise<object|null>} Blob reference or null
   */
  async uploadImageFromUrl(imageUrl) {
    if (!imageUrl) return null;

    try {
      const client = await this.#client();
      const response = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; IndiekitBot/1.0)",
        },
        redirect: "follow",
      });

      if (!response.ok) return null;

      let blob = await response.blob();
      let encoding = response.headers.get("Content-Type") || "image/jpeg";

      // Reject non-image responses (e.g. HTML error pages, login redirects)
      if (!encoding.startsWith("image/")) return null;

      // Compress if needed
      if (encoding?.startsWith("image/")) {
        const buffer = Buffer.from(await blob.arrayBuffer());
        const image = await getPostImage(buffer, encoding);
        blob = new Blob([new Uint8Array(image.buffer)], {
          type: image.mimeType,
        });
        encoding = image.mimeType;
      }

      const uploadResponse = await client.com.atproto.repo.uploadBlob(blob, {
        encoding,
      });

      return uploadResponse.data.blob;
    } catch (error) {
      console.error(`Failed to upload OG image: ${error.message}`);
      return null;
    }
  }

  /**
   * Create external link embed
   * @param {string} url - External URL
   * @param {object} [options] - Options
   * @param {boolean} [options.generateDefaultImage] - Generate default image if no OG image
   * @param {string} [options.siteName] - Site name for default image
   * @returns {Promise<object|null>} External embed or null
   */
  async createExternalEmbed(url, options = {}) {
    if (!url) return null;

    const { generateDefaultImage = true, siteName } = options;

    try {
      const ogData = await fetchOpenGraphData(url);
      let thumb = null;

      if (ogData.imageUrl) {
        // Use the OG image from the URL
        thumb = await this.uploadImageFromUrl(ogData.imageUrl);
      }

      // Fall back to generated default image if no OG image or upload failed
      if (!thumb && generateDefaultImage && ogData.title && ogData.title !== url) {
        // Generate a default image with the title
        try {
          const defaultImageBuffer = await generateDefaultOgImage(ogData.title, {
            siteName: siteName || new URL(url).hostname,
          });
          const client = await this.#client();
          const uploadResponse = await client.com.atproto.repo.uploadBlob(
            new Blob([new Uint8Array(defaultImageBuffer)], { type: "image/png" }),
            { encoding: "image/png" }
          );
          thumb = uploadResponse.data.blob;
        } catch (imageError) {
          console.error(`Failed to generate default OG image: ${imageError.message}`);
          // Continue without thumb
        }
      }

      return {
        $type: "app.bsky.embed.external",
        external: {
          uri: url,
          title: ogData.title || url,
          description: ogData.description || "",
          ...(thumb && { thumb }),
        },
      };
    } catch (error) {
      console.error(`Failed to create external embed: ${error.message}`);
      return null;
    }
  }

  /**
   * Post a regular post
   * @param {object} richText - Rich text
   * @param {object} [options] - Post options
   * @param {Array} [options.images] - Images
   * @param {object} [options.externalEmbed] - External link embed
   * @returns {Promise<string>} Bluesky post URL
   */
  async postPost(richText, options = {}) {
    const client = await this.#client();
    const { images, externalEmbed } = options;

    // Determine embed type - images take priority over external
    let embed = null;
    if (images?.length > 0) {
      embed = {
        $type: "app.bsky.embed.images",
        images,
      };
    } else if (externalEmbed) {
      embed = externalEmbed;
    }

    const postData = {
      $type: "app.bsky.feed.post",
      text: richText.text,
      facets: richText.facets,
      createdAt: new Date().toISOString(),
      ...(embed && { embed }),
    };

    const post = await client.post(postData);
    return uriToPostUrl(this.profileUrl, post.uri);
  }

  /**
   * Upload media
   * @param {object} media - JF2 media object
   * @param {string} me - Publication URL
   * @returns {Promise<object>} Blob reference for the uploaded media
   */
  async uploadMedia(media, me) {
    const client = await this.#client();
    const { url } = media;

    if (typeof url !== "string") {
      return;
    }

    try {
      const mediaUrl = getCanonicalUrl(url, me);
      const mediaResponse = await fetch(mediaUrl);

      if (!mediaResponse.ok) {
        throw new Error(`Failed to fetch media: ${mediaResponse.status} ${mediaResponse.statusText}`);
      }

      let blob = await mediaResponse.blob();
      let encoding = mediaResponse.headers.get("Content-Type");

      if (encoding?.startsWith("image/")) {
        const buffer = Buffer.from(await blob.arrayBuffer());
        const image = await getPostImage(buffer, encoding);
        blob = new Blob([new Uint8Array(image.buffer)], {
          type: image.mimeType,
        });
        encoding = image.mimeType;
      }

      const response = await client.com.atproto.repo.uploadBlob(blob, {
        encoding,
      });

      return response.data.blob;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Post to Bluesky
   * @param {object} properties - JF2 properties
   * @param {string} me - Publication URL
   * @returns {Promise<string|boolean>} URL of syndicated status
   */
  async post(properties, me) {
    try {
      const client = await this.#client();

      // Upload photos
      let images = [];
      if (properties.photo) {
        const photos = properties.photo.slice(0, 4);
        const uploads = photos.map(async (photo) => ({
          alt: photo.alt || "",
          image: await this.uploadMedia(photo, me),
        }));
        images = await Promise.all(uploads);
      }

      // Handle reposts
      const repostUrl = properties["repost-of"];
      if (repostUrl) {
        if (isSameOrigin(repostUrl, this.profileUrl) && properties.content) {
          const text = getPostText(properties, this.includePermalink);
          const richText = await createRichText(client, text);
          return this.postQuotePost(repostUrl, richText, images);
        }
        if (isSameOrigin(repostUrl, this.profileUrl)) {
          return this.postRepost(repostUrl);
        }

        // Syndicate reposts of external URLs as posts with link card
        if (this.syndicateExternalReposts) {
          const text = getRepostPostText(properties, repostUrl);
          const richText = await createRichText(client, text);
          const externalEmbed = await this.createExternalEmbed(repostUrl);
          return this.postPost(richText, { images, externalEmbed });
        }

        return;
      }

      // Handle likes
      const likeOfUrl = properties["like-of"];
      if (likeOfUrl) {
        // Native Bluesky like for Bluesky URLs
        if (isSameOrigin(likeOfUrl, this.profileUrl)) {
          return this.postLike(likeOfUrl);
        }

        // Syndicate likes of external URLs as posts with link card
        if (this.syndicateExternalLikes) {
          const text = getLikePostText(properties, likeOfUrl);
          const richText = await createRichText(client, text);
          // Create external embed for the liked URL
          const externalEmbed = await this.createExternalEmbed(likeOfUrl);
          return this.postPost(richText, { images, externalEmbed });
        }

        // Don't syndicate if option is disabled
        return;
      }

      // Handle bookmarks - OG card shows bookmarked URL, text has commentary + permalink
      const bookmarkOfUrl = properties["bookmark-of"];
      if (bookmarkOfUrl) {
        const text = getBookmarkPostText(properties, bookmarkOfUrl);
        const richText = await createRichText(client, text);
        const externalEmbed = await this.createExternalEmbed(bookmarkOfUrl);
        return this.postPost(richText, { images, externalEmbed });
      }

      // Regular post - determine external URL and build text accordingly
      const externalUrl = getExternalUrl(properties);
      const text = buildPostText(properties, { externalUrl });

      // Build link facets from HTML content (makes display text clickable)
      let linkFacets = [];
      if (properties.content?.html) {
        const htmlLinks = extractHtmlLinks(properties.content.html);
        linkFacets = buildLinkFacets(text, htmlLinks);
      }

      const richText = await createRichText(client, text, linkFacets);

      // Create OG embed:
      // - External URL exists → use it as OG card (permalink is in text)
      // - No external URL → use permalink as OG card
      let externalEmbed = null;
      if (!images?.length) {
        const embedUrl = externalUrl || properties.url;
        if (embedUrl) {
          externalEmbed = await this.createExternalEmbed(embedUrl);
        }
      }

      return this.postPost(richText, { images, externalEmbed });
    } catch (error) {
      throw new Error(error.message);
    }
  }
}
