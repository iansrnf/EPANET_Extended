import { describe, expect, it } from "vitest";
import { MapCameraGestureState } from "./map-3d-gestures";

describe("camera gesture safety", () => {
  it("preserves Ctrl-click and suppresses a middle drag's trailing click", () => {
    const gesture = new MapCameraGestureState();
    expect(gesture.startMouse(mouse({ ctrlKey: true }), true)).toBe(false);
    gesture.endMouse(mouse({ ctrlKey: true }));
    expect(gesture.clickSuppressed).toBe(false);

    gesture.startMouse(mouse({ button: 1 }), true);
    gesture.moveMouse(mouse({ button: 1, clientY: 20 }));
    gesture.endMouse(mouse({ button: 1, clientY: 20 }));

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

  it("rotates and tilts with the middle button using incremental clamped angles", () => {
    const gesture = new MapCameraGestureState();
    gesture.startMouse(mouse({ button: 1 }), true, { bearing: 170, pitch: 60 });
    expect(gesture.moveMouse(mouse({ clientX: 2 }))).toBeNull();
    expect(gesture.moveMouse(mouse({ clientX: 20, clientY: -100 }))).toEqual({
      bearing: 186,
      pitch: 75,
    });
    expect(gesture.moveMouse(mouse({ clientX: 20, clientY: -90 }))).toEqual({
      bearing: 186,
      pitch: 70,
    });
    expect(gesture.moveMouse(mouse({ clientX: 20, clientY: -90 }))).toBeNull();
    expect(gesture.moveMouse(mouse({ clientX: 20, clientY: 200 }))).toEqual({
      bearing: 186,
      pitch: 0,
    });
  });

  it("does not orbit with Ctrl-left or right-click", () => {
    const gesture = new MapCameraGestureState();
    const camera = { bearing: 0, pitch: 60 };
    expect(gesture.startMouse(mouse({ ctrlKey: true }), true, camera)).toBe(
      false,
    );
    expect(gesture.moveMouse(mouse({ clientX: 20 }))).toBeNull();
    gesture.startMouse(mouse({ button: 2 }), true, camera);
    expect(gesture.moveMouse(mouse({ clientX: 20 }))).toBeNull();
    expect(gesture.middleMouseActive).toBe(false);
  });

  it("does not select on a stationary middle click or end on another button", () => {
    const gesture = new MapCameraGestureState();
    gesture.startMouse(mouse({ button: 1 }), true);
    gesture.endMouse(mouse());
    expect(gesture.middleMouseActive).toBe(true);
    gesture.endMouse(mouse({ button: 1 }));
    expect(gesture.middleMouseActive).toBe(false);
    expect(gesture.clickSuppressed).toBe(true);
    gesture.startMouse(mouse(), true);
    expect(gesture.clickSuppressed).toBe(false);
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
