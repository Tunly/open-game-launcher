import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";

type LibraryScrollbarState = {
  height: number;
  top: number;
  visible: boolean;
};

function useLibraryScrollbar(targetRef: RefObject<HTMLElement | null>) {
  const [scrollbarState, setScrollbarState] = useState<LibraryScrollbarState>({
    height: 0,
    top: 0,
    visible: false,
  });

  const updateScrollbar = useCallback(() => {
    const target = targetRef.current;

    if (!target) {
      setScrollbarState((current) =>
        current.visible ? { height: 0, top: 0, visible: false } : current,
      );
      return;
    }

    const maxScrollTop = target.scrollHeight - target.clientHeight;
    const visible = maxScrollTop > 1;

    if (!visible) {
      setScrollbarState((current) =>
        current.visible ? { height: 0, top: 0, visible: false } : current,
      );
      return;
    }

    const trackHeight = target.clientHeight;
    const thumbHeight = Math.max(
      28,
      Math.round((target.clientHeight / target.scrollHeight) * trackHeight),
    );
    const maxThumbTop = Math.max(1, trackHeight - thumbHeight);
    const thumbTop = Math.round((target.scrollTop / maxScrollTop) * maxThumbTop);

    setScrollbarState((current) => {
      if (
        current.visible === visible &&
        current.height === thumbHeight &&
        current.top === thumbTop
      ) {
        return current;
      }

      return {
        height: thumbHeight,
        top: thumbTop,
        visible,
      };
    });
  }, [targetRef]);

  useEffect(() => {
    const target = targetRef.current;

    if (!target) {
      return;
    }

    updateScrollbar();
    target.addEventListener("scroll", updateScrollbar, { passive: true });

    const resizeObserver = new ResizeObserver(updateScrollbar);
    resizeObserver.observe(target);

    const mutationObserver = new MutationObserver(updateScrollbar);
    mutationObserver.observe(target, { childList: true, subtree: true });

    window.addEventListener("resize", updateScrollbar);
    const animationFrame = window.requestAnimationFrame(updateScrollbar);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateScrollbar);
      target.removeEventListener("scroll", updateScrollbar);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [targetRef, updateScrollbar]);

  return {
    scrollbarState,
    updateScrollbar,
  };
}

export function LibraryCustomScrollbar({
  targetRef,
}: {
  targetRef: RefObject<HTMLElement | null>;
}) {
  const { scrollbarState, updateScrollbar } = useLibraryScrollbar(targetRef);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const stopDragging = useCallback(() => {
    dragCleanupRef.current?.();
  }, []);

  useEffect(() => stopDragging, [stopDragging]);

  useEffect(() => {
    if (!scrollbarState.visible) {
      stopDragging();
    }
  }, [scrollbarState.visible, stopDragging]);

  const scrollToThumbPosition = useCallback(
    (track: HTMLDivElement, clientY: number, thumbOffset: number) => {
      const target = targetRef.current;

      if (!target || !scrollbarState.visible) {
        return;
      }

      const trackRect = track.getBoundingClientRect();
      const maxScrollTop = target.scrollHeight - target.clientHeight;
      const maxThumbTop = Math.max(1, trackRect.height - scrollbarState.height);
      const nextThumbTop = Math.min(
        maxThumbTop,
        Math.max(0, clientY - trackRect.top - thumbOffset),
      );

      target.scrollTop = (nextThumbTop / maxThumbTop) * maxScrollTop;
      updateScrollbar();
    },
    [scrollbarState.height, scrollbarState.visible, targetRef, updateScrollbar],
  );

  if (!scrollbarState.visible) {
    return null;
  }

  return (
    <div
      className="library-custom-scrollbar"
      aria-hidden="true"
      onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        scrollToThumbPosition(event.currentTarget, event.clientY, scrollbarState.height / 2);
      }}
    >
      <div
        className="library-custom-scrollbar-thumb"
        style={{
          height: `${scrollbarState.height}px`,
          transform: `translateY(${scrollbarState.top}px)`,
        }}
        onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
          event.preventDefault();
          event.stopPropagation();

          const thumb = event.currentTarget;
          const track = thumb.parentElement;

          if (!(track instanceof HTMLDivElement)) {
            return;
          }

          stopDragging();
          const thumbOffset = event.clientY - thumb.getBoundingClientRect().top;
          thumb.setPointerCapture(event.pointerId);
          const pointerId = event.pointerId;
          let cleaned = false;

          const handlePointerMove = (moveEvent: PointerEvent) => {
            scrollToThumbPosition(track, moveEvent.clientY, thumbOffset);
          };

          const cleanupDrag = () => {
            if (cleaned) return;
            cleaned = true;
            if (dragCleanupRef.current === cleanupDrag) {
              dragCleanupRef.current = null;
            }
            document.removeEventListener("pointermove", handlePointerMove);
            document.removeEventListener("pointerup", handlePointerUp);
            document.removeEventListener("pointercancel", handlePointerCancel);
            thumb.removeEventListener("lostpointercapture", handleLostPointerCapture);
            if (thumb.hasPointerCapture(pointerId)) {
              thumb.releasePointerCapture(pointerId);
            }
          };

          const handlePointerUp = () => cleanupDrag();
          const handlePointerCancel = () => cleanupDrag();
          const handleLostPointerCapture = () => cleanupDrag();

          document.addEventListener("pointermove", handlePointerMove);
          document.addEventListener("pointerup", handlePointerUp);
          document.addEventListener("pointercancel", handlePointerCancel);
          thumb.addEventListener("lostpointercapture", handleLostPointerCapture);
          dragCleanupRef.current = cleanupDrag;
        }}
      />
    </div>
  );
}
