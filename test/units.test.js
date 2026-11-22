import { test } from "node:test";
import assert from "node:assert/strict";
import { toFraction, formatIngredient, formatMinutes, formatClock } from "../public/units.js";

test("fractions", () => {
  assert.equal(toFraction(0.5), "½");
  assert.equal(toFraction(1.5), "1½");
  assert.equal(toFraction(0.333), "⅓");
  assert.equal(toFraction(2), "2");
  assert.equal(toFraction(0.98), "1");
});

test("scales cups and shows grams as secondary", () => {
  const ing = { name: "flour", quantity: 1, unit: "cup", grams: 120, ml: null };
  assert.deepEqual(formatIngredient(ing, 1.5, "original"), { amount: "1½ cup", name: "flour", secondary: "180 g" });
  assert.deepEqual(formatIngredient(ing, 2, "metric"), { amount: "240 g", name: "flour", secondary: "2 cup" });
});

test("liquids use ml in metric mode", () => {
  const ing = { name: "soy sauce", quantity: 2, unit: "tbsp", grams: 36, ml: 30 };
  assert.equal(formatIngredient(ing, 1, "metric").amount, "30 ml");
  assert.equal(formatIngredient(ing, 1, "original").secondary, "30 ml · 36 g");
});

test("count items and to-taste items", () => {
  assert.equal(formatIngredient({ name: "eggs", quantity: 3, unit: "", grams: 150, ml: null }, 0.5, "original").amount, "1½");
  assert.equal(formatIngredient({ name: "salt", quantity: null, unit: "", grams: null, ml: null }, 2, "metric").amount, "");
});

test("time formatting", () => {
  assert.equal(formatMinutes(45), "45 min");
  assert.equal(formatMinutes(90), "1 h 30 min");
  assert.equal(formatClock(125), "2:05");
});
