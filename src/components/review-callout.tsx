type ReviewCalloutProps = {
  title: string;
  children: React.ReactNode;
};

/** Soft warning for reconciliation issues (negative bank, over-limit card). */
export function ReviewCallout({ title, children }: ReviewCalloutProps) {
  return (
    <aside className="review-callout" role="status">
      <strong className="review-callout-title">{title}</strong>
      <div className="review-callout-body">{children}</div>
    </aside>
  );
}
