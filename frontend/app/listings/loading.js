import { Loading } from "@/components/ui/Feedback";

export default function ListingsLoading() {
  return (
    <main id="main-content" className="shell page" tabIndex={-1}>
      <Loading cards />
    </main>
  );
}
