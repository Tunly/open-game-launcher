import { Loader2, Plus, Save } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ProfileCustomizeForm } from "../components/profile/ProfileCustomizeForm";
import { ProfileThemePreview } from "../components/profile/ProfileThemePreview";
import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  createShowcase,
  getMyProfile,
  getMyShowcases,
  getProfileThemes,
  updateMyProfileTheme,
  updateShowcases,
} from "../lib/supabase/profile";
import type { Profile, ProfileShowcase, ProfileTheme } from "../lib/types/profile";

export function ProfileCustomizePage() {
  const { isConfigured, isLoading: isAuthLoading, user } = useCurrentUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showcases, setShowcases] = useState<ProfileShowcase[]>([]);
  const [themes, setThemes] = useState<ProfileTheme[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState("");
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
    void Promise.all([getMyProfile(), getMyShowcases(), getProfileThemes()])
      .then(([loadedProfile, loadedShowcases, loadedThemes]) => {
        if (!isMounted) return;
        setProfile(loadedProfile);
        setShowcases(loadedShowcases);
        setThemes(loadedThemes);
        setSelectedThemeId(loadedProfile.profileThemeId ?? "");
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isConfigured, user]);

  const selectedTheme = useMemo(
    () => themes.find((theme) => theme.id === selectedThemeId) ?? null,
    [selectedThemeId, themes],
  );

  function handleMove(id: string, direction: "up" | "down") {
    setShowcases((current) => {
      const index = current.findIndex((showcase) => showcase.id === id);
      const nextIndex = direction === "up" ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next.map((showcase, sortOrder) => ({ ...showcase, sortOrder }));
    });
  }

  function handleChange(id: string, patch: Partial<ProfileShowcase>) {
    setShowcases((current) =>
      current.map((showcase) =>
        showcase.id === id ? { ...showcase, ...patch } : showcase,
      ),
    );
  }

  async function handleCreateCustomText() {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const created = await createShowcase({
        config: { body: "Write a custom room note here." },
        isEnabled: true,
        sortOrder: showcases.length,
        title: "Custom Panel",
        type: "custom_text",
        visibility: "public",
      });
      setShowcases((current) => [...current, created]);
      setMessage("Custom showcase created.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      const saved = await updateShowcases(
        showcases.map((showcase, index) => ({ ...showcase, sortOrder: index })),
      );
      await updateMyProfileTheme(selectedThemeId || null);
      setShowcases(saved);
      setMessage("Profile customization saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  if (isAuthLoading || isLoading) {
    return <Frame title="Customize Profile"><LoadingPanel /></Frame>;
  }

  if (!isConfigured) {
    return <Frame title="Customize Profile"><Notice title="Supabase is not configured" body="Set the public Supabase env vars before editing profile cosmetics." /></Frame>;
  }

  if (!user || !profile) {
    return <Frame title="Customize Profile"><Notice title="Login required" body="Sign in before arranging your showcase panels." /></Frame>;
  }

  return (
    <Frame title="Customize Profile" eyebrow={`@${profile.username}`}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="border border-white/10 bg-white/[0.05] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Showcases</h2>
              <p className="mt-1 text-sm text-slate-400">
                Reorder, rename, hide, and tune profile panels.
              </p>
            </div>
            <button
              className="inline-flex h-10 items-center gap-2 border border-white/10 px-3 text-sm font-bold text-white hover:bg-white/[0.08]"
              disabled={isSaving}
              type="button"
              onClick={() => void handleCreateCustomText()}
            >
              <Plus className="h-4 w-4" />
              Custom text
            </button>
          </div>
          <div className="mt-5">
            {showcases.length > 0 ? (
              <ProfileCustomizeForm
                showcases={showcases}
                onChange={handleChange}
                onMove={handleMove}
              />
            ) : (
              <Notice title="No showcases yet" body="New users receive defaults from the auth trigger after the migration is applied." />
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="border border-white/10 bg-white/[0.05] p-5">
            <h2 className="text-xl font-bold text-white">Theme</h2>
            <select
              className="mt-4 h-11 w-full border border-white/10 bg-[#0f172a] px-3 text-white"
              value={selectedThemeId}
              onChange={(event) => setSelectedThemeId(event.target.value)}
            >
              <option value="">Default</option>
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>{theme.name}</option>
              ))}
            </select>
            <div className="mt-4">
              {selectedTheme ? (
                <ProfileThemePreview theme={selectedTheme} />
              ) : (
                <Notice title="Default Theme" body="The default dark launcher room style will be used." />
              )}
            </div>
          </section>
          {errorMessage ? <Status tone="error" message={errorMessage} /> : null}
          {message ? <Status tone="success" message={message} /> : null}
          <button
            className="flex h-12 w-full items-center justify-center gap-2 bg-sky-400 px-4 text-sm font-black text-slate-950 hover:bg-sky-300 disabled:opacity-60"
            disabled={isSaving}
            type="button"
            onClick={() => void handleSave()}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Customization
          </button>
        </aside>
      </div>
    </Frame>
  );
}

function Frame({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode;
  eyebrow?: string;
  title: string;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {eyebrow ? <p className="text-sm font-bold uppercase text-sky-200">{eyebrow}</p> : null}
      <h1 className="mb-6 text-4xl font-black text-white">{title}</h1>
      {children}
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="grid min-h-80 place-items-center border border-white/10 bg-white/[0.05]">
      <Loader2 className="h-8 w-8 animate-spin text-sky-300" />
    </div>
  );
}

function Notice({ body, title }: { body: string; title: string }) {
  return (
    <div className="border border-white/10 bg-black/20 p-4">
      <h3 className="font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
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
