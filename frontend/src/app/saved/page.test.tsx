// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, beforeEach } from "vitest";
import SavedPage from "./page";
import { useHistoryStore } from "@/lib/history";
import { strings } from "@/lib/strings";

const t = strings.th;
beforeEach(() => useHistoryStore.setState({ items: [{ id: "1", question: "q1", answer: "a", references: [], createdAt: 1, savedAt: 1 }] }));

it("cancel keeps items, confirm clears", async () => {
  render(<SavedPage />);
  fireEvent.click(await screen.findByText(t.clearAll));
  fireEvent.click(await screen.findByText(t.cancel));
  expect(useHistoryStore.getState().items).toHaveLength(1);
  fireEvent.click(screen.getByText(t.clearAll));
  fireEvent.click(await screen.findByText(t.confirm));
  expect(useHistoryStore.getState().items).toHaveLength(0);
});
