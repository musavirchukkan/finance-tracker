"use client";

import { useEffect, useId, useRef } from "react";

type ModalProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** When true, only backdrop + panel; children supply the chrome */
  bare?: boolean;
};

export function Modal({
  open,
  title,
  onClose,
  children,
  size = "sm",
  bare = false,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <dialog
      ref={dialogRef}
      className={`modal modal-${size}${bare ? " modal-bare" : ""}`}
      aria-labelledby={bare || !title ? undefined : titleId}
      aria-label={bare ? title : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        {!bare && title ? (
          <div className="modal-head">
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        ) : null}
        <div className={bare ? "modal-body bare" : "modal-body"}>{children}</div>
      </div>
    </dialog>
  );
}
