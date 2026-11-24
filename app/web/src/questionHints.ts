// Question wording hints (F-02): the prototype's createHints
// (docs/prototype/source/steelman-refined.html), as a pure function. New
// steelman shows them under the question as the person types. They never
// block making the board, and nothing is sent or stored.

/** Words that lean a question one way, in the order the prototype checks them. */
const LOADED = ["obviously", "clearly", "finally", "ridiculous", "stupid", "just", "really", "still", "even"];

/** The hints for a question and its options, in the prototype's order: a loaded word, Why, then Yes or No. */
export function questionHints(question: string, options: readonly string[]): string[] {
  const q = question.trim();
  const hints: string[] = [];
  const loaded = LOADED.find((word) => new RegExp(`\\b${word}\\b`, "i").test(q));
  if (loaded) hints.push(`“${loaded}” may tilt the question.`);
  // Two sentences, where the prototype had a fragment (AGENTS.md rule 13).
  if (/^why\b/i.test(q)) hints.push("A question that starts with “Why” assumes an answer. Try starting it with “Should”.");
  if (options.some((option) => /^(yes|no)$/i.test(option.trim()))) hints.push("Name options as positions, not Yes or No.");
  return hints;
}
