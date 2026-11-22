// Quantity scaling and formatting helpers (no DOM).

const FRACTIONS = [
  [0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"],
  [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"], [1, ""],
];

// Units we show as fractions ("1½ cups"); everything else gets decimals.
const FRACTION_UNITS = /^(cups?|c|tbsps?|tablespoons?|tsps?|teaspoons?|cloves?|pieces?|pcs?|slices?|cans?|sticks?|bunch(es)?|heads?|stalks?|sprigs?|pinch(es)?|dash(es)?|handfuls?|lbs?|pounds?|)$/i;

export function toFraction(value) {
  if (!isFinite(value) || value <= 0) return "0";
  let whole = Math.floor(value);
  const frac = value - whole;
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) if (Math.abs(f[0] - frac) < Math.abs(best[0] - frac)) best = f;
  if (best[0] === 1) { whole += 1; best = FRACTIONS[0]; }
  if (whole === 0 && best[1] === "") return value < 0.0625 ? "pinch" : "⅛";
  return `${whole || ""}${best[1]}`;
}

export function roundSmart(n) {
  if (!isFinite(n)) return "";
  if (n >= 100) return String(Math.round(n / 5) * 5);
  if (n >= 10) return String(Math.round(n));
  if (n >= 1) return String(Math.round(n * 10) / 10);
  return String(Math.round(n * 100) / 100);
}

export function formatAmount(qty, unit = "") {
  if (qty == null) return "";
  return FRACTION_UNITS.test(unit.trim()) ? toFraction(qty) : roundSmart(qty);
}

export function formatGrams(g) {
  if (g == null) return "";
  if (g >= 1000) return `${roundSmart(g / 1000)} kg`;
  if (g < 1) return `${Math.round(g * 10) / 10} g`;
  return `${roundSmart(g)} g`;
}

export function formatMl(ml) {
  if (ml == null) return "";
  if (ml >= 1000) return `${roundSmart(ml / 1000)} L`;
  return `${roundSmart(ml)} ml`;
}

/**
 * @param {object} ing ingredient from the recipe
 * @param {number} factor scale factor (desired servings / original servings)
 * @param {"original"|"metric"} mode
 * @returns {{amount:string, name:string, secondary:string}}
 */
export function formatIngredient(ing, factor, mode) {
  const q = ing.quantity != null ? ing.quantity * factor : null;
  const g = ing.grams != null ? ing.grams * factor : null;
  const ml = ing.ml != null ? ing.ml * factor : null;
  const unit = (ing.unit || "").trim();

  const original = q != null ? `${formatAmount(q, unit)}${unit ? " " + unit : ""}` : "";
  const metric = ml != null ? formatMl(ml) : g != null ? formatGrams(g) : "";

  let amount, secondary;
  if (mode === "metric" && metric) {
    amount = metric;
    secondary = original && original !== metric ? original : "";
  } else {
    amount = original || metric;
    secondary = original && metric && !/^(g|grams?|ml|kg|l)$/i.test(unit) ? metric : "";
    // Add the weight next to a liquid's volume, it helps when using a scale.
    if (mode !== "metric" && ml != null && g != null && secondary === formatMl(ml)) {
      secondary = `${formatMl(ml)} · ${formatGrams(g)}`;
    }
  }
  return { amount, name: ing.name, secondary };
}

export function formatMinutes(min) {
  if (min == null || !isFinite(min) || min <= 0) return "";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
