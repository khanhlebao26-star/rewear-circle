import HomePage from "@/features/home/HomePage";
import { getPublicListingData } from "@/lib/publicListingData";

export const dynamic = "force-dynamic";

export default async function HomeRoute() {
  const { data, error } = await getPublicListingData("/listings?limit=8");
  return <HomePage items={data} error={error} />;
}
