import { CheckCircle2, Search, UserPlus } from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";

import { useCurrentUser } from "../../hooks/useCurrentUser";
import { isUsernameAvailable, updateMyProfile } from "../../lib/supabase/profile";
import { getErrorMessage } from "../../lib/formatters";
import { usernameSchema } from "../../lib/validation/profile";
import { ModalDialog } from "../ui/ModalDialog";

type UsernameStatus = "idle" | "checking" | "available" | "taken";

interface UsernamePromptModalProps {
  onComplete: (newUsername: string) => void;
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function UsernamePromptModal({ onComplete }: UsernamePromptModalProps) {
  const { user } = useCurrentUser();
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const descriptionId = useId();
  const titleId = useId();
  const usernameRef = useRef(username);
  const availabilityRequestIdRef = useRef(0);

  useEffect(
    () => () => {
      availabilityRequestIdRef.current += 1;
    },
    [],
  );

  async function checkUsername() {
    const requestId = ++availabilityRequestIdRef.current;
    const normalizedUsername = normalizeUsername(usernameRef.current);
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
      if (
        availabilityRequestIdRef.current !== requestId ||
        normalizeUsername(usernameRef.current) !== parsed.data
      ) {
        return false;
      }
      setUsernameStatus(available ? "available" : "taken");
      if (!available) {
        setErrorMessage("Username is already taken.");
      }
      return available;
    } catch (error) {
      if (
        availabilityRequestIdRef.current !== requestId ||
        normalizeUsername(usernameRef.current) !== parsed.data
      ) {
        return false;
      }
      setUsernameStatus("idle");
      setErrorMessage(getErrorMessage(error));
      return false;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const normalizedUsername = normalizeUsername(usernameRef.current);
    const usernameAvailable = await checkUsername();

    if (!usernameAvailable) {
      setIsSubmitting(false);
      return;
    }

    try {
      await updateMyProfile({
        displayName: normalizedUsername,
        username: normalizedUsername,
      });
      onComplete(normalizedUsername);
    } catch (error) {
      const message = getErrorMessage(error).toLowerCase();
      if (message.includes("username") && message.includes("taken")) {
        setUsernameStatus("taken");
        setErrorMessage("Username is already taken.");
      } else {
        setErrorMessage(getErrorMessage(error));
      }
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
    <ModalDialog
      labelledBy={titleId}
      describedBy={descriptionId}
      backdropClassName="fixed inset-0 z-50 flex items-center justify-center bg-[#171411]/90 bg-[radial-gradient(circle,rgba(255,249,237,0.14)_1px,transparent_1px)] bg-[length:10px_10px] p-4"
      panelClassName="max-h-[calc(100vh-2rem)] w-full max-w-[500px] overflow-y-auto"
      initialFocusSelector="input[name='username']"
    >
      <div className="mb-4">
        <span className="neo-copy inline-flex border-2 border-black bg-[#c20b2f] px-3 py-1 text-xs font-bold text-white uppercase shadow-[3px_3px_0_#171411]">
          Required Action
        </span>
        <h2
          id={titleId}
          className="neo-title mt-4 text-[2.5rem] leading-[0.82] text-white drop-shadow-[2px_2px_0_#171411] sm:text-[3.25rem] lg:text-[4rem]"
        >
          Pick a Username
        </h2>
        <p
          id={descriptionId}
          className="neo-copy mt-4 text-xs leading-6 font-bold text-[#efe6d4] uppercase"
        >
          Your current account was created without a username. Please select one now to use social
          features.
        </p>
      </div>

      <form
        className="border-4 border-black bg-[#f5eedf] p-5 shadow-[6px_6px_0_#171411]"
        onSubmit={handleSubmit}
      >
        <label className="grid gap-2">
          <span className="neo-copy text-[10px] font-bold text-[#55504a] uppercase">Username</span>
          <span className="flex h-12 items-center gap-3 border-2 border-black bg-[#fbf8ef] px-3">
            <UserPlus className="h-5 w-5 shrink-0" />
            <input
              name="username"
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
                const nextUsername = event.target.value;
                usernameRef.current = nextUsername;
                availabilityRequestIdRef.current += 1;
                setUsername(nextUsername);
                setUsernameStatus("idle");
                setErrorMessage(null);
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
        </label>

        {errorMessage && (
          <p
            className="neo-copy mt-4 border-2 border-black bg-[#c20b2f] p-3 text-[10px] font-bold text-white uppercase"
            role="alert"
          >
            {errorMessage}
          </p>
        )}

        <button
          className="neo-copy mt-5 flex h-12 w-full items-center justify-center gap-3 border-2 border-black bg-[#087d6d] px-5 text-xs font-bold text-white uppercase shadow-[3px_3px_0_#171411] disabled:opacity-60"
          disabled={isSubmitting || usernameStatus === "taken" || usernameStatus === "checking"}
          type="submit"
        >
          <CheckCircle2 className="h-4 w-4" />
          {isSubmitting ? "Saving..." : "Save Username"}
        </button>
      </form>
    </ModalDialog>
  );
}
