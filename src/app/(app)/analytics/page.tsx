import { redirect } from "next/navigation";

export default async function AnalyticsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const q = params.month ? `?month=${params.month}` : "";
  redirect(`/budget${q}`);
}
