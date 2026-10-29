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
