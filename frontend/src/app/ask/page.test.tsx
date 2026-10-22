// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AskEvent } from "@/lib/sse";

const paper = { title: "Great Paper", authors: ["A"], year: 2024, doi: "10.1000/abc", pmid: null, url: "https://doi.org/10.1000/abc" };
let script: AskEvent[] = [];
vi.mock("@/lib/sse", () => ({
  streamAsk: async function* () { for (const e of script) yield e; },
}));
import AskPage from "./page";

async function run(events: AskEvent[]) {
  script = events;
  render(<AskPage />);
  fireEvent.change(screen.getByLabelText("ถามคำถามวิจัย"), { target: { value: "q?" } });
  fireEvent.click(screen.getByRole("button", { name: "ถาม" }));
}

describe("AskPage", () => {
  it("shows plan, sources, answer, then references", async () => {
    await run([
      { type: "strategy", reasoning: "r", searches: [{ term: "rag", instructions: "i" }] },
      { type: "sources", term: "rag", papers: [paper] },
      { type: "answer", term: "rag", content: "x" },
      { type: "final_answer", content: "Final text [1]", references: [{ id: "1", paper, status: "unverified" }] },
      { type: "complete" },
    ]);
    expect(await screen.findByText("Final text")).toBeInTheDocument();
    expect(screen.getByText("rag")).toBeInTheDocument();
    expect(screen.getByText("1 พบงานวิจัย")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Great Paper" })).toHaveAttribute("href", "https://doi.org/10.1000/abc");
    expect(screen.getByText(/ตรวจสอบไม่ผ่าน/)).toBeInTheDocument();
  });
  it("shows refusal as polite info, not an error", async () => {
    await run([{ type: "refused", reason: "not science" }]);
    expect(await screen.findByText("คำถามนี้อยู่นอกขอบเขตของระบบ")).toBeInTheDocument();
    expect(screen.getByText("not science")).toBeInTheDocument();
    expect(screen.queryByText("เกิดข้อผิดพลาด")).toBeNull();
  });
});
