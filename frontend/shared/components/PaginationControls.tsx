"use client";

type PaginationControlsProps = {
  page: number;
  onPageChange: (newPage: number) => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
  isLoading?: boolean;
  totalPages?: number;
};

export default function PaginationControls({
  page,
  onPageChange,
  hasNext = true,
  hasPrevious = true,
  isLoading,
  totalPages,
}: PaginationControlsProps) {
  const disablePrev = isLoading || page <= 1 || !hasPrevious;
  const disableNext =
    isLoading ||
    !hasNext ||
    (typeof totalPages === "number" && page >= totalPages);

  return (
    <nav
      className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3"
      aria-label="Pagination"
    >
      <button
        type="button"
        aria-label="Go to previous page"
        className="ui-btn ui-btn-secondary"
        onClick={() => onPageChange(page - 1)}
        disabled={disablePrev}
      >
        Previous
      </button>
      <p
        className="order-3 w-full text-center text-sm text-slate-400 sm:order-none sm:w-auto"
        aria-current="page"
      >
        Page {page}
        {typeof totalPages === "number" ? ` of ${totalPages}` : ""}
      </p>
      <button
        type="button"
        aria-label="Go to next page"
        className="ui-btn ui-btn-secondary"
        onClick={() => onPageChange(page + 1)}
        disabled={disableNext}
      >
        Next
      </button>
    </nav>
  );
}
