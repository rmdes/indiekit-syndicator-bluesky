import { RichText } from "@atproto/api";
import { htmlToText } from "html-to-text";
import sharp from "sharp";
import { JSDOM } from "jsdom";

/**
 * Default OG image configuration
 */
const DEFAULT_OG_CONFIG = {
  width: 1200,
  height: 630,
  backgroundColor: "#1a1a2e", // Dark blue-purple
  textColor: "#ffffff",
  accentColor: "#e94560", // Coral/red accent
  fontFamily: "sans-serif",
  siteName: "rmendes.net",
};

const AT_URI = /at:\/\/(?<did>did:[^/]+)\/(?<type>[^/]+)\/(?<rkey>[^/]+)/;

/**
 * Escape XML special characters for SVG
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Wrap text into lines that fit within a width
 * @param {string} text - Text to wrap
 * @param {number} maxCharsPerLine - Maximum characters per line
 * @param {number} maxLines - Maximum number of lines
 * @returns {string[]} Array of lines
 */
function wrapText(text, maxCharsPerLine = 35, maxLines = 4) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if (lines.length >= maxLines) break;

    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Word is longer than max, truncate it
        lines.push(word.slice(0, maxCharsPerLine - 3) + "...");
        currentLine = "";
      }
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  // Add ellipsis to last line if we truncated
  if (lines.length === maxLines && words.length > lines.join(" ").split(/\s+/).length) {
    const lastLine = lines[maxLines - 1];
    if (lastLine.length > maxCharsPerLine - 3) {
      lines[maxLines - 1] = lastLine.slice(0, maxCharsPerLine - 3) + "...";
    } else if (!lastLine.endsWith("...")) {
      lines[maxLines - 1] = lastLine + "...";
    }
  }

  return lines;
}

/**
 * Generate a default OG image with title text
 * @param {string} title - Title text to display
 * @param {object} [options] - Configuration options
 * @param {string} [options.siteName] - Site name to display
 * @param {string} [options.backgroundColor] - Background color
 * @param {string} [options.textColor] - Text color
 * @param {string} [options.accentColor] - Accent color for decorations
 * @returns {Promise<Buffer>} PNG image buffer
 */
