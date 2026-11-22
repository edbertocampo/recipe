import { test } from "node:test";
import assert from "node:assert/strict";
import { findTikTokUrl, isAllowedHost, parseRehydrationData, vttToText, cleanVideoUrl } from "../lib/tiktok.js";

test("finds TikTok links inside shared text", () => {
  assert.equal(findTikTokUrl("Check this out! https://vm.tiktok.com/ZMabc123/ so good"), "https://vm.tiktok.com/ZMabc123/");
  assert.equal(findTikTokUrl("https://www.tiktok.com/@chef/video/123?is_from_webapp=1."), "https://www.tiktok.com/@chef/video/123?is_from_webapp=1");
  assert.equal(findTikTokUrl("no link"), null);
});

test("only allows TikTok hosts", () => {
  assert.ok(isAllowedHost("https://www.tiktok.com/x"));
  assert.ok(isAllowedHost("https://v16-webapp.tiktokcdn.com/sub.vtt"));
  assert.ok(!isAllowedHost("https://evil.com/tiktok.com"));
  assert.ok(!isAllowedHost("https://tiktok.com.evil.com/"));
  assert.ok(!isAllowedHost("file:///etc/passwd"));
});

test("cleans video URLs", () => {
  assert.equal(cleanVideoUrl("https://www.tiktok.com/@chef/video/123?_r=1&lang=en"), "https://www.tiktok.com/@chef/video/123");
});

test("parses page data", () => {
  const data = { __DEFAULT_SCOPE__: { "webapp.video-detail": { itemInfo: { itemStruct: { desc: "Garlic noodles #recipe", author: { uniqueId: "chef" } } } } } };
  const html = `<html><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(data)}</script></html>`;
  assert.equal(parseRehydrationData(html).desc, "Garlic noodles #recipe");
  assert.equal(parseRehydrationData("<html></html>"), null);
});

test("converts subtitles to text", () => {
  const vtt = "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\nAdd two cups of rice\n\n2\n00:00:02.000 --> 00:00:04.000\nAdd two cups of rice\n\n00:00:04.000 --> 00:00:06.000\nthen <c>simmer</c> 15 minutes";
  assert.equal(vttToText(vtt), "Add two cups of rice then simmer 15 minutes");
});
