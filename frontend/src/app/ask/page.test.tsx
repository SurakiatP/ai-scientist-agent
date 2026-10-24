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

async function run(events: AskEvent[], submit: "click" | "enter" = "click") {
  script = events;
  render(<AskPage />);
  fireEvent.change(screen.getByLabelText("ถามคำถามวิจัย"), { target: { value: "q?" } });
  if (submit === "click") fireEvent.click(screen.getByRole("button", { name: "ถาม" }));
  else {
    const box = screen.getByLabelText("ถามคำถามวิจัย");
    fireEvent.keyDown(box, { key: "Enter", isComposing: true }); // IME confirm: must not submit
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.keyDown(box, { key: "Enter" });
  }
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
    expect(screen.getByText("พบ 1 งานวิจัย")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Great Paper" })).toHaveAttribute("href", "https://doi.org/10.1000/abc");
    expect(screen.getByText("ยังยืนยันไม่ได้ว่ามีงานนี้จริง")).toBeInTheDocument();
  });
  it("shows refusal as polite info, not an error", async () => {
    await run([{ type: "refused", reason: "not science" }]);
    expect(await screen.findByText("คำถามนี้อยู่นอกขอบเขตของระบบ")).toBeInTheDocument();
    expect(screen.getByText("not science")).toBeInTheDocument();
    expect(screen.queryByText("เกิดข้อผิดพลาด")).toBeNull();
  });
  it("accumulates one-paper sources events per term", async () => {
    await run([
      { type: "strategy", reasoning: "r", searches: [{ term: "rag", instructions: "i" }] },
      { type: "sources", term: "rag", papers: [paper] },
      { type: "sources", term: "rag", papers: [paper] },
      { type: "sources", term: "rag", papers: [paper] },
      { type: "complete" },
    ]);
    expect(await screen.findByText("พบ 3 งานวิจัย")).toBeInTheDocument();
  });
  it("shows an error when the stream ends without a terminal event", async () => {
    await run([{ type: "strategy", reasoning: "r", searches: [{ term: "rag", instructions: "i" }] }]);
    expect(await screen.findByText(/การเชื่อมต่อสิ้นสุดก่อน/)).toBeInTheDocument();
    expect(screen.getByText("rag")).toBeInTheDocument();
  });
  it("submits on Enter but not while an IME composition is active", async () => {
    await run([{ type: "complete" }], "enter");
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
});