export async function generateDefaultOgImage(title, options = {}) {
  const config = { ...DEFAULT_OG_CONFIG, ...options };
  const { width, height, backgroundColor, textColor, accentColor, siteName } = config;

  // Wrap title into multiple lines
  const titleLines = wrapText(title, 35, 4);
  const fontSize = titleLines.length > 2 ? 48 : 56;
  const lineHeight = fontSize * 1.3;

  // Calculate vertical position to center the text block
  const textBlockHeight = titleLines.length * lineHeight;
  const startY = (height - textBlockHeight) / 2 + fontSize * 0.8;

  // Generate title text elements
  const titleElements = titleLines
    .map((line, i) => {
      const y = startY + i * lineHeight;
      return `<text x="${width / 2}" y="${y}" text-anchor="middle" font-size="${fontSize}" font-weight="bold" fill="${textColor}" font-family="${config.fontFamily}">${escapeXml(line)}</text>`;
    })
    .join("\n    ");

  // Create SVG
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="${backgroundColor}"/>

  <!-- Decorative elements -->
  <rect x="0" y="0" width="${width}" height="8" fill="${accentColor}"/>
  <rect x="0" y="${height - 80}" width="${width}" height="80" fill="${accentColor}" opacity="0.1"/>

  <!-- Decorative circles -->
  <circle cx="100" cy="100" r="200" fill="${accentColor}" opacity="0.05"/>
  <circle cx="${width - 100}" cy="${height - 100}" r="150" fill="${accentColor}" opacity="0.05"/>

  <!-- Title -->
  ${titleElements}

  <!-- Site name -->
  <text x="${width / 2}" y="${height - 30}" text-anchor="middle" font-size="24" fill="${textColor}" opacity="0.7" font-family="${config.fontFamily}">${escapeXml(siteName)}</text>
</svg>`;

  // Convert SVG to PNG using sharp
  const pngBuffer = await sharp(Buffer.from(svg))
    .png({ quality: 90 })
    .toBuffer();

  return pngBuffer;
}

/**
 * Convert plain text to rich text
 * @param {import("@atproto/api").Agent} client - AT Protocol agent
 * @param {string} text - Text to convert
 * @returns {Promise<RichText>} Rich text
 */
export const createRichText = async (client, text) => {
  const rt = new RichText({ text });
  await rt.detectFacets(client);
  return rt;
};

/**
 * Get post parts (UID and CID)
 * @param {string} url - Post URL
 * @returns {object} Parts
 */
export const getPostParts = (url) => {
  const pathParts = new URL(url).pathname.split("/");
  const did = pathParts[2];
  const rkey = pathParts[4];
  return { did, rkey };
};

/**
 * Convert Bluesky URI to post URL
 * @param {string} profileUrl - Profile URL
 * @param {string} uri - Bluesky URI
 * @returns {string|undefined} Post URL
 */
export const uriToPostUrl = (profileUrl, uri) => {
  const match = uri.match(AT_URI);
  if (match) {
    let { did, rkey, type } = match.groups;
    type = type.split(".").at(-1);
    return `${profileUrl}/${did}/${type}/${rkey}`;
  }
};

/**
 * Get post text from given JF2 properties
 * @param {object} properties - JF2 properties
 * @param {boolean} [includePermalink] - Include permalink in post
 * @returns {string} Post text
 */
export const getPostText = (properties, includePermalink) => {
  let text = "";

  if (properties.name && properties.name !== "") {
    text = `${properties.name} ${properties.url}`;
  } else if (properties.content?.html) {
    text = htmlToStatusText(properties.content.html);
  } else if (properties.content?.text) {
    text = properties.content.text;
  }

  // Truncate status if longer than 300 characters
  // ALWAYS include permalink when truncating so readers can see full post
  if (text.length > 300) {
    const suffix = `\n\n${properties.url}`;
    const maxLen = 300 - suffix.length - 3;
    text = text.slice(0, maxLen).trim() + "..." + suffix;
  } else if (includePermalink && !text.includes(properties.url)) {
    text = `${text}\n\n${properties.url}`;
  }

  return text;
};

/**
 * Get post text for a like of an external URL
 * @param {object} properties - JF2 properties
 * @param {string} likedUrl - The URL being liked
 * @returns {string} Post text
 */
export const getLikePostText = (properties, likedUrl) => {
  let text = "";

  // Get the content/comment
  if (properties.content?.html) {
    text = htmlToStatusText(properties.content.html);
  } else if (properties.content?.text) {
    text = properties.content.text;
  }

  // If there's content, append the liked URL
  if (text) {
    // Check if the URL is already in the text
    if (!text.includes(likedUrl)) {
      text = `${text}\n\n❤️ ${likedUrl}`;
    }
  } else {
    // No content, just post the liked URL with a heart
    text = `❤️ ${likedUrl}`;
  }

  // Truncate if needed (Bluesky limit is 300 chars)
  if (text.length > 300) {
    const suffix = `\n\n❤️ ${likedUrl}`;
    const maxLen = 300 - suffix.length - 3;
    const contentPart = text.replace(suffix, "").slice(0, maxLen).trim();
    text = contentPart + "..." + suffix;
  }

  return text;
};

/**
 * Constrain image buffer to be under 1MB
 * @param {Buffer} buffer - Image buffer
 * @param {number} maxBytes - Maximum byte length
 * @param {number} [quality] - Image quality
 * @returns {Promise<Buffer>} Compressed image
 */
export async function constrainImage(buffer, maxBytes, quality = 90) {
  const compressed = await sharp(buffer).jpeg({ quality }).toBuffer();
  if (compressed.byteLength > maxBytes) {
    return constrainImage(buffer, maxBytes, quality - 5);
  }
  return compressed;
}

/**
 * Compress image buffer to be under 1MB for Bluesky
 * @param {Buffer} buffer - Image buffer
 * @param {string} mimeType - Original MIME type
 * @returns {Promise<{buffer: Buffer, mimeType: string}>} Compressed image
 */
export async function getPostImage(buffer, mimeType) {
  const MAX_SIZE = 1024 * 1024; // 1MB
  if (buffer.length < MAX_SIZE) {
    return { buffer, mimeType };
  }
  const compressed = await constrainImage(buffer, MAX_SIZE);
  return { buffer: compressed, mimeType: "image/jpeg" };
}

/**
 * Convert HTML to plain text, appending last link href if present
 * @param {string} html - HTML
 * @returns {string} Text
 */
export const htmlToStatusText = (html) => {
  let hrefs = [...html.matchAll(/href="(https?:\/\/.+?)"/g)];
  const lastHref = hrefs.length > 0 ? hrefs.at(-1)[1] : false;

  const text = htmlToText(html, {
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" },
    ],
    wordwrap: false,
  });

  const statusText = lastHref ? `${text} ${lastHref}` : text;
  return statusText;
};

/**
 * Fetch OpenGraph metadata from a URL
 * @param {string} url - URL to fetch OG data from
 * @returns {Promise<{title: string, description: string, imageUrl: string|null}>} OG metadata
 */
export async function fetchOpenGraphData(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IndiekitBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      timeout: 10000,
    });

    if (!response.ok) {
      return { title: url, description: "", imageUrl: null };
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // Get OG title, fallback to regular title
    const ogTitle =
      doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
      doc.querySelector("title")?.textContent ||
      url;

    // Get OG description, fallback to meta description
    const ogDescription =
      doc
        .querySelector('meta[property="og:description"]')
        ?.getAttribute("content") ||
      doc.querySelector('meta[name="description"]')?.getAttribute("content") ||
      "";

    // Get OG image
    let ogImage =
      doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
      null;

    // Handle relative URLs for image
    if (ogImage && !ogImage.startsWith("http")) {
      const baseUrl = new URL(url);
      ogImage = new URL(ogImage, baseUrl.origin).href;
    }

    return {
      title: ogTitle.slice(0, 300), // Bluesky title limit
      description: ogDescription.slice(0, 1000), // Reasonable limit
      imageUrl: ogImage,
    };
  } catch (error) {
    console.error(`Failed to fetch OG data for ${url}:`, error.message);
    return { title: url, description: "", imageUrl: null };
  }
}

/**
 * Extract URLs from text using a comprehensive regex
 * @param {string} text - Text to search for URLs
 * @returns {Array<string>} Array of URLs found
 */
function extractUrlsFromText(text) {
  if (!text) return [];
  // Match URLs starting with http:// or https://
  // This regex is more permissive to catch URLs in plain text
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  const matches = text.match(urlRegex) || [];
  // Clean up trailing punctuation that might have been captured
  return matches.map((url) =>
    url.replace(/[.,;:!?)]+$/, "").replace(/\)+$/, "")
  );
}

/**
 * Extract the primary URL from post properties
 * @param {object} properties - JF2 properties
 * @param {string} [ownDomain] - Own domain to deprioritize (e.g., "rmendes.net")
 * @returns {string|null} Primary URL to create card for
 */
export function getExternalUrl(properties, ownDomain) {
  // For likes, use the liked URL
  if (properties["like-of"]) {
    return properties["like-of"];
  }

  // For bookmarks, use the bookmarked URL
  if (properties["bookmark-of"]) {
    return properties["bookmark-of"];
  }

  // For replies, use the in-reply-to URL
  if (properties["in-reply-to"]) {
    return properties["in-reply-to"];
  }

  // Collect all URLs from content
  let urls = [];

  // Extract from HTML href attributes (both single and double quotes)
  if (properties.content?.html) {
    const hrefMatches = [
      ...properties.content.html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi),
    ];
    urls.push(...hrefMatches.map((m) => m[1]));
  }

  // Extract plain text URLs from HTML content (for URLs not in anchors)
  if (properties.content?.html) {
    const plainUrls = extractUrlsFromText(properties.content.html);
    urls.push(...plainUrls);
  }

  // Extract from plain text content
  if (properties.content?.text) {
    const textUrls = extractUrlsFromText(properties.content.text);
    urls.push(...textUrls);
  }

  // Deduplicate URLs
  urls = [...new Set(urls)];

  if (urls.length === 0) {
    return null;
  }

  // If we have an ownDomain, try to find a URL that's NOT our own site first
  // but if all URLs are our own site, still return one (for OG cards of own content)
  if (ownDomain) {
    const externalUrls = urls.filter((url) => {
      try {
        const hostname = new URL(url).hostname;
        return !hostname.includes(ownDomain);
      } catch {
        return true;
      }
    });
    // Prefer external URLs, but fall back to own domain URLs
    if (externalUrls.length > 0) {
      return externalUrls.at(-1);
    }
  }

  // Return the last URL found (most likely to be the main link)
  return urls.at(-1);
}
