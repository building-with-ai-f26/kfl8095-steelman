import { describe, expect, test } from "vitest";
import {
  LIMITS,
  OPTIONS_PER_BOARD,
  boardIdInput,
  cleanText,
  contextInput,
  itemIdInput,
  optionNameInput,
  questionInput,
  sourceInput,
  webLink,
  wordingInput,
} from "@steelman/shared";
import { createSeededIds } from "@steelman/shared/testing";

// What people may send. The lengths are the prototype's `maxlength` values
// (docs/prototype/source/steelman-refined.html), so the form and the server
// agree. The server refuses what is too long; it never quietly cuts it.

const chars = (count: number) => "x".repeat(count);
const accepts = (schema: { safeParse(value: unknown): { success: boolean } }, value: unknown) => schema.safeParse(value).success;

describe("tidying text", () => {
  test("A-03: runs of spaces and line breaks become one space, and the ends are trimmed", () => {
    expect(cleanText("  Open   weights\n\n help  \t researchers ")).toBe("Open weights help researchers");
  });
});

describe("length limits", () => {
  test("A-01, A-03, C-01: the limits are the prototype's", () => {
    expect(LIMITS).toEqual({
      question: 200,
      optionName: 80,
      wording: 500,
      context: 700,
      sourceName: 120,
      sourceLocator: 200,
      sourceFinding: 500,
      sourceBacksUp: 300,
      sourceLimits: 300,
    });
    expect(OPTIONS_PER_BOARD).toEqual({ min: 2, max: 4 });
  });

  test("A-03, A-05: a wording may be 500 characters and no more", () => {
    expect(accepts(wordingInput, chars(500))).toBe(true);
    expect(accepts(wordingInput, chars(501))).toBe(false);
  });

  test("A-03, A-05: a wording can't be empty or only spaces", () => {
    expect(accepts(wordingInput, "")).toBe(false);
    expect(accepts(wordingInput, "  \n ")).toBe(false);
  });

  test("A-03: a wording is tidied before it is measured or saved", () => {
    expect(wordingInput.parse(`  ${chars(250)}   \n ${chars(249)}  `)).toBe(`${chars(250)} ${chars(249)}`);
  });

  test("A-03: only text is a wording", () => {
    expect(accepts(wordingInput, 42)).toBe(false);
    expect(accepts(wordingInput, null)).toBe(false);
    expect(accepts(wordingInput, undefined)).toBe(false);
  });

  test("A-03: context is optional, up to 700 characters", () => {
    expect(contextInput.parse("")).toBe("");
    expect(contextInput.parse("   ")).toBe("");
    expect(accepts(contextInput, chars(700))).toBe(true);
    expect(accepts(contextInput, chars(701))).toBe(false);
  });

  test("A-01: a question is required, up to 200 characters", () => {
    expect(accepts(questionInput, "Should our library open on Sundays?")).toBe(true);
    expect(accepts(questionInput, " ")).toBe(false);
    expect(accepts(questionInput, chars(200))).toBe(true);
    expect(accepts(questionInput, chars(201))).toBe(false);
  });

  test("A-01: an option's name is required, up to 80 characters", () => {
    expect(accepts(optionNameInput, "Yes")).toBe(true);
    expect(accepts(optionNameInput, "")).toBe(false);
    expect(accepts(optionNameInput, chars(80))).toBe(true);
    expect(accepts(optionNameInput, chars(81))).toBe(false);
  });
});

describe("a source", () => {
  const source = { name: "City library survey, 2025", locator: "", finding: "61% of weekday visitors can't come on weekdays.", backsUp: "", limits: "" };

  test("C-01: needs a name and what it shows; the rest is optional", () => {
    expect(accepts(sourceInput, source)).toBe(true);
    expect(accepts(sourceInput, { ...source, name: " " })).toBe(false);
    expect(accepts(sourceInput, { ...source, finding: "" })).toBe(false);
  });

  test("C-01: each field has its own limit", () => {
    expect(accepts(sourceInput, { ...source, name: chars(120) })).toBe(true);
    expect(accepts(sourceInput, { ...source, name: chars(121) })).toBe(false);
    expect(accepts(sourceInput, { ...source, locator: chars(200) })).toBe(true);
    expect(accepts(sourceInput, { ...source, locator: chars(201) })).toBe(false);
    expect(accepts(sourceInput, { ...source, finding: chars(500) })).toBe(true);
    expect(accepts(sourceInput, { ...source, finding: chars(501) })).toBe(false);
    expect(accepts(sourceInput, { ...source, backsUp: chars(300) })).toBe(true);
    expect(accepts(sourceInput, { ...source, backsUp: chars(301) })).toBe(false);
    expect(accepts(sourceInput, { ...source, limits: chars(300) })).toBe(true);
    expect(accepts(sourceInput, { ...source, limits: chars(301) })).toBe(false);
  });

  test("C-01: fields nobody defined are refused, not saved", () => {
    expect(accepts(sourceInput, { ...source, html: "<b>bold</b>" })).toBe(false);
  });
});

describe("where a source can be found", () => {
  test("C-01: an http or https address is a link", () => {
    expect(webLink("https://example.org/report.pdf")).toBe("https://example.org/report.pdf");
    expect(webLink("http://example.org/a?b=c#d")).toBe("http://example.org/a?b=c#d");
    expect(webLink("HTTPS://Example.org")).toBe("HTTPS://Example.org");
  });

  test("C-01: anything else is shown as plain text, never as a link", () => {
    expect(webLink("javascript:alert(1)")).toBeNull();
    expect(webLink("javascript://example.org/%0Aalert(1)")).toBeNull();
    expect(webLink("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(webLink("file:///etc/passwd")).toBeNull();
    expect(webLink("ftp://example.org/file")).toBeNull();
    expect(webLink("Chapter 3, page 41")).toBeNull();
    expect(webLink("see https://example.org")).toBeNull();
    expect(webLink("https://example.org and more")).toBeNull();
    expect(webLink("https://")).toBeNull();
    expect(webLink("")).toBeNull();
  });
});

describe("IDs", () => {
  test("M-06: a board ID is 12 URL-safe characters, an item ID 20", () => {
    expect(accepts(boardIdInput, "AbC123_-xyzQ")).toBe(true);
    expect(accepts(boardIdInput, "AbC123_-xyz")).toBe(false);
    expect(accepts(boardIdInput, "AbC123_-xyzQQ")).toBe(false);
    expect(accepts(itemIdInput, "AbC123_-xyzQAbC123_-")).toBe(true);
    expect(accepts(itemIdInput, "AbC123_-xyzQ")).toBe(false);
  });

  test("M-06: anything that could break out of a link or a query is refused", () => {
    expect(accepts(boardIdInput, "AbC123/../yz")).toBe(false);
    expect(accepts(boardIdInput, "AbC123 xyzQw")).toBe(false);
    expect(accepts(itemIdInput, "'; drop table board--")).toBe(false);
    expect(accepts(itemIdInput, 12345)).toBe(false);
  });

  test("M-06: the IDs the app makes pass its own check", () => {
    const ids = createSeededIds(3);
    for (let i = 0; i < 100; i++) {
      expect(accepts(boardIdInput, ids.boardId())).toBe(true);
      expect(accepts(itemIdInput, ids.itemId())).toBe(true);
    }
  });
});
