import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapEngine } from "@epanet-js/map";
import type { ResultsReader } from "@epanet-js/simulation";
import { HydraulicModelBuilder } from "@epanet-js/hydraulic-model-testing";
import { FlowAnimation } from "./flow-animation";
import { FLOW_PARTICLE_SPACING } from "./flow-animation-path";

const IDS = { J1: 1, J2: 2, J3: 3, J4: 4, P1: 5, P2: 6 } as const;
const controllers: FlowAnimation[] = [];

describe("flow animation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("animates overview pipes without scanning the model on each frame", () => {
    const fixture = createFixture();
    const { animation, assets, getPipe, queryRenderedFeatures, options } =
      fixture;
    const scan = vi.spyOn(assets, "values").mockImplementation(() => {
      throw new Error("Animation must not scan the model");
    });
    const lookup = vi.spyOn(assets, "get");
    queryRenderedFeatures.mockReturnValue([
      { id: IDS.P1, source: "main-features" },
      { id: IDS.P1, source: "delta-features" },
    ]);
    fixture.getZoom.mockReturnValue(13);

    animation.update(options);
    vi.advanceTimersByTime(0);
    fixture.renderFrame(0);
    fixture.renderFrame(100);

    expect(getPipe.mock.calls.map(([id]) => id)).toEqual([IDS.P1]);
    expect(lookup.mock.calls.map(([id]) => id)).toEqual([IDS.P1]);
    expect(scan).not.toHaveBeenCalled();
    expect(queryRenderedFeatures).toHaveBeenCalledTimes(1);
    expect(fixture.context.stroke).toHaveBeenCalled();

    fixture.emit("sourcedata", { sourceId: "basemap" });
    vi.advanceTimersByTime(100);
    expect(queryRenderedFeatures).toHaveBeenCalledTimes(1);

    queryRenderedFeatures.mockReturnValue([
      { id: IDS.P2, source: "main-features" },
    ]);
    fixture.emit("sourcedata", { sourceId: "delta-features" });
    fixture.emit("sourcedata", { sourceId: "main-features" });
    vi.advanceTimersByTime(80);

    expect(queryRenderedFeatures).toHaveBeenCalledTimes(2);
    expect(getPipe.mock.calls.map(([id]) => id)).toEqual([IDS.P1, IDS.P2]);
    expect(scan).not.toHaveBeenCalled();
    expect(fixture.getAllValues).toHaveBeenCalledTimes(1);
    expect(fixture.getAllValues).toHaveBeenCalledWith("flow");
  });

  it("draws low flow light blue and high flow deep blue with clearly different speeds", () => {
    const fixture = createFixture();
    fixture.getPipe.mockImplementation((id) => ({
      flow: id === IDS.P1 ? 0.01 : 1,
      status: "open",
    }));
    fixture.getAllValues.mockReturnValue(new Float32Array([0.01, 1]));
    fixture.queryRenderedFeatures.mockReturnValue([
      { id: IDS.P1, source: "main-features" },
      { id: IDS.P2, source: "main-features" },
    ]);
    const strokeColors: string[] = [];
    fixture.context.stroke.mockImplementation(() => {
      strokeColors.push(fixture.context.strokeStyle);
    });

    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(0);
    fixture.renderFrame(0);
    const initialSlow = fixture.context.moveTo.mock.calls.filter(
      ([, y]) => y === 50,
    )[1][0];
    const initialFast = fixture.context.moveTo.mock.calls.filter(
      ([, y]) => y === 150,
    )[1][0];
    fixture.context.moveTo.mockClear();
    fixture.renderFrame(100);
    const slowMovement =
      fixture.context.moveTo.mock.calls.filter(([, y]) => y === 50)[1][0] -
      initialSlow;
    const fastMovement =
      fixture.context.moveTo.mock.calls.filter(([, y]) => y === 150)[1][0] -
      initialFast;

    expect(slowMovement).toBeGreaterThan(0);
    expect(fastMovement).toBeGreaterThan(20 * slowMovement);
    expect(strokeColors).toContain("rgb(186, 230, 253)");
    expect(strokeColors).toContain("rgb(29, 78, 216)");
    expect(fixture.getAllValues).toHaveBeenCalledTimes(1);
  });

  it("changes the palette without restarting motion or querying pipe data", () => {
    const fixture = createFixture();
    const strokeColors: string[] = [];
    fixture.context.stroke.mockImplementation(() => {
      strokeColors.push(fixture.context.strokeStyle);
    });
    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(0);
    fixture.renderFrame(0);
    const initialHead = fixture.context.lineTo.mock.calls[0][0];
    expect(strokeColors).toContain("rgb(29, 78, 216)");
    fixture.context.lineTo.mockClear();
    strokeColors.length = 0;

    fixture.animation.setColors([
      "#fff7ed",
      "#fed7aa",
      "#fb923c",
      "#ea580c",
      "#9a3412",
    ]);
    expect(fixture.frames.size).toBe(1);
    fixture.renderFrame(100);

    expect(fixture.context.lineTo.mock.calls[0][0]).toBeGreaterThan(
      initialHead,
    );
    expect(strokeColors).toContain("rgb(154, 52, 18)");
    expect(fixture.frames.size).toBe(1);
    expect(fixture.queryRenderedFeatures).toHaveBeenCalledTimes(1);
    expect(fixture.getAllValues).toHaveBeenCalledTimes(1);
    expect(fixture.getPipe).toHaveBeenCalledTimes(1);
  });

  it("caches the flow maximum per results reader and refreshes colors for a new timestep", () => {
    const fixture = createFixture();
    const strokeColors: string[] = [];
    fixture.context.stroke.mockImplementation(() => {
      strokeColors.push(fixture.context.strokeStyle);
    });
    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(0);
    fixture.renderFrame(0);
    expect(strokeColors).toContain("rgb(29, 78, 216)");

    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(0);
    fixture.emit("sourcedata", { sourceId: "main-features" });
    vi.advanceTimersByTime(80);
    fixture.emit("movestart");
    fixture.emit("moveend");
    vi.advanceTimersByTime(0);
    expect(fixture.getAllValues).toHaveBeenCalledTimes(1);

    const nextGetAllValues = vi.fn(
      (_property: string) => new Float32Array([10]),
    );
    const nextOptions = {
      ...fixture.options,
      results: {
        getPipe: fixture.getPipe,
        getAllValues: nextGetAllValues,
      } as unknown as ResultsReader,
    };
    strokeColors.length = 0;
    fixture.animation.update(nextOptions);
    vi.advanceTimersByTime(0);
    fixture.renderFrame(100);

    const nextColor = strokeColors.find((color) => color.startsWith("rgb("))!;
    expect(nextColor).not.toBe("rgb(29, 78, 216)");
    expect(Number(nextColor.match(/\d+/)![0])).toBeGreaterThan(29);
    expect(nextGetAllValues).toHaveBeenCalledWith("flow");
    expect(nextGetAllValues).toHaveBeenCalledTimes(1);
    expect(fixture.getAllValues).toHaveBeenCalledTimes(1);

    fixture.animation.update(nextOptions);
    vi.advanceTimersByTime(0);
    expect(nextGetAllValues).toHaveBeenCalledTimes(1);
  });

  it.each([1, -1])("moves water in the direction of signed flow %s", (flow) => {
    const fixture = createFixture(flow);
    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(0);
    fixture.renderFrame(0);
    const initialPosition = fixture.context.moveTo.mock.calls[0][0];
    fixture.context.moveTo.mockClear();

    fixture.renderFrame(100);
    const nextPosition = fixture.context.moveTo.mock.calls[0][0];

    expect((nextPosition - initialPosition) * Math.sign(flow)).toBeGreaterThan(
      0,
    );
    expect(fixture.queryRenderedFeatures).toHaveBeenCalledTimes(1);
    expect(fixture.getPipe).toHaveBeenCalledTimes(1);
  });

  it("keeps water moving and aligned while dragging the map", () => {
    const fixture = createFixture();
    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(0);
    fixture.renderFrame(0);
    const initialPosition = fixture.context.moveTo.mock.calls[0][0];
    const initialHead = fixture.context.lineTo.mock.calls[0][0];
    fixture.context.moveTo.mockClear();

    fixture.emit("movestart");
    expect(fixture.frames.size).toBe(1);
    fixture.projection.offsetX = 30;
    fixture.projection.offsetY = 15;
    fixture.emit("move");
    fixture.renderFrame(100);

    const draggingPosition = fixture.context.moveTo.mock.calls.find(
      ([, y]) => y === 65,
    )![0];
    const draggingHead = fixture.context.lineTo.mock.calls.find(
      ([, y]) => y === 65,
    )![0];
    expect(draggingPosition - initialPosition - 30).toBeGreaterThan(0);
    expect(fixture.frames.size).toBe(1);
    expect(fixture.queryRenderedFeatures).toHaveBeenCalledTimes(1);
    expect(fixture.getAllValues).toHaveBeenCalledTimes(1);

    fixture.context.moveTo.mockClear();
    fixture.context.lineTo.mockClear();
    fixture.emit("moveend");
    vi.advanceTimersByTime(0);
    expect(fixture.frames.size).toBe(1);
    fixture.renderFrame(200);

    const settledHead = fixture.context.lineTo.mock.calls.find(
      ([, y]) => y === 65,
    )![0];
    const continuedMovement =
      (settledHead - draggingHead + FLOW_PARTICLE_SPACING) %
      FLOW_PARTICLE_SPACING;
    expect(continuedMovement).toBeCloseTo(draggingHead - initialHead - 30);
    expect(fixture.frames.size).toBe(1);
  });

  it("reprojects cached pipes during zoom without querying every frame", () => {
    const fixture = createFixture();
    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(0);
    fixture.renderFrame(0);
    fixture.context.moveTo.mockClear();
    fixture.project.mockClear();

    fixture.emit("movestart");
    fixture.projection.scale = 150;
    fixture.emit("move");
    fixture.renderFrame(100);

    expect(fixture.project).toHaveBeenCalled();
    expect(fixture.context.moveTo.mock.calls.some(([, y]) => y === 75)).toBe(
      true,
    );
    expect(fixture.frames.size).toBe(1);
    expect(fixture.queryRenderedFeatures).toHaveBeenCalledTimes(1);
    expect(fixture.getAllValues).toHaveBeenCalledTimes(1);

    fixture.emit("move");
    fixture.renderFrame(200);
    expect(fixture.queryRenderedFeatures).toHaveBeenCalledTimes(1);
    expect(fixture.getAllValues).toHaveBeenCalledTimes(1);
  });

  it("adds newly visible pipes before dragging ends", () => {
    const fixture = createFixture();
    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(0);
    fixture.renderFrame(0);

    fixture.emit("movestart");
    fixture.queryRenderedFeatures.mockReturnValue([
      { id: IDS.P2, source: "main-features" },
    ]);
    fixture.emit("move");
    fixture.emit("sourcedata", { sourceId: "main-features" });
    vi.advanceTimersByTime(150);
    fixture.emit("render");
    fixture.context.moveTo.mockClear();
    fixture.renderFrame(150);

    expect(fixture.getPipe.mock.calls.some(([id]) => id === IDS.P2)).toBe(true);
    expect(fixture.context.moveTo.mock.calls.some(([, y]) => y === 150)).toBe(
      true,
    );
    expect(fixture.frames.size).toBe(1);
    expect(fixture.queryRenderedFeatures.mock.calls.length).toBeLessThanOrEqual(
      3,
    );
    expect(fixture.getAllValues).toHaveBeenCalledTimes(1);
  });

  it("preserves moving water while newly exposed tiles are loading", () => {
    const fixture = createFixture();
    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(0);
    fixture.renderFrame(0);

    fixture.emit("movestart");
    fixture.projection.offsetY = 15;
    fixture.queryRenderedFeatures.mockReturnValue([]);
    fixture.emit("move");
    fixture.emit("sourcedata", { sourceId: "main-features" });
    vi.advanceTimersByTime(150);
    fixture.emit("render");
    fixture.context.moveTo.mockClear();
    fixture.renderFrame(150);

    expect(fixture.queryRenderedFeatures.mock.calls.length).toBeGreaterThan(1);
    expect(fixture.context.moveTo.mock.calls.some(([, y]) => y === 65)).toBe(
      true,
    );
    expect(fixture.frames.size).toBe(1);
    expect(fixture.getAllValues).toHaveBeenCalledTimes(1);
  });

  it("retries visibility after the source is first rendered", () => {
    const fixture = createFixture();
    fixture.queryRenderedFeatures.mockReturnValueOnce([]);

    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(0);
    expect(fixture.frames.size).toBe(0);

    fixture.emit("render");
    vi.advanceTimersByTime(80);
    fixture.renderFrame(0);

    expect(fixture.queryRenderedFeatures).toHaveBeenCalledTimes(2);
    expect(fixture.context.stroke).toHaveBeenCalled();
    expect(fixture.frames.size).toBe(1);

    fixture.emit("render");
    vi.advanceTimersByTime(80);
    fixture.renderFrame(100);

    expect(fixture.queryRenderedFeatures).toHaveBeenCalledTimes(2);
  });

  it("clears motion when paused and releases resources when the map is removed", () => {
    const fixture = createFixture();
    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(0);
    fixture.renderFrame(0);
    expect(fixture.frames.size).toBe(1);

    fixture.context.clearRect.mockClear();
    fixture.animation.update({ ...fixture.options, enabled: false });
    fixture.emit("sourcedata", { sourceId: "main-features" });
    vi.advanceTimersByTime(100);

    expect(fixture.frames.size).toBe(0);
    expect(fixture.context.clearRect).toHaveBeenCalled();
    expect(fixture.queryRenderedFeatures).toHaveBeenCalledTimes(1);

    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(0);
    expect(fixture.frames.size).toBe(1);
    fixture.emit("remove");

    expect(fixture.frames.size).toBe(0);
    expect(fixture.container.querySelector("canvas")).toBeNull();
    expect([...fixture.listeners.values()].every((set) => set.size === 0)).toBe(
      true,
    );
    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(100);
    expect(fixture.frames.size).toBe(0);
  });

  it("respects reduced motion until explicitly played and pauses hidden tabs", () => {
    const fixture = createFixture();
    fixture.media.matches = true;
    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(0);
    expect(fixture.queryRenderedFeatures).not.toHaveBeenCalled();

    fixture.animation.update({
      ...fixture.options,
      allowReducedMotion: true,
    });
    vi.advanceTimersByTime(0);
    expect(fixture.frames.size).toBe(1);

    fixture.animation.update(fixture.options);
    vi.advanceTimersByTime(0);
    expect(fixture.frames.size).toBe(0);

    fixture.media.matches = false;
    fixture.media.dispatchEvent(new Event("change"));
    vi.advanceTimersByTime(0);
    expect(fixture.frames.size).toBe(1);

    fixture.hidden.mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fixture.frames.size).toBe(0);

    fixture.hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(0);
    expect(fixture.frames.size).toBe(1);
  });
});

