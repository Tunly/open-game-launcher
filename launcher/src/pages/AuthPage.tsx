import {
  CheckCircle2,
  KeyRound,
  LogIn,
  Mail,
  RotateCcw,
  Search,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { TurnstileWidget } from "../components/auth/TurnstileWidget";
import { getErrorMessage } from "../lib/formatters";
import { supabase } from "../lib/supabase";
import { getMyProfile, isUsernameAvailable, updateMyProfile } from "../lib/supabase/profile";
import { usernameSchema } from "../lib/validation/profile";

type AuthMode = "forgot-password" | "reset-password" | "sign-in" | "sign-up";
type UsernameStatus = "idle" | "checking" | "available" | "taken";

const minimumPasswordLength = 10;

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function hasRecoveryCallback() {
  return (
    window.location.hash.includes("type=recovery") ||
    new URLSearchParams(window.location.search).get("type") === "recovery"
  );
}

function validateNewPassword(password: string): string | null {
  if (password.length < minimumPasswordLength) {
    return `Password must contain at least ${minimumPasswordLength} characters.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return "Password must contain lower- and uppercase letters.";
  }
  if (!/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "Password must contain a number and a symbol.";
  }
  return null;
}

function passwordResetRedirectUrl() {
  const configuredUrl = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();
  if (configuredUrl) return configuredUrl;
  return new URL("/auth", window.location.origin).toString();
}

export function AuthPage() {
  const navigate = useNavigate();
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";
  const [mode, setMode] = useState<AuthMode>(() =>
    hasRecoveryCallback() ? "reset-password" : "sign-in",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaEpoch, setCaptchaEpoch] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetCaptcha = useCallback(() => {
    setCaptchaToken(null);
    setCaptchaEpoch((epoch) => epoch + 1);
  }, []);

  const handleCaptchaError = useCallback((nextError: string) => {
    setErrorMessage(nextError);
  }, []);

  const handleCaptchaToken = useCallback((token: string | null) => {
    setCaptchaToken(token);
    if (token) setErrorMessage(null);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "PASSWORD_RECOVERY") return;
      setMode("reset-password");
      setMessage("Recovery link accepted. Set a new password.");
      setErrorMessage(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrorMessage(null);
    setMessage(null);
    setPassword("");
    setConfirmPassword("");
    setUsername("");
    setUsernameStatus("idle");
    resetCaptcha();
  }

  async function checkUsername() {
    const normalizedUsername = normalizeUsername(username);
    const parsed = usernameSchema.safeParse(normalizedUsername);

    if (!parsed.success) {
      setUsernameStatus("idle");
      setErrorMessage(parsed.error.issues[0]?.message ?? "Username is invalid.");
      return false;
    }

    setUsernameStatus("checking");
    setErrorMessage(null);

    try {
      const available = await isUsernameAvailable(parsed.data);
      setUsernameStatus(available ? "available" : "taken");
      if (!available) setErrorMessage("Username is already taken.");
      return available;
    } catch (error) {
      setUsernameStatus("idle");
      setErrorMessage(getErrorMessage(error));
      return false;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setErrorMessage(null);

    if (!supabase) {
      setErrorMessage("Supabase is not configured.");
      setIsSubmitting(false);
      return;
    }

    const captchaRequired = Boolean(turnstileSiteKey) && mode !== "reset-password";
    if (captchaRequired && !captchaToken) {
      setErrorMessage("Complete the bot check before continuing.");
      setIsSubmitting(false);
      return;
    }

    if (mode === "forgot-password") {
      try {
        const result = await supabase.auth.resetPasswordForEmail(email, {
          captchaToken: captchaToken ?? undefined,
          redirectTo: passwordResetRedirectUrl(),
        });
        if (result.error) throw result.error;
        setMessage("Recovery link sent. Check your inbox and local spam folder.");
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        resetCaptcha();
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === "reset-password") {
      const passwordError = validateNewPassword(password);
      if (passwordError) {
        setErrorMessage(passwordError);
        setIsSubmitting(false);
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage("Passwords do not match.");
        setIsSubmitting(false);
        return;
      }

      try {
        const result = await supabase.auth.updateUser({ password });
        if (result.error) throw result.error;
        const signOutResult = await supabase.auth.signOut({ scope: "local" });
        if (signOutResult.error) throw signOutResult.error;
        setMode("sign-in");
        setPassword("");
        setConfirmPassword("");
        setMessage("Password updated. Sign in with your new password.");
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (mode === "sign-in") {
      try {
        const result = await supabase.auth.signInWithPassword({
          email,
          options: { captchaToken: captchaToken ?? undefined },
          password,
        });
        if (result.error) throw result.error;
        setMessage("Login successful.");
        setPassword("");
        navigate("/store", { replace: true });
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        resetCaptcha();
        setIsSubmitting(false);
      }
      return;
    }

    const passwordError = validateNewPassword(password);
    if (passwordError) {
      setErrorMessage(passwordError);
      setIsSubmitting(false);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      setIsSubmitting(false);
      return;
    }

    const normalizedUsername = normalizeUsername(username);
    const usernameAvailable = await checkUsername();
    if (!usernameAvailable) {
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await supabase.auth.signUp({
        email,
        options: {
          captchaToken: captchaToken ?? undefined,
          data: {
            display_name: normalizedUsername,
            username: normalizedUsername,
          },
          emailRedirectTo: passwordResetRedirectUrl(),
        },
        password,
      });

      if (result.error) throw result.error;

      if (result.data.session) {
        try {
          await getMyProfile();
          await updateMyProfile({
            displayName: normalizedUsername,
            username: normalizedUsername,
          });
        } catch (profileError) {
          const profileMessage = getErrorMessage(profileError).toLowerCase();
          if (profileMessage.includes("username") && profileMessage.includes("taken")) {
            setErrorMessage(
              "Username was taken before profile setup finished. Pick another username after login.",
            );
          } else {
            setMessage(
              `Account created. Continue profile setup after login: ${getErrorMessage(profileError)}`,
            );
          }
          setPassword("");
          setConfirmPassword("");
          return;
        }
      }

      setMessage(
        result.data.session
          ? "Account created. Username was saved."
          : "Account created. Confirm your email, then sign in to finish profile setup.",
      );
      setPassword("");
      setConfirmPassword("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      resetCaptcha();
      setIsSubmitting(false);
    }
  }

  const usernameStatusText =
    usernameStatus === "checking"
      ? "Checking database..."
      : usernameStatus === "available"
        ? "Username is available."
        : usernameStatus === "taken"
          ? "Username is taken."
          : "3-32 characters: letters, numbers, _, . or -";
  const needsPassword = mode !== "forgot-password";
  const needsStrongPassword = mode === "sign-up" || mode === "reset-password";
  const showsTurnstile = Boolean(turnstileSiteKey) && mode !== "reset-password";
  const submitLabel =
    mode === "sign-in"
      ? "Sign In"
      : mode === "sign-up"
        ? "Sign Up"
        : mode === "forgot-password"
          ? "Send Recovery Link"
          : "Save New Password";

  return (
    <section className="grid min-h-[calc(100vh-150px)] content-center gap-6 py-4 sm:py-6 lg:min-h-[calc(100vh-112px)] lg:grid-cols-[minmax(0,1fr)_390px] lg:items-center">
      <div className="max-w-[680px]">
        <span className="neo-copy inline-flex border-2 border-black bg-[#171411] px-3 py-1 text-xs font-bold text-white uppercase shadow-[3px_3px_0_#171411]">
          Supabase Auth
        </span>
        <h1 className="neo-title mt-4 max-w-[620px] text-[3.5rem] leading-[0.82] text-[#171411] sm:text-[4.5rem] lg:text-[5.4rem] xl:text-[6rem]">
          Launcher Account
        </h1>
        <p className="neo-copy mt-5 max-w-[560px] text-xs leading-6 font-bold text-[#55504a] uppercase">
          Library, downloads, and community features are account-bound. Store browsing and local
          settings stay available without login.
        </p>
      </div>

      <form
        aria-label="Launcher account"
        className="border-4 border-black bg-[#f5eedf] p-5 shadow-[6px_6px_0_#171411]"
        onSubmit={handleSubmit}
      >
        {mode !== "reset-password" && (
          <div className="mb-5 flex border-2 border-black bg-[#efe6d4] p-1">
            {(["sign-in", "sign-up"] as const).map((item) => (
              <button
                key={item}
                className={`neo-copy flex h-10 flex-1 items-center justify-center gap-2 text-[10px] font-bold uppercase ${
                  mode === item ? "bg-[#087d6d] text-white" : "text-[#171411]"
                }`}
                type="button"
                onClick={() => switchMode(item)}
              >
                {item === "sign-in" ? (
                  <LogIn className="h-4 w-4" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {item === "sign-in" ? "Login" : "Signup"}
              </button>
            ))}
          </div>
        )}

        {(mode === "forgot-password" || mode === "reset-password") && (
          <div className="mb-4 border-2 border-black bg-[#8cf5e4] p-3">
            <p className="neo-copy text-[10px] font-black text-[#171411] uppercase">
              {mode === "forgot-password" ? "Account Recovery" : "Set New Password"}
            </p>
          </div>
        )}

        {mode === "sign-up" && (
          <div className="mb-4">
            <div className="grid gap-2">
              <label
                className="neo-copy text-[10px] font-bold text-[#55504a] uppercase"
                htmlFor="auth-username"
              >
                Username
              </label>
              <span className="flex h-12 items-center gap-3 border-2 border-black bg-[#fbf8ef] px-3">
                <UserPlus className="h-5 w-5 shrink-0" />
                <input
                  required
                  autoComplete="username"
                  className="min-w-0 flex-1 bg-transparent text-base font-black lowercase outline-none"
                  id="auth-username"
                  maxLength={32}
                  minLength={3}
                  value={username}
                  onBlur={() => {
                    if (username.trim()) void checkUsername();
                  }}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setUsernameStatus("idle");
                  }}
                />
                <button
                  aria-label="Check username"
                  className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-black bg-[#efe6d4] text-[#171411]"
                  disabled={isSubmitting || usernameStatus === "checking"}
                  type="button"
                  onClick={() => void checkUsername()}
                >
                  {usernameStatus === "available" ? (
                    <CheckCircle2 className="h-4 w-4 text-[#087d6d]" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </button>
              </span>
              <span
                aria-live="polite"
                className={`neo-copy text-[10px] font-bold uppercase ${
                  usernameStatus === "available"
                    ? "text-[#087d6d]"
                    : usernameStatus === "taken"
                      ? "text-[#c20b2f]"
                      : "text-[#55504a]"
                }`}
              >
                {usernameStatusText}
              </span>
            </div>
          </div>
        )}

        {mode !== "reset-password" && (
          <label className="grid gap-2">
            <span className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">Email</span>
            <span className="flex h-12 items-center gap-3 border-2 border-black bg-[#fbf8ef] px-3">
              <Mail className="h-5 w-5 shrink-0" />
              <input
                required
                autoComplete="email"
                className="min-w-0 flex-1 bg-transparent text-base font-black outline-none"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </span>
          </label>
        )}

        {needsPassword && (
          <label className={`${mode === "reset-password" ? "" : "mt-4"} grid gap-2`}>
            <span className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
              {mode === "reset-password" ? "New Password" : "Password"}
            </span>
            <span className="flex h-12 items-center gap-3 border-2 border-black bg-[#fbf8ef] px-3">
              <KeyRound className="h-5 w-5 shrink-0" />
              <input
                required
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                className="min-w-0 flex-1 bg-transparent text-base font-black outline-none"
                minLength={needsStrongPassword ? minimumPasswordLength : undefined}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </span>
          </label>
        )}

        {needsStrongPassword && (
          <>
            <p className="neo-copy mt-2 text-[10px] font-bold text-[#55504a] uppercase">
              {minimumPasswordLength}+ chars with upper/lowercase, number and symbol
            </p>
            <label className="mt-4 grid gap-2">
              <span className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">
                Repeat Password
              </span>
              <span className="flex h-12 items-center gap-3 border-2 border-black bg-[#fbf8ef] px-3">
                <KeyRound className="h-5 w-5 shrink-0" />
                <input
                  required
                  autoComplete="new-password"
                  className="min-w-0 flex-1 bg-transparent text-base font-black outline-none"
                  minLength={minimumPasswordLength}
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </span>
            </label>
          </>
        )}

        {showsTurnstile && (
          <TurnstileWidget
            key={captchaEpoch}
            onError={handleCaptchaError}
            onToken={handleCaptchaToken}
            siteKey={turnstileSiteKey}
          />
        )}

        {errorMessage && (
          <p
            className="neo-copy mt-4 border-2 border-black bg-[#c20b2f] p-3 text-[10px] font-bold text-white uppercase"
            role="alert"
          >
            {errorMessage}
          </p>
        )}

        {message && (
          <p
            aria-live="polite"
            className="neo-copy mt-4 border-2 border-black bg-[#087d6d] p-3 text-[10px] font-bold text-white uppercase"
            role="status"
          >
            {message}
          </p>
        )}

        <button
          className="neo-copy mt-5 flex h-12 w-full items-center justify-center gap-3 border-2 border-black bg-[#c20b2f] px-5 text-xs font-bold text-white uppercase shadow-[3px_3px_0_#171411] disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {mode === "sign-in" ? (
            <LogIn className="h-4 w-4" />
          ) : mode === "sign-up" ? (
            <UserPlus className="h-4 w-4" />
          ) : mode === "forgot-password" ? (
            <RotateCcw className="h-4 w-4" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {isSubmitting ? "Please wait" : submitLabel}
        </button>

        {mode === "sign-in" && (
          <button
            className="neo-copy mt-4 w-full text-[10px] font-black text-[#5b403f] uppercase underline decoration-2 underline-offset-4"
            type="button"
            onClick={() => switchMode("forgot-password")}
          >
            Forgot Password?
          </button>
        )}
        {(mode === "forgot-password" || mode === "reset-password") && (
          <button
            className="neo-copy mt-4 w-full text-[10px] font-black text-[#5b403f] uppercase underline decoration-2 underline-offset-4"
            type="button"
            onClick={() => switchMode("sign-in")}
          >
            Back to Login
          </button>
        )}
      </form>
    </section>
  );
}
