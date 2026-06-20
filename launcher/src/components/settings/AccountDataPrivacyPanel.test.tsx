import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountDataPrivacyPanel } from "./AccountDataPrivacyPanel";
import {
  cancelAccountDeletion,
  exportUserData,
  getLatestAccountDeletionRequest,
  requestAccountDeletion,
} from "../../lib/supabase/privacy";

vi.mock("../../lib/supabase/privacy", () => ({
  cancelAccountDeletion: vi.fn(),
  exportUserData: vi.fn(),
  getLatestAccountDeletionRequest: vi.fn(),
  requestAccountDeletion: vi.fn(),
}));

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  root = null;
  document.body.innerHTML = "";
});

function renderWithRoot(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(node);
  });
  return container;
}

async function waitForAssertion(assertion: () => void) {
  const timeoutAt = Date.now() + 1000;
  let lastError: unknown;

  while (Date.now() < timeoutAt) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

function findButton(container: HTMLElement, label: RegExp) {
  const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
    label.test(candidate.textContent ?? ""),
  );

  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button;
}

function updateTextarea(container: HTMLElement, label: string, value: string) {
  const textarea = Array.from(container.querySelectorAll("textarea")).find((candidate) => {
    const id = candidate.getAttribute("id");
    return id && container.querySelector(`label[for="${id}"]`)?.textContent === label;
  });

  if (!textarea) {
    throw new Error(`Textarea not found: ${label}`);
  }

  textarea.value = value;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("AccountDataPrivacyPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(cancelAccountDeletion).mockReset();
    vi.mocked(exportUserData).mockReset();
    vi.mocked(getLatestAccountDeletionRequest).mockReset();
    vi.mocked(requestAccountDeletion).mockReset();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:local-export"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("does not call Supabase while rendering local account data mode", async () => {
    const container = renderWithRoot(<AccountDataPrivacyPanel mode="local" />);

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Local Account Preview");
      expect(container).toHaveTextContent("Clear");
      expect(container).toHaveTextContent("Cron Dry-run Packet");
      expect(container).toHaveTextContent('{"dry_run":true,"limit":20}');
      expect(container).toHaveTextContent("Writes disabled");
      expect(container).toHaveTextContent("Bearer $ACCOUNT_DELETION_PROCESSOR_SECRET");
      expect(container).toHaveTextContent("does not call hosted cron");
      expect(container).toHaveTextContent("Hosted Cron Staging Proof");
      expect(container).toHaveTextContent("account_deletion_processor_runs");
      expect(container).toHaveTextContent("account-deletion-fixture");
      expect(container).toHaveTextContent("Supabase Scheduled Functions staging");
      expect(container).toHaveTextContent("No verify-route deletion write");
      expect(container).toHaveTextContent("No processor secret value");
      expect(container).toHaveTextContent("No raw request id");
      expect(container).toHaveTextContent("No raw user id");
      expect(container).toHaveTextContent("No auth user deletion");
      expect(container).toHaveTextContent("No storage deletion");
      expect(container).toHaveTextContent("No hosted cron success claim");
    });
    expect(getLatestAccountDeletionRequest).not.toHaveBeenCalled();
    expect(container).not.toHaveTextContent(/hosted cron (verified|ready|complete|passed)/i);
  });

  it("stores local deletion requests and exports local JSON without Supabase calls", async () => {
    const container = renderWithRoot(<AccountDataPrivacyPanel mode="local" />);

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Local Account Preview");
      expect(findButton(container, /Request Deletion/i)).not.toBeDisabled();
    });

    await act(async () => {
      updateTextarea(container, "Deletion note", "local verification");
      findButton(container, /Request Deletion/i).click();
    });

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Pending");
      expect(container).toHaveTextContent("account-deletion-request-redacted");
      expect(container).toHaveTextContent("user-id-redacted");
      expect(container).not.toHaveTextContent("local-privacy-user");
      expect(window.localStorage.getItem("og-launcher:privacy-account-deletion:v1")).toContain(
        '"status":"pending"',
      );
    });
    expect(requestAccountDeletion).not.toHaveBeenCalled();

    await act(async () => {
      findButton(container, /Export JSON/i).click();
    });

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Local data export ready.");
    });
    expect(exportUserData).not.toHaveBeenCalled();
    expect(cancelAccountDeletion).not.toHaveBeenCalled();
  });

  it("keeps processor-claimed deletion requests active instead of showing clear", async () => {
    vi.mocked(getLatestAccountDeletionRequest).mockResolvedValue({
      cancelled_at: null,
      completed_at: null,
      created_at: "2026-06-10T10:00:00.000Z",
      error_message: null,
      failed_at: null,
      id: "33333333-3333-4333-8333-333333333333",
      reason: "leaving",
      request_metadata: { processor_started_at: "2026-07-10T10:00:00.000Z" },
      requested_at: "2026-06-10T10:00:00.000Z",
      scheduled_at: "2026-07-10T10:00:00.000Z",
      status: "processing",
      updated_at: "2026-07-10T10:00:00.000Z",
      user_id: "44444444-4444-4444-8444-444444444444",
    });

    const container = renderWithRoot(<AccountDataPrivacyPanel />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitForAssertion(() => {
      expect(container).toHaveTextContent("Processing");
      expect(container).toHaveTextContent("Processor claimed");
      expect(container).toHaveTextContent("Cancellation is closed");
      expect(container).not.toHaveTextContent("No pending account deletion request.");
      expect(findButton(container, /Request Deletion/i)).toBeDisabled();
      expect(findButton(container, /Cancel/i)).toBeDisabled();
    });
  });
});
