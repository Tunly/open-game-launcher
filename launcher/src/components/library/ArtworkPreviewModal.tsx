import { useState, useEffect, useRef } from "react";
import { X, ImagePlus } from "lucide-react";
import type { CustomArtworkKind } from "../../lib/custom-artwork";
import { compressAndReadImage, isAllowedImageType } from "../../lib/image-compress";

interface ArtworkPreviewModalProps {
  isOpen: boolean;
  file: File | null;
  initialKind: CustomArtworkKind;
  onClose: () => void;
  onConfirm: (dataUrl: string, kind: CustomArtworkKind) => void;
}

const KIND_LABELS: Record<CustomArtworkKind, string> = {
  cover: "Cover",
  icon: "Icon",
  logo: "Logo",
};

export function ArtworkPreviewModal({
  isOpen,
  file,
  initialKind,
  onClose,
  onConfirm,
}: ArtworkPreviewModalProps) {
  const [selectedKind, setSelectedKind] = useState<CustomArtworkKind>(initialKind);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    setSelectedKind(initialKind);
  }, [initialKind]);

  useEffect(() => {
    if (!isOpen || !file) {
      setPreviewUrl(null);
      setError(null);
      return;
    }

    if (!isAllowedImageType(file)) {
      setError("Only JPG, PNG, and WebP images are supported.");
      setPreviewUrl(null);
      return;
    }

    cancelRef.current = false;
    setIsCompressing(true);
    setError(null);

    compressAndReadImage(file, selectedKind)
      .then((dataUrl) => {
        if (!cancelRef.current) {
          setPreviewUrl(dataUrl);
          setIsCompressing(false);
        }
      })
      .catch(() => {
        if (!cancelRef.current) {
          setError("Could not process the image.");
          setIsCompressing(false);
        }
      });

    return () => {
      cancelRef.current = true;
    };
  }, [isOpen, file, selectedKind]);

  if (!isOpen || !file) {
    return null;
  }

  function handleConfirm() {
    if (previewUrl) {
      onConfirm(previewUrl, selectedKind);
      onClose();
    }
  }

  return (
    <div
      aria-label="Artwork Preview"
      aria-modal="true"
      className="fixed inset-0 z-[80] grid place-items-center bg-black/45 px-4"
      role="dialog"
    >
      <div className="w-full max-w-[520px] border-4 border-black bg-[#fbf4e7] shadow-[8px_8px_0_#171411]">
        <div className="flex items-center justify-between border-b-4 border-black bg-[#b7102a] px-4 py-3 text-white">
          <h2 className="neo-title text-2xl leading-none uppercase">Custom Artwork</h2>
          <button
            type="button"
            className="grid h-8 w-8 place-items-center border-2 border-black bg-[#fbf4e7] text-[#171411] shadow-[2px_2px_0_#171411]"
            onClick={onClose}
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="flex gap-1">
            {(["cover", "icon", "logo"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                className={`flex-1 border-2 border-black px-3 py-2 text-[11px] font-black uppercase transition ${
                  selectedKind === kind
                    ? "bg-[#169b83] text-white shadow-[2px_2px_0_#171411]"
                    : "bg-[#efe3cf] text-[#171411] hover:bg-[#dfd4c1]"
                }`}
                onClick={() => setSelectedKind(kind)}
              >
                {KIND_LABELS[kind]}
              </button>
            ))}
          </div>

          <div className="flex min-h-[200px] items-center justify-center border-2 border-dashed border-black bg-[#efe6d4]">
            {isCompressing ? (
              <span className="neo-copy text-[11px] font-bold text-[#55504a] uppercase">
                Processing...
              </span>
            ) : error ? (
              <span className="neo-copy text-[11px] font-bold text-[#c20b2f] uppercase">
                {error}
              </span>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt="Artwork preview"
                className="max-h-[200px] max-w-full object-contain"
              />
            ) : (
              <ImagePlus className="h-12 w-12 text-[#b8ad9e]" />
            )}
          </div>

          <p className="neo-copy text-[10px] font-bold text-[#655f58] uppercase">
            The image will be resized and saved as JPEG.
          </p>

          <div className="flex flex-wrap justify-end gap-2 border-t-2 border-black pt-3">
            <button
              type="button"
              className="border-2 border-black bg-[#efe3cf] px-4 py-2 text-[12px] font-black uppercase"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!previewUrl || isCompressing}
              className="border-2 border-black bg-[#169b83] px-4 py-2 text-[12px] font-black text-white uppercase shadow-[3px_3px_0_#171411] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleConfirm}
            >
              Save Artwork
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
