import { describe, expect, it } from "vitest";
import { emptyProgress, reduce } from "./progress";

describe("reduce replan", () => {
  it("appends the extra searches, records the plan change and stays in searching", () => {
    const a = { term: "a", instructions: "i" }, b = { term: "b", instructions: "j" };
    const p = [
      { type: "strategy", reasoning: "r", searches: [a] }, { type: "sources", term: "a", papers: [] },
      { type: "replan", reasoning: "broaden", thin: ["a"], searches: [b] },
    ].reduce((x, e) => reduce(x, e as never), emptyProgress);
    expect(p.searches).toEqual([a, b]);
    expect(p.replans).toEqual([{ reasoning: "broaden", thin: ["a"], searches: [b] }]);
    expect(p.phase).toBe("searching");
    expect(p.reasoning).toBe("r");
  });
});

describe("reduce restarted", () => {
  it("starts over, remembers it, and the next events build on the empty state", () => {
    const a = { term: "a", instructions: "i" };
    const p = [
      { type: "strategy", reasoning: "r", searches: [a] }, { type: "sources", term: "a", papers: [] }, { type: "answer", term: "a", content: "x" },
      { type: "restarted" }, { type: "waiting", position: 1 },
    ].reduce((x, e) => reduce(x, e as never), emptyProgress);
    expect(p).toEqual({ ...emptyProgress, waiting: 1, eta: null, phase: "waiting", restarted: true });
    expect(reduce({ ...emptyProgress, phase: "writing", writing: true, answered: ["a"] }, { type: "restarted" })).toEqual({ ...emptyProgress, restarted: true });
  });
});
