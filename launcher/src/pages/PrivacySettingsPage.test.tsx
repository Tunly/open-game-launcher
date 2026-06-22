import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUserMock = vi.hoisted(() => vi.fn());
const profileMocks = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  updateMyProfilePrivacy: vi.fn(),
}));
const privacyMocks = vi.hoisted(() => ({
  cancelAccountDeletion: vi.fn(),
  exportUserData: vi.fn(),
  getLatestAccountDeletionRequest: vi.fn(),
  requestAccountDeletion: vi.fn(),
}));

vi.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: currentUserMock,
}));

vi.mock("../lib/supabase/profile", () => profileMocks);

vi.mock("../lib/supabase/privacy", () => privacyMocks);

import { PrivacySettingsPage } from "./PrivacySettingsPage";

function renderPrivacyRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<PrivacySettingsPage />} path="/settings/privacy" />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PrivacySettingsPage verification routes", () => {
  beforeEach(() => {
    currentUserMock.mockReturnValue({
      isConfigured: true,
      isLoading: false,
      user: { id: "user-1" },
    });
    profileMocks.getMyProfile.mockReset();
    profileMocks.updateMyProfilePrivacy.mockReset();
    privacyMocks.cancelAccountDeletion.mockReset();
    privacyMocks.exportUserData.mockReset();
    privacyMocks.getLatestAccountDeletionRequest.mockReset();
    privacyMocks.requestAccountDeletion.mockReset();
  });

  it("forces local cron dry-run packet evidence on the processor verify route", async () => {
    renderPrivacyRoute("/settings/privacy?verify=deletion-processor-cron-dry-run-packet");

    expect(await screen.findByText("Local Privacy Preview")).toBeVisible();
    expect(screen.getAllByText("Cron Dry-run Packet").length).toBeGreaterThan(0);
    expect(screen.getByText("POST /functions/v1/process-account-deletions")).toBeInTheDocument();
    expect(screen.getByText('{"dry_run":true,"limit":20}')).toBeInTheDocument();
    expect(screen.getByText("Writes disabled")).toBeInTheDocument();
    expect(screen.getByText("Hosted Cron Staging Proof")).toBeInTheDocument();
    expect(screen.getByText("account_deletion_processor_runs")).toBeInTheDocument();
    expect(screen.getAllByText(/account-deletion-fixture/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Supabase Scheduled Functions staging")).toBeInTheDocument();
    expect(screen.getByText("No verify-route deletion write")).toBeInTheDocument();
    expect(screen.getByText("No processor secret value")).toBeInTheDocument();
    expect(screen.getByText("No raw request id")).toBeInTheDocument();
    expect(screen.getByText("No raw user id")).toBeInTheDocument();
    expect(screen.getByText("No auth user deletion")).toBeInTheDocument();
    expect(screen.getByText("No storage deletion")).toBeInTheDocument();
    expect(screen.getByText("No hosted cron success claim")).toBeInTheDocument();
    expect(
      screen.getByText(/does not call hosted cron, delete storage, or delete auth users/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Final DSGVO processor go-live still needs hosted cron delivery/i),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/hosted cron (verified|complete|passed)/i);
    expect(profileMocks.getMyProfile).not.toHaveBeenCalled();
    expect(privacyMocks.getLatestAccountDeletionRequest).not.toHaveBeenCalled();
  });
});
