// Question wording hints (F-02), the prototype's createHints as a pure
// function: a loaded word, a question that starts with "Why", and an option
// named Yes or No.

import { expect, test } from "vitest";
import { questionHints } from "../src/questionHints.ts";

const LOADED_WORDS = ["obviously", "clearly", "finally", "ridiculous", "stupid", "just", "really", "still", "even"];
const WHY = "A question that starts with “Why” assumes an answer. Try starting it with “Should”.";
const YES_NO = "Name options as positions, not Yes or No.";

test("F-02: a neutral question with named options gets no hints", () => {
  expect(questionHints("Should our school start an hour later?", ["Start later", "Keep the time"])).toEqual([]);
  expect(questionHints("", ["", ""])).toEqual([]);
});

test("F-02: each loaded word, as a whole word, gets a hint naming it", () => {
  for (const word of LOADED_WORDS) {
    expect(questionHints(`Is this ${word} the right call?`, ["A", "B"]), word).toEqual([`“${word}” may tilt the question.`]);
  }
});

test("F-02: a loaded word inside another word gets no hint", () => {
  expect(questionHints("Should we adjust the rota evenly, or stillborn plans?", ["A", "B"])).toEqual([]);
  expect(questionHints("Is the clearlyish wording justified?", ["A", "B"])).toEqual([]);
});

test("F-02: capitals don't hide a loaded word, and the hint names it in small letters", () => {
  expect(questionHints("OBVIOUSLY we should start later?", ["A", "B"])).toEqual(["“obviously” may tilt the question."]);
});

test("F-02: two loaded words give one hint, for the first in the list of loaded words", () => {
  expect(questionHints("Should we really, obviously, start later?", ["A", "B"])).toEqual(["“obviously” may tilt the question."]);
});

test("F-02: a question that starts with Why gets its hint, in two sentences", () => {
  expect(questionHints("Why should our school start later?", ["A", "B"])).toEqual([WHY]);
  expect(questionHints("why not start later?", ["A", "B"])).toEqual([WHY]);
  expect(questionHints("   Why start later?", ["A", "B"])).toEqual([WHY]);
});

test("F-02: Why anywhere but at the start, or as part of a longer word, gets no hint", () => {
  expect(questionHints("Should we ask why school starts early?", ["A", "B"])).toEqual([]);
  expect(questionHints("Whyte Street or Main Street for the new park?", ["A", "B"])).toEqual([]);
});

test("F-02: an option named exactly Yes or No gets the hint, once", () => {
  expect(questionHints("Should we start later?", ["Yes", "Keep the time"])).toEqual([YES_NO]);
  expect(questionHints("Should we start later?", ["Start later", "  no "])).toEqual([YES_NO]);
  expect(questionHints("Should we start later?", ["YES", "No"])).toEqual([YES_NO]);
});

test("F-02: an option that only begins with Yes or No gets no hint", () => {
  expect(questionHints("Should we start later?", ["Yes please", "Not now", "Nope"])).toEqual([]);
});

test("F-02: all three rules give three hints, in order", () => {
  expect(questionHints("Why is this clearly better?", ["Yes", "No"])).toEqual(["“clearly” may tilt the question.", WHY, YES_NO]);
});
