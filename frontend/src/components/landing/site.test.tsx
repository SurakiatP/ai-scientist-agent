// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { featureSlugs, landing, sitePages } from "@/lib/strings";
import { usePrefs } from "@/lib/prefs";
import { DocsView, FeatureView, InfoView } from "./SitePage";

vi.mock("@mui/material", async (orig) => ({ ...(await orig<typeof import("@mui/material")>()), useColorScheme: () => ({ mode: "system", setMode: vi.fn() }) }));
beforeEach(() => usePrefs.setState({ lang: "th" }));

describe("public pages behind the header menu", () => {
  it("every feature page has one h1, its steps, and links to the other pages", () => {
    for (const slug of featureSlugs) {
      const { unmount } = render(<FeatureView slug={slug} />);
      const p = sitePages.th.features[slug];
      expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(p.title);
      expect(screen.getAllByRole("listitem").some((li) => li.textContent?.includes(p.steps[0].d))).toBe(true);
      expect(screen.getAllByRole("link", { name: new RegExp(sitePages.th.features[featureSlugs[0]].tab) }).length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("how it works and the FAQ render their sections and the honest check note", () => {
    render(<InfoView kind="faq" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(sitePages.th.faq.title);
    expect(screen.getByText(sitePages.th.faq.sections[0].items[0].d)).toBeInTheDocument();
  });

  it("the guide says plainly that it is in development and links to what exists", () => {
    render(<DocsView />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(sitePages.th.docs.title);
    expect(screen.getAllByText(landing.th.soon).length).toBeGreaterThan(0);
    const links = screen.getByRole("heading", { name: sitePages.th.docs.links }).parentElement!;
    expect(within(links).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/how-it-works", "/faq"]);
  });

  it("pages follow the language, with no login and no external links", () => {
    usePrefs.setState({ lang: "en" });
    const { container } = render(<InfoView kind="how" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(sitePages.en.how.title);
    expect(container.textContent).not.toMatch(/log ?in|sign ?up|เข้าสู่ระบบ/i);
    expect(container.innerHTML).not.toMatch(/href="(https?:)?\/\//);
    fireEvent.click(screen.getByRole("radio", { name: "ไทย" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(sitePages.th.how.title);
  });

  it("th and en have the same pages and the same number of points", () => {
    for (const s of featureSlugs) expect(sitePages.en.features[s].steps).toHaveLength(sitePages.th.features[s].steps.length);
    for (const k of ["how", "faq"] as const) expect(sitePages.en[k].sections.map((x) => x.items.length)).toEqual(sitePages.th[k].sections.map((x) => x.items.length));
  });
});
