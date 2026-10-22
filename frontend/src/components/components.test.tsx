// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnswerView } from "./AnswerView";
import { ReferenceList } from "./ReferenceList";
import { strings } from "@/lib/strings";
import type { Reference } from "@/lib/sse";

const ref = (id: string, status: Reference["status"], p: Partial<Reference["paper"]> = {}): Reference => ({
  id, status, paper: { title: `Paper ${id}`, authors: ["A"], year: 2024, doi: null, pmid: null, url: "https://example.com/x", ...p },
});

describe("ReferenceList", () => {
  it("links DOI, PMID and arXiv only; never javascript: or arbitrary urls", () => {
    render(<ReferenceList t={strings.en} references={[
      ref("1", "verified", { doi: "10.1000/abc" }),
      ref("2", "verified", { pmid: "123" }),
      ref("3", "verified", { url: "https://arxiv.org/abs/2401.00001" }),
      ref("4", "unknown", { url: "javascript:alert(1)" }),
      ref("5", "unknown", { doi: "javascript:alert(1)", url: "https://evil.example/p" }),
    ]} />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["https://doi.org/10.1000/abc", "https://pubmed.ncbi.nlm.nih.gov/123/", "https://arxiv.org/abs/2401.00001"]);
  });
  it("shows warning chips for unverified and unknown", () => {
    render(<ReferenceList t={strings.en} references={[ref("1", "unverified"), ref("2", "unknown")]} />);
    expect(screen.getByText(/Unverified/)).toBeInTheDocument();
    expect(screen.getByText(/Could not check/)).toBeInTheDocument();
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
    const { container } = render(<AnswerView content={"| a | b |\n|---|---|\n| 1 | 2 |\n\nClaim [1][2]."} />);
    expect(container.querySelector("table")).not.toBeNull();
    expect([...container.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["#ref-1", "#ref-2"]);
  });
});
