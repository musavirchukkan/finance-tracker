"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";

type InfoTipProps = {
  title: string;
  children: React.ReactNode;
  /** Accessible name for the trigger button */
  label?: string;
};

export function InfoTip({
  title,
  children,
  label = "More info",
}: InfoTipProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="info-tip-btn"
        aria-label={label}
        onClick={() => setOpen(true)}
      >
        i
      </button>
      <Modal open={open} title={title} onClose={() => setOpen(false)} size="sm">
        <div className="info-tip-body">{children}</div>
      </Modal>
    </>
  );
}
