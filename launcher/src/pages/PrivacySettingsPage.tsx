import { Loader2, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ProfilePrivacyForm } from "../components/profile/ProfilePrivacyForm";
import { AccountDataPrivacyPanel } from "../components/settings/AccountDataPrivacyPanel";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { getMyProfile, updateMyProfilePrivacy } from "../lib/supabase/profile";
import type { Profile, ProfileVisibility } from "../lib/types/profile";

const LOCAL_PRIVACY_DRAFT_KEY = "og-launcher:privacy-settings-draft:v1";

const visibilityFields = [
  "achievementVisibility",
  "commentsVisibility",
  "gameActivityVisibility",
  "libraryVisibility",
  "onlineStatusVisibility",
  "profileVisibility",
  "wishlistVisibility",
] as const satisfies Array<keyof Profile>;

export function PrivacySettingsPage() {
  const { isConfigured, isLoading: isAuthLoading, user } = useCurrentUser();
  const [searchParams] = useSearchParams();
  const isDeletionProcessorCronPacketVerify =
    searchParams.get("verify") === "deletion-processor-cron-dry-run-packet";
  const isLocalFallback = !isConfigured || isDeletionProcessorCronPacketVerify;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (isLocalFallback) {
      setProfile(createLocalPrivacyProfile());
      setErrorMessage(null);
      setMessage(null);
      setIsLoading(false);
      return;
    }

    if (!user) {
      setProfile(null);
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
  }, [isLocalFallback, user]);

  function handleChange(field: keyof Profile, value: ProfileVisibility) {
    setProfile((current) => (current ? { ...current, [field]: value } : current));
  }

  async function handleSave() {
    if (!profile) return;
    setIsSaving(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      if (isLocalFallback) {
        writeLocalPrivacyDraft(profile);
        setProfile({ ...profile, updatedAt: new Date().toISOString() });
        setMessage("Local privacy draft saved in this browser. Connect Supabase to sync.");
        return;
      }

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
    <div className="mx-auto w-full max-w-[1220px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8 border-b-4 border-black pb-4">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="neo-copy inline-flex border-2 border-black bg-[#171411] px-3 py-1 text-xs font-bold uppercase text-white shadow-[3px_3px_0_#171411]">
              Settings
            </span>
            <h1 className="neo-title mt-2 max-w-[760px] text-[3.5rem] leading-[0.82] text-[#171411] sm:text-[4.5rem] lg:text-[5.4rem] xl:text-[6rem]">
              Privacy Deck
            </h1>
            <p className="neo-copy mt-3 text-xs font-bold uppercase text-[#55504a]">
              Visibility rules // account data // deletion queue
            </p>
          </div>
          <ShieldCheck className="hidden h-16 w-16 text-[#087d6d] sm:block" />
        </div>
      </div>

      {(!isDeletionProcessorCronPacketVerify && isAuthLoading) || isLoading ? (
        <div className="grid min-h-80 place-items-center border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]">
          <Loader2 className="h-8 w-8 animate-spin text-[#087d6d]" />
        </div>
      ) : isLocalFallback ? (
        <PrivacySettingsContent
          isLocalFallback
          errorMessage={errorMessage}
          isSaving={isSaving}
          message={message}
          profile={profile}
          onChange={handleChange}
          onSave={() => void handleSave()}
        />
      ) : !user ? (
        <Notice title="Login required" body="Sign in before changing your visibility rules." />
      ) : !profile ? (
        <Notice
          title="Profile unavailable"
          body={errorMessage ?? "Your visibility rules could not be loaded."}
        />
      ) : (
        <PrivacySettingsContent
          errorMessage={errorMessage}
          isSaving={isSaving}
          message={message}
          profile={profile}
          onChange={handleChange}
          onSave={() => void handleSave()}
        />
      )}
    </div>
  );
}

