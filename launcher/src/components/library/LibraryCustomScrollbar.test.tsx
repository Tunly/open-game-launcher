import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { describe, expect, it, vi, type MockInstance } from "vitest";

import { LibraryCustomScrollbar } from "./LibraryCustomScrollbar";

function ScrollbarHarness() {
  const targetRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    Object.defineProperties(target, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });
  }, []);

  return (
    <>
      <div ref={targetRef}>Library games</div>
      <LibraryCustomScrollbar targetRef={targetRef} />
    </>
  );
}

async function renderDraggingScrollbar() {
  const view = render(<ScrollbarHarness />);
  let thumb: HTMLDivElement | null = null;
  await waitFor(() => {
    thumb = view.container.querySelector<HTMLDivElement>(".library-custom-scrollbar-thumb");
    expect(thumb).not.toBeNull();
  });

  Object.defineProperties(thumb!, {
    hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
    releasePointerCapture: { configurable: true, value: vi.fn() },
    setPointerCapture: { configurable: true, value: vi.fn() },
  });

  const removeListenerSpy = vi.spyOn(document, "removeEventListener");
  fireEvent.pointerDown(thumb!, { clientY: 10, pointerId: 7 });

  return { ...view, removeListenerSpy, thumb: thumb! };
}

function expectDragListenersRemoved(
  removeListenerSpy: MockInstance<Document["removeEventListener"]>,
) {
  const removedTypes = removeListenerSpy.mock.calls.map(([type]) => type);
  expect(removedTypes).toEqual(
    expect.arrayContaining(["pointermove", "pointerup", "pointercancel"]),
  );
}

describe("LibraryCustomScrollbar", () => {
  it("removes document drag listeners on pointer cancellation", async () => {
    const { removeListenerSpy } = await renderDraggingScrollbar();

    fireEvent.pointerCancel(document, { pointerId: 7 });

    expectDragListenersRemoved(removeListenerSpy);
  });

  it("removes document drag listeners when pointer capture is lost", async () => {
    const { removeListenerSpy, thumb } = await renderDraggingScrollbar();

    fireEvent(thumb, new Event("lostpointercapture"));

    expectDragListenersRemoved(removeListenerSpy);
  });

  it("removes document drag listeners when unmounted during a drag", async () => {
    const { removeListenerSpy, unmount } = await renderDraggingScrollbar();

    act(() => unmount());

    expectDragListenersRemoved(removeListenerSpy);
  });
});
