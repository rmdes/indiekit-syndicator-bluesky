import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { Bluesky } from "../lib/bluesky.js";

/**
 * Serve a page with a title but deliberately no og:image, so the embed has
 * to fall through every thumbnail tier.
 * @param {string} html - Page markup to serve
 * @returns {Promise<object>} Server handle and its URL
 */
const serve = (html) =>
  new Promise((resolve) => {
    const server = createServer((request, response) => {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end(html);
    });
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}/` }),
    );
  });

test("external embed without og:image yields a thumbless card", async () => {
  const { server, url } = await serve(
    `<html><head>
       <title>Fallback title</title>
       <meta name="description" content="No image here">
     </head><body>hi</body></html>`,
  );

  try {
    // No handle or password: an authenticated call would throw, proving the
    // embed no longer needs a client when the target page has no image.
    const bluesky = new Bluesky({ profileUrl: "https://bsky.app/profile" });
    const embed = await bluesky.createExternalEmbed(url);

    assert.equal(embed.$type, "app.bsky.embed.external");
    assert.equal(embed.external.uri, url);
    assert.equal(embed.external.title, "Fallback title");
    assert.equal(embed.external.description, "No image here");
    assert.ok(!("thumb" in embed.external), "must not invent a thumbnail");
  } finally {
    server.close();
  }
});
