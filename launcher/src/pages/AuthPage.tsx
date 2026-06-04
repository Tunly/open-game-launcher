import { CheckCircle2, KeyRound, LogIn, Mail, Search, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../lib/supabase";
import { getMyProfile, isUsernameAvailable, updateMyProfile } from "../lib/supabase/profile";
import { getErrorMessage } from "../lib/formatters";
import { usernameSchema } from "../lib/validation/profile";

type AuthMode = "sign-in" | "sign-up";
type UsernameStatus = "idle" | "checking" | "available" | "taken";

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrorMessage(null);
    setMessage(null);
    setConfirmPassword("");
    setUsername("");
    setUsernameStatus("idle");
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
      if (!available) {
        setErrorMessage("Username is already taken.");
      }
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

    if (mode === "sign-in") {
      try {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        setMessage("Login successful.");
        setPassword("");
        navigate("/store", { replace: true });
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setIsSubmitting(false);
      }
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
          data: {
            display_name: normalizedUsername,
            username: normalizedUsername,
          },
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

  return (
    <section className="grid min-h-[calc(100vh-150px)] content-center gap-6 py-4 sm:py-6 lg:min-h-[calc(100vh-112px)] lg:grid-cols-[minmax(0,1fr)_390px] lg:items-center">
      <div className="max-w-[680px]">
        <span className="neo-copy inline-flex border-2 border-black bg-[#171411] px-3 py-1 text-xs font-bold uppercase text-white shadow-[3px_3px_0_#171411]">
          Supabase Auth
        </span>
        <h1 className="neo-title mt-4 max-w-[620px] text-[clamp(3.5rem,16vw,6rem)] leading-[0.82] text-[#171411]">
          Launcher Account
        </h1>
        <p className="neo-copy mt-5 max-w-[560px] text-xs font-bold uppercase leading-6 text-[#55504a]">
          Library, downloads, and community features are account-bound. Store browsing and local
          settings stay available without login.
        </p>
      </div>

      <form
        className="border-4 border-black bg-[#f5eedf] p-5 shadow-[6px_6px_0_#171411]"
        onSubmit={handleSubmit}
      >
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

        {mode === "sign-up" && (
          <div className="mb-4">
            <label className="grid gap-2">
              <span className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                Username
              </span>
              <span className="flex h-12 items-center gap-3 border-2 border-black bg-[#fbf8ef] px-3">
                <UserPlus className="h-5 w-5 shrink-0" />
                <input
                  required
                  autoComplete="username"
                  className="min-w-0 flex-1 bg-transparent text-base font-black lowercase outline-none"
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
            </label>
          </div>
        )}

        <label className="grid gap-2">
          <span className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">Email</span>
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

        <label className="mt-4 grid gap-2">
          <span className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">Password</span>
          <span className="flex h-12 items-center gap-3 border-2 border-black bg-[#fbf8ef] px-3">
            <KeyRound className="h-5 w-5 shrink-0" />
            <input
              required
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              className="min-w-0 flex-1 bg-transparent text-base font-black outline-none"
              minLength={6}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </span>
        </label>

        {mode === "sign-up" && (
          <label className="mt-4 grid gap-2">
            <span className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
              Repeat Password
            </span>
            <span className="flex h-12 items-center gap-3 border-2 border-black bg-[#fbf8ef] px-3">
              <KeyRound className="h-5 w-5 shrink-0" />
              <input
                required
                autoComplete="new-password"
                className="min-w-0 flex-1 bg-transparent text-base font-black outline-none"
                minLength={6}
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </span>
          </label>
        )}

        {errorMessage && (
          <p className="neo-copy mt-4 border-2 border-black bg-[#c20b2f] p-3 text-[10px] font-bold uppercase text-white">
            {errorMessage}
          </p>
        )}

        {message && (
          <p className="neo-copy mt-4 border-2 border-black bg-[#087d6d] p-3 text-[10px] font-bold uppercase text-white">
            {message}
          </p>
        )}

        <button
          className="neo-copy mt-5 flex h-12 w-full items-center justify-center gap-3 border-2 border-black bg-[#c20b2f] px-5 text-xs font-bold uppercase text-white shadow-[3px_3px_0_#171411] disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {mode === "sign-in" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {isSubmitting ? "Please wait" : mode === "sign-in" ? "Sign In" : "Sign Up"}
        </button>
      </form>
    </section>
  );
}
