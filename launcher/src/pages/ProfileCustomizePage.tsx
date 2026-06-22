import { Download, Loader2, Palette, Plus, RotateCcw, Save, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { AppWideThemeReadinessPanel } from "../components/profile/AppWideThemeReadinessPanel";
import { ProfileCustomizeForm } from "../components/profile/ProfileCustomizeForm";
import { ProfileThemePreview } from "../components/profile/ProfileThemePreview";
import { useCurrentUser } from "../hooks/useCurrentUser";
import {
  APP_SHELL_SKINS,
  getAppShellSkin,
  notifyAppShellSkinChanged,
  readAppShellSkinId,
  resetAppShellSkin,
  writeAppShellSkinId,
  type AppShellSkin,
  type AppShellSkinId,
} from "../lib/app-shell-skins";
import { createVerifyAppWideThemeReadiness } from "../lib/app-wide-theme-readiness";
import {
  createProfileThemeExchangePayload,
  isLocalCustomProfileTheme,
  isProfileThemeLike,
  parseProfileThemeExchangePayload,
  themeExchangeFileName,
} from "../lib/profile-theme-exchange";
import {
  createShowcase,
  getMyProfile,
  getMyShowcases,
  getProfileThemes,
  updateMyAppShellSkin,
  updateMyCustomTheme,
  updateMyProfileTheme,
  updateShowcases,
} from "../lib/supabase/profile";
import { isMissingSchemaMessage } from "../lib/supabase/helpers";
import {
  buildThemeSkinReadinessPlan,
  type ThemeSkinReadinessPlan,
} from "../lib/theme-skin-readiness";
import type { Profile, ProfileShowcase, ProfileTheme } from "../lib/types/profile";

const LOCAL_CUSTOMIZE_DRAFT_KEY = "og-launcher:profile-customize-draft:v1";

function formatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function readBrowserFileText(file: File) {
  if (typeof file.text === "function") return file.text();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("Theme file read failed.")),
    );
    reader.addEventListener("load", () =>
      resolve(typeof reader.result === "string" ? reader.result : ""),
    );
    reader.readAsText(file);
  });
}

