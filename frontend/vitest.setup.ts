import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// next/font only works inside the Next compiler.
vi.mock("@/lib/sheetFont", () => ({ sarabun: { style: { fontFamily: "Sarabun" } } }));

afterEach(cleanup);
