import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize, Minus, Square, X } from "lucide-react";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

/**
 * Invisible stretch region that lets the user drag the frameless window by the
 * header. It lives between the primary navigation and the right-aligned action
 * buttons so those buttons still sit flush against the far-right edge.
 */
export function WindowDragRegion() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    setIsDesktop(true);
    return () => {
      setIsDesktop(false);
    };
  }, []);

  if (!isDesktop) {
    return null;
  }

  return (
    // Tauri drag region: keyboard handlers are intentionally omitted because
    // window-drag is a native OS gesture, not a user-facing control.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="hidden min-h-8 max-w-[10%] flex-1 cursor-move self-stretch sm:block"
      data-tauri-drag-region
      onDoubleClick={() => void toggleMaximizeWindow()}
      onMouseDown={(event) => void startWindowDrag(event)}
    />
  );
}

export function DesktopWindowChrome() {
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

  async function toggleMaximizeWindowAndSync() {
    try {
      const window = getCurrentWindow();
      await window.toggleMaximize();
      setIsMaximized(await window.isMaximized());
    } catch (error) {
      reportWindowCommandError("toggle maximize", error);
    }
  }

  async function minimizeWindow() {
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      reportWindowCommandError("minimize", error);
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
    <div className="flex shrink-0 items-center select-none">
      {isDesktop ? (
        <div className="app-window-controls flex h-8 shrink-0 items-center gap-1">
          <WindowControlButton label="Minimize" onClick={() => void minimizeWindow()}>
            <Minus className="h-3.5 w-3.5" />
          </WindowControlButton>
          <WindowControlButton
            label={isMaximized ? "Restore" : "Maximize"}
            onClick={() => void toggleMaximizeWindowAndSync()}
          >
            {isMaximized ? <Square className="h-3 w-3" /> : <Maximize className="h-3.5 w-3.5" />}
          </WindowControlButton>
          <WindowControlButton isDanger label="Close" onClick={() => void closeWindow()}>
            <X className="h-4 w-4" />
          </WindowControlButton>
        </div>
      ) : null}
    </div>
  );
}

async function toggleMaximizeWindow() {
  try {
    await getCurrentWindow().toggleMaximize();
  } catch (error) {
    reportWindowCommandError("toggle maximize", error);
  }
}

async function startWindowDrag(event: MouseEvent<HTMLDivElement>) {
  if (event.button !== 0) {
    return;
  }

  try {
    await getCurrentWindow().startDragging();
  } catch (error) {
    reportWindowCommandError("start dragging", error);
  }
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
      className={`app-window-control-button grid h-8 w-8 place-items-center border border-transparent bg-transparent transition ${
        isDanger
          ? "text-[#b7102a] hover:border-black hover:bg-[#b7102a] hover:text-[#fff9ed]"
          : "text-[#171411] hover:border-black hover:bg-[#efe6d4]"
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
