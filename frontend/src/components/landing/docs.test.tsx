// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import th from "@/content/manual/th.json";
import en from "@/content/manual/en.json";
import { usePrefs } from "@/lib/prefs";
import { DocsIndexView, DocsTopicView } from "./DocsPage";
import { LandingHeader } from "./LandingHeader";

vi.mock("@mui/material", async (orig) => ({ ...(await orig<typeof import("@mui/material")>()), useColorScheme: () => ({ mode: "system", setMode: vi.fn() }) }));
beforeEach(() => usePrefs.setState({ lang: "th" }));

describe("in-app manual", () => {
  it("the index lists every topic once, under its group", () => {
    render(<DocsIndexView />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(th.book.title);
    expect(th.topics).toHaveLength(22);
    for (const g of th.groups) expect(screen.getByRole("heading", { name: g.title, level: 3 })).toBeInTheDocument();
    const all = screen.getByRole("heading", { name: "ทุกหัวข้อ" }).parentElement!;
    for (const t of th.topics) expect(all.querySelectorAll(`a[href="/docs/${t.id}"]`)).toHaveLength(1);
  });

  it("a topic page renders its steps with pictures, a note section and previous/next", () => {
    usePrefs.setState({ lang: "en" });
    const { container } = render(<DocsTopicView slug="ask-a-question" />);
    const t = en.topics.find((x) => x.id === "ask-a-question")!;
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.title);
    for (const s of t.sections) expect(screen.getByRole("heading", { level: 2, name: s.heading })).toBeInTheDocument();
    const img = container.querySelector("article img")!;
    expect(img.getAttribute("src")).toMatch(/^\/manual\/en\/ask-flow-1\.webp$/);
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("width", "1280");
    const rel = (r: string) => container.querySelector(`a[rel="${r}"]`)!;
    expect(rel("next")).toHaveAttribute("href", "/docs/review-plan");
    expect(rel("prev")).toHaveAttribute("href", "/docs/getting-started");
  });

  it("every topic is prerendered, has its own metadata, and unknown slugs 404", async () => {
    const mod = await import("@/app/docs/[topic]/page");
    expect(mod.generateStaticParams()).toHaveLength(th.topics.length);
    await expect(mod.default({ params: Promise.resolve({ topic: "nope" }) })).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    const meta = await mod.generateMetadata({ params: Promise.resolve({ topic: "faq" }) });
    expect(meta.title).toContain(th.topics.find((t) => t.id === "faq")!.title);
  });

  it("the Start cards link the three first-read topics in order", () => {
    render(<DocsIndexView />);
    const start = screen.getByRole("heading", { name: "เริ่มใน 3 ขั้น", level: 2 }).parentElement!;
    const nums = [...start.querySelectorAll("li a")].map((a) => th.topics.findIndex((t) => a.getAttribute("href") === `/docs/${t.id}`) + 1);
    expect(nums).toEqual([2, 3, 5]);
    expect([...start.querySelectorAll("li a")].map((a) => a.querySelector("h3,h4")?.tagName)).toEqual(["H3", "H3", "H3"]);
  });

  it("follows the language switch", () => {
    render(<DocsTopicView slug="faq" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(th.topics.find((t) => t.id === "faq")!.title);
    fireEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(en.topics.find((t) => t.id === "faq")!.title);
  });

  it("the Docs item in the header is active on these pages and has no in-development chip", () => {
    render(<DocsIndexView />);
    const nav = screen.getAllByRole("navigation", { name: "เมนูหลัก" })[0];
    expect(within(nav).getByRole("link", { name: /คู่มือ/ })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "เมนู" }));
    expect(screen.getByRole("menuitem", { name: "คู่มือ" })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/กำลังพัฒนา|In development/);
  });

  it("header alone: the docs link is not marked as coming soon", () => {
    render(<LandingHeader active="docs" />);
    expect(document.body.textContent).not.toMatch(/กำลังพัฒนา/);
  });
});
