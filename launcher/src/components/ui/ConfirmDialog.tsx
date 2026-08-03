import { useId } from "react";
import { AlertTriangle, X } from "lucide-react";

import { Button } from "./Button";
import { ModalDialog } from "./ModalDialog";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const messageId = useId();
  const titleId = useId();

  if (!open) {
    return null;
  }

  return (
    <ModalDialog
      labelledBy={titleId}
      describedBy={messageId}
      backdropClassName="neo-dots-ink fixed inset-0 z-50 flex items-center justify-center p-4"
      panelClassName="w-full max-w-[440px] border-4 border-black bg-[#f5eedf] shadow-[6px_6px_0_#171411]"
      initialFocusSelector="[data-safe-action]"
      onDismiss={onCancel}
    >
      <div className="flex items-start justify-between gap-3 border-b-2 border-black bg-[#fbf4e7] px-4 py-3">
        <div className="flex items-center gap-2">
          {destructive ? (
            <AlertTriangle className="h-5 w-5 text-[#c20b2f]" aria-hidden="true" />
          ) : null}
          <h2 id={titleId} className="neo-title text-xl leading-none text-[#171411] uppercase">
            {title}
          </h2>
        </div>
        <button
          aria-label="Close dialog"
          className="flex h-7 w-7 items-center justify-center border-2 border-black bg-[#efe6d4] text-[#171411] hover:bg-[#d9d0bb]"
          type="button"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-4">
        <p id={messageId} className="neo-copy text-xs leading-6 font-bold text-[#55504a] uppercase">
          {message}
        </p>
      </div>

      <div className="flex items-center justify-end gap-2 border-t-2 border-black bg-[#fbf4e7] px-4 py-3">
        <Button data-safe-action size="sm" type="button" variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          size="sm"
          type="button"
          variant={destructive ? "danger" : "primary"}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </ModalDialog>
  );
}
