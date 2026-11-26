import { describe, expect, it } from "vitest";
import { MapCameraGestureState } from "./map-3d-gestures";

describe("camera gesture safety", () => {
  it("preserves a stationary Ctrl-click but suppresses an orbit's trailing click", () => {
    const gesture = new MapCameraGestureState();
    expect(gesture.startMouse(mouse({ ctrlKey: true }), true)).toBe(true);
    gesture.endMouse(mouse({ ctrlKey: true }));
    expect(gesture.clickSuppressed).toBe(false);

    gesture.startMouse(mouse({ ctrlKey: true }), true);
    gesture.moveMouse(mouse({ clientY: 20, ctrlKey: true }));
    gesture.endMouse(mouse({ clientY: 20 }));

    expect(gesture.clickSuppressed).toBe(true);
    expect(gesture.contextMenuHandled).toBe(true);
    expect(gesture.contextMenu(mouse({ button: 2, clientY: 20 }))).toBeNull();
    expect(gesture.contextMenuHandled).toBe(false);
    expect(gesture.contextMenu(mouse({ clientY: 20 }))).toMatchObject({
      clientY: 20,
    });
    gesture.startMouse(mouse(), true);
    expect(gesture.clickSuppressed).toBe(false);
    expect(gesture.contextMenuHandled).toBe(false);
  });

  it("opens an early context menu on release only when the right button did not drag", () => {
    const gesture = new MapCameraGestureState();
    const rightClick = mouse({ button: 2, clientX: 125, clientY: 60 });
    gesture.startMouse(rightClick, true);

    expect(gesture.contextMenu(rightClick)).toBeNull();
    expect(gesture.endMouse(rightClick)).toMatchObject({
      clientX: 125,
      clientY: 60,
    });

    gesture.startMouse(rightClick, true);
    expect(gesture.contextMenu(rightClick)).toBeNull();
    gesture.moveMouse(mouse({ button: 2, clientX: 125, clientY: 100 }));

    expect(
      gesture.endMouse(mouse({ button: 2, clientX: 125, clientY: 100 })),
    ).toBeNull();
    expect(gesture.clickSuppressed).toBe(true);
  });

  it("preserves a context menu that arrives after a stationary right-button release", () => {
    const gesture = new MapCameraGestureState();
    const rightClick = mouse({ button: 2, clientX: 25, clientY: 50 });
    gesture.startMouse(rightClick, true);
    gesture.endMouse(rightClick);

    expect(gesture.contextMenu(rightClick)).toMatchObject({
      clientX: 25,
      clientY: 50,
    });
    expect(gesture.startMouse(rightClick, false)).toBe(false);
    expect(gesture.contextMenuHandled).toBe(false);
  });

  it("suppresses the whole two-finger sequence and duplicate final touch events", () => {
    const gesture = new MapCameraGestureState();
    expect(gesture.startTouch(1, true)).toBe(false);
    expect(gesture.startTouch(2, true)).toBe(true);
    expect(gesture.endTouch(1, {})).toBe(true);
    expect(gesture.startTouch(1, false)).toBe(true);

    const finalTouch = {};
    expect(gesture.endTouch(0, finalTouch)).toBe(true);
    expect(gesture.endTouch(0, finalTouch)).toBe(true);
    expect(gesture.touchActive).toBe(false);
    expect(gesture.clickSuppressed).toBe(true);
    expect(gesture.startTouch(1, true)).toBe(false);
    expect(gesture.clickSuppressed).toBe(false);
  });

  it("drops pending camera input when focus is lost", () => {
    const gesture = new MapCameraGestureState();
    const rightClick = mouse({ button: 2 });
    gesture.startMouse(rightClick, true);
    gesture.contextMenu(rightClick);
    gesture.startTouch(2, true);

    gesture.reset();

    expect(gesture.mouseActive).toBe(false);
    expect(gesture.touchActive).toBe(false);
    expect(gesture.contextMenuHandled).toBe(false);
    expect(gesture.clickSuppressed).toBe(false);
    expect(gesture.endMouse(rightClick)).toBeNull();
  });
});

const mouse = (overrides: Partial<MouseEvent> = {}): MouseEvent =>
  ({
    button: 0,
    clientX: 0,
    clientY: 0,
    screenX: 0,
    screenY: 0,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...overrides,
  }) as MouseEvent;
