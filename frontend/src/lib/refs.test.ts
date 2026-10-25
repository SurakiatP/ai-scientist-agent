import { describe, expect, it } from "vitest";
import { sourceHost } from "./refs";

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
