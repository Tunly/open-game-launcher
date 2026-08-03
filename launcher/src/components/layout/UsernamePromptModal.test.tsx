import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UsernamePromptModal } from "./UsernamePromptModal";

const profileMocks = vi.hoisted(() => ({
  isUsernameAvailable: vi.fn(),
  updateMyProfile: vi.fn(),
}));

vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ user: { id: "user-1" } }),
}));

vi.mock("../../lib/supabase/profile", () => profileMocks);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe("UsernamePromptModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores an older availability response after the username changes", async () => {
    const firstCheck = deferred<boolean>();
    const secondCheck = deferred<boolean>();
    profileMocks.isUsernameAvailable.mockImplementation((username: string) =>
      username === "alpha_player" ? firstCheck.promise : secondCheck.promise,
    );

    render(<UsernamePromptModal onComplete={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: /username/i });

    fireEvent.change(input, { target: { value: "alpha_player" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(profileMocks.isUsernameAvailable).toHaveBeenCalledWith("alpha_player"),
    );

    fireEvent.change(input, { target: { value: "beta_player" } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(profileMocks.isUsernameAvailable).toHaveBeenCalledWith("beta_player"),
    );

    await act(async () => {
      secondCheck.resolve(true);
      await secondCheck.promise;
    });
    expect(screen.getByText("Username is available.")).toBeVisible();

    await act(async () => {
      firstCheck.resolve(false);
      await firstCheck.promise;
    });

    expect(screen.getByText("Username is available.")).toBeVisible();
    expect(screen.queryByText("Username is taken.")).not.toBeInTheDocument();
    expect(screen.queryByText("Username is already taken.")).not.toBeInTheDocument();
  });
});
