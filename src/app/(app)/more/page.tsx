import { MoreHub } from "@/components/more-hub";

export default function MorePage() {
  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <h2 className="page-title">More</h2>
          <p className="muted page-sub">
            Transactions, budget, and settings.
          </p>
        </div>
      </div>

      <section className="panel">
        <MoreHub />
      </section>
    </div>
  );
}
