// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { cite, AnswerView } from "./AnswerView";
import { ReferenceList } from "./ReferenceList";
import { strings } from "@/lib/strings";
import type { Reference } from "@/lib/sse";

const ref = (id: string, status: Reference["status"], p: Partial<Reference["paper"]> = {}): Reference => ({
  id, status, paper: { title: `Paper ${id}`, authors: ["A"], year: 2024, doi: null, pmid: null, url: "https://example.com/x", ...p },
});

describe("ReferenceList", () => {
  it("links DOI > PMID > arXiv > http(s) url; never javascript:, data:, ftp:", () => {
    render(<ReferenceList t={strings.en} references={[
      ref("1", "verified", { doi: "10.1000/abc" }),
      ref("2", "verified", { pmid: "123" }),
      ref("3", "verified", { url: "https://arxiv.org/abs/2401.00001" }),
      ref("4", "unknown", { url: "javascript:alert(1)" }),
      ref("5", "unknown", { url: "data:text/html,x" }),
      ref("6", "unknown", { url: "ftp://x.example/p" }),
      ref("7", "unknown", { url: "https://openreview.net/forum?id=1" }),
    ]} />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["https://doi.org/10.1000/abc", "https://pubmed.ncbi.nlm.nih.gov/123/", "https://arxiv.org/abs/2401.00001", "https://openreview.net/forum?id=1"]);
  });
  it("shows warning chips for unverified and unknown", () => {
    render(<ReferenceList t={strings.en} references={[ref("1", "unverified"), ref("2", "unknown")]} />);
    expect(screen.getByText(/No identifier \(DOI/)).toBeInTheDocument();
    expect(screen.getByText(/Could not check/)).toBeInTheDocument();
  });
  it("labels verified as identifier existence only, not content verification", () => {
    render(<ReferenceList t={strings.en} references={[ref("1", "verified", { doi: "10.1000/x" })]} />);
    expect(screen.getByText("Identifier exists")).toBeInTheDocument();
    expect(document.querySelector(".MuiChip-icon")).not.toBeNull();
    expect(strings.th.verified).toBe("พบเลขอ้างอิงนี้จริง");
    expect(screen.queryByText(/verified/i)).toBeNull();
  });
  it("words unverified by whether an identifier exists", () => {
    render(<ReferenceList t={strings.en} references={[ref("1", "unverified", { doi: "10.1000/x" })]} />);
    expect(screen.getByText("Could not confirm this reference exists")).toBeInTheDocument();
  });
});

describe("AnswerView", () => {
  it("does not render raw html or javascript links", () => {
    const { container } = render(<AnswerView content={'hi <script>alert(1)</script><img src=x onerror=alert(1)> [x](javascript:alert(1)) **b**'} />);
    expect(container.querySelector("script,img")).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(container.querySelector("strong")).toHaveTextContent("b");
  });
  it("renders tables and turns citation markers into reference links", () => {
    const { container } = render(<AnswerView references={[{ id: "1" }, { id: "2" }]} content={"| a | b |\n|---|---|\n| 1 | 2 |\n\nClaim [1][2]."} />);
    expect(container.querySelector("table")).not.toBeNull();
    expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["#ref-1"]); // adjacent ids share one chip
  });
  it("renders no img or request-able src for markdown images", () => {
    const { container } = render(<AnswerView content="![x](https://evil.example/x.png?q=secret)" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("evil.example");
  });
  it("links only existing ids and never inside code", () => {
    const { container } = render(<AnswerView references={[{ id: "1" }]} content={"a [1] b [9] `[1]`\n\n```\n[1]\n```"} />);
    expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["#ref-1"]);
  });
  it("citation chip shows the source domain, +n for grouped ids, and the id in the aria-label", () => {
    const refs = [ref("1", "verified", { url: "https://www.nature.com/a" }), ref("2", "verified", { url: "https://b.org/x" })];
    render(<AnswerView references={refs} content="Claim [1][2]." />);
    const a = screen.getByRole("link", { name: /1, 2: Paper 1/ });
    expect(a).toHaveTextContent("nature.com+1");
    expect(a).toHaveAttribute("href", "#ref-1");
  });
  it("falls back to [id] when the source has no host", () => {
    render(<AnswerView references={[ref("1", "unverified", { url: "", authors: [], year: null })]} content="Claim [1]." />);
    expect(screen.getByRole("link", { name: /1: Paper 1/ })).toHaveTextContent("[1]");
  });
  it("shows author and year when the only host is the DOI resolver", () => {
    render(<AnswerView references={[ref("1", "verified", { url: "", doi: "10.1000/x", authors: ["Chen J", "Mei J"], year: 2024 })]} content="Claim [1]." />);
    expect(screen.getByRole("link", { name: /1: Paper 1/ })).toHaveTextContent("Chen et al. 2024");
  });
  it("cite keeps unknown ids out of a grouped chip", () => {
    expect(cite("a [1][9]", new Set(["1"]))).toBe("a [[1]](#ref-1)[9]");
  });
});
