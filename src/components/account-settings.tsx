"use client";

import { useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { ActionForm } from "@/components/action-form";
import { Modal } from "@/components/modal";
import { changePassword } from "@/lib/actions";
import { clearClientState } from "@/lib/client-cache";

type Props = {
  email: string;
  name: string;
};

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function AccountSettings({ email, name }: Props) {
  const [signingOut, startSignOut] = useTransition();
  const [open, setOpen] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  function handleSignOut() {
    startSignOut(async () => {
      await clearClientState();
      await signOut({ callbackUrl: "/login" });
    });
  }

  function closeModal() {
    setOpen(false);
    setShowCurrent(false);
    setShowNew(false);
  }

  return (
    <section className="panel account-panel">
      <div className="panel-head">
        <div>
          <h2>Account</h2>
          <p className="muted page-sub" style={{ margin: "0.25rem 0 0" }}>
            Change your password or sign out and clear offline data.
          </p>
        </div>
      </div>

      <div className="account-meta">
        <div>
          <span className="muted" style={{ fontSize: "0.75rem" }}>
            Signed in as
          </span>
          <p style={{ margin: "0.15rem 0 0", fontWeight: 650 }}>{name}</p>
          <p className="muted" style={{ margin: "0.1rem 0 0" }}>
            {email}
          </p>
        </div>
        <div className="account-password-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setOpen(true)}
          >
            Change password
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={signingOut}
            onClick={handleSignOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>

      <Modal open={open} title="Change password" onClose={closeModal}>
        <ActionForm
          action={changePassword}
          successMessage="Password updated"
          errorMessage="Could not update password"
          className="form-stack"
          resetOnSuccess
          onSuccess={closeModal}
        >
          <div className="field">
            <label htmlFor="currentPassword">Current password</label>
            <div className="password-field">
              <input
                id="currentPassword"
                name="currentPassword"
                type={showCurrent ? "text" : "password"}
                required
                minLength={6}
                autoComplete="current-password"
                autoFocus
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showCurrent ? "Hide password" : "Show password"}
                aria-pressed={showCurrent}
                onClick={() => setShowCurrent((v) => !v)}
              >
                <EyeIcon open={showCurrent} />
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="newPassword">New password</label>
            <div className="password-field">
              <input
                id="newPassword"
                name="newPassword"
                type={showNew ? "text" : "password"}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showNew ? "Hide password" : "Show password"}
                aria-pressed={showNew}
                onClick={() => setShowNew((v) => !v)}
              >
                <EyeIcon open={showNew} />
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showNew ? "text" : "password"}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={closeModal}
            >
              Cancel
            </button>
            <button className="btn btn-primary" type="submit">
              Update password
            </button>
          </div>
        </ActionForm>
      </Modal>
    </section>
  );
}
