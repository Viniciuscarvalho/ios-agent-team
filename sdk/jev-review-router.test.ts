import assert from "node:assert/strict";
import test from "node:test";
import { REVIEWERS, reviewersFromProbabilities } from "./jev-review-router";

test("uses only reviewers with a strong Jev signal", () => {
  assert.deepEqual(reviewersFromProbabilities({ "swiftui-expert": 0.8 }), ["swiftui-expert"]);
});

test("keeps the full review when Jev is uncertain", () => {
  assert.deepEqual(reviewersFromProbabilities({ "swiftui-expert": 0.74 }), REVIEWERS);
});
