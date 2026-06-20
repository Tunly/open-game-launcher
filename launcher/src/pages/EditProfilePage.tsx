import { CheckCircle2, Cpu, Loader2, Plus, Save, Search, Trash2, Upload } from "lucide-react";
import {
  useEffect,
  useCallback,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Link } from "react-router-dom";

import { useCurrentUser } from "../hooks/useCurrentUser";
import { detectHardwareInfo } from "../lib/launcher";
import { isMissingSchemaMessage } from "../lib/supabase/helpers";
import {
  ensureMyHardwareShowcase,
  getMyProfile,
  getProfileThemes,
  getUserHardware,
  getUserSocialLinks,
  updateMyHardware,
  updateMyProfile,
  updateMyProfileTheme,
  updateMySocialLinks,
  uploadAvatar,
  uploadBanner,
  isUsernameAvailable,
} from "../lib/supabase/profile";
import { usernameSchema } from "../lib/validation/profile";
import type { Profile, ProfileTheme, ProfileVisibility } from "../lib/types/profile";

interface ProfileFormState {
  username: string;
  displayName: string;
  avatarUrl: string;
  bannerUrl: string;
  bio: string;
  countryCode: string;
  language: string;
  timezone: string;
  cpu: string;
  gpu: string;
  ram: string;
  monitor: string;
  keyboard: string;
  mouse: string;
  headset: string;
  controller: string;
  hardwareVisibility: ProfileVisibility;
}

interface EditableSocialLink {
  id?: string;
  platform: string;
  label: string;
  url: string;
  visibility: ProfileVisibility;
}

const emptyForm: ProfileFormState = {
  username: "",
  displayName: "",
  avatarUrl: "",
  bannerUrl: "",
  bio: "",
  countryCode: "",
  language: "en",
  timezone: "",
  cpu: "",
  gpu: "",
  ram: "",
  monitor: "",
  keyboard: "",
  mouse: "",
  headset: "",
  controller: "",
  hardwareVisibility: "friends_only",
};

type UsernameStatus = "idle" | "checking" | "available" | "taken";
const LOCAL_PROFILE_EDITOR_KEY = "og-launcher:profile-editor-draft:v1";
const SOCIAL_LINK_VISIBILITY_EDITOR_VERIFY = "social-link-visibility-editor";
const SOCIAL_LINK_VISIBILITY_EDITOR_REASON =
  "Social-link visibility editor verification active: public, friends-only, and private links are staged locally without Supabase writes.";

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

const hardwareFields = [
  "cpu",
  "gpu",
  "ram",
  "monitor",
  "keyboard",
  "mouse",
  "headset",
  "controller",
] as const;

type HardwareField = (typeof hardwareFields)[number];

