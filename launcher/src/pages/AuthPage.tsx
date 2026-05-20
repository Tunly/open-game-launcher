import { KeyRound, LogIn, Mail, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";

import { supabase } from "../lib/supabase";

type AuthMode = "sign-in" | "sign-up";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    try {
      const result =
        mode === "sign-in"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });

      if (result.error) {
        throw result.error;
      }

      setMessage(
        mode === "sign-in"
          ? "Login erfolgreich."
          : "Account erstellt. Falls E-Mail-Bestatigung aktiv ist, bitte Postfach prufen.",
      );
      setPassword("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

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
              onClick={() => {
                setMode(item);
                setErrorMessage(null);
                setMessage(null);
              }}
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
              : "Account erstellen"}
        </button>
      </form>
    </section>
  );
}