const createFixture = (flow = 1) => {
  const { assets } = HydraulicModelBuilder.with()
    .aJunction(IDS.J1, { coordinates: [0.1, 0.5] })
    .aJunction(IDS.J2, { coordinates: [2.1, 0.5] })
    .aJunction(IDS.J3, { coordinates: [0.1, 1.5] })
    .aJunction(IDS.J4, { coordinates: [2.1, 1.5] })
    .aPipe(IDS.P1, { startNodeId: IDS.J1, endNodeId: IDS.J2 })
    .aPipe(IDS.P2, { startNodeId: IDS.J3, endNodeId: IDS.J4 })
    .build();
  const context = {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn<(x: number, y: number) => void>(),
    lineTo: vi.fn<(x: number, y: number) => void>(),
    stroke: vi.fn(),
    strokeStyle: "",
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(media));
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));

  const container = document.createElement("div");
  const listeners = new Map<string, Set<(event?: unknown) => void>>();
  const queryRenderedFeatures = vi
    .fn()
    .mockReturnValue([{ id: IDS.P1, source: "main-features" }]);
  const getPipe = vi.fn((_id: number) => ({ flow, status: "open" }));
  const getAllValues = vi.fn(
    (_property: string) => new Float32Array([Math.abs(flow)]),
  );
  const getZoom = vi.fn().mockReturnValue(16);
  const projection = { offsetX: 0, offsetY: 0, scale: 100 };
  const project = vi.fn(([x, y]: number[]) => ({
    x: x * projection.scale + projection.offsetX,
    y: y * projection.scale + projection.offsetY,
  }));
  const map = {
    isAlive: () => true,
    getZoom,
    queryRenderedFeatures,
    map: {
      getCanvasContainer: () => container,
      getCanvas: () => ({ clientWidth: 300, clientHeight: 200 }),
      project,
      on: (name: string, callback: (event?: unknown) => void) => {
        if (!listeners.has(name)) listeners.set(name, new Set());
        listeners.get(name)!.add(callback);
      },
      off: (name: string, callback: (event?: unknown) => void) => {
        listeners.get(name)?.delete(callback);
      },
    },
  };
  const animation = new FlowAnimation(map as unknown as MapEngine);
  controllers.push(animation);
  return {
    animation,
    assets,
    context,
    container,
    frames,
    getPipe,
    getAllValues,
    getZoom,
    hidden,
    media,
    listeners,
    project,
    projection,
    queryRenderedFeatures,
    options: {
      assets,
      results: { getPipe, getAllValues } as unknown as ResultsReader,
      enabled: true,
    },
    emit: (name: string, event?: unknown) => {
      listeners.get(name)?.forEach((callback) => callback(event));
    },
    renderFrame: (timestamp: number) => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(timestamp));
    },
  };
};
