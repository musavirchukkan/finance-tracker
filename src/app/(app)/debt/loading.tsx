export default function DebtLoading() {
  return (
    <div className="page-stack page-enter" aria-busy="true" aria-label="Loading">
      <div className="skeleton-block title" />
      <div className="skeleton-block" />
      <div className="skeleton-grid">
        <div className="skeleton-block card insight" />
        <div className="skeleton-block card insight" />
        <div className="skeleton-block card insight" />
      </div>
      <div className="skeleton-block tall" />
    </div>
  );
}
