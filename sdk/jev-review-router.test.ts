import assert from "node:assert/strict";
import test from "node:test";
import { REVIEWERS, reviewersFromProbabilities, selectAgents } from "./jev-review-router";

test("uses only reviewers with a strong Jev signal", () => {
  assert.deepEqual(reviewersFromProbabilities({ "swiftui-expert": 0.8 }), ["swiftui-expert"]);
});

test("keeps the full review when Jev is uncertain", () => {
  assert.deepEqual(reviewersFromProbabilities({ "swiftui-expert": 0.74 }), REVIEWERS);
});

test("exposes only Jev-selected agents to the Claude SDK", () => {
  const agents = Object.fromEntries(REVIEWERS.map((reviewer) => [reviewer, reviewer])) as Record<
    (typeof REVIEWERS)[number],
    string
  >;

  assert.deepEqual(Object.keys(selectAgents(agents, ["swiftui-expert"])), ["swiftui-expert"]);
});
