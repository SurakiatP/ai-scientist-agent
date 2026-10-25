import { describe, expect, it } from "vitest";
import { citeLabel, sourceHost } from "./refs";

const p = (o: Record<string, unknown>) => ({ title: "t", authors: [], year: null, doi: null, pmid: null, url: "", ...o }) as never;

describe("sourceHost", () => {
  it("takes the host of the paper url, without www", () => expect(sourceHost(p({ url: "https://www.Nature.com/articles/x" }))).toBe("nature.com"));
  it("keeps subdomains", () => expect(sourceHost(p({ url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1/" }))).toBe("pmc.ncbi.nlm.nih.gov"));
  it("drops the port and a trailing dot", () => {
    expect(sourceHost(p({ url: "http://example.org:8080/a" }))).toBe("example.org");
    expect(sourceHost(p({ url: "https://example.org./a" }))).toBe("example.org");
  });
  it("lowercases", () => expect(sourceHost(p({ url: "HTTPS://EXAMPLE.ORG/A" }))).toBe("example.org"));
  it("keeps an IP as is", () => expect(sourceHost(p({ url: "http://10.0.0.5:3000/x" }))).toBe("10.0.0.5"));
  it("falls back to doi.org when only a DOI", () => expect(sourceHost(p({ doi: "10.1000/abc" }))).toBe("doi.org"));
  it("is empty with no url, no id, or a non-http url", () => {
    expect(sourceHost(p({}))).toBe("");
    expect(sourceHost(p({ url: "javascript:alert(1)" }))).toBe("");
    expect(sourceHost(p({ url: "ftp://example.org/x" }))).toBe("");
  });
});

describe("citeLabel", () => {
  const q = (o: Partial<Parameters<typeof sourceHost>[0]>) => ({ title: "T", authors: [], year: null, doi: null, pmid: null, url: null, ...o }) as Parameters<typeof sourceHost>[0];
  it("uses the publisher host when the paper has its own url", () => expect(citeLabel(q({ url: "https://www.nature.com/a" }))).toBe("nature.com"));
  it("uses author and year when only a DOI resolver is known", () => expect(citeLabel(q({ doi: "10.1000/x", authors: ["Chen J", "Mei J"], year: 2024 }))).toBe("Chen et al. 2024"));
  it("single author has no et al.", () => expect(citeLabel(q({ doi: "10.1000/x", authors: ["Komor AC"], year: 2016 }))).toBe("Komor 2016"));
  it("falls back to the host when there is no author or year", () => expect(citeLabel(q({ doi: "10.1000/x" }))).toBe("doi.org"));
});
