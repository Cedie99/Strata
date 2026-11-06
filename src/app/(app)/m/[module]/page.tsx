import { notFound, redirect } from "next/navigation";
import { db } from "@/core/db";

/** /m/<module> opens the module's first record type. */
export default async function CustomModuleIndex({ params }: { params: Promise<{ module: string }> }) {
  const { module: slug } = await params;
  const first = await db.customEntity.findFirst({
    where: { module: { slug, isActive: true } },
    orderBy: { sortOrder: "asc" },
  });
  if (!first) notFound();
  redirect(`/m/${slug}/${first.slug}`);
}
