import { ImagePlus, Loader2, UploadCloud, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type { CommunityArtworkCandidate, CustomArtworkKind } from "../../lib/custom-artwork";

export interface CommunityArtworkUploadDraft {
  artistName: string;
  description: string;
  file: File;
  kind: CustomArtworkKind;
  tags: string[];
  title: string;
}

interface CommunityArtworkUploadPanelProps {
  disabled?: boolean;
  gameTitle: string;
  isUploading?: boolean;
  message?: string | null;
  onSubmit: (draft: CommunityArtworkUploadDraft) => boolean | void | Promise<boolean | void>;
  pendingSubmissions: CommunityArtworkCandidate[];
}

const ARTWORK_KINDS: Array<{ kind: CustomArtworkKind; label: string }> = [
  { kind: "cover", label: "Cover" },
  { kind: "icon", label: "Icon" },
  { kind: "logo", label: "Logo" },
];

export function CommunityArtworkUploadPanel({
  disabled = false,
  gameTitle,
  isUploading = false,
  message,
  onSubmit,
  pendingSubmissions,
}: CommunityArtworkUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [artistName, setArtistName] = useState("OG Player");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<CustomArtworkKind>("cover");
  const [title, setTitle] = useState("");
  const suggestedTitle = useMemo(() => `${gameTitle} ${getKindLabel(kind)}`, [gameTitle, kind]);
  const canSubmit = Boolean(file) && !disabled && !isUploading;

  function handleFileChange(fileList: FileList | null) {
    const nextFile = fileList?.[0] ?? null;
    setFile(nextFile);
    if (nextFile && !title.trim()) {
      setTitle(fileNameToTitle(nextFile.name) || suggestedTitle);
    }
  }

  async function handleSubmit() {
    if (!file || disabled || isUploading) {
      return;
    }

    const shouldClear = await onSubmit({
      artistName: artistName.trim() || "OG Player",
      description: description.trim(),
      file,
      kind,
      tags: [kind, "community-upload"],
      title: title.trim() || suggestedTitle,
    });
    if (shouldClear !== false) {
      setDescription("");
      setFile(null);
      setTitle("");
    }
  }

  return (
    <section
      aria-label="Hosted community artwork upload"
      className="mt-2 border-2 border-black bg-[#fbf4e7] p-2 shadow-[2px_2px_0_#171411]"
    >
      <input
        ref={inputRef}
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        type="file"
        onChange={(event) => {
          handleFileChange(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />

      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="neo-copy block text-[9px] font-black uppercase text-[#171411]">
            Hosted Upload Queue
          </span>
          <span className="neo-copy mt-1 block text-[8px] font-black uppercase leading-4 text-[#655f58]">
            Uploads are stored in Supabase, marked pending, and require moderation before public
            ranking.
          </span>
        </div>
        <span className="border-2 border-black bg-[#8cf5e4] px-1.5 py-0.5 text-[8px] font-black uppercase text-[#171411]">
          Pending
        </span>
      </div>

      <div className="grid gap-2">
        <button
          className="flex min-h-10 items-center justify-center gap-1 border-2 border-black bg-[#ded3c1] px-2 text-[9px] font-black uppercase transition hover:bg-[#8cf5e4] disabled:opacity-60"
          disabled={disabled || isUploading}
          type="button"
          onClick={() => inputRef.current?.click()}
        >
          <UploadCloud className="h-3.5 w-3.5" />
          {file ? file.name : "Choose Hosted Art"}
        </button>

        <div className="grid grid-cols-3 gap-1">
          {ARTWORK_KINDS.map((entry) => (
            <button
              aria-pressed={kind === entry.kind}
              className={`h-7 border-2 border-black px-1 text-[8px] font-black uppercase ${
                kind === entry.kind ? "bg-[#8cf5e4]" : "bg-[#efe3cf]"
              }`}
              key={entry.kind}
              type="button"
              onClick={() => setKind(entry.kind)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <input
          aria-label="Hosted artwork title"
          className="neo-copy h-8 min-w-0 border-2 border-black bg-[#f4ead8] px-2 text-[9px] font-bold outline-none"
          maxLength={120}
          placeholder={suggestedTitle}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          aria-label="Hosted artwork artist"
          className="neo-copy h-8 min-w-0 border-2 border-black bg-[#f4ead8] px-2 text-[9px] font-bold outline-none"
          maxLength={80}
          placeholder="Artist"
          value={artistName}
          onChange={(event) => setArtistName(event.target.value)}
        />
        <textarea
          aria-label="Hosted artwork description"
          className="neo-copy min-h-14 resize-none border-2 border-black bg-[#f4ead8] px-2 py-1 text-[9px] font-bold outline-none"
          maxLength={500}
          placeholder="Short moderation note"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />

        <div className="flex flex-wrap gap-1">
          <button
            className="flex h-8 flex-1 items-center justify-center gap-1 border-2 border-black bg-[#b7102a] px-2 text-[9px] font-black uppercase text-white transition hover:-translate-y-0.5 hover:bg-[#171411] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSubmit}
            type="button"
            onClick={handleSubmit}
          >
            {isUploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            Submit for Review
          </button>
          {file ? (
            <button
              aria-label="Clear hosted artwork upload draft"
              className="grid h-8 w-8 place-items-center border-2 border-black bg-[#efe3cf] text-[#171411] transition hover:bg-[#8cf5e4]"
              disabled={isUploading}
              type="button"
              onClick={() => setFile(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {message ? (
        <p className="neo-copy mt-2 border-2 border-black bg-[#efe3cf] px-2 py-1 text-[8px] font-black uppercase leading-4 text-[#171411]">
          {message}
        </p>
      ) : null}

      {pendingSubmissions.length > 0 ? (
        <div className="mt-2 grid gap-1">
          {pendingSubmissions.map((submission) => (
            <article
              className="border-2 border-black bg-[#fff9ed] p-1.5 shadow-[1px_1px_0_#171411]"
              key={submission.id}
            >
              <p className="neo-copy text-[8px] font-black uppercase text-[#b7102a]">
                Pending Review
              </p>
              <p className="truncate text-[9px] font-black uppercase text-[#171411]">
                {submission.title}
              </p>
              <p className="neo-copy text-[8px] font-black uppercase text-[#655f58]">
                {getKindLabel(submission.kind)} - {submission.artist}
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function getKindLabel(kind: CustomArtworkKind): string {
  return kind === "cover" ? "Cover" : kind === "icon" ? "Icon" : "Logo";
}

function fileNameToTitle(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
