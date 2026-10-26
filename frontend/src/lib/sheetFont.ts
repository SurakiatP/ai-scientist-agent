import { Sarabun } from "next/font/google";

// The report renderer's face, used only by the A4 sheet so the page looks like the exported file.
export const sarabun = Sarabun({ subsets: ["thai", "latin"], weight: ["400", "700"], style: ["normal", "italic"], display: "swap" });
