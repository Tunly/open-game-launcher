import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { FAMILY_LOCAL_RELAY_STORAGE_KEY } from "../lib/supabase/family";
import type { FamilyGroup, FamilyMember, FamilySharedGame } from "../lib/types/family";
import { FamilyPage } from "./FamilyPage";

interface LocalFamilyRelayState {
  activeFamilyId: string | null;
  groups: FamilyGroup[];
  members: FamilyMember[];
  sharedGames: FamilySharedGame[];
}

vi.mock("../lib/supabase/client", () => ({
  getSupabaseClient: vi.fn(() => {
    throw new Error("Missing Supabase environment variables.");
  }),
}));

function renderFamilyRoute() {
  return render(
    <MemoryRouter initialEntries={["/family"]}>
      <Routes>
        <Route element={<FamilyPage />} path="/family" />
      </Routes>
    </MemoryRouter>,
  );
}

function readStoredRelayState(): LocalFamilyRelayState {
  return JSON.parse(
    window.localStorage.getItem(FAMILY_LOCAL_RELAY_STORAGE_KEY) ?? "{}",
  ) as LocalFamilyRelayState;
}

function seedStoredRelayState(state: LocalFamilyRelayState) {
  window.localStorage.setItem(FAMILY_LOCAL_RELAY_STORAGE_KEY, JSON.stringify(state));
}

describe("FamilyPage local relay fallback", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("creates a browser-local family relay when Supabase is unavailable and persists it", async () => {
    const { unmount } = renderFamilyRoute();

    expect(
      await screen.findByRole("heading", { name: /create family group/i }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/family name/i), {
      target: { value: "Arcade Household" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create relay/i }));

    expect(await screen.findByText("Family relay created: Arcade Household")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Arcade Household" })).toBeInTheDocument();
    expect(screen.getByText("1/6")).toBeInTheDocument();
    expect(screen.getByText("local-preview-player")).toBeInTheDocument();

    const storedState = readStoredRelayState();
    expect(storedState.activeFamilyId).toBe(storedState.groups[0]?.id);
    expect(storedState.groups[0]?.name).toBe("Arcade Household");
    expect(storedState.groups[0]?.inviteCode).toMatch(/^[A-Z0-9]{8}$/);

    unmount();
    renderFamilyRoute();

    expect(await screen.findByRole("heading", { name: "Arcade Household" })).toBeInTheDocument();
    expect(screen.getByText("1/6")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /create family group/i })).not.toBeInTheDocument();
  });

  it("joins a seeded browser-local relay by invite code and persists membership", async () => {
    const seededGroup: FamilyGroup = {
      id: "local-family-seeded",
      ownerId: "remote-preview-owner",
      name: "Cartridge Coop",
      inviteCode: "JOIN1234",
      maxMembers: 6,
      createdAt: "2026-06-13T08:00:00.000Z",
      updatedAt: "2026-06-13T08:00:00.000Z",
    };
    const seededOwner: FamilyMember = {
      id: "local-family-member-owner",
      familyId: seededGroup.id,
      userId: "remote-preview-owner",
      role: "owner",
      joinedAt: "2026-06-13T08:00:00.000Z",
    };
    seedStoredRelayState({
      activeFamilyId: null,
      groups: [seededGroup],
      members: [seededOwner],
      sharedGames: [],
    });

    const { unmount } = renderFamilyRoute();

    expect(
      await screen.findByRole("heading", { name: /join existing family/i }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/invite code/i), {
      target: { value: "join1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join relay/i }));

    expect(await screen.findByText("Joined family relay: Cartridge Coop")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cartridge Coop" })).toBeInTheDocument();
    expect(screen.getByText("2/6")).toBeInTheDocument();

    const storedState = readStoredRelayState();
    expect(storedState.activeFamilyId).toBe(seededGroup.id);
    expect(
      storedState.members.some(
        (member) => member.familyId === seededGroup.id && member.userId === "local-preview-player",
      ),
    ).toBe(true);

    unmount();
    renderFamilyRoute();

    expect(await screen.findByRole("heading", { name: "Cartridge Coop" })).toBeInTheDocument();
    expect(screen.getByText("2/6")).toBeInTheDocument();
  });
});
