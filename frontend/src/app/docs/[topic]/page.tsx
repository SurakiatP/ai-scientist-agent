import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsTopicView } from "@/components/landing/DocsPage";
import th from "@/content/manual/th.json";

export const generateStaticParams = () => th.topics.map((t) => ({ topic: t.id }));

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }): Promise<Metadata> {
  const { topic } = await params, t = th.topics.find((x) => x.id === topic);
  return t ? { title: `${t.title} · ${th.book.title}`, description: t.summary } : {};
}

export default async function Page({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  if (!th.topics.some((t) => t.id === topic)) notFound(); // cacheComponents forbids dynamicParams = false; this gives the same branded 404
  return <DocsTopicView slug={topic} />;
}
