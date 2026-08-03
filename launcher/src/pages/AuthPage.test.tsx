import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthPage } from "./AuthPage";

type AuthStateCallback = (event: string) => void;

let authStateCallback: AuthStateCallback | null = null;

const authMocks = vi.hoisted(() => ({
  onAuthStateChange: vi.fn((callback: AuthStateCallback) => {
    authStateCallback = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  }),
  resetPasswordForEmail: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  updateUser: vi.fn(),
}));

const profileMocks = vi.hoisted(() => ({
  getMyProfile: vi.fn(),
  isUsernameAvailable: vi.fn(),
  updateMyProfile: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: { auth: authMocks },
}));

vi.mock("../lib/supabase/profile", () => profileMocks);

vi.mock("../components/auth/TurnstileWidget", () => ({
  TurnstileWidget: ({ onToken }: { onToken: (token: string) => void }) => (
    <button type="button" onClick={() => onToken("captcha-token")}>
      Complete bot check
    </button>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/auth"]}>
      <AuthPage />
    </MemoryRouter>,
  );
}

describe("AuthPage account recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    authStateCallback = null;
    authMocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    authMocks.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    authMocks.signOut.mockResolvedValue({ error: null });
    authMocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
    authMocks.updateUser.mockResolvedValue({ data: {}, error: null });
    profileMocks.isUsernameAvailable.mockResolvedValue(true);
  });

  it("sends a password recovery link with an allow-listable auth redirect", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /forgot password/i }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "pilot@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send recovery link/i }));

    await waitFor(() =>
      expect(authMocks.resetPasswordForEmail).toHaveBeenCalledWith("pilot@example.com", {
        captchaToken: undefined,
        redirectTo: "http://localhost:3000/auth",
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(/recovery link sent/i);
  });

  it("accepts a recovery session and replaces the password before local sign-out", async () => {
    renderPage();

    act(() => authStateCallback?.("PASSWORD_RECOVERY"));
    fireEvent.change(screen.getByLabelText("New Password"), {
      target: { value: "MangaPilot1!" },
    });
    fireEvent.change(screen.getByLabelText("Repeat Password"), {
      target: { value: "MangaPilot1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save new password/i }));

    await waitFor(() =>
      expect(authMocks.updateUser).toHaveBeenCalledWith({ password: "MangaPilot1!" }),
    );
    expect(authMocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(screen.getByRole("status")).toHaveTextContent(/password updated/i);
  });

  it("enforces the configured strong-password contract before signup", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Signup" }));
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "manga-pilot" } });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "pilot@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "alllowercase" } });
    fireEvent.change(screen.getByLabelText("Repeat Password"), {
      target: { value: "alllowercase" },
    });
    fireEvent.submit(screen.getByRole("form", { name: /launcher account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/lower- and uppercase/i);
    expect(authMocks.signUp).not.toHaveBeenCalled();
  });

  it("requires and forwards a Turnstile token only when a public site key is configured", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "1x00000000000000000000AA");
    renderPage();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "pilot@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "existing" } });
    fireEvent.submit(screen.getByRole("form", { name: /launcher account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/complete the bot check/i);
    expect(authMocks.signInWithPassword).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /complete bot check/i }));
    fireEvent.submit(screen.getByRole("form", { name: /launcher account/i }));

    await waitFor(() =>
      expect(authMocks.signInWithPassword).toHaveBeenCalledWith({
        email: "pilot@example.com",
        options: { captchaToken: "captcha-token" },
        password: "existing",
      }),
    );
  });
});
