import { findTikTokUrl, getTikTokInfo } from "./tiktok.js";
import { extractRecipe, RecipeError } from "./recipe.js";

const MAX_PASTE = 15000;

/**
 * Framework-neutral handler used by both the Vercel function and server.js.
 * @returns {Promise<{status:number, body:object}>}
 */
export async function handleExtract(body, headers = {}) {
  const required = process.env.ACCESS_CODE;
  if (required && headers["x-access-code"] !== required) {
    return { status: 401, body: { error: "Access code required.", needsCode: true } };
  }

  const rawUrl = typeof body?.url === "string" ? body.url : "";
  const pastedText = typeof body?.text === "string" ? body.text.slice(0, MAX_PASTE).trim() : "";
  const url = findTikTokUrl(rawUrl) || findTikTokUrl(pastedText);

  if (!url && !pastedText) {
    return { status: 400, body: { error: "Paste a TikTok link (or the recipe text)." } };
  }

  let video = { url: url || "", caption: "", author: "", authorUrl: "", thumbnail: "", transcript: "", durationSec: null };
  if (url) video = await getTikTokInfo(url);

  if (!video.caption && !video.transcript && !pastedText) {
    return {
      status: 422,
      body: {
        error:
          "Couldn't read this TikTok (it may be private or TikTok blocked the request). Paste the caption or recipe text below and try again.",
        needsText: true,
        video,
      },
    };
  }

  try {
    const recipe = await extractRecipe({ ...video, pastedText });
    if (!recipe.is_recipe) {
      return {
        status: 422,
        body: { error: recipe.not_recipe_reason || "This doesn't look like a recipe video.", needsText: true, video },
      };
    }
    const { transcript, ...publicVideo } = video;
    return { status: 200, body: { recipe, video: { ...publicVideo, hadTranscript: Boolean(transcript) } } };
  } catch (err) {
    if (err instanceof RecipeError) return { status: err.status, body: { error: err.message } };
    console.error(err);
    return { status: 500, body: { error: "Something went wrong. Try again." } };
  }
}
