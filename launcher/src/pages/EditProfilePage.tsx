import { Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
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
import {
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
} from "../lib/supabase/profile";
import type { Profile, ProfileTheme } from "../lib/types/profile";

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
};

export function EditProfilePage() {
  const { isConfigured, isLoading: isAuthLoading, user } = useCurrentUser();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [themes, setThemes] = useState<ProfileTheme[]>([]);
  const [selectedThemeId, setSelectedThemeId] = useState("");
  const [form, setForm] = useState<ProfileFormState>(emptyForm);
  const [socialLinks, setSocialLinks] = useState<EditableSocialLink[]>([]);
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
      setMessage(`${type === "avatar" ? "Avatar" : "Banner"} uploaded. Save profile to persist it.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const nextProfile = await updateMyProfile({
        username: form.username,
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
        visibility: "friends_only",
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
      setMessage("Profile saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  }

  if (isAuthLoading || isLoading) {
    return <PageFrame title="Edit Profile"><LoadingPanel /></PageFrame>;
  }

  if (!isConfigured) {
    return (
      <PageFrame title="Edit Profile">
        <NoticePanel title="Supabase is not configured" body="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in launcher/.env.local." />
      </PageFrame>
    );
  }

  if (!user || !profile) {
    return (
      <PageFrame title="Edit Profile">
        <NoticePanel title="Login required" body="Sign in before editing your public launcher profile." />
      </PageFrame>
    );
  }

  return (
    <PageFrame
      eyebrow="Settings"
      title="Edit Profile"
      action={<Link className="text-sm font-bold text-sky-200 hover:text-sky-100" to={`/u/${profile.username}`}>View public profile</Link>}
    >
      <form className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]" onSubmit={handleSubmit}>
        <div className="space-y-5">
          <Panel title="Identity">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="Username" value={form.username} onChange={(value) => updateField("username", value)} />
              <TextInput label="Display Name" value={form.displayName} onChange={(value) => updateField("displayName", value)} />
              <TextInput label="Country" value={form.countryCode} onChange={(value) => updateField("countryCode", value)} placeholder="DE" />
              <TextInput label="Language" value={form.language} onChange={(value) => updateField("language", value)} placeholder="en" />
              <TextInput label="Timezone" value={form.timezone} onChange={(value) => updateField("timezone", value)} placeholder="Europe/Berlin" />
              <label>
                <span className="text-sm font-semibold text-slate-300">Theme</span>
                <select
                  className="mt-2 h-11 w-full border border-white/10 bg-[#0f172a] px-3 text-white outline-none focus:border-sky-300"
                  value={selectedThemeId}
                  onChange={(event) => setSelectedThemeId(event.target.value)}
                >
                  <option value="">Default</option>
                  {themes.map((theme) => (
                    <option key={theme.id} value={theme.id}>{theme.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-slate-300">Bio</span>
              <textarea
                className="mt-2 min-h-36 w-full border border-white/10 bg-black/20 px-3 py-3 text-white outline-none focus:border-sky-300"
                maxLength={1000}
                value={form.bio}
                onChange={(event) => updateField("bio", event.target.value)}
              />
            </label>
          </Panel>

          <Panel title="Social Links">
            <div className="space-y-3">
              {socialLinks.map((link, index) => (
                <div key={link.id ?? index} className="grid gap-3 md:grid-cols-[130px_1fr_1fr_auto]">
                  <TextInput label="Platform" value={link.platform} onChange={(value) => updateSocialLink(index, { platform: value }, setSocialLinks)} />
                  <TextInput label="Label" value={link.label} onChange={(value) => updateSocialLink(index, { label: value }, setSocialLinks)} />
                  <TextInput label="URL" value={link.url} onChange={(value) => updateSocialLink(index, { url: value }, setSocialLinks)} />
                  <button
                    aria-label="Remove social link"
                    className="mt-7 flex h-11 items-center justify-center border border-white/10 px-3 text-slate-200 hover:bg-white/[0.08]"
                    type="button"
                    onClick={() => setSocialLinks((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="mt-4 inline-flex h-10 items-center gap-2 border border-white/10 px-3 text-sm font-bold text-white hover:bg-white/[0.08]"
              type="button"
              onClick={() => setSocialLinks((current) => [...current, { label: "", platform: "website", url: "" }])}
            >
              <Plus className="h-4 w-4" />
              Add link
            </button>
          </Panel>

          <Panel title="Hardware Setup">
            <div className="grid gap-4 sm:grid-cols-2">
              {(["cpu", "gpu", "ram", "monitor", "keyboard", "mouse", "headset", "controller"] as const).map((field) => (
                <TextInput key={field} label={field.toUpperCase()} value={form[field]} onChange={(value) => updateField(field, value)} />
              ))}
            </div>
          </Panel>
        </div>

        <aside className="space-y-5">
          <Panel title="Profile Assets">
            <AssetUpload label="Avatar" onChange={(event) => void handleAssetUpload(event, "avatar")} />
            <AssetUpload label="Banner" onChange={(event) => void handleAssetUpload(event, "banner")} />
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Files are stored in user-scoped Supabase Storage folders. Bucket
              policies prevent users from writing into another user's folder.
            </p>
          </Panel>
          <Panel title="Featured Slots">
            <p className="text-sm leading-6 text-slate-400">
              Featured game and achievement selectors are UI stubs until the
              trusted library and achievement APIs return owned options.
            </p>
          </Panel>
          {errorMessage ? <StatusPanel tone="error" message={errorMessage} /> : null}
          {message ? <StatusPanel tone="success" message={message} /> : null}
          <button
            className="flex h-12 w-full items-center justify-center gap-2 bg-sky-400 px-4 text-sm font-black text-slate-950 hover:bg-sky-300 disabled:opacity-60"
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
    current.map((link, itemIndex) =>
      itemIndex === index ? { ...link, ...patch } : link,
    ),
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
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          {eyebrow ? <p className="text-sm font-bold uppercase text-sky-200">{eyebrow}</p> : null}
          <h1 className="mt-1 text-4xl font-black text-white">{title}</h1>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="border border-white/10 bg-white/[0.05] p-5">
      <h2 className="text-xl font-bold text-white">{title}</h2>
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
      <span className="text-sm font-semibold text-slate-300">{label}</span>
      <input
        className="mt-2 h-11 w-full border border-white/10 bg-black/20 px-3 text-white outline-none focus:border-sky-300"
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
    <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 border border-white/10 bg-black/20 px-3 py-3 text-sm text-slate-200 hover:bg-white/[0.06]">
      <span className="font-semibold">{label}</span>
      <span className="inline-flex items-center gap-2 text-sky-200">
        <Upload className="h-4 w-4" />
        Upload
      </span>
      <input className="sr-only" type="file" accept="image/*" onChange={onChange} />
    </label>
  );
}

function LoadingPanel() {
  return (
    <div className="grid min-h-80 place-items-center border border-white/10 bg-white/[0.05]">
      <Loader2 className="h-8 w-8 animate-spin text-sky-300" />
    </div>
  );
}

function NoticePanel({ body, title }: { body: string; title: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.05] p-6">
      <h2 className="text-2xl font-black text-white">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}

function StatusPanel({ message, tone }: { message: string; tone: "error" | "success" }) {
  return (
    <div className={tone === "error" ? "border border-rose-300/30 bg-rose-500/10 p-4 text-sm text-rose-100" : "border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm text-emerald-100"}>
      {message}
    </div>
  );
}
