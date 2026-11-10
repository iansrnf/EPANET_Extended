import type { MapEngine } from "@epanet-js/map";
import type { AssetsMap, Pipe } from "@epanet-js/hydraulic-model";
import type { ResultsReader } from "@epanet-js/simulation";
import type { MapSourceDataEvent } from "mapbox-gl";
import {
  buildFlowAnimationPath,
  pointAlongFlowPath,
  resolveFlowAnimationStyle,
  FLOW_PARTICLE_SPACING,
  FLOW_TRAIL_LENGTH,
  type FlowAnimationPath,
} from "./flow-animation-path";
import { visibleFlowAnimationFragments } from "./flow-animation-fragments";

type FlowAnimationOptions = {
  assets: AssetsMap;
  results: ResultsReader | null;
  enabled: boolean;
  allowReducedMotion?: boolean;
  colors?: readonly string[];
};

type AnimatedPath = {
  path: FlowAnimationPath;
  speed: number;
  phase: number;
  particleCount: number;
  startGap: number;
  endGap: number;
};

type CachedFlowPipe = {
  coordinates: readonly (readonly number[])[];
  speed: number;
  color: string;
  phase: number;
  flow: number;
};

type AnimatedPathGroup = {
  color: string;
  paths: AnimatedPath[];
};

const MAX_PIPES = 2000;
const MAX_PARTICLES = 10000;
const FRAME_INTERVAL = 1000 / 30;
const MOVING_REFRESH_INTERVAL = 150;
const PIPE_LAYERS = ["main-features-pipes", "delta-features-pipes"];

export class FlowAnimation {
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private options: FlowAnimationOptions | null = null;
  private pathGroups: AnimatedPathGroup[] = [];
  private pipes: CachedFlowPipe[] = [];
  private projectionDirty = false;
  private lastSourceRefresh = -Infinity;
  private maximumFlow = 0;
  private flowMaximums = new WeakMap<ResultsReader, number>();
  private frame: number | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshAfterRender = false;
  private motionPreference: MediaQueryList | null = null;
  private moving = false;
  private destroyed = false;
  private elapsed = 0;
  private previousFrame: number | null = null;
  private width = 0;
  private height = 0;
  private pixelRatio = 1;

