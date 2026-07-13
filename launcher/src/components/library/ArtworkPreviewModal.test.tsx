import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ArtworkPreviewModal } from "./ArtworkPreviewModal";

const imageMocks = vi.hoisted(() => ({
  compressAndReadImage: vi.fn(),
  isAllowedImageType: vi.fn(),
}));

vi.mock("../../lib/image-compress", () => imageMocks);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("ArtworkPreviewModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    imageMocks.isAllowedImageType.mockReturnValue(true);
  });

  it("ignores an older compression result after the artwork kind changes", async () => {
    const coverCompression = deferred<string>();
    const iconCompression = deferred<string>();
    imageMocks.compressAndReadImage
      .mockReturnValueOnce(coverCompression.promise)
      .mockReturnValueOnce(iconCompression.promise);
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ArtworkPreviewModal
        file={new File(["image"], "art.png", { type: "image/png" })}
        initialKind="cover"
        isOpen
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Icon" }));
    await waitFor(() => expect(imageMocks.compressAndReadImage).toHaveBeenCalledTimes(2));

    await act(async () => {
      iconCompression.resolve("data:image/jpeg;base64,icon");
      await iconCompression.promise;
    });
    await act(async () => {
      coverCompression.resolve("data:image/jpeg;base64,cover");
      await coverCompression.promise;
    });

    expect(screen.getByRole("img", { name: "Artwork preview" })).toHaveAttribute(
      "src",
      "data:image/jpeg;base64,icon",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Artwork" }));
    expect(onConfirm).toHaveBeenCalledWith("data:image/jpeg;base64,icon", "icon");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