function PrivacySettingsContent({
  errorMessage,
  isLocalFallback = false,
  isSaving,
  message,
  onChange,
  onSave,
  profile,
}: {
  errorMessage: string | null;
  isLocalFallback?: boolean;
  isSaving: boolean;
  message: string | null;
  onChange: (field: keyof Profile, value: ProfileVisibility) => void;
  onSave: () => void;
  profile: Profile | null;
}) {
  if (!profile) {
    return (
      <Notice
        title="Local privacy deck unavailable"
        body="The launcher could not prepare the local visibility matrix."
      />
    );
  }

  return (
    <div className="space-y-5">
      {isLocalFallback ? (
        <section className="grid gap-4 border-4 border-black bg-[#fff9ed] p-5 shadow-[5px_5px_0_#171411] lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <p className="neo-copy inline-flex border-2 border-black bg-[#087d6d] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411]">
              Local Privacy Preview
            </p>
            <h2 className="neo-title mt-3 text-4xl leading-none text-[#171411]">
              Broadcast Rules Stay Editable
            </h2>
            <p className="neo-copy mt-2 max-w-3xl text-[12px] font-bold uppercase leading-6 text-[#5b403f]">
              Supabase is absent, so this deck writes visibility and account-data actions to this
              browser only.
            </p>
          </div>
          <div className="border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411]">
            <p className="neo-copy text-[10px] font-black uppercase tracking-[0.12em] text-[#171411]">
              Sync Target
            </p>
            <p className="neo-title mt-2 text-3xl leading-none text-[#c20b2f]">Local Only</p>
            <p className="neo-copy mt-2 text-[11px] font-bold uppercase leading-5 text-[#5b403f]">
              No Supabase error is shown because the fallback owns the offline state.
            </p>
          </div>
        </section>
      ) : null}

      <div className="border-4 border-black bg-[#f5eedf] shadow-[5px_5px_0_#171411]">
        <div className="border-b-4 border-black bg-[#171411] p-5 text-white">
          <p className="neo-copy text-[10px] font-bold uppercase text-[#8cf5e4]">
            Profile Broadcast
          </p>
          <h2 className="neo-title mt-1 text-3xl leading-none">Visibility Matrix</h2>
        </div>
        <div className="space-y-4 p-5">
          <ProfilePrivacyForm profile={profile} onChange={onChange} />
          {errorMessage ? <Status tone="error" message={errorMessage} /> : null}
          {message ? <Status tone="success" message={message} /> : null}
          <button
            className="neo-copy flex h-12 w-full items-center justify-center gap-2 border-2 border-black bg-[#c20b2f] px-4 text-xs font-black uppercase text-white shadow-[3px_3px_0_#171411] hover:-translate-y-0.5 disabled:opacity-60"
            disabled={isSaving}
            type="button"
            onClick={onSave}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isLocalFallback ? "Save Local Privacy Draft" : "Save Privacy Settings"}
          </button>
        </div>
      </div>

      <AccountDataPrivacyPanel mode={isLocalFallback ? "local" : "remote"} />
    </div>
  );
}

function Notice({ body, title }: { body: string; title: string }) {
  return (
    <div className="border-4 border-black bg-[#f5eedf] p-6 shadow-[5px_5px_0_#171411]">
      <h2 className="neo-title text-3xl leading-none text-[#171411]">{title}</h2>
      <p className="neo-copy mt-3 text-xs font-bold uppercase leading-6 text-[#55504a]">{body}</p>
    </div>
  );
}

function Status({ message, tone }: { message: string; tone: "error" | "success" }) {
  return (
    <div
      className={
        tone === "error"
          ? "neo-copy border-2 border-black bg-[#c20b2f] p-3 text-[11px] font-black uppercase tracking-[0.08em] text-white"
          : "neo-copy border-2 border-black bg-[#087d6d] p-3 text-[11px] font-black uppercase tracking-[0.08em] text-white"
      }
    >
      {message}
    </div>
  );
}

function createLocalPrivacyProfile(): Profile {
  const now = "2026-06-10T12:00:00.000Z";
  const savedDraft = readLocalPrivacyDraft();
  const base: Profile = {
    achievementVisibility: "friends_only",
    appShellSkinId: null,
    customTheme: null,
    avatarUrl: null,
    bannerUrl: null,
    bio: "Local privacy relay for offline launcher checks.",
    commentsVisibility: "friends_only",
    countryCode: "DE",
    createdAt: now,
    displayName: "Local Privacy Runner",
    featuredAchievementId: null,
    featuredBadgeId: null,
    featuredGameId: null,
    gameActivityVisibility: "friends_only",
    id: "local-privacy-user",
    isBanned: false,
    isDeleted: false,
    language: "en",
    lastSeenAt: now,
    libraryVisibility: "private",
    onlineStatusVisibility: "friends_only",
    profileLevel: 12,
    profileThemeId: null,
    profileVisibility: "public",
    profileXp: 1840,
    timezone: "Europe/Berlin",
    updatedAt: now,
    username: "localprivacy",
    wishlistVisibility: "private",
  };

  return {
    ...base,
    ...savedDraft,
  };
}

function readLocalPrivacyDraft(): Partial<Pick<Profile, (typeof visibilityFields)[number]>> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_PRIVACY_DRAFT_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Partial<Record<(typeof visibilityFields)[number], unknown>>;
    const draft: Partial<Pick<Profile, (typeof visibilityFields)[number]>> = {};
    for (const field of visibilityFields) {
      if (
        parsed[field] === "public" ||
        parsed[field] === "friends_only" ||
        parsed[field] === "private"
      ) {
        draft[field] = parsed[field];
      }
    }
    return draft;
  } catch {
    return {};
  }
}

function writeLocalPrivacyDraft(profile: Profile) {
  if (typeof window === "undefined") {
    return;
  }

  const draft = Object.fromEntries(visibilityFields.map((field) => [field, profile[field]]));
  window.localStorage.setItem(LOCAL_PRIVACY_DRAFT_KEY, JSON.stringify(draft));
}
