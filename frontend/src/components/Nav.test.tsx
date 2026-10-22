// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { vi, expect, it } from "vitest";
import { Nav } from "./Nav";
import { strings } from "@/lib/strings";

vi.mock("next/navigation", () => ({ usePathname: () => "/saved" }));

it("marks only the active link aria-current=page", () => {
  render(<Nav />);
  expect(screen.getByText(strings.th.navSaved).closest("a")).toHaveAttribute("aria-current", "page");
  expect(screen.getByText(strings.th.navAsk).closest("a")).not.toHaveAttribute("aria-current");
});
