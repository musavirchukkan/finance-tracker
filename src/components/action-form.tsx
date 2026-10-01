"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast";

type ServerAction = (formData: FormData) => Promise<void> | void;

type Props = {
  action: ServerAction;
  successMessage: string;
  errorMessage?: string;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  resetOnSuccess?: boolean;
  confirmMessage?: string;
  onSuccess?: () => void;
};

export function ActionForm({
  action,
  successMessage,
  errorMessage = "Something went wrong. Try again.",
  className,
  id,
  style,
  children,
  resetOnSuccess,
  confirmMessage,
  onSuccess,
}: Props) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      id={id}
      className={className}
      style={style}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmMessage && !window.confirm(confirmMessage)) return;
        const form = e.currentTarget;
        const fd = new FormData(form);
        startTransition(async () => {
          try {
            await action(fd);
            toast.success(successMessage);
            if (resetOnSuccess) form.reset();
            onSuccess?.();
            router.refresh();
          } catch (err) {
            console.error(err);
            const message =
              err instanceof Error && err.message.trim()
                ? err.message
                : errorMessage;
            toast.error(message);
          }
        });
      }}
    >
      <fieldset
        disabled={pending}
        style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}
      >
        {children}
      </fieldset>
    </form>
  );
}
