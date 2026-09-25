import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractHeadings } from "./headings.js";

describe("extractHeadings", () => {
  it("keeps only explicit h1–h4 and drops empty / h5", () => {
    const headings = extractHeadings(
      [
        { tagName: "H1", textContent: " Intro ", id: "h-intro" },
        { tagName: "H5", textContent: "too deep", id: "h5" },
        { tagName: "H2", textContent: "  ", id: "empty" },
        { tagName: "H3", textContent: "Detail", getAttribute: () => null },
      ],
      "turn_a_outline",
      "item_a_outline",
    );
    assert.equal(headings.length, 2);
    assert.equal(headings[0]?.id, "h-intro");
    assert.equal(headings[0]?.level, 1);
    assert.equal(headings[1]?.text, "Detail");
    assert.equal(headings[1]?.level, 3);
  });

  it("returns 20 anchors for a 20-heading fixture", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => ({
      tagName: i % 2 === 0 ? "H2" : "H3",
      textContent: `Heading ${i + 1}`,
      id: `outline-h-${String(i + 1).padStart(2, "0")}`,
    }));
    const headings = extractHeadings(nodes, "turn_a_long");
    assert.equal(headings.length, 20);
    assert.equal(headings[19]?.id, "outline-h-20");
  });
});
