import { Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { ProfilePrivacyForm } from "../components/profile/ProfilePrivacyForm";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { getMyProfile, updateMyProfilePrivacy } from "../lib/supabase/profile";
import type { Profile, ProfileVisibility } from "../lib/types/profile";

export function PrivacySettingsPage() {
  const { isConfigured, isLoading: isAuthLoading, user } = useCurrentUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (!isConfigured || !user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void getMyProfile()
      .then((loadedProfile) => {
        if (isMounted) setProfile(loadedProfile);
      })
      .catch((error: unknown) => {
        if (isMounted) setErrorMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isConfigured, user]);

  function handleChange(field: keyof Profile, value: ProfileVisibility) {
    setProfile((current) => (current ? { ...current, [field]: value } : current));
  }

  async function handleSave() {
    if (!profile) return;
    setIsSaving(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      const saved = await updateMyProfilePrivacy({
        achievementVisibility: profile.achievementVisibility,
        commentsVisibility: profile.commentsVisibility,
        gameActivityVisibility: profile.gameActivityVisibility,
        libraryVisibility: profile.libraryVisibility,
        onlineStatusVisibility: profile.onlineStatusVisibility,
        profileVisibility: profile.profileVisibility,
        wishlistVisibility: profile.wishlistVisibility,
      });
      setProfile(saved);
      setMessage("Privacy settings saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <p className="text-sm font-bold uppercase text-sky-200">Settings</p>
      <h1 className="mb-6 text-4xl font-black text-white">Privacy</h1>

      {isAuthLoading || isLoading ? (
        <div className="grid min-h-80 place-items-center border border-white/10 bg-white/[0.05]">
          <Loader2 className="h-8 w-8 animate-spin text-sky-300" />
        </div>
      ) : !isConfigured ? (
        <Notice title="Supabase is not configured" body="Privacy settings need the public Supabase env vars." />
      ) : !user || !profile ? (
        <Notice title="Login required" body="Sign in before changing your visibility rules." />
      ) : (
        <div className="space-y-5">
          <ProfilePrivacyForm profile={profile} onChange={handleChange} />
          {errorMessage ? <Status tone="error" message={errorMessage} /> : null}
          {message ? <Status tone="success" message={message} /> : null}
          <button
            className="flex h-12 w-full items-center justify-center gap-2 bg-sky-400 px-4 text-sm font-black text-slate-950 hover:bg-sky-300 disabled:opacity-60"
            disabled={isSaving}
            type="button"
            onClick={() => void handleSave()}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Privacy Settings
          </button>
        </div>
      )}
    </div>
  );
}

function Notice({ body, title }: { body: string; title: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.05] p-6">
      <h2 className="text-2xl font-black text-white">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

function Status({ message, tone }: { message: string; tone: "error" | "success" }) {
  return (
    <div className={tone === "error" ? "border border-rose-300/30 bg-rose-500/10 p-4 text-sm text-rose-100" : "border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm text-emerald-100"}>
      {message}
    </div>
  );
}