interface LocalCustomizeDraft {
  customThemes?: ProfileTheme[];
  savedAt: string;
  selectedThemeId: string;
  showcases: ProfileShowcase[];
}

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
  const [localFallbackReason, setLocalFallbackReason] = useState<string | null>(null);
  const [selectedShellSkinId, setSelectedShellSkinId] = useState<AppShellSkinId>(() =>
    readAppShellSkinId(),
  );
  const themeFileInputRef = useRef<HTMLInputElement | null>(null);
  const isLocalFallback = !isConfigured || localFallbackReason !== null;

  const applyLocalCustomizeState = useCallback((reason: string | null) => {
    const mockState = createMockCustomizeState();
    setProfile(mockState.profile);
    setShowcases(mockState.showcases);
    setThemes(mockState.themes);
    setSelectedThemeId(mockState.profile.profileThemeId ?? "");
    setLocalFallbackReason(reason);
    setErrorMessage(null);
  }, []);

  function saveLocalCustomizeDraft(
    nextShowcases = showcases,
    nextThemeId = selectedThemeId,
    nextThemes = themes,
  ) {
    const orderedShowcases = nextShowcases.map((showcase, index) => ({
      ...showcase,
      sortOrder: index,
      updatedAt: new Date().toISOString(),
    }));
    setShowcases(orderedShowcases);
    setProfile((current) =>
      current ? { ...current, profileThemeId: nextThemeId || null } : current,
    );
    writeLocalCustomizeDraft({
      customThemes: nextThemes.filter(isLocalCustomProfileTheme),
      savedAt: new Date().toISOString(),
      selectedThemeId: nextThemeId,
      showcases: orderedShowcases,
    });
    return orderedShowcases;
  }

  useEffect(() => {
    let isMounted = true;

    if (!isConfigured) {
      applyLocalCustomizeState(null);
      setIsLoading(false);
      return;
    }

    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void Promise.all([getMyProfile(), getMyShowcases(), getProfileThemes()])
      .then(([loadedProfile, loadedShowcases, loadedThemes]) => {
        if (!isMounted) return;
        const hostedShellSkinId = loadedProfile.appShellSkinId
          ? writeAppShellSkinId(loadedProfile.appShellSkinId)
          : readAppShellSkinId();
        const loadedThemeOptions = loadedProfile.customTheme
          ? mergeProfileThemeDraft(loadedThemes, loadedProfile.customTheme)
          : loadedThemes;
        setProfile(loadedProfile);
        setShowcases(loadedShowcases);
        setThemes(loadedThemeOptions);
        setSelectedThemeId(loadedProfile.customTheme?.id ?? loadedProfile.profileThemeId ?? "");
        setSelectedShellSkinId(hostedShellSkinId);
        notifyAppShellSkinChanged(hostedShellSkinId);
        setLocalFallbackReason(null);
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        if (isProfileSchemaFallbackError(error)) {
          applyLocalCustomizeState("Supabase profile showcase schema is unavailable.");
        } else {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [applyLocalCustomizeState, isConfigured, user]);

  const selectedTheme = useMemo(
    () => themes.find((theme) => theme.id === selectedThemeId) ?? null,
    [selectedThemeId, themes],
  );
  const verifyParam = new URLSearchParams(window.location.search).get("verify");
  const isThemeSkinVerify = verifyParam === "theme-skins";
  const isAppWideThemeReadinessVerify = verifyParam === "app-wide-theme-readiness";
  const appWideThemeReadiness = useMemo(() => createVerifyAppWideThemeReadiness(), []);
  const themeSkinReadiness = useMemo(
    () =>
      buildThemeSkinReadinessPlan({
        isLocalFallback: isLocalFallback || isThemeSkinVerify,
        selectedThemeId,
        themes,
      }),
    [isLocalFallback, isThemeSkinVerify, selectedThemeId, themes],
  );
  const hasHardwareShowcase = showcases.some((showcase) => showcase.type === "hardware_setup");

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
      current.map((showcase) => (showcase.id === id ? { ...showcase, ...patch } : showcase)),
    );
  }

  async function handleCreateCustomText() {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      if (isLocalFallback) {
        const created = createLocalShowcase({
          config: { text: "Local profile note staged in this browser relay." },
          sortOrder: showcases.length,
          title: "Custom Panel",
          type: "custom_text",
        });
        setShowcases((current) => [...current, created]);
        setMessage("Local custom showcase staged.");
        return;
      }

      const created = await createShowcase({
        config: { text: "Write a custom room note here." },
        isEnabled: true,
        sortOrder: showcases.length,
        title: "Custom Panel",
        type: "custom_text",
        visibility: "public",
      });
      setShowcases((current) => [...current, created]);
      setMessage("Custom showcase created.");
    } catch (error) {
      if (isProfileSchemaFallbackError(error)) {
        const created = createLocalShowcase({
          config: { text: "Local profile note staged after schema fallback." },
          sortOrder: showcases.length,
          title: "Custom Panel",
          type: "custom_text",
        });
        setLocalFallbackReason("Supabase profile showcase schema is unavailable.");
        setShowcases((current) => [...current, created]);
        setMessage("Profile showcase schema unavailable. Local custom showcase staged.");
      } else {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreateHardwareShowcase() {
    if (hasHardwareShowcase) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      if (isLocalFallback) {
        const created = createLocalShowcase({
          config: {},
          sortOrder: showcases.length,
          title: "Hardware Rig",
          type: "hardware_setup",
        });
        setShowcases((current) => [...current, created]);
        setMessage("Local hardware rig showcase staged.");
        return;
      }

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
      if (isProfileSchemaFallbackError(error)) {
        const created = createLocalShowcase({
          config: {},
          sortOrder: showcases.length,
          title: "Hardware Rig",
          type: "hardware_setup",
        });
        setLocalFallbackReason("Supabase profile showcase schema is unavailable.");
        setShowcases((current) => [...current, created]);
        setMessage("Profile showcase schema unavailable. Local hardware rig showcase staged.");
      } else {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      if (isLocalFallback) {
        saveLocalCustomizeDraft();
        setMessage("Local customization draft saved in this browser.");
        return;
      }

      const saved = await updateShowcases(
        showcases.map((showcase, index) => ({ ...showcase, sortOrder: index })),
      );
      setShowcases(saved);
      if (selectedTheme && isLocalCustomProfileTheme(selectedTheme)) {
        const updatedProfile = await updateMyCustomTheme(selectedTheme);
        setProfile(updatedProfile);
        setMessage("Profile customization and custom theme draft synced.");
        return;
      }

      const updatedProfile = await updateMyProfileTheme(selectedThemeId || null);
      const finalProfile = profile?.customTheme ? await updateMyCustomTheme(null) : updatedProfile;
      setProfile(finalProfile);
      setMessage("Profile customization saved.");
    } catch (error) {
      if (isProfileSchemaFallbackError(error)) {
        setLocalFallbackReason("Supabase profile showcase schema is unavailable.");
        saveLocalCustomizeDraft();
        setMessage("Profile showcase schema unavailable. Local customization draft saved.");
      } else {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleExportTheme() {
    if (!selectedTheme) {
      setMessage("Select a theme before exporting.");
      return;
    }

    setMessage(null);
    setErrorMessage(null);
    try {
      const payload = createProfileThemeExchangePayload(selectedTheme);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = themeExchangeFileName(selectedTheme);
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Custom theme JSON exported for local review.");
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    }
  }

  async function handleImportTheme(file: File | null | undefined) {
    if (!file) return;

    setMessage(null);
    setErrorMessage(null);
    try {
      const importedTheme = parseProfileThemeExchangePayload(await readBrowserFileText(file));
      const nextThemes = mergeProfileThemeDraft(themes, importedTheme);
      setThemes(nextThemes);
      setSelectedThemeId(importedTheme.id);
      setProfile((current) =>
        current ? { ...current, customTheme: importedTheme, profileThemeId: null } : current,
      );
      saveLocalCustomizeDraft(showcases, importedTheme.id, nextThemes);
      if (!isLocalFallback && user) {
        try {
          const updatedProfile = await updateMyCustomTheme(importedTheme);
          setProfile(updatedProfile);
          setMessage("Custom theme JSON synced as hosted profile draft.");
          return;
        } catch (error) {
          if (isProfileSchemaFallbackError(error)) {
            setLocalFallbackReason("Supabase custom theme draft column is unavailable.");
          } else {
            setErrorMessage(formatErrorMessage(error));
            return;
          }
        }
      } else {
        setLocalFallbackReason("Custom theme exchange is local-only.");
      }
      setMessage("Custom theme imported as local draft.");
    } catch (error) {
      setErrorMessage(formatErrorMessage(error));
    } finally {
      if (themeFileInputRef.current) themeFileInputRef.current.value = "";
    }
  }

  async function handleSelectShellSkin(skinId: AppShellSkinId) {
    const nextSkinId = writeAppShellSkinId(skinId);
    const nextSkin = getAppShellSkin(nextSkinId);
    setSelectedShellSkinId(nextSkinId);
    notifyAppShellSkinChanged(nextSkinId);
    setErrorMessage(null);
    if (!isLocalFallback && user) {
      try {
        const updatedProfile = await updateMyAppShellSkin(nextSkinId);
        setProfile(updatedProfile);
        setMessage(`${nextSkin.name} shell skin synced to this profile.`);
        return;
      } catch (error) {
        if (isProfileSchemaFallbackError(error)) {
          setLocalFallbackReason("Supabase app shell skin column is unavailable.");
        } else {
          setErrorMessage(formatErrorMessage(error));
        }
      }
    }
    setMessage(`${nextSkin.name} browser-only shell skin selected.`);
  }

  async function handleResetShellSkin() {
    const nextSkinId = resetAppShellSkin();
    const nextSkin = getAppShellSkin(nextSkinId);
    setSelectedShellSkinId(nextSkinId);
    notifyAppShellSkinChanged(nextSkinId);
    setErrorMessage(null);
    if (!isLocalFallback && user) {
      try {
        const updatedProfile = await updateMyAppShellSkin(nextSkinId);
        setProfile(updatedProfile);
        setMessage(`${nextSkin.name} shell skin restored on this profile.`);
        return;
      } catch (error) {
        if (isProfileSchemaFallbackError(error)) {
          setLocalFallbackReason("Supabase app shell skin column is unavailable.");
        } else {
          setErrorMessage(formatErrorMessage(error));
        }
      }
    }
    setMessage(`${nextSkin.name} browser-only shell skin restored.`);
  }

  if (isAuthLoading || isLoading) {
    return (
      <Frame title="Customize Profile">
        <LoadingPanel />
      </Frame>
    );
  }

  if (isConfigured && !isLocalFallback && (!user || !profile)) {
    return (
      <Frame title="Customize Profile">
        <Notice title="Login required" body="Sign in before arranging your showcase panels." />
      </Frame>
    );
  }

  return (
    <Frame title="Customize Profile" eyebrow={`@${profile?.username ?? "local-editor"}`}>
      {isLocalFallback ? (
        <div className="neo-copy mb-5 border-[3px] border-black bg-[#8cf5e4] p-4 text-[11px] font-black uppercase leading-5 text-[#171411] shadow-[4px_4px_0_#171411]">
          {localFallbackReason
            ? "Profile showcase schema fallback active: Supabase is configured, but showcase tables are unavailable, so edits save as local browser drafts."
            : "Local customization relay active: Supabase is not configured, so this editor uses deterministic profile/showcase/theme data and saves drafts to this browser."}
        </div>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="border-4 border-black bg-[#fff9ed] p-5 shadow-[6px_6px_0_#171411]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="neo-copy inline-block border-2 border-black bg-[#b7102a] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#171411]">
                Panels
              </p>
              <h2 className="neo-title mt-2 text-4xl leading-none text-[#171411]">Showcases</h2>
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
              <Notice
                title="No showcases yet"
                body="New users receive defaults from the auth trigger after the migration is applied."
              />
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="border-4 border-black bg-[#fff9ed] p-5 shadow-[6px_6px_0_#171411]">
            <p className="neo-copy inline-block border-2 border-black bg-[#171411] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#fff9ed]">
              Cosmetic
            </p>
            <h2 className="neo-title mt-2 text-4xl leading-none text-[#171411]">Theme</h2>
            <select
              className="neo-copy mt-4 h-11 w-full border-2 border-black bg-[#f6edd8] px-3 text-xs font-black uppercase tracking-[0.08em] text-[#171411] shadow-[2px_2px_0_#171411] outline-none focus:bg-[#8cf5e4]"
              value={selectedThemeId}
              onChange={(event) => setSelectedThemeId(event.target.value)}
            >
              <option value="">Default</option>
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
            <div className="mt-4">
              {selectedTheme ? (
                <ProfileThemePreview theme={selectedTheme} />
              ) : (
                <Notice
                  title="Default Theme"
                  body="The warm paper launcher-room theme will be used."
                />
              )}
            </div>
            <div
              aria-label="Custom theme import export"
              className="mt-4 border-[3px] border-black bg-[#efe3cf] p-3 shadow-[3px_3px_0_#171411]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black uppercase text-[#171411]">
                  Theme Exchange
                </p>
                <p className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase text-[#171411]">
                  Schema v1
                </p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  className="neo-copy inline-flex h-10 items-center justify-center gap-2 border-2 border-black bg-[#007166] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a] disabled:opacity-60"
                  disabled={!selectedTheme}
                  type="button"
                  onClick={handleExportTheme}
                >
                  <Download className="h-4 w-4" />
                  Export JSON
                </button>
                <label className="neo-copy inline-flex h-10 cursor-pointer items-center justify-center gap-2 border-2 border-black bg-[#fff9ed] px-3 text-[9px] font-black uppercase tracking-[0.1em] text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]">
                  <Upload className="h-4 w-4" />
                  Import JSON
                  <input
                    ref={themeFileInputRef}
                    accept="application/json,.json"
                    aria-label="Import custom theme JSON"
                    className="sr-only"
                    type="file"
                    onChange={(event) => void handleImportTheme(event.currentTarget.files?.[0])}
                  />
                </label>
              </div>
            </div>
          </section>
          <AppShellSkinSelector
            selectedSkinId={selectedShellSkinId}
            onReset={handleResetShellSkin}
            onSelect={handleSelectShellSkin}
          />
          <ThemeSkinReadinessPanel plan={themeSkinReadiness} />
          {isAppWideThemeReadinessVerify ? (
            <AppWideThemeReadinessPanel readiness={appWideThemeReadiness} />
          ) : null}
          {errorMessage ? <Status tone="error" message={errorMessage} /> : null}
          {message ? <Status tone="success" message={message} /> : null}
          <button
            className="neo-copy flex h-12 w-full items-center justify-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 text-[12px] font-black uppercase tracking-[0.16em] text-white shadow-[5px_5px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#007166] disabled:opacity-60"
            disabled={isSaving}
            type="button"
            onClick={() => void handleSave()}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isLocalFallback ? "Save Local Draft" : "Save Customization"}
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
        <h1 className="neo-title mt-3 text-[3.4rem] leading-[0.82] text-[#171411] sm:text-[4.5rem] lg:text-[5.3rem] xl:text-[6rem]">
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
    <div
      className={
        tone === "error"
          ? "neo-copy border-2 border-black bg-[#b7102a] p-4 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411]"
          : "neo-copy border-2 border-black bg-[#007166] p-4 text-[11px] font-black uppercase tracking-[0.1em] text-white shadow-[3px_3px_0_#171411]"
      }
    >
      {message}
    </div>
  );
}

function AppShellSkinSelector({
  onReset,
  onSelect,
  selectedSkinId,
}: {
  onReset: () => void;
  onSelect: (skinId: AppShellSkinId) => void;
  selectedSkinId: AppShellSkinId;
}) {
  return (
    <section
      aria-label="Browser-only shell skin"
      className="border-4 border-black bg-[#fff9ed] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-3">
        <div>
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.14em] text-[#b7102a]">
            Shell Skin
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl leading-none text-[#171411]">
            <Palette aria-hidden="true" className="h-7 w-7" /> App Shell
          </h2>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
          Browser only
        </span>
      </div>

      <p className="neo-copy mt-3 border-2 border-black bg-[#efe3cf] px-3 py-2 text-[9px] font-black uppercase leading-5 text-[#5b403f] shadow-[2px_2px_0_#171411]">
        Stored on this device and, when signed in, as a built-in skin ID. No marketplace install or
        profile_theme_id write.
      </p>

      <div className="mt-3 grid gap-2">
        {APP_SHELL_SKINS.map((skin) => (
          <AppShellSkinButton
            isSelected={skin.id === selectedSkinId}
            key={skin.id}
            skin={skin}
            onSelect={onSelect}
          />
        ))}
      </div>

      <button
        className="neo-copy mt-3 flex h-10 w-full items-center justify-center gap-2 border-2 border-black bg-[#171411] px-3 text-[10px] font-black uppercase tracking-[0.1em] text-[#fff9ed] shadow-[3px_3px_0_#b7102a] transition hover:-translate-y-0.5 hover:bg-[#b7102a]"
        type="button"
        onClick={onReset}
      >
        <RotateCcw aria-hidden="true" className="h-4 w-4" />
        Reset Shell Skin
      </button>
    </section>
  );
}

function AppShellSkinButton({
  isSelected,
  onSelect,
  skin,
}: {
  isSelected: boolean;
  onSelect: (skinId: AppShellSkinId) => void;
  skin: AppShellSkin;
}) {
  return (
    <button
      aria-pressed={isSelected}
      className={
        isSelected
          ? "neo-copy flex min-h-16 w-full items-center gap-3 border-2 border-black bg-[#007166] px-3 py-2 text-left text-[10px] font-black uppercase text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5"
          : "neo-copy flex min-h-16 w-full items-center gap-3 border-2 border-black bg-[#fff9ed] px-3 py-2 text-left text-[10px] font-black uppercase text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
      }
      type="button"
      onClick={() => onSelect(skin.id)}
    >
      <span className="grid shrink-0 grid-cols-2 border-2 border-black shadow-[2px_2px_0_#171411]">
        <span className="h-4 w-4" style={{ background: skin.swatches.paper }} />
        <span className="h-4 w-4" style={{ background: skin.swatches.accent }} />
        <span className="h-4 w-4" style={{ background: skin.swatches.secondary }} />
        <span className="h-4 w-4" style={{ background: skin.swatches.highlight }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{skin.name}</span>
        <span
          className={
            isSelected
              ? "mt-1 block text-[8px] font-black uppercase leading-4 text-[#fff9ed]"
              : "mt-1 block text-[8px] font-black uppercase leading-4 text-[#5b403f]"
          }
        >
          {skin.description}
        </span>
      </span>
      <span
        className={
          isSelected
            ? "shrink-0 border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] text-[#171411]"
            : "shrink-0 border-2 border-black bg-[#f6edd8] px-2 py-1 text-[8px] text-[#171411]"
        }
      >
        {isSelected ? "Selected" : "Local"}
      </span>
    </button>
  );
}

function ThemeSkinReadinessPanel({ plan }: { plan: ThemeSkinReadinessPlan }) {
  return (
    <section
      aria-label="Theme skin readiness"
      className="border-4 border-black bg-[#fbf4e7] p-4 shadow-[5px_5px_0_#171411]"
    >
      <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-3">
        <div>
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.14em] text-[#b7102a]">
            Local Skin Check
          </p>
          <h2 className="neo-title mt-1 flex items-center gap-2 text-3xl leading-none text-[#171411]">
            <Palette aria-hidden="true" className="h-7 w-7" /> Theme Skin Readiness
          </h2>
        </div>
        <span className="neo-copy border-2 border-black bg-[#8cf5e4] px-2 py-1 text-[9px] font-black uppercase text-[#171411] shadow-[2px_2px_0_#171411]">
          Local only
        </span>
      </div>

      <div className="mt-3 border-2 border-black bg-[#efe3cf] p-3 shadow-[2px_2px_0_#171411]">
        <p className="neo-copy text-[9px] font-black uppercase text-[#5b403f]">Profile Theme</p>
        <p className="neo-title mt-1 text-3xl leading-none text-[#171411]">
          {plan.selectedThemeName}
        </p>
        <p className="neo-copy mt-2 text-[9px] font-black uppercase leading-4 text-[#5b403f]">
          {plan.summary}
        </p>
      </div>

      <div className="mt-3 grid gap-2">
        {[...plan.blockers, ...plan.warnings].slice(0, 4).map((item) => (
          <p
            className="neo-copy border-2 border-black bg-[#fff9ed] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
            key={item}
          >
            {item}
          </p>
        ))}
      </div>

      <div className="mt-3 grid gap-2">
        {plan.checklist.map((item) => (
          <p
            className="neo-copy border-2 border-black bg-[#f6edd8] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]"
            key={item}
          >
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}

function createMockCustomizeState(): {
  profile: Profile;
  showcases: ProfileShowcase[];
  themes: ProfileTheme[];
} {
  const now = new Date().toISOString();
  const draft = readLocalCustomizeDraft();
  const profile: Profile = {
    achievementVisibility: "public",
    appShellSkinId: null,
    customTheme: null,
    avatarUrl: null,
    bannerUrl: null,
    bio: "Local customization profile for editor verification.",
    commentsVisibility: "public",
    countryCode: "DE",
    createdAt: now,
    displayName: "Local Editor",
    featuredAchievementId: null,
    featuredBadgeId: null,
    featuredGameId: null,
    gameActivityVisibility: "friends_only",
    id: "local-editor-user",
    isBanned: false,
    isDeleted: false,
    language: "en",
    lastSeenAt: now,
    libraryVisibility: "friends_only",
    onlineStatusVisibility: "public",
    profileLevel: 18,
    profileThemeId: draft?.selectedThemeId || "local-theme-paper",
    profileVisibility: "public",
    profileXp: 7400,
    timezone: "Europe/Berlin",
    updatedAt: now,
    username: "local-editor",
    wishlistVisibility: "public",
  };

  const baseThemes: ProfileTheme[] = [
    {
      accentColor: "#b7102a",
      backgroundType: "solid",
      backgroundValue: "#f6edd8",
      cardStyle: "pixel",
      createdAt: now,
      description: "Warm paper, red ink, teal signal blocks, and hard black panel shadows.",
      id: "local-theme-paper",
      isActive: true,
      isPremium: false,
      key: "retro-paper",
      name: "Retro Paper Room",
      textColor: "#171411",
    },
    {
      accentColor: "#007166",
      backgroundType: "solid",
      backgroundValue: "#fff9ed",
      cardStyle: "solid",
      createdAt: now,
      description: "Cleaner paper-room variant for dense showcase editing.",
      id: "local-theme-clean",
      isActive: true,
      isPremium: false,
      key: "clean-paper",
      name: "Clean Paper Room",
      textColor: "#171411",
    },
  ];
  const defaultShowcases = [
    createLocalShowcase({
      config: { text: "Pin the active build, speedrun goals, or profile rules here." },
      sortOrder: 0,
      title: "Room Note",
      type: "custom_text",
    }),
    createLocalShowcase({
      config: {},
      sortOrder: 1,
      title: "Favorite Games",
      type: "favorite_games",
    }),
    createLocalShowcase({
      config: {},
      sortOrder: 2,
      title: "Rare Unlocks",
      type: "rare_achievements",
    }),
    createLocalShowcase({
      config: {},
      sortOrder: 3,
      title: "Hardware Rig",
      type: "hardware_setup",
    }),
  ];
  const customThemes = draft?.customThemes?.filter(isProfileThemeLike) ?? [];
  const themes = [
    ...baseThemes,
    ...customThemes.filter(
      (customTheme) => !baseThemes.some((baseTheme) => baseTheme.id === customTheme.id),
    ),
  ];
  const themeIds = new Set(themes.map((theme) => theme.id));
  const selectedThemeId =
    draft?.selectedThemeId && themeIds.has(draft.selectedThemeId)
      ? draft.selectedThemeId
      : profile.profileThemeId;
  profile.profileThemeId = selectedThemeId;

  return {
    profile,
    showcases: draft?.showcases.length ? draft.showcases : defaultShowcases,
    themes,
  };
}

function readLocalCustomizeDraft(): LocalCustomizeDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(LOCAL_CUSTOMIZE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalCustomizeDraft>;
    if (
      typeof parsed.savedAt !== "string" ||
      typeof parsed.selectedThemeId !== "string" ||
      !Array.isArray(parsed.showcases)
    ) {
      return null;
    }

    const showcases = parsed.showcases.filter(isLocalProfileShowcase).map((showcase, index) => ({
      ...showcase,
      sortOrder: index,
    }));
    const customThemes = Array.isArray(parsed.customThemes)
      ? parsed.customThemes.filter(isProfileThemeLike).filter(isLocalCustomProfileTheme)
      : [];

    return {
      customThemes,
      savedAt: parsed.savedAt,
      selectedThemeId: parsed.selectedThemeId,
      showcases,
    };
  } catch {
    return null;
  }
}

function mergeProfileThemeDraft(themes: ProfileTheme[], customTheme: ProfileTheme) {
  return [
    ...themes.filter((theme) => theme.id !== customTheme.id && theme.key !== customTheme.key),
    customTheme,
  ];
}

function writeLocalCustomizeDraft(draft: LocalCustomizeDraft) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(LOCAL_CUSTOMIZE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Local draft saving is best-effort in restricted browser previews.
  }
}

function isProfileSchemaFallbackError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    isMissingSchemaMessage(message) ||
    normalized.includes("profile_showcases") ||
    normalized.includes("profile_themes") ||
    normalized.includes("profiles") ||
    normalized.includes("column") ||
    normalized.includes("schema cache")
  );
}

function isLocalProfileShowcase(value: unknown): value is ProfileShowcase {
  if (!value || typeof value !== "object") return false;
  const showcase = value as Partial<ProfileShowcase>;
  return (
    typeof showcase.id === "string" &&
    typeof showcase.userId === "string" &&
    typeof showcase.type === "string" &&
    typeof showcase.sortOrder === "number" &&
    typeof showcase.config === "object" &&
    typeof showcase.isEnabled === "boolean" &&
    typeof showcase.createdAt === "string" &&
    typeof showcase.updatedAt === "string"
  );
}

function createLocalShowcase({
  config,
  sortOrder,
  title,
  type,
}: Pick<ProfileShowcase, "config" | "sortOrder" | "title" | "type">): ProfileShowcase {
  const now = new Date().toISOString();

  return {
    config,
    createdAt: now,
    id: `local-${type}-${sortOrder}-${Date.now()}`,
    isEnabled: true,
    sortOrder,
    title,
    type,
    updatedAt: now,
    userId: "local-editor-user",
    visibility: "public",
  };
}
