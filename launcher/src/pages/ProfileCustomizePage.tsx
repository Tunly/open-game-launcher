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
  const hasHardwareShowcase = showcases.some(
    (showcase) => showcase.type === "hardware_setup",
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

  async function handleCreateHardwareShowcase() {
    if (hasHardwareShowcase) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const created = await createShowcase({
        config: {},
        isEnabled: true,
        sortOrder: showcases.length,
        title: "Hardware Rig",
        type: "hardware_setup",
        visibility: "public",
      });
      setShowcases((current) => [...current, created]);
      setMessage("Hardware rig showcase created.");
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
        <section className="border-4 border-black bg-[#fff9ed] p-5 shadow-[6px_6px_0_#171411]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="neo-copy inline-block border-2 border-black bg-[#b7102a] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411]">
                Panels
              </p>
              <h2 className="neo-title mt-2 text-4xl leading-none text-[#171411]">
                Showcases
              </h2>
              <p className="mt-1 text-sm font-semibold text-[#5b403f]">
                Reorder, rename, hide, and tune profile panels.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!hasHardwareShowcase ? (
                <button
                  className="neo-copy inline-flex h-10 items-center gap-2 border-2 border-black bg-[#007166] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a]"
                  disabled={isSaving}
                  type="button"
                  onClick={() => void handleCreateHardwareShowcase()}
                >
                  <Plus className="h-4 w-4" />
                  Hardware Rig
                </button>
              ) : null}
              <button
                className="neo-copy inline-flex h-10 items-center gap-2 border-2 border-black bg-[#fff9ed] px-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
                disabled={isSaving}
                type="button"
                onClick={() => void handleCreateCustomText()}
              >
                <Plus className="h-4 w-4" />
                Custom text
              </button>
            </div>
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
          <section className="border-4 border-black bg-[#fff9ed] p-5 shadow-[6px_6px_0_#171411]">
            <p className="neo-copy inline-block border-2 border-black bg-[#171411] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#fff9ed]">
              Cosmetic
            </p>
            <h2 className="neo-title mt-2 text-4xl leading-none text-[#171411]">
              Theme
            </h2>
            <select
              className="neo-copy mt-4 h-11 w-full border-2 border-black bg-[#f6edd8] px-3 text-xs font-black uppercase tracking-[0.08em] text-[#171411] shadow-[2px_2px_0_#171411] outline-none focus:bg-[#8cf5e4]"
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
            className="neo-copy flex h-12 w-full items-center justify-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 text-[12px] font-black uppercase tracking-[0.16em] text-white shadow-[5px_5px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#007166] disabled:opacity-60"
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
    <div className="mx-auto w-full max-w-[1220px] px-0 py-2">
      <div className="mb-7 border-b-4 border-black pb-5">
        {eyebrow ? (
          <p className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-[3px_3px_0_#171411]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="neo-title mt-3 text-[clamp(3.4rem,13vw,6rem)] leading-[0.82] text-[#171411]">
          {title}
        </h1>
      </div>
      {children}
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="grid min-h-80 place-items-center border-4 border-black bg-[#fff9ed] shadow-[6px_6px_0_#171411]">
      <Loader2 className="h-8 w-8 animate-spin text-[#b7102a]" />
    </div>
  );
}

function Notice({ body, title }: { body: string; title: string }) {
  return (
    <div className="border-[3px] border-black bg-[#f6edd8] p-4 shadow-[3px_3px_0_#171411]">
      <h3 className="neo-title text-3xl leading-none text-[#171411]">{title}</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-[#5b403f]">{body}</p>
    </div>
  );
}

function Status({ message, tone }: { message: string; tone: "error" | "success" }) {
  return (
    <div className={tone === "error" ? "neo-copy border-2 border-black bg-[#b7102a] p-4 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411]" : "neo-copy border-2 border-black bg-[#007166] p-4 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411]"}>
      {message}
    </div>
  );
}
