import { test, mock } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";

process.env.ANTHROPIC_API_KEY = "test-key";
const { handleExtract } = await import("../lib/handler.js");
const { RECIPE_SCHEMA } = await import("../lib/recipe.js");

const sampleRecipe = {
  is_recipe: true, not_recipe_reason: "", title: "Garlic Noodles", description: "Quick buttery noodles.",
  cuisine: "Asian-American", servings: 2, prep_minutes: 5, cook_minutes: 10, total_minutes: 15, difficulty: "easy",
  source_quality: "from_video", source_note: "", ingredients: [], steps: [], equipment: [], tips: [], tags: [],
  nutrition_per_serving: { calories: 500, protein_g: 12, carbs_g: 60, fat_g: 22 },
};

function mockTikTok() {
  const page = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify({
    __DEFAULT_SCOPE__: { "webapp.video-detail": { itemInfo: { itemStruct: {
      desc: "Garlic noodles 🍜 4 tbsp butter, 6 cloves garlic", author: { uniqueId: "chef" },
      video: { cover: "https://p16.tiktokcdn.com/c.jpg", duration: 42, subtitleInfos: [{ LanguageCodeName: "eng-US", Url: "https://v16.tiktokcdn.com/s.vtt" }] },
    } } } },
  })}</script>`;
  return mock.method(globalThis, "fetch", async (url) => {
    url = String(url);
    if (url.startsWith("https://vm.tiktok.com/")) return new Response(null, { status: 301, headers: { location: "https://www.tiktok.com/@chef/video/111?x=1" } });
    if (url.startsWith("https://www.tiktok.com/@chef/video/111")) return new Response(page, { status: 200 });
    if (url.startsWith("https://www.tiktok.com/oembed")) return Response.json({ title: "Garlic noodles", author_name: "Chef", author_url: "https://www.tiktok.com/@chef" });
    if (url.startsWith("https://v16.tiktokcdn.com/s.vtt")) return new Response("WEBVTT\n\n00:00.000 --> 00:02.000\nboil noodles 8 minutes");
    throw new Error("unexpected fetch " + url);
  });
}

test("full flow: short link -> page -> subtitles -> Claude", async () => {
  const f = mockTikTok();
  let sent;
  const c = mock.method(Anthropic.Beta.Messages.prototype, "create", async function (params) {
    sent = params;
    return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(sampleRecipe) }] };
  });
  const { status, body } = await handleExtract({ url: "https://vm.tiktok.com/ZMabc/" });
  assert.equal(status, 200);
  assert.equal(body.recipe.title, "Garlic Noodles");
  assert.equal(body.video.url, "https://www.tiktok.com/@chef/video/111");
  assert.equal(body.video.author, "chef");
  assert.equal(body.video.hadTranscript, true);
  assert.equal(body.video.transcript, undefined);
  const userText = sent.messages[0].content;
  assert.match(userText, /4 tbsp butter/);
  assert.match(userText, /boil noodles 8 minutes/);
  assert.equal(sent.model, "claude-opus-5-5");
  assert.deepEqual(sent.output_config.format, { type: "json_schema", schema: RECIPE_SCHEMA });
  f.mock.restore(); c.mock.restore();
});

test("asks for text when TikTok can't be read", async () => {
  const f = mock.method(globalThis, "fetch", async () => new Response("blocked", { status: 403 }));
  const { status, body } = await handleExtract({ url: "https://www.tiktok.com/@a/video/1" });
  assert.equal(status, 422);
  assert.equal(body.needsText, true);
  f.mock.restore();
});

test("pasted text alone works", async () => {
  const c = mock.method(Anthropic.Beta.Messages.prototype, "create", async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(sampleRecipe) }] }));
  const { status } = await handleExtract({ text: "2 eggs, 1 cup milk, whisk and fry" });
  assert.equal(status, 200);
  c.mock.restore();
});

test("refusal becomes a friendly error", async () => {
  const c = mock.method(Anthropic.Beta.Messages.prototype, "create", async () => ({ stop_reason: "refusal", content: [] }));
  const { status } = await handleExtract({ text: "something" });
  assert.equal(status, 422);
  c.mock.restore();
});

test("access code is enforced when set", async () => {
  process.env.ACCESS_CODE = "secret";
  assert.equal((await handleExtract({ text: "x" }, {})).status, 401);
  delete process.env.ACCESS_CODE;
});
