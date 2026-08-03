import { useEffect, useRef, type ReactNode } from "react";

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface ModalDialogProps {
  labelledBy: string;
  children: ReactNode;
  backdropClassName: string;
  panelClassName: string;
  describedBy?: string;
  initialFocusSelector?: string;
  onDismiss?: () => void;
}

function focusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => element.getAttribute("aria-hidden") !== "true",
  );
}

export function ModalDialog({
  labelledBy,
  children,
  backdropClassName,
  panelClassName,
  describedBy,
  initialFocusSelector,
  onDismiss,
}: ModalDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const panel = panelRef.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!panel) return;
    const dialogPanel = panel;

    const initialFocus = initialFocusSelector
      ? dialogPanel.querySelector<HTMLElement>(initialFocusSelector)
      : null;
    (initialFocus ?? focusableElements(dialogPanel)[0] ?? dialogPanel).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && onDismissRef.current) {
        event.preventDefault();
        onDismissRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableElements(dialogPanel);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogPanel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [initialFocusSelector]);

  return (
    <div className={backdropClassName}>
      <div
        ref={panelRef}
        aria-describedby={describedBy}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={panelClassName}
        role="dialog"
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
