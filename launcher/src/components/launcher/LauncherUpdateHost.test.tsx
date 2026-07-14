import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LauncherUpdateHost } from "./LauncherUpdateHost";

const checkForLauncherUpdate = vi.hoisted(() => vi.fn());

vi.mock("../../stores/launcherUpdateStore", () => ({ checkForLauncherUpdate }));

describe("LauncherUpdateHost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    checkForLauncherUpdate.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs one non-blocking update check after the startup delay", () => {
    render(<LauncherUpdateHost />);

    vi.advanceTimersByTime(1_999);
    expect(checkForLauncherUpdate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(checkForLauncherUpdate).toHaveBeenCalledOnce();
  });

  it("cancels the scheduled check when the main host unmounts", () => {
    const view = render(<LauncherUpdateHost delayMs={50} />);
    view.unmount();

    vi.advanceTimersByTime(50);
    expect(checkForLauncherUpdate).not.toHaveBeenCalled();
  });
});
