import type { MapEngine } from "@epanet-js/map";
import { MAX_MAP_PITCH } from "src/state/map-view";

export const updateMapCameraGestures = (
  map: MapEngine,
  {
    terrainEnabled,
    tiltEnabled,
    rotationEnabled,
  }: {
    terrainEnabled: boolean;
    tiltEnabled: boolean;
    rotationEnabled: boolean;
  },
) => {
  if (!map.isAlive()) return;

  const renderer = map.map;
  const maxPitch = terrainEnabled ? MAX_MAP_PITCH : 0;
  if (renderer.getMaxPitch() !== maxPitch) {
    renderer.setMaxPitch(maxPitch);
  }

  if (rotationEnabled && (!terrainEnabled || tiltEnabled)) {
    renderer.dragRotate.enable();
    renderer.touchZoomRotate.enableRotation();
    renderer.keyboard.enableRotation();
  } else {
    renderer.dragRotate.disable();
    renderer.touchZoomRotate.disableRotation();
    renderer.keyboard.disableRotation();
  }

  if (tiltEnabled) {
    renderer.touchPitch.enable();
  } else {
    renderer.touchPitch.disable();
  }
};

export type MapContextMenuPosition = Pick<
  MouseEvent,
  | "clientX"
  | "clientY"
  | "screenX"
  | "screenY"
  | "ctrlKey"
  | "shiftKey"
  | "altKey"
  | "metaKey"
>;

export class MapCameraGestureState {
  private mouse: {
    button: number;
    clientX: number;
    clientY: number;
    dragged: boolean;
  } | null = null;
  private pendingContextMenu: MapContextMenuPosition | null = null;
  private dragged = false;
  private multiTouch = false;
  private ignoreClick = false;
  private lastTouchEnd: object | null = null;
  private lastTouchEndIgnored = false;

  get mouseActive() {
    return this.mouse !== null;
  }

  get touchActive() {
    return this.multiTouch;
  }

  get contextMenuHandled() {
    return this.mouseActive || this.dragged;
  }

  get clickSuppressed() {
    return this.mouseActive || this.multiTouch || this.ignoreClick;
  }

  startMouse(event: MouseEvent, enabled: boolean) {
    this.dragged = false;
    this.ignoreClick = false;
    this.pendingContextMenu = null;
    this.mouse =
      enabled && (event.button === 2 || (event.button === 0 && event.ctrlKey))
        ? {
            button: event.button,
            clientX: event.clientX,
            clientY: event.clientY,
            dragged: false,
          }
        : null;
    return this.mouseActive;
  }

  moveMouse(event: MouseEvent) {
    if (!this.mouse) return;
    const dx = event.clientX - this.mouse.clientX;
    const dy = event.clientY - this.mouse.clientY;
    if (dx * dx + dy * dy >= 9) this.mouse.dragged = true;
  }

  endMouse(event: MouseEvent): MapContextMenuPosition | null {
    if (!this.mouse || event.button !== this.mouse.button) return null;
    this.moveMouse(event);
    this.dragged = this.mouse.dragged;
    this.ignoreClick = this.dragged;
    this.mouse = null;
    const menu = this.dragged ? null : this.pendingContextMenu;
    this.pendingContextMenu = null;
    return menu;
  }

  contextMenu(event: MouseEvent): MapContextMenuPosition | null {
    if (this.dragged) {
      this.dragged = false;
      return null;
    }
    if (this.mouse?.dragged) return null;
    const position = {
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    };
    if (this.mouse) {
      this.pendingContextMenu = position;
      return null;
    }
    return position;
  }

  startTouch(touchCount: number, enabled: boolean) {
    if (enabled && touchCount > 1) {
      this.multiTouch = true;
      this.ignoreClick = true;
    } else if (!this.multiTouch) {
      this.ignoreClick = false;
      this.lastTouchEnd = null;
    }
    return this.multiTouch;
  }

  endTouch(remainingTouches: number, event: object) {
    if (event === this.lastTouchEnd) return this.lastTouchEndIgnored;
    const ignored = this.multiTouch;
    if (remainingTouches === 0) this.multiTouch = false;
    this.lastTouchEnd = event;
    this.lastTouchEndIgnored = ignored;
    return ignored;
  }

  reset() {
    this.mouse = null;
    this.pendingContextMenu = null;
    this.dragged = false;
    this.multiTouch = false;
    this.ignoreClick = false;
    this.lastTouchEnd = null;
    this.lastTouchEndIgnored = false;
  }
}
