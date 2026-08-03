import { useId, useState } from "react";
import { FileSearch, X } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";

import { executableTitleFromPath, getErrorMessage } from "../../lib/formatters";
import { ModalDialog } from "../ui/ModalDialog";

interface AddGameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddGame: (input: { title: string; installPath: string }) => Promise<void>;
}

function isWindowsRuntime() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /win32|win64|windows/i.test(`${navigator.platform} ${navigator.userAgent}`);
}

function getExecutablePathError(path: string) {
  if (
    isWindowsRuntime() &&
    /\.(?:7z|csv|docx?|gif|jpe?g|json|md|pdf|png|rar|rtf|svg|txt|webp|zip)$/i.test(path)
  ) {
    return "Choose a game executable (.exe, .bat, or .cmd) or its install folder.";
  }

  return null;
}

export function AddGameDialog({ isOpen, onClose, onAddGame }: AddGameDialogProps) {
  const [title, setTitle] = useState("");
  const [installPath, setInstallPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleId = useId();
  const isDesktopRuntime = isTauri();

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isTauri()) {
      setError(
        "Adding local games requires the OG-Launcher desktop app. Browser preview cannot access or launch local executables.",
      );
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedPath = installPath.trim();

    if (!trimmedTitle || !trimmedPath) {
      setError("Title and EXE are required.");
      return;
    }
    const executablePathError = getExecutablePathError(trimmedPath);
    if (executablePathError) {
      setError(executablePathError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onAddGame({ title: trimmedTitle, installPath: trimmedPath });
      setTitle("");
      setInstallPath("");
      setError(null);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePathChange(nextPath: string) {
    setError(null);
    setInstallPath(nextPath);
    if (!title.trim()) {
      setTitle(executableTitleFromPath(nextPath));
    }
  }

  async function handleSelectGameExecutable() {
    if (!isTauri()) {
      setError(
        "Desktop app can open a native file picker. Browser preview keeps manual EXE entry available.",
      );
      return;
    }

    setError(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selectedPath = await open({
        directory: false,
        ...(isWindowsRuntime()
          ? {
              filters: [
                {
                  name: "Windows game executables",
                  extensions: ["exe", "bat", "cmd"],
                },
              ],
            }
          : {}),
        multiple: false,
        title: "Choose game executable",
      });

      if (typeof selectedPath !== "string") {
        setError("Executable selection cancelled.");
        return;
      }

      handlePathChange(selectedPath);
    } catch (err) {
      setError(`Could not open executable picker: ${getErrorMessage(err)}`);
    }
  }

  return (
    <ModalDialog
      labelledBy={titleId}
      backdropClassName="fixed inset-0 z-[80] grid place-items-center bg-[#171411]/90 bg-[radial-gradient(circle,rgba(255,249,237,0.14)_1px,transparent_1px)] bg-[length:10px_10px] px-4"
      panelClassName="max-h-[calc(100vh-2rem)] w-full max-w-[520px] overflow-y-auto border-4 border-black bg-[#fbf4e7] shadow-[8px_8px_0_#171411]"
      initialFocusSelector="input[name='game-title']"
      onDismiss={isSubmitting ? undefined : onClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="flex items-center justify-between border-b-4 border-black bg-[#b7102a] px-4 py-3 text-white">
          <h2 id={titleId} className="neo-title text-2xl leading-none uppercase">
            Add a Game
          </h2>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411] shadow-[2px_2px_0_#171411]"
            onClick={onClose}
            aria-label="Close add game"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {!isDesktopRuntime ? (
            <p className="neo-copy border-2 border-black bg-[#f5d6d9] px-3 py-2 text-[11px] font-black text-[#77101f] uppercase">
              Adding local games requires the OG-Launcher desktop app. Browser preview cannot access
              or launch local executables.
            </p>
          ) : null}

          <label className="block">
            <span className="neo-copy block text-[11px] font-black text-[#55504a] uppercase">
              Game title
            </span>
            <input
              name="game-title"
              className="mt-1 h-11 w-full border-4 border-black bg-[#fffaf0] px-3 text-[14px] font-black uppercase shadow-[3px_3px_0_#171411] outline-none"
              value={title}
              disabled={!isDesktopRuntime}
              onChange={(event) => {
                setError(null);
                setTitle(event.target.value);
              }}
              placeholder="Example: Hollow Knight"
            />
          </label>

          <label className="block">
            <span className="neo-copy block text-[11px] font-black text-[#55504a] uppercase">
              Executable
            </span>
            <div className="mt-1 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                className="h-11 min-w-0 border-4 border-black bg-[#fffaf0] px-3 text-[13px] font-bold shadow-[3px_3px_0_#171411] outline-none"
                value={installPath}
                disabled={!isDesktopRuntime}
                placeholder="C:/Games/Example/Game.exe"
                onChange={(event) => handlePathChange(event.target.value)}
              />
              <button
                type="button"
                disabled={!isDesktopRuntime}
                className="flex h-11 items-center justify-center gap-2 border-4 border-black bg-[#8cf5e4] px-4 text-[12px] font-black uppercase shadow-[3px_3px_0_#171411] disabled:cursor-not-allowed disabled:bg-[#d8cdb9] disabled:opacity-70"
                onClick={handleSelectGameExecutable}
              >
                <FileSearch className="h-4 w-4" />
                Browse EXE
              </button>
            </div>
          </label>

          {error && (
            <p
              className="neo-copy border-2 border-black bg-[#f5d6d9] px-3 py-2 text-[11px] font-black text-[#77101f] uppercase"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t-2 border-black pt-3">
            <button
              type="button"
              className="border-2 border-black bg-[#efe3cf] px-4 py-2 text-[12px] font-black uppercase"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isDesktopRuntime}
              className="border-2 border-black bg-[#007166] px-4 py-2 text-[12px] font-black text-white uppercase shadow-[3px_3px_0_#171411] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {!isDesktopRuntime
                ? "Desktop App Required"
                : isSubmitting
                  ? "Adding..."
                  : "Save Game"}
            </button>
          </div>
        </div>
      </form>
    </ModalDialog>
  );
}
