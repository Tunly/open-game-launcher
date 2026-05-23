import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize, Minimize, Square, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export function DesktopTitleBar() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    setIsDesktop(true);
    document.documentElement.classList.add("tauri-runtime");
    void getCurrentWindow()
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => setIsMaximized(false));

    return () => {
      document.documentElement.classList.remove("tauri-runtime");
    };
  }, []);

  if (!isDesktop) {
    return null;
  }

  async function minimizeWindow() {
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      reportWindowCommandError("minimize", error);
    }
  }

  async function toggleMaximizeWindow() {
    try {
      const window = getCurrentWindow();
      await window.toggleMaximize();
      setIsMaximized(await window.isMaximized());
    } catch (error) {
      reportWindowCommandError("toggle maximize", error);
    }
  }

  async function startWindowDrag(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    try {
      await getCurrentWindow().startDragging();
    } catch (error) {
      reportWindowCommandError("start dragging", error);
    }
  }

  async function closeWindow() {
    try {
      await getCurrentWindow().close();
    } catch (error) {
      reportWindowCommandError("close", error);
    }
  }

  return (
    <div className="sticky top-0 z-50 flex h-9 select-none items-center border-b-[3px] border-black bg-[#fff9ed] text-[#1f1c0f]">
      <div
        className="neo-copy flex min-w-0 flex-1 items-center gap-2 px-4 text-[10px] font-black uppercase tracking-[0.16em]"
        data-tauri-drag-region
        onDoubleClick={() => void toggleMaximizeWindow()}
        onMouseDown={(event) => void startWindowDrag(event)}
      >
        <span className="h-3 w-3 shrink-0 border-2 border-black bg-[#b7102a]" />
        <span className="truncate" data-tauri-drag-region>
          OG-Launcher Desktop
        </span>
      </div>
      <div className="flex h-full shrink-0">
        <WindowControlButton label="Minimieren" onClick={() => void minimizeWindow()}>
          <Minimize className="h-4 w-4" />
        </WindowControlButton>
        <WindowControlButton
          label={isMaximized ? "Wiederherstellen" : "Maximieren"}
          onClick={() => void toggleMaximizeWindow()}
        >
          {isMaximized ? <Square className="h-3.5 w-3.5" /> : <Maximize className="h-4 w-4" />}
        </WindowControlButton>
        <WindowControlButton isDanger label="Schliessen" onClick={() => void closeWindow()}>
          <X className="h-4 w-4" />
        </WindowControlButton>
      </div>
    </div>
  );
}

function reportWindowCommandError(command: string, error: unknown) {
  console.error(`Tauri window command failed: ${command}`, error);
}

function WindowControlButton({
  children,
  isDanger = false,
  label,
  onClick,
}: {
  children: ReactNode;
  isDanger?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`grid h-full w-12 place-items-center border-l-2 border-black transition ${
        isDanger
          ? "bg-[#b7102a] text-white hover:bg-[#8f0b20]"
          : "bg-[#fff9ed] text-[#1f1c0f] hover:bg-[#8cf5e4]"
      }`}
      type="button"
      onClick={onClick}
      onDoubleClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {children}
    </button>
  );
}
