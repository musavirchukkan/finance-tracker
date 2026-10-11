export function ExportDataCard() {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Export data</h2>
          <p className="muted page-sub" style={{ margin: "0.25rem 0 0" }}>
            Download all transactions before a DB wipe or schema change. Use the
            file as a reference while re-entering values.
          </p>
        </div>
      </div>

      <div className="dash-actions" style={{ justifyContent: "flex-start" }}>
        <a
          className="btn btn-primary"
          href="/api/export/transactions?format=csv"
          download
        >
          Download CSV
        </a>
        <a
          className="btn btn-ghost"
          href="/api/export/transactions?format=json"
          download
        >
          Download JSON
        </a>
      </div>
    </section>
  );
}