export function EditProfilePage() {
  const { isConfigured, isLoading: isAuthLoading, user } = useCurrentUser();
  const verifyMode =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("verify");
  const isSocialLinkVisibilityEditorVerify = verifyMode === SOCIAL_LINK_VISIBILITY_EDITOR_VERIFY;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [themes, setThemes] = useState<ProfileTheme[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState("");
  const [form, setForm] = useState<ProfileFormState>(emptyForm);
  const [socialLinks, setSocialLinks] = useState<EditableSocialLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDetectingHardware, setIsDetectingHardware] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [localFallbackReason, setLocalFallbackReason] = useState<string | null>(null);
  const isLocalFallback =
    !isConfigured || localFallbackReason !== null || isSocialLinkVisibilityEditorVerify;

  const applyLocalProfileEditorState = useCallback(
    (reason: string | null) => {
      const mockState = createMockProfileEditorState({
        socialLinkVisibilityEditor: isSocialLinkVisibilityEditorVerify,
      });
      setProfile(mockState.profile);
      setThemes(mockState.themes);
      setSelectedThemeId(mockState.profile.profileThemeId ?? "");
      setForm(mockState.form);
      setSocialLinks(mockState.socialLinks);
      setLocalFallbackReason(reason);
      setErrorMessage(null);
    },
    [isSocialLinkVisibilityEditorVerify],
  );

  useEffect(() => {
    let isMounted = true;

    if (isSocialLinkVisibilityEditorVerify) {
      applyLocalProfileEditorState(SOCIAL_LINK_VISIBILITY_EDITOR_REASON);
      setIsLoading(false);
      return;
    }

    if (!isConfigured) {
      applyLocalProfileEditorState(null);
      setIsLoading(false);
      return;
    }

    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    void getMyProfile()
      .then(async (loadedProfile) => {
        const [hardware, loadedSocialLinks, loadedThemes] = await Promise.all([
          getUserHardware(loadedProfile.id),
          getUserSocialLinks(loadedProfile.id),
          getProfileThemes(),
        ]);

        if (!isMounted) return;

        setProfile(loadedProfile);
        setThemes(loadedThemes);
        setSelectedThemeId(loadedProfile.profileThemeId ?? "");
        setForm({
          username: loadedProfile.username,
          displayName: loadedProfile.displayName ?? "",
          avatarUrl: loadedProfile.avatarUrl ?? "",
          bannerUrl: loadedProfile.bannerUrl ?? "",
          bio: loadedProfile.bio ?? "",
          countryCode: loadedProfile.countryCode ?? "",
          language: loadedProfile.language,
          timezone: loadedProfile.timezone ?? "",
          cpu: hardware?.cpu ?? "",
          gpu: hardware?.gpu ?? "",
          ram: hardware?.ram ?? "",
          monitor: hardware?.monitor ?? "",
          keyboard: hardware?.keyboard ?? "",
          mouse: hardware?.mouse ?? "",
          headset: hardware?.headset ?? "",
          controller: hardware?.controller ?? "",
          hardwareVisibility: hardware?.visibility ?? "friends_only",
        });
        setSocialLinks(
          loadedSocialLinks.map((link) => ({
            id: link.id,
            label: link.label ?? "",
            platform: link.platform,
            url: link.url,
            visibility: link.visibility,
          })),
        );
        setLocalFallbackReason(null);
      })
      .catch((error: unknown) => {
        if (!isMounted) return;
        if (isProfileSchemaFallbackError(error)) {
          applyLocalProfileEditorState("Supabase profile schema is unavailable.");
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
  }, [applyLocalProfileEditorState, isConfigured, isSocialLinkVisibilityEditorVerify, user]);

  function updateField(field: keyof ProfileFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleAssetUpload(
    event: ChangeEvent<HTMLInputElement>,
    type: "avatar" | "banner",
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      if (isLocalFallback) {
        const url = await fileToDataUrl(file);
        updateField(type === "avatar" ? "avatarUrl" : "bannerUrl", url);
        setMessage(
          `${type === "avatar" ? "Avatar" : "Banner"} staged as a local browser draft asset.`,
        );
        return;
      }

      const url = type === "avatar" ? await uploadAvatar(file) : await uploadBanner(file);
      updateField(type === "avatar" ? "avatarUrl" : "bannerUrl", url);
      setMessage(
        `${type === "avatar" ? "Avatar" : "Banner"} uploaded. Save profile to persist it.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function checkUsername(currentUsername: string) {
    const normalizedUsername = normalizeUsername(currentUsername);
    if (isLocalFallback) {
      const parsed = usernameSchema.safeParse(normalizedUsername);
      if (!parsed.success) {
        setUsernameStatus("idle");
        setErrorMessage(parsed.error.issues[0]?.message ?? "Username is invalid.");
        return false;
      }

      setUsernameStatus("available");
      setErrorMessage(null);
      return true;
    }

    if (normalizedUsername === profile?.username) {
      setUsernameStatus("available");
      return true;
    }

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
      setErrorMessage(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    setErrorMessage(null);

    const normalizedUsername = normalizeUsername(form.username);
    const usernameAvailable = await checkUsername(normalizedUsername);

    if (!usernameAvailable) {
      setIsSaving(false);
      return;
    }

    try {
      if (isLocalFallback) {
        const nextProfile: Profile = {
          ...(profile ??
            createMockProfileEditorState({
              socialLinkVisibilityEditor: isSocialLinkVisibilityEditorVerify,
            }).profile),
          avatarUrl: nullable(form.avatarUrl),
          bannerUrl: nullable(form.bannerUrl),
          bio: nullable(form.bio),
          countryCode: nullable(form.countryCode)?.toUpperCase() ?? null,
          displayName: nullable(form.displayName),
          language: form.language || "en",
          profileThemeId: selectedThemeId || null,
          timezone: nullable(form.timezone),
          updatedAt: new Date().toISOString(),
          username: normalizedUsername,
        };
        const nextForm = {
          ...form,
          countryCode: nullable(form.countryCode)?.toUpperCase() ?? "",
          username: normalizedUsername,
        };

        setProfile(nextProfile);
        setForm(nextForm);
        const didSaveDraft = writeLocalProfileEditorDraft({
          form: nextForm,
          profile: nextProfile,
          selectedThemeId,
          socialLinks,
        });
        setUsernameStatus("idle");
        setMessage(
          didSaveDraft
            ? "Local profile draft saved in this browser. Connect Supabase to persist."
            : "Local profile draft could not be stored in this browser.",
        );
        window.dispatchEvent(
          new CustomEvent("profile-updated", { detail: { username: nextProfile.username } }),
        );
        return;
      }

      const nextProfile = await updateMyProfile({
        username: normalizedUsername,
        displayName: nullable(form.displayName),
        avatarUrl: nullable(form.avatarUrl),
        bannerUrl: nullable(form.bannerUrl),
        bio: nullable(form.bio),
        countryCode: nullable(form.countryCode)?.toUpperCase() ?? null,
        language: form.language || "en",
        timezone: nullable(form.timezone),
      });
      await updateMyProfileTheme(selectedThemeId || null);
      await updateMyHardware({
        controller: nullable(form.controller),
        cpu: nullable(form.cpu),
        gpu: nullable(form.gpu),
        headset: nullable(form.headset),
        keyboard: nullable(form.keyboard),
        monitor: nullable(form.monitor),
        mouse: nullable(form.mouse),
        ram: nullable(form.ram),
        visibility: form.hardwareVisibility,
      });
      await ensureMyHardwareShowcase(form.hardwareVisibility).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        const normalizedMessage = message.toLowerCase();

        if (
          !normalizedMessage.includes("profile_showcases") &&
          !normalizedMessage.includes("schema cache")
        ) {
          throw error;
        }
      });
      await updateMySocialLinks(
        socialLinks
          .filter((link) => link.platform.trim() && link.url.trim())
          .map((link, index) => ({
            id: link.id,
            label: nullable(link.label),
            platform: link.platform.trim(),
            sortOrder: index,
            url: link.url.trim(),
            visibility: link.visibility,
          })),
      );

      setProfile(nextProfile);
      setForm((current) => ({ ...current, username: nextProfile.username }));
      setUsernameStatus("idle");
      setMessage("Profile and hardware rig saved.");
      window.dispatchEvent(
        new CustomEvent("profile-updated", { detail: { username: nextProfile.username } }),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDetectHardware() {
    setIsDetectingHardware(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const detectedHardware = await detectHardwareInfo();
      const detectedFields: Partial<Record<HardwareField, string>> = {};

      hardwareFields.forEach((field) => {
        const value = detectedHardware[field];
        if (typeof value === "string" && value.trim()) {
          detectedFields[field] = value.trim();
        }
      });

      setForm((current) => ({ ...current, ...detectedFields }));

      const filledLabels = Object.keys(detectedFields)
        .map((field) => field.toUpperCase())
        .join(", ");

      setMessage(
        filledLabels
          ? `Hardware detected (${detectedHardware.source}): ${filledLabels}. Save to apply these values to your profile.`
          : "No hardware data detected. Browser preview only provides estimated browser values.",
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDetectingHardware(false);
    }
  }

  if (isAuthLoading || isLoading) {
    return (
      <PageFrame title="Edit Profile">
        <LoadingPanel />
      </PageFrame>
    );
  }

  if (isConfigured && !isLocalFallback && (!user || !profile)) {
    return (
      <PageFrame title="Edit Profile">
        <NoticePanel title="Login required" body="Sign in to edit your player profile." />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      eyebrow="Settings"
      title="Edit Profile"
      action={
        <Link
          className="neo-copy border-2 border-black bg-[#fff9ed] px-4 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
          to={`/u/${profile?.username ?? form.username}`}
        >
          Public Profile
        </Link>
      }
    >
      {isLocalFallback ? (
        <div className="neo-copy mb-5 border-[3px] border-black bg-[#8cf5e4] p-4 text-[11px] font-black uppercase leading-5 text-[#171411] shadow-[4px_4px_0_#171411]">
          {localFallbackBannerCopy(localFallbackReason)}
        </div>
      ) : null}
      <form className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]" onSubmit={handleSubmit}>
        <div className="space-y-5">
          <Panel label="Player Card" title="Identity">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="neo-copy text-[11px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                  Username
                </span>
                <span className="mt-2 flex h-11 items-center gap-2 border-2 border-black bg-[#f6edd8] px-3 shadow-[2px_2px_0_#171411] focus-within:bg-[#fff9ed]">
                  <input
                    className="min-w-0 flex-1 bg-transparent lowercase text-[#171411] outline-none"
                    maxLength={32}
                    minLength={3}
                    value={form.username}
                    onBlur={() => {
                      if (form.username.trim() && form.username !== profile?.username)
                        void checkUsername(form.username);
                    }}
                    onChange={(event) => {
                      updateField("username", event.target.value);
                      if (event.target.value === profile?.username) {
                        setUsernameStatus("idle");
                      } else {
                        setUsernameStatus("idle");
                      }
                    }}
                  />
                  <button
                    aria-label="Check username"
                    className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-black bg-[#efe6d4] text-[#171411]"
                    disabled={isSaving || usernameStatus === "checking"}
                    type="button"
                    onClick={() => void checkUsername(form.username)}
                  >
                    {usernameStatus === "available" || form.username === profile?.username ? (
                      <CheckCircle2 className="h-4 w-4 text-[#087d6d]" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </button>
                </span>
                {usernameStatus === "taken" && (
                  <span className="neo-copy mt-1 block text-[10px] font-bold uppercase text-[#c20b2f]">
                    Username is taken
                  </span>
                )}
                {usernameStatus === "available" && form.username !== profile?.username && (
                  <span className="neo-copy mt-1 block text-[10px] font-bold uppercase text-[#087d6d]">
                    Username is available
                  </span>
                )}
              </label>
              <TextInput
                label="Display Name"
                value={form.displayName}
                onChange={(value) => updateField("displayName", value)}
              />
              <TextInput
                label="Country"
                value={form.countryCode}
                onChange={(value) => updateField("countryCode", value)}
                placeholder="DE"
              />
              <TextInput
                label="Language"
                value={form.language}
                onChange={(value) => updateField("language", value)}
                placeholder="en"
              />
              <TextInput
                label="Timezone"
                value={form.timezone}
                onChange={(value) => updateField("timezone", value)}
                placeholder="Europe/Berlin"
              />
              <label>
                <span className="neo-copy text-[11px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                  Theme
                </span>
                <select
                  className="neo-copy mt-2 h-11 w-full border-2 border-black bg-[#f6edd8] px-3 text-xs font-black uppercase tracking-[0.08em] text-[#171411] shadow-[2px_2px_0_#171411] outline-none focus:bg-[#8cf5e4]"
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
              </label>
            </div>
            <label className="mt-4 block">
              <span className="neo-copy text-[11px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                Bio
              </span>
              <textarea
                className="mt-2 min-h-36 w-full border-2 border-black bg-[#f6edd8] px-3 py-3 text-[#171411] shadow-[3px_3px_0_#171411] outline-none focus:bg-[#fff9ed]"
                maxLength={1000}
                value={form.bio}
                onChange={(event) => updateField("bio", event.target.value)}
              />
            </label>
          </Panel>

          <Panel label="Links" title="Social Slots">
            <div className="space-y-3">
              {socialLinks.map((link, index) => (
                <div
                  key={link.id ?? index}
                  className="grid gap-3 md:grid-cols-[130px_1fr_1fr_150px_auto]"
                >
                  <TextInput
                    label="Platform"
                    value={link.platform}
                    onChange={(value) =>
                      updateSocialLink(index, { platform: value }, setSocialLinks)
                    }
                  />
                  <TextInput
                    label="Label"
                    value={link.label}
                    onChange={(value) => updateSocialLink(index, { label: value }, setSocialLinks)}
                  />
                  <TextInput
                    label="URL"
                    value={link.url}
                    onChange={(value) => updateSocialLink(index, { url: value }, setSocialLinks)}
                  />
                  <label>
                    <span className="neo-copy text-[11px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                      Visibility
                    </span>
                    <select
                      className="neo-copy mt-2 h-11 w-full border-2 border-black bg-[#f6edd8] px-3 text-xs font-black uppercase tracking-[0.08em] text-[#171411] shadow-[2px_2px_0_#171411] outline-none focus:bg-[#8cf5e4]"
                      value={link.visibility}
                      onChange={(event) =>
                        updateSocialLink(
                          index,
                          { visibility: normalizeProfileVisibility(event.target.value) },
                          setSocialLinks,
                        )
                      }
                    >
                      <option value="public">Public</option>
                      <option value="friends_only">Friends Only</option>
                      <option value="private">Private</option>
                    </select>
                  </label>
                  <button
                    aria-label="Remove social link"
                    className="mt-7 flex h-11 items-center justify-center border-2 border-black bg-[#b7102a] px-3 text-white shadow-[2px_2px_0_#171411] transition hover:-translate-y-0.5"
                    type="button"
                    onClick={() =>
                      setSocialLinks((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="neo-copy mt-4 inline-flex h-10 items-center gap-2 border-2 border-black bg-[#007166] px-3 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a]"
              type="button"
              onClick={() =>
                setSocialLinks((current) => [
                  ...current,
                  { label: "", platform: "website", url: "", visibility: "public" },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              Add link
            </button>
          </Panel>

          <Panel label="Setup" title="Hardware Rig">
            <div className="mb-4 flex flex-col gap-3 border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411] md:flex-row md:items-center md:justify-between">
              <p className="neo-copy text-[11px] font-black uppercase leading-5 tracking-[0.08em] text-[#5b403f]">
                Desktop mode detects CPU, GPU, RAM, monitor, and input devices. Browser preview uses
                estimated browser values.
              </p>
              <button
                className="neo-copy inline-flex h-11 shrink-0 items-center justify-center gap-2 border-2 border-black bg-[#007166] px-3 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isDetectingHardware || isSaving}
                type="button"
                onClick={() => void handleDetectHardware()}
              >
                {isDetectingHardware ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Cpu className="h-4 w-4" />
                )}
                Detect Hardware
              </button>
            </div>
            <label className="mb-4 block">
              <span className="neo-copy text-[11px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
                Show Hardware On Profile
              </span>
              <select
                className="neo-copy mt-2 h-11 w-full border-2 border-black bg-[#f6edd8] px-3 text-xs font-black uppercase tracking-[0.08em] text-[#171411] shadow-[2px_2px_0_#171411] outline-none focus:bg-[#8cf5e4]"
                value={form.hardwareVisibility}
                onChange={(event) =>
                  updateField("hardwareVisibility", event.target.value as ProfileVisibility)
                }
              >
                <option value="public">Public</option>
                <option value="friends_only">Friends Only</option>
                <option value="private">Private</option>
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              {hardwareFields.map((field) => (
                <TextInput
                  key={field}
                  label={field.toUpperCase()}
                  value={form[field]}
                  onChange={(value) => updateField(field, value)}
                />
              ))}
            </div>
          </Panel>
        </div>

        <aside className="space-y-5">
          <Panel label="Assets" title="Profile Images">
            <ProfileImagePreview
              avatarUrl={form.avatarUrl}
              bannerUrl={form.bannerUrl}
              displayName={form.displayName || form.username}
              username={form.username}
            />
            <AssetUpload
              label="Avatar"
              onChange={(event) => void handleAssetUpload(event, "avatar")}
            />
            <AssetUpload
              label="Banner"
              onChange={(event) => void handleAssetUpload(event, "banner")}
            />
          </Panel>
          <Panel label="Showcase" title="Featured Slots">
            <div className="space-y-3">
              <FeaturedSlotReadout
                artClass="library-art-tokyo"
                label="Featured Game"
                value="Neon Drift"
              />
              <FeaturedSlotReadout
                artClass="library-art-mech"
                label="Achievement"
                value="Perfect Lap"
              />
              <FeaturedSlotReadout label="Badge" value="Founder" />
            </div>
          </Panel>
          {errorMessage ? <StatusPanel tone="error" message={errorMessage} /> : null}
          {message ? <StatusPanel tone="success" message={message} /> : null}
          <button
            className="neo-copy flex h-14 w-full items-center justify-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 text-[12px] font-black uppercase tracking-[0.16em] text-white shadow-[5px_5px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#007166] disabled:opacity-60"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isLocalFallback ? "Save Local Draft" : "Save Profile"}
          </button>
        </aside>
      </form>
    </PageFrame>
  );
}

function updateSocialLink(
  index: number,
  patch: Partial<EditableSocialLink>,
  setSocialLinks: Dispatch<SetStateAction<EditableSocialLink[]>>,
) {
  setSocialLinks((current) =>
    current.map((link, itemIndex) => (itemIndex === index ? { ...link, ...patch } : link)),
  );
}

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeProfileVisibility(value: unknown): ProfileVisibility {
  return value === "friends_only" || value === "private" || value === "public" ? value : "public";
}

function localFallbackBannerCopy(reason: string | null) {
  if (reason === SOCIAL_LINK_VISIBILITY_EDITOR_REASON) return reason;
  if (reason) {
    return "Profile schema fallback active: Supabase is configured, but profile tables are unavailable, so identity, social links, hardware, and image slots save as local browser drafts.";
  }

  return "Local profile editor relay active: Supabase is not connected, so identity, social links, hardware, and image slots save as persistent drafts in this browser.";
}

function createMockProfileEditorState(options: { socialLinkVisibilityEditor?: boolean } = {}): {
  form: ProfileFormState;
  profile: Profile;
  selectedThemeId: string;
  socialLinks: EditableSocialLink[];
  themes: ProfileTheme[];
} {
  const now = new Date().toISOString();
  const themes = createLocalProfileThemes(now);
  const profile: Profile = {
    achievementVisibility: "public",
    appShellSkinId: null,
    customTheme: null,
    avatarUrl: null,
    bannerUrl: null,
    bio: options.socialLinkVisibilityEditor
      ? "Local editor verification for public, friends-only, and private profile links."
      : "Local profile editor draft for Retro Manga Launcher verification.",
    commentsVisibility: "public",
    countryCode: "DE",
    createdAt: now,
    displayName: options.socialLinkVisibilityEditor
      ? "Social Link Visibility Editor"
      : "Local Editor",
    featuredAchievementId: null,
    featuredBadgeId: null,
    featuredGameId: null,
    gameActivityVisibility: "friends_only",
    id: "local-profile-editor",
    isBanned: false,
    isDeleted: false,
    language: "en",
    lastSeenAt: now,
    libraryVisibility: "friends_only",
    onlineStatusVisibility: "public",
    profileLevel: 18,
    profileThemeId: themes[0]?.id ?? null,
    profileVisibility: "public",
    profileXp: 7400,
    timezone: "Europe/Berlin",
    updatedAt: now,
    username: options.socialLinkVisibilityEditor ? "social-link-editor" : "local-editor",
    wishlistVisibility: "public",
  };
  const form = profileToForm(profile, {
    controller: "Xbox Elite Controller",
    cpu: "8 logical cores",
    gpu: "Browser WebGL adapter",
    headset: "",
    keyboard: "Mechanical TKL",
    monitor: "1920x1080",
    mouse: "Wireless mouse",
    ram: "8 GB",
    hardwareVisibility: "public",
  });
  const socialLinks: EditableSocialLink[] = options.socialLinkVisibilityEditor
    ? [
        {
          id: "verify-social-public",
          label: "Public Proof",
          platform: "docs",
          url: "https://example.com/public-profile-link",
          visibility: "public",
        },
        {
          id: "verify-social-friends",
          label: "Friends Lobby",
          platform: "discord",
          url: "https://discord.gg/friends-lobby",
          visibility: "friends_only",
        },
        {
          id: "verify-social-private",
          label: "Private Discord",
          platform: "discord",
          url: "https://discord.gg/private-lab",
          visibility: "private",
        },
      ]
    : [
        {
          id: "local-social-clips",
          label: "Match Clips",
          platform: "clips",
          url: "https://example.com/clips",
          visibility: "public",
        },
        {
          id: "local-social-speedrun",
          label: "Speedrun Board",
          platform: "speedrun",
          url: "https://example.com/speedrun",
          visibility: "public",
        },
      ];
  const storedDraft = options.socialLinkVisibilityEditor ? null : readLocalProfileEditorDraft();

  return {
    form: storedDraft?.form ?? form,
    profile: storedDraft?.profile ?? profile,
    selectedThemeId: storedDraft?.selectedThemeId ?? profile.profileThemeId ?? "",
    socialLinks: storedDraft?.socialLinks ?? socialLinks,
    themes,
  };
}

function createLocalProfileThemes(now: string): ProfileTheme[] {
  return [
    {
      accentColor: "#b7102a",
      backgroundType: "solid",
      backgroundValue: "#f6edd8",
      cardStyle: "pixel",
      createdAt: now,
      description: "Warm paper profile room with red ink, teal signals, and hard panel shadows.",
      id: "local-profile-theme-paper",
      isActive: true,
      isPremium: false,
      key: "local-paper-room",
      name: "Retro Paper Room",
      textColor: "#171411",
    },
    {
      accentColor: "#007166",
      backgroundType: "solid",
      backgroundValue: "#fff9ed",
      cardStyle: "solid",
      createdAt: now,
      description: "Clean paper editor variant for dense profile settings.",
      id: "local-profile-theme-clean",
      isActive: true,
      isPremium: false,
      key: "local-clean-room",
      name: "Clean Paper Room",
      textColor: "#171411",
    },
  ];
}

function profileToForm(
  profile: Profile,
  hardware: Pick<
    ProfileFormState,
    | "controller"
    | "cpu"
    | "gpu"
    | "headset"
    | "keyboard"
    | "monitor"
    | "mouse"
    | "ram"
    | "hardwareVisibility"
  >,
): ProfileFormState {
  return {
    avatarUrl: profile.avatarUrl ?? "",
    bannerUrl: profile.bannerUrl ?? "",
    bio: profile.bio ?? "",
    controller: hardware.controller,
    countryCode: profile.countryCode ?? "",
    cpu: hardware.cpu,
    displayName: profile.displayName ?? "",
    gpu: hardware.gpu,
    hardwareVisibility: hardware.hardwareVisibility,
    headset: hardware.headset,
    keyboard: hardware.keyboard,
    language: profile.language,
    monitor: hardware.monitor,
    mouse: hardware.mouse,
    ram: hardware.ram,
    timezone: profile.timezone ?? "",
    username: profile.username,
  };
}

function readLocalProfileEditorDraft(): {
  form: ProfileFormState;
  profile: Profile;
  selectedThemeId: string;
  socialLinks: EditableSocialLink[];
} | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(LOCAL_PROFILE_EDITOR_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!isLocalProfileEditorDraft(parsed)) return null;
    return sanitizeLocalProfileEditorDraft(parsed);
  } catch {
    return null;
  }
}

function writeLocalProfileEditorDraft(input: {
  form: ProfileFormState;
  profile: Profile;
  selectedThemeId: string;
  socialLinks: EditableSocialLink[];
}): boolean {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(LOCAL_PROFILE_EDITOR_KEY, JSON.stringify(input));
    return true;
  } catch {
    return false;
  }
}

function sanitizeLocalProfileEditorDraft(input: {
  form: ProfileFormState;
  profile: Profile;
  selectedThemeId: string;
  socialLinks: EditableSocialLink[];
}) {
  const form = {
    ...input.form,
    avatarUrl: sanitizePersistedAssetUrl(input.form.avatarUrl),
    bannerUrl: sanitizePersistedAssetUrl(input.form.bannerUrl),
  };
  const profile = {
    ...input.profile,
    avatarUrl: sanitizePersistedAssetUrl(input.profile.avatarUrl ?? "") || null,
    bannerUrl: sanitizePersistedAssetUrl(input.profile.bannerUrl ?? "") || null,
  };

  return {
    ...input,
    form,
    profile,
    socialLinks: input.socialLinks.map((link) => ({
      ...link,
      visibility: normalizeProfileVisibility(link.visibility),
    })),
  };
}

function sanitizePersistedAssetUrl(url: string) {
  return url.startsWith("blob:") ? "" : url;
}

function isProfileSchemaFallbackError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    isMissingSchemaMessage(message) ||
    normalized.includes("profiles") ||
    normalized.includes("profile_themes") ||
    normalized.includes("profile_showcases") ||
    normalized.includes("user_hardware") ||
    normalized.includes("user_social_links") ||
    normalized.includes("column") ||
    normalized.includes("schema cache")
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read image file."));
      }
    });
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("Could not read image file.")),
    );
    reader.readAsDataURL(file);
  });
}

function isLocalProfileEditorDraft(value: unknown): value is {
  form: ProfileFormState;
  profile: Profile;
  selectedThemeId: string;
  socialLinks: EditableSocialLink[];
} {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as {
    form?: unknown;
    profile?: unknown;
    selectedThemeId?: unknown;
    socialLinks?: unknown;
  };

  return (
    isProfileFormState(draft.form) &&
    isProfile(draft.profile) &&
    typeof draft.selectedThemeId === "string" &&
    Array.isArray(draft.socialLinks) &&
    draft.socialLinks.every(isEditableSocialLink)
  );
}

function isProfileFormState(value: unknown): value is ProfileFormState {
  if (typeof value !== "object" || value === null) return false;
  const form = value as Record<keyof ProfileFormState, unknown>;
  return Object.keys(emptyForm).every(
    (key) => typeof form[key as keyof ProfileFormState] === "string",
  );
}

function isProfile(value: unknown): value is Profile {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Partial<Profile>;
  return (
    typeof profile.id === "string" &&
    typeof profile.username === "string" &&
    typeof profile.language === "string" &&
    typeof profile.profileLevel === "number" &&
    typeof profile.profileXp === "number" &&
    typeof profile.createdAt === "string" &&
    typeof profile.updatedAt === "string"
  );
}

function isEditableSocialLink(value: unknown): value is EditableSocialLink {
  if (typeof value !== "object" || value === null) return false;
  const link = value as Partial<EditableSocialLink>;
  return (
    (typeof link.id === "string" || link.id === undefined) &&
    typeof link.platform === "string" &&
    typeof link.label === "string" &&
    typeof link.url === "string"
  );
}

function PageFrame({
  action,
  children,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  eyebrow?: string;
  title: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[1220px] px-0 py-2">
      <div className="mb-7 flex flex-col gap-4 border-b-4 border-black pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          {eyebrow ? (
            <p className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-white shadow-[3px_3px_0_#171411]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="neo-title mt-3 text-[3.6rem] leading-[0.82] text-[#171411] sm:text-[4.6rem] lg:text-[5.4rem] xl:text-[6rem]">
            {title}
          </h1>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Panel({ children, label, title }: { children: ReactNode; label?: string; title: string }) {
  return (
    <section className="relative border-4 border-black bg-[#fff9ed] p-5 shadow-[6px_6px_0_#171411]">
      {label ? (
        <span className="neo-copy absolute -top-4 left-4 border-2 border-black bg-[#171411] px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#fff9ed]">
          {label}
        </span>
      ) : null}
      <h2 className="neo-title text-4xl leading-none text-[#171411]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TextInput({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="neo-copy text-[11px] font-black uppercase tracking-[0.12em] text-[#5b403f]">
        {label}
      </span>
      <input
        className="mt-2 h-11 w-full border-2 border-black bg-[#f6edd8] px-3 text-[#171411] shadow-[2px_2px_0_#171411] outline-none focus:bg-[#fff9ed]"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function AssetUpload({
  label,
  onChange,
}: {
  label: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="neo-copy mt-3 flex cursor-pointer items-center justify-between gap-3 border-2 border-black bg-[#f6edd8] px-3 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-[#171411] shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]">
      <span>{label}</span>
      <span className="inline-flex items-center gap-2">
        <Upload className="h-4 w-4" />
        Upload
      </span>
      <input className="sr-only" type="file" accept="image/*" onChange={onChange} />
    </label>
  );
}

function ProfileImagePreview({
  avatarUrl,
  bannerUrl,
  displayName,
  username,
}: {
  avatarUrl: string;
  bannerUrl: string;
  displayName: string;
  username: string;
}) {
  const initials = username.slice(0, 2).toUpperCase() || "OG";

  return (
    <div className="mb-4 overflow-hidden border-[3px] border-black bg-[#f6edd8] shadow-[4px_4px_0_#171411]">
      {bannerUrl ? (
        <img
          alt=""
          className="h-28 w-full border-b-[3px] border-black object-cover"
          src={bannerUrl}
        />
      ) : (
        <div className="hero-art h-28 border-b-[3px] border-black" />
      )}
      <div className="flex items-end gap-3 p-3">
        {avatarUrl ? (
          <img
            alt=""
            className="h-16 w-16 border-[3px] border-black object-cover shadow-[3px_3px_0_#171411]"
            src={avatarUrl}
          />
        ) : (
          <div className="neo-title grid h-16 w-16 place-items-center border-[3px] border-black bg-[#007166] text-2xl leading-none text-white shadow-[3px_3px_0_#171411]">
            {initials}
          </div>
        )}
        <div className="min-w-0">
          <p className="neo-copy text-[9px] font-black uppercase tracking-[0.12em] text-[#b7102a]">
            Player-card preview
          </p>
          <p className="neo-title truncate text-3xl leading-none text-[#171411]">{displayName}</p>
        </div>
      </div>
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

function NoticePanel({ body, title }: { body: string; title: string }) {
  return (
    <div className="border-4 border-black bg-[#fff9ed] p-6 shadow-[6px_6px_0_#171411]">
      <h2 className="neo-title text-4xl leading-none text-[#171411]">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-[#5b403f]">{body}</p>
    </div>
  );
}

function StatusPanel({ message, tone }: { message: string; tone: "error" | "success" }) {
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

function FeaturedSlotReadout({
  artClass,
  label,
  value,
}: {
  artClass?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] overflow-hidden border-2 border-black bg-[#f6edd8] shadow-[2px_2px_0_#171411]">
      <div className={`${artClass ?? "hero-art"} min-h-20 border-r-2 border-black`} />
      <div className="min-w-0 p-3">
        <p className="neo-copy text-[10px] font-black uppercase tracking-[0.14em] text-[#5b403f]">
          {label}
        </p>
        <p className="neo-title mt-1 truncate text-2xl leading-none text-[#171411]">{value}</p>
      </div>
    </div>
  );
}
