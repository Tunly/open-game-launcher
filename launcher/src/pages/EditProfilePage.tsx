import { CheckCircle2, Cpu, Loader2, Plus, Save, Search, Trash2, Upload } from "lucide-react";
import {
  useEffect,
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

  useEffect(() => {
    let isMounted = true;

    if (!isConfigured || !user) {
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
          })),
        );
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

  if (!isConfigured) {
    return (
      <PageFrame title="Edit Profile">
        <NoticePanel
          title="Supabase is not connected"
          body="Profile data is currently unavailable."
        />
      </PageFrame>
    );
  }

  if (!user || !profile) {
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
          className="neo-copy border-2 border-black bg-[#fff9ed] px-4 py-2 text-[11px] font-black tracking-[0.12em] text-[#171411] uppercase shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]"
          to={`/u/${profile.username}`}
        >
          Public Profile
        </Link>
      }
    >
      <form className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]" onSubmit={handleSubmit}>
        <div className="space-y-5">
          <Panel label="Player Card" title="Identity">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="neo-copy text-[11px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
                  Username
                </span>
                <span className="mt-2 flex h-11 items-center gap-2 border-2 border-black bg-[#f6edd8] px-3 shadow-[2px_2px_0_#171411] focus-within:bg-[#fff9ed]">
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[#171411] lowercase outline-none"
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
                  <span className="neo-copy mt-1 block text-[10px] font-bold text-[#c20b2f] uppercase">
                    Username is taken
                  </span>
                )}
                {usernameStatus === "available" && form.username !== profile?.username && (
                  <span className="neo-copy mt-1 block text-[10px] font-bold text-[#087d6d] uppercase">
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
                <span className="neo-copy text-[11px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
                  Theme
                </span>
                <select
                  className="neo-copy mt-2 h-11 w-full border-2 border-black bg-[#f6edd8] px-3 text-xs font-black tracking-[0.08em] text-[#171411] uppercase shadow-[2px_2px_0_#171411] outline-none focus:bg-[#8cf5e4]"
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
              <span className="neo-copy text-[11px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
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
                  className="grid gap-3 md:grid-cols-[130px_1fr_1fr_auto]"
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
              className="neo-copy mt-4 inline-flex h-10 items-center gap-2 border-2 border-black bg-[#007166] px-3 text-[11px] font-black tracking-[0.12em] text-white uppercase shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a]"
              type="button"
              onClick={() =>
                setSocialLinks((current) => [
                  ...current,
                  { label: "", platform: "website", url: "" },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              Add link
            </button>
          </Panel>

          <Panel label="Setup" title="Hardware Rig">
            <div className="mb-4 flex flex-col gap-3 border-[3px] border-black bg-[#f6edd8] p-3 shadow-[3px_3px_0_#171411] md:flex-row md:items-center md:justify-between">
              <p className="neo-copy text-[11px] leading-5 font-black tracking-[0.08em] text-[#5b403f] uppercase">
                Desktop mode detects CPU, GPU, RAM, monitor, and input devices. Browser preview uses
                estimated browser values.
              </p>
              <button
                className="neo-copy inline-flex h-11 shrink-0 items-center justify-center gap-2 border-2 border-black bg-[#007166] px-3 text-[11px] font-black tracking-[0.12em] text-white uppercase shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#b7102a] disabled:cursor-not-allowed disabled:opacity-60"
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
              <span className="neo-copy text-[11px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
                Show Hardware On Profile
              </span>
              <select
                className="neo-copy mt-2 h-11 w-full border-2 border-black bg-[#f6edd8] px-3 text-xs font-black tracking-[0.08em] text-[#171411] uppercase shadow-[2px_2px_0_#171411] outline-none focus:bg-[#8cf5e4]"
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
              <MiniReadout label="Featured Game" value="Not Set" />
              <MiniReadout label="Achievement" value="Not Set" />
              <MiniReadout label="Badge" value="Not Set" />
            </div>
          </Panel>
          {errorMessage ? <StatusPanel tone="error" message={errorMessage} /> : null}
          {message ? <StatusPanel tone="success" message={message} /> : null}
          <button
            className="neo-copy flex h-14 w-full items-center justify-center gap-2 border-[3px] border-black bg-[#b7102a] px-4 text-[12px] font-black tracking-[0.16em] text-white uppercase shadow-[5px_5px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#007166] disabled:opacity-60"
            disabled={isSaving}
            type="submit"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Profile
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
            <p className="neo-copy inline-flex border-2 border-black bg-[#b7102a] px-3 py-1 text-[11px] font-black tracking-[0.14em] text-white uppercase shadow-[3px_3px_0_#171411]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="neo-title mt-3 text-[clamp(3.6rem,13vw,6rem)] leading-[0.82] text-[#171411]">
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
        <span className="neo-copy absolute -top-4 left-4 border-2 border-black bg-[#171411] px-3 py-1 text-[10px] font-black tracking-[0.14em] text-[#fff9ed] uppercase">
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
      <span className="neo-copy text-[11px] font-black tracking-[0.12em] text-[#5b403f] uppercase">
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
    <label className="neo-copy mt-3 flex cursor-pointer items-center justify-between gap-3 border-2 border-black bg-[#f6edd8] px-3 py-3 text-[11px] font-black tracking-[0.12em] text-[#171411] uppercase shadow-[3px_3px_0_#171411] transition hover:-translate-y-0.5 hover:bg-[#8cf5e4]">
      <span>{label}</span>
      <span className="inline-flex items-center gap-2">
        <Upload className="h-4 w-4" />
        Upload
      </span>
      <input className="sr-only" type="file" accept="image/*" onChange={onChange} />
    </label>
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
          ? "neo-copy border-2 border-black bg-[#b7102a] p-4 text-[11px] font-black tracking-[0.1em] text-white uppercase shadow-[3px_3px_0_#171411]"
          : "neo-copy border-2 border-black bg-[#007166] p-4 text-[11px] font-black tracking-[0.1em] text-white uppercase shadow-[3px_3px_0_#171411]"
      }
    >
      {message}
    </div>
  );
}

function MiniReadout({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-black bg-[#f6edd8] p-3 shadow-[2px_2px_0_#171411]">
      <p className="neo-copy text-[10px] font-black tracking-[0.14em] text-[#5b403f] uppercase">
        {label}
      </p>
      <p className="mt-1 text-lg font-black text-[#171411] uppercase">{value}</p>
    </div>
  );
}
