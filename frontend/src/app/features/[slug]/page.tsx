import { notFound } from "next/navigation";
import { FeatureView } from "@/components/landing/SitePage";
import { featureSlugs, type FeatureSlug } from "@/lib/strings";

export const generateStaticParams = () => featureSlugs.map((slug) => ({ slug }));

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!featureSlugs.includes(slug as FeatureSlug)) notFound();
  return <FeatureView slug={slug as FeatureSlug} />;
}
