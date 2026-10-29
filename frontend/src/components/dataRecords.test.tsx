// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataRecords } from "./DataRecords";
import { ReferenceList } from "./ReferenceList";
import { strings } from "@/lib/strings";
import type { Reference } from "@/lib/sse";

const rec = { database: "uniprot", id: "P04637", title: "Cellular tumor antigen p53", url: "https://uniprot.org/P04637", summary: "Acts as a tumor suppressor." };
const ref = (source?: string | null): Reference => ({ id: "1", status: "verified", paper: { title: "Paper 1", authors: ["A"], year: 2024, doi: "10.1000/x", pmid: null, url: "https://example.com/x", ...(source !== undefined && { source }) } });

describe("DataRecords", () => {
  it("renders nothing without records (also old turns where the field is absent)", () => {
    const { container, rerender } = render(<DataRecords records={[]} t={strings.en} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DataRecords records={undefined} t={strings.en} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("shows database name, id, title link (new tab, noopener) and summary", () => {
    render(<DataRecords records={[rec]} t={strings.en} />);
    expect(screen.getByRole("heading", { name: "Database records" })).toBeInTheDocument();
    const a = screen.getByRole("link", { name: /Cellular tumor antigen p53/ });
    expect(a).toHaveAttribute("href", "https://uniprot.org/P04637");
    expect(a).toHaveAttribute("target", "_blank");
    expect(a).toHaveAttribute("rel", "noopener noreferrer");
    expect(a).toHaveAccessibleName("Cellular tumor antigen p53, opens in a new tab");
    expect(screen.getByText("UniProt", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("P04637")).toBeInTheDocument();
    expect(screen.getByText("Acts as a tumor suppressor.")).toBeInTheDocument();
  });
  it("gives each section its own heading id (two answers on one page)", () => {
    const { container } = render(<><DataRecords records={[rec]} t={strings.en} /><DataRecords records={[rec]} t={strings.en} /></>);
    const ids = [...container.querySelectorAll("h2")].map((h) => h.id);
    expect(new Set(ids).size).toBe(2);
  });
  it("links only http(s); other schemes and junk entries are plain text or dropped; Thai heading", () => {
    render(<DataRecords records={[{ ...rec, url: "javascript:alert(1)" }, null, 5, { ...rec, title: "  " }]} t={strings.th} />);
    expect(screen.getByRole("heading", { name: "ข้อมูลจากฐานข้อมูล" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Cellular tumor antigen p53")).toBeInTheDocument();
  });
});

describe("reference source", () => {
  it("shows the source name when known and nothing new when missing or unknown", () => {
    const { rerender } = render(<ReferenceList t={strings.en} references={[ref("europepmc")]} />);
    expect(screen.getByText(/Found via Europe PMC/)).toBeInTheDocument();
    for (const s of [undefined, null, "mystery"]) {
      rerender(<ReferenceList t={strings.en} references={[ref(s)]} />);
      expect(screen.queryByText(/Found via/)).toBeNull();
    }
  });
});
