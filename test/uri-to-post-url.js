import assert from "node:assert/strict";
import test from "node:test";

import { uriToPostUrl } from "../lib/utils.js";

// Called on the AT URI returned by every successful post. If it throws, the
// post already exists on Bluesky and the syndication is reported as failed,
// which is how a retry turns into a duplicate post.
test("converts an AT URI to a web URL", () => {
  assert.equal(
    uriToPostUrl(
      "https://bsky.app/profile",
      "at://did:plc:abc123/app.bsky.feed.post/xyz789",
    ),
    "https://bsky.app/profile/did:plc:abc123/post/xyz789",
  );
});

test("returns undefined for a non-matching URI without throwing", () => {
  assert.equal(
    uriToPostUrl("https://bsky.app/profile", "not-an-at-uri"),
    undefined,
  );
});
