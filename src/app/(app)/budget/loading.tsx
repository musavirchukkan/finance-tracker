export default function BudgetLoading() {
  return (
    <div className="page-stack page-enter" aria-busy="true" aria-label="Loading">
      <div className="skeleton-block title" />
      <div className="skeleton-block" />
      <div className="skeleton-grid cols-4">
        <div className="skeleton-block card insight" />
        <div className="skeleton-block card insight" />
        <div className="skeleton-block card insight" />
        <div className="skeleton-block card insight" />
      </div>
      <div className="skeleton-block tall" />
      <div className="skeleton-block tall" />
    </div>
  );
}
