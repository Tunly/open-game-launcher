import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TurnstileWidget } from "./TurnstileWidget";

type WidgetOptions = {
  action: string;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  sitekey: string;
  theme: "light";
};

describe("TurnstileWidget", () => {
  afterEach(() => {
    delete window.turnstile;
  });

  it("renders an explicit challenge, returns the token and removes the widget", async () => {
    const onError = vi.fn();
    const onToken = vi.fn();
    const remove = vi.fn();
    const renderWidget = vi.fn((_container: HTMLElement, options: WidgetOptions) => {
      options.callback("verified-token");
      return "widget-1";
    });
    window.turnstile = { remove, render: renderWidget };

    const { container, unmount } = render(
      <TurnstileWidget onError={onError} onToken={onToken} siteKey="public-site-key" />,
    );

    await waitFor(() => expect(onToken).toHaveBeenCalledWith("verified-token"));
    expect(renderWidget).toHaveBeenCalledOnce();
    expect(renderWidget.mock.calls[0][1]).toMatchObject({
      action: "turnstile-spin-v2",
      sitekey: "public-site-key",
      theme: "light",
    });
    expect(container.querySelector('[data-action="turnstile-spin-v2"]')).toBeInTheDocument();
    expect(screen.getByText(/bot check complete/i)).toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();

    unmount();
    expect(remove).toHaveBeenCalledWith("widget-1");
  });

  it("clears the token when the challenge expires", async () => {
    const onError = vi.fn();
    const onToken = vi.fn();
    window.turnstile = {
      remove: vi.fn(),
      render: (_container, options) => {
        options["expired-callback"]();
        return "widget-expired";
      },
    };

    render(<TurnstileWidget onError={onError} onToken={onToken} siteKey="public-site-key" />);

    await waitFor(() => expect(onToken).toHaveBeenCalledWith(null));
    expect(screen.getByText(/bot check expired/i)).toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });
});
