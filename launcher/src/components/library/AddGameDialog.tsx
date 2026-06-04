import { useState } from "react";
import { FileSearch, X } from "lucide-react";

import { executableTitleFromPath, getErrorMessage } from "../../lib/formatters";

interface AddGameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAddGame: (input: { title: string; installPath: string }) => Promise<void>;
}

export function AddGameDialog({ isOpen, onClose, onAddGame }: AddGameDialogProps) {
  const [title, setTitle] = useState("");
  const [installPath, setInstallPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedPath = installPath.trim();

    if (!trimmedTitle || !trimmedPath) {
      setError("Title and EXE are required.");
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

  function handleSelectGameExecutable() {
    setError("File selection is disabled without the dialog plugin. Enter the EXE path manually.");
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/45 px-4">
      <form
        className="w-full max-w-[520px] border-4 border-black bg-[#fbf4e7] shadow-[8px_8px_0_#171411]"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center justify-between border-b-4 border-black bg-[#b7102a] px-4 py-3 text-white">
          <h2 className="neo-title text-2xl uppercase leading-none">Add a Game</h2>
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
          <label className="block">
            <span className="neo-copy block text-[11px] font-black uppercase text-[#55504a]">
              Game title
            </span>
            <input
              className="mt-1 h-11 w-full border-4 border-black bg-[#fffaf0] px-3 text-[14px] font-black uppercase shadow-[3px_3px_0_#171411] outline-none"
              value={title}
              onChange={(event) => {
                setError(null);
                setTitle(event.target.value);
              }}
              placeholder="Example: Hollow Knight"
            />
          </label>

          <label className="block">
            <span className="neo-copy block text-[11px] font-black uppercase text-[#55504a]">
              Executable
            </span>
            <div className="mt-1 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                className="h-11 min-w-0 border-4 border-black bg-[#fffaf0] px-3 text-[13px] font-bold shadow-[3px_3px_0_#171411] outline-none"
                value={installPath}
                placeholder="C:/Games/Example/Game.exe"
                onChange={(event) => handlePathChange(event.target.value)}
              />
              <button
                type="button"
                className="flex h-11 items-center justify-center gap-2 border-4 border-black bg-[#e8c843] px-4 text-[12px] font-black uppercase shadow-[3px_3px_0_#171411]"
                onClick={handleSelectGameExecutable}
              >
                <FileSearch className="h-4 w-4" />
                Manual Path
              </button>
            </div>
          </label>

          {error && (
            <p className="neo-copy border-2 border-black bg-[#f5d6d9] px-3 py-2 text-[11px] font-black uppercase text-[#77101f]">
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
              disabled={isSubmitting}
              className="border-2 border-black bg-[#169b83] px-4 py-2 text-[12px] font-black uppercase text-white shadow-[3px_3px_0_#171411] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Adding..." : "Save Game"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
