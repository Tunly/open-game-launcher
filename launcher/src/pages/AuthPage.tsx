import {
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  KeyRound,
  LogIn,
  Mail,
  Search,
  UserPlus,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../lib/supabase";
import {
  getMyProfile,
  isUsernameAvailable,
  updateMyProfile,
  uploadAvatar,
} from "../lib/supabase/profile";
import { usernameSchema } from "../lib/validation/profile";

type AuthMode = "sign-in" | "sign-up";
type SignupStep = "credentials" | "profile";
type UsernameStatus = "idle" | "checking" | "available" | "taken";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [signupStep, setSignupStep] = useState<SignupStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] =
    useState<UsernameStatus>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  function resetSignupProfileStep() {
    setSignupStep("credentials");
    setUsername("");
    setUsernameStatus("idle");
    setAvatarFile(null);
    setAvatarPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrorMessage(null);
    setMessage(null);
    setConfirmPassword("");
    resetSignupProfileStep();
  }

  async function checkUsername() {
    const normalizedUsername = normalizeUsername(username);
    const parsed = usernameSchema.safeParse(normalizedUsername);

    if (!parsed.success) {
      setUsernameStatus("idle");
      setErrorMessage(parsed.error.issues[0]?.message ?? "Username ist ungueltig.");
      return false;
    }

    setUsernameStatus("checking");
    setErrorMessage(null);

    try {
      const available = await isUsernameAvailable(parsed.data);
      setUsernameStatus(available ? "available" : "taken");
      if (!available) {
        setErrorMessage("Username ist bereits vergeben.");
      }
      return available;
    } catch (error) {
      setUsernameStatus("idle");
      setErrorMessage(getErrorMessage(error));
      return false;
    }
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setAvatarFile(file);
    setAvatarPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setErrorMessage(null);

    if (!supabase) {
      setErrorMessage("Supabase ist nicht konfiguriert.");
      setIsSubmitting(false);
      return;
    }

    if (mode === "sign-in") {
      try {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        setMessage("Login erfolgreich.");
        setPassword("");
        navigate("/store", { replace: true });
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (signupStep === "credentials") {
      if (password !== confirmPassword) {
        setErrorMessage("Passwoerter stimmen nicht ueberein.");
        setIsSubmitting(false);
        return;
      }

      setSignupStep("profile");
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

      let avatarUploaded = false;
      if (result.data.session) {
        try {
          await getMyProfile();
          if (avatarFile) {
            const avatarUrl = await uploadAvatar(avatarFile);
            await updateMyProfile({
              avatarUrl,
              displayName: normalizedUsername,
              username: normalizedUsername,
            });
            avatarUploaded = true;
          } else {
            await updateMyProfile({
              displayName: normalizedUsername,
              username: normalizedUsername,
            });
          }
        } catch (profileError) {
          setMessage(
            `Account erstellt. Profil-Setup bitte nach dem Login fortsetzen: ${getErrorMessage(profileError)}`,
          );
          setPassword("");
          setConfirmPassword("");
          resetSignupProfileStep();
          return;
        }
      }

      setMessage(
        result.data.session
          ? avatarUploaded
            ? "Account erstellt. Username und Profilbild wurden gespeichert."
            : "Account erstellt. Username wurde gespeichert."
          : "Account erstellt. Username wurde vorgemerkt. Profilbild nach E-Mail-Bestaetigung hochladen.",
      );
      setPassword("");
      setConfirmPassword("");
      resetSignupProfileStep();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const isSignupProfileStep = mode === "sign-up" && signupStep === "profile";
  const usernameStatusText =
    usernameStatus === "checking"
      ? "Pruefe Datenbank..."
      : usernameStatus === "available"
        ? "Username ist frei."
        : usernameStatus === "taken"
          ? "Username ist vergeben."
          : "3-32 Zeichen: Buchstaben, Zahlen, _, . oder -";

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
          Library, Downloads und Community sind accountgebunden. Store und
          lokale Settings bleiben zum Stobern erreichbar.
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

        {isSignupProfileStep ? (
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="neo-copy border-2 border-black bg-[#171411] px-2 py-1 text-[10px] font-bold uppercase text-white">
                Step 2 / Profil
              </span>
              <button
                className="neo-copy inline-flex h-9 items-center gap-2 border-2 border-black bg-[#fbf8ef] px-3 text-[10px] font-bold uppercase text-[#171411] shadow-[2px_2px_0_#171411]"
                disabled={isSubmitting}
                type="button"
                onClick={() => {
                  setSignupStep("credentials");
                  setErrorMessage(null);
                  setMessage(null);
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Zurueck
              </button>
            </div>

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
                  aria-label="Username pruefen"
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

            <label className="mt-4 grid gap-2">
              <span className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                Profilbild optional
              </span>
              <span className="flex min-h-20 items-center gap-3 border-2 border-black bg-[#fbf8ef] px-3 py-3">
                <span className="neo-title flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden border-2 border-black bg-[#087d6d] text-xl text-white">
                  {avatarPreviewUrl ? (
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      src={avatarPreviewUrl}
                    />
                  ) : (
                    normalizeUsername(username).slice(0, 2).toUpperCase() || "OG"
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="neo-copy block text-[10px] font-bold uppercase text-[#171411]">
                    {avatarFile?.name ?? "Bild auswaehlen"}
                  </span>
                  <span className="mt-1 block text-xs font-bold text-[#55504a]">
                    Wird direkt hochgeladen, wenn Supabase nach Signup eine
                    Session erstellt.
                  </span>
                </span>
                <ImagePlus className="h-5 w-5 shrink-0" />
                <input
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                />
              </span>
            </label>
          </div>
        ) : (
          <>
            <label className="grid gap-2">
              <span className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                Email
              </span>
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
              <span className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                Passwort
              </span>
              <span className="flex h-12 items-center gap-3 border-2 border-black bg-[#fbf8ef] px-3">
                <KeyRound className="h-5 w-5 shrink-0" />
                <input
                  required
                  autoComplete={
                    mode === "sign-in" ? "current-password" : "new-password"
                  }
                  className="min-w-0 flex-1 bg-transparent text-base font-black outline-none"
                  minLength={6}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </span>
            </label>

            {mode === "sign-up" ? (
              <label className="mt-4 grid gap-2">
                <span className="neo-copy text-[10px] font-bold uppercase text-[#55504a]">
                  Passwort wiederholen
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
            ) : null}
          </>
        )}

        {errorMessage ? (
          <p className="neo-copy mt-4 border-2 border-black bg-[#c20b2f] p-3 text-[10px] font-bold uppercase text-white">
            {errorMessage}
          </p>
        ) : null}

        {message ? (
          <p className="neo-copy mt-4 border-2 border-black bg-[#087d6d] p-3 text-[10px] font-bold uppercase text-white">
            {message}
          </p>
        ) : null}

        <button
          className="neo-copy mt-5 flex h-12 w-full items-center justify-center gap-3 border-2 border-black bg-[#c20b2f] px-5 text-xs font-bold uppercase text-white shadow-[3px_3px_0_#171411] disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {mode === "sign-in" ? (
            <LogIn className="h-4 w-4" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          {isSubmitting
            ? "Bitte warten"
            : mode === "sign-in"
              ? "Einloggen"
              : isSignupProfileStep
                ? "Account finalisieren"
                : "Weiter"}
        </button>
      </form>
    </section>
  );
}
