import type { Metadata } from "next";
import { DocsIndexView } from "@/components/landing/DocsPage";
import th from "@/content/manual/th.json";

export const metadata: Metadata = { title: th.book.title, description: th.book.description };

export default function Page() {
  return <DocsIndexView />;
}