  constructor(private map: MapEngine) {
    const container =
      map.map.getContainer?.() ?? map.map.getCanvasContainer?.();
    if (!container || typeof container.appendChild !== "function") return;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "1",
    });
    const context = canvas.getContext("2d");
    if (!context) return;

    this.canvas = canvas;
    this.context = context;
    container.appendChild(canvas);
    this.motionPreference =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    this.motionPreference?.addEventListener("change", this.handleVisibility);
    document.addEventListener("visibilitychange", this.handleVisibility);
    map.map.on("movestart", this.handleMoveStart);
    map.map.on("move", this.handleMove);
    map.map.on("moveend", this.handleMoveEnd);
    map.map.on("resize", this.handleResize);
    map.map.on("sourcedata", this.handleSourceData);
    map.map.on("render", this.handleRender);
    map.map.on("remove", this.destroy);
  }

  update(options: FlowAnimationOptions) {
    this.options = options;
    if (this.destroyed) return;

    this.stop();
    this.pathGroups = [];
    this.pipes = [];
    this.maximumFlow = 0;
    if (options.results) {
      let maximum = this.flowMaximums.get(options.results);
      if (maximum === undefined) {
        maximum = 0;
        for (const flow of options.results.getAllValues("flow")) {
          if (Number.isFinite(flow))
            maximum = Math.max(maximum, Math.abs(flow));
        }
        this.flowMaximums.set(options.results, maximum);
      }
      this.maximumFlow = maximum;
    }
    if (this.canAnimate()) this.scheduleRefresh(0);
  }

  setColors(colors: readonly string[]) {
    if (!this.options || this.options.colors === colors || this.destroyed)
      return;
    this.options = { ...this.options, colors };
    for (const pipe of this.pipes) {
      const style = resolveFlowAnimationStyle({
        flow: pipe.flow,
        status: "open",
        maximumFlow: this.maximumFlow,
        colors,
      });
      if (style) pipe.color = style.color;
    }
    this.projectionDirty = true;
  }

  destroy = () => {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.pathGroups = [];
    this.pipes = [];
    if (!this.canvas) return;

    this.map.map.off("movestart", this.handleMoveStart);
    this.map.map.off("move", this.handleMove);
    this.map.map.off("moveend", this.handleMoveEnd);
    this.map.map.off("resize", this.handleResize);
    this.map.map.off("sourcedata", this.handleSourceData);
    this.map.map.off("render", this.handleRender);
    this.map.map.off("remove", this.destroy);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    this.motionPreference?.removeEventListener("change", this.handleVisibility);
    this.canvas.remove();
    this.canvas = null;
    this.context = null;
  };

  private canAnimate() {
    return (
      !this.destroyed &&
      !!this.context &&
      !!this.options?.enabled &&
      !!this.options.results &&
      !document.hidden &&
      (!this.motionPreference?.matches ||
        this.options.allowReducedMotion === true) &&
      this.map.isAlive()
    );
  }

  private handleMoveStart = () => {
    this.moving = true;
    this.handleMove();
  };

  private handleMove = () => {
    this.projectionDirty = true;
    this.scheduleRefresh(0);
  };

  private handleMoveEnd = () => {
    this.moving = false;
    this.projectionDirty = true;
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.scheduleRefresh(0);
  };

  private handleResize = () => {
    this.projectionDirty = true;
    this.scheduleRefresh(0);
  };

  private handleVisibility = () => {
    this.stop();
    this.scheduleRefresh(0);
  };

  private handleSourceData = (event: MapSourceDataEvent) => {
    if (
      event.sourceId === "main-features" ||
      event.sourceId === "delta-features"
    ) {
      this.scheduleRefresh();
    }
  };

  private handleRender = () => {
    if (!this.refreshAfterRender || !this.canAnimate()) return;
    if (
      this.moving &&
      Date.now() - this.lastSourceRefresh < MOVING_REFRESH_INTERVAL
    )
      return;
    this.refreshAfterRender = false;
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.refresh();
  };

  private scheduleRefresh(delay = 80) {
    if (!this.canAnimate()) return;
    this.refreshAfterRender = true;
    if (this.refreshTimer !== null) return;
    if (this.moving) {
      delay = Math.max(
        delay,
        MOVING_REFRESH_INTERVAL - (Date.now() - this.lastSourceRefresh),
      );
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refresh();
    }, delay);
  }

  private refresh() {
    if (!this.canAnimate() || !this.canvas || !this.context || !this.options)
      return;

    const features = this.map.queryRenderedFeatures(undefined, {
      layers: PIPE_LAYERS,
    });
    this.lastSourceRefresh = Date.now();
    if (this.moving && !features.length && this.pipes.length) {
      this.projectionDirty = true;
      return;
    }
    const ids = new Set<number>();
    const pipes: CachedFlowPipe[] = [];

    for (const feature of features) {
      const id = Number(feature.id);
      if (!Number.isFinite(id) || ids.has(id)) continue;
      if (ids.size >= MAX_PIPES) break;
      ids.add(id);
      const asset = this.options.assets.get(id);
      if (!asset || asset.type !== "pipe") continue;

      const pipe = asset as Pipe;
      const result = this.options.results?.getPipe(id);
      if (!result) continue;
      const style = resolveFlowAnimationStyle({
        flow: result.flow,
        status: result.status,
        isActive: pipe.isActive,
        isVisible: pipe.getProperty("visibility") !== false,
        maximumFlow: this.maximumFlow,
        colors: this.options.colors,
      });
      if (!style) continue;
      pipes.push({
        coordinates: pipe.coordinates,
        speed: style.speed,
        color: style.color,
        phase: (id * 17) % FLOW_PARTICLE_SPACING,
        flow: result.flow,
      });
    }

    this.pipes = pipes;
    this.reprojectPaths();
    if (!this.pathGroups.length && !this.pipes.length) {
      this.stop();
    } else if (this.frame === null) {
      this.previousFrame = null;
      this.frame = requestAnimationFrame(this.draw);
    }
  }

  private reprojectPaths() {
    this.projectionDirty = false;
    if (!this.canvas || !this.context) return;
    const mapCanvas = this.map.map.getCanvas();
    const width = mapCanvas.clientWidth;
    const height = mapCanvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (
      width !== this.width ||
      height !== this.height ||
      ratio !== this.pixelRatio
    ) {
      this.width = width;
      this.height = height;
      this.pixelRatio = ratio;
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    const pathsByColor = new Map<string, AnimatedPath[]>();
    let particleCount = 0;
    for (const pipe of this.pipes) {
      if (particleCount >= MAX_PARTICLES) break;
      const path = buildFlowAnimationPath(pipe.coordinates, (coordinates) =>
        this.map.map.project([coordinates[0], coordinates[1]]),
      );
      if (!path) continue;

      for (const fragment of visibleFlowAnimationFragments(
        path,
        this.width,
        this.height,
      )) {
        const count = Math.min(
          MAX_PARTICLES - particleCount,
          Math.ceil(
            (fragment.path.length - fragment.startGap - fragment.endGap) /
              FLOW_PARTICLE_SPACING,
          ) + 1,
        );
        if (!count) break;
        let paths = pathsByColor.get(pipe.color);
        if (!paths) {
          paths = [];
          pathsByColor.set(pipe.color, paths);
        }
        paths.push({
          path: fragment.path,
          speed: pipe.speed,
          phase: pipe.phase - fragment.offset,
          particleCount: count,
          startGap: fragment.startGap,
          endGap: fragment.endGap,
        });
        particleCount += count;
      }
    }

    this.pathGroups = Array.from(pathsByColor, ([color, paths]) => ({
      color,
      paths,
    }));
  }

  private draw = (timestamp: number) => {
    if (!this.canAnimate() || !this.context) {
      this.stop();
      return;
    }

    this.frame = requestAnimationFrame(this.draw);
    if (this.previousFrame !== null) {
      const delta = timestamp - this.previousFrame;
      if (delta < FRAME_INTERVAL) return;
      this.elapsed += Math.min(delta, 100) / 1000;
    }
    this.previousFrame = timestamp;
    if (this.projectionDirty) this.reprojectPaths();

    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    context.lineCap = "butt";
    context.lineJoin = "round";
    for (const group of this.pathGroups) {
      context.beginPath();
      for (const animated of group.paths) {
        const end = animated.path.length - animated.endGap;
        const travelled = this.elapsed * animated.speed + animated.phase;
        const offset =
          ((travelled % FLOW_PARTICLE_SPACING) + FLOW_PARTICLE_SPACING) %
          FLOW_PARTICLE_SPACING;
        let head =
          Math.ceil((animated.startGap - offset) / FLOW_PARTICLE_SPACING) *
            FLOW_PARTICLE_SPACING +
          offset;
        for (
          let particle = 0;
          particle < animated.particleCount && head <= end;
          particle++, head += FLOW_PARTICLE_SPACING
        ) {
          const tail = Math.max(
            animated.startGap,
            Math.min(end, head - Math.sign(animated.speed) * FLOW_TRAIL_LENGTH),
          );
          appendTrail(
            context,
            animated.path,
            Math.min(head, tail),
            Math.max(head, tail),
          );
        }
      }
      context.strokeStyle = "rgba(255, 255, 255, 0.9)";
      context.lineWidth = 6.2;
      context.stroke();
      context.strokeStyle = group.color;
      context.lineWidth = 4.2;
      context.stroke();
    }
  };

  private stop() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.frame = null;
    this.refreshTimer = null;
    this.previousFrame = null;
    this.context?.clearRect(0, 0, this.width, this.height);
  }
}

const appendTrail = (
  context: CanvasRenderingContext2D,
  path: FlowAnimationPath,
  from: number,
  to: number,
) => {
  const start = pointAlongFlowPath(path, from);
  const end = pointAlongFlowPath(path, to);
  context.moveTo(start.x, start.y);
  let low = 0;
  let high = path.cumulativeLengths.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (path.cumulativeLengths[middle] <= from) low = middle + 1;
    else high = middle;
  }
  for (let index = low; path.cumulativeLengths[index] < to; index++) {
    context.lineTo(path.points[index].x, path.points[index].y);
  }
  context.lineTo(end.x, end.y);
};
