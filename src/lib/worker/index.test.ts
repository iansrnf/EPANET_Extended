import { MessageChannel } from "node:worker_threads";
import * as Comlink from "comlink";
import type { Feature, Point } from "geojson";
import type { Lib } from "./api";

const point: Feature<Point> = {
  type: "Feature",
  properties: { name: "Point" },
  geometry: { type: "Point", coordinates: [0, 0] },
};
const validGeoJSON = JSON.stringify(point);

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("worker execution environments", () => {
  it("imports the synchronous API during server rendering", async () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("addEventListener", undefined);

    const { lib } = await import("./index");

    expect(await lib.getIssues(validGeoJSON)).toEqual([]);
    expect(await lib.getIssues("{")).toContainEqual(
      expect.objectContaining({ severity: "error" }),
    );
  });

  it("buffers directly in a browser without workers or a message endpoint", async () => {
    const addEventListener = vi.fn();
    vi.stubGlobal("window", { addEventListener });
    vi.stubGlobal("addEventListener", addEventListener);
    const { lib } = await import("./index");

    const buffered = await lib.bufferFeature(point, {
      radius: 0.1,
      units: "kilometers",
      quadrantSegments: 4,
    });

    expect(buffered.geometry?.type).toBe("Polygon");
    expect(buffered.properties).toEqual(point.properties);
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it("serves validation and buffering through the dedicated worker entry", async () => {
    const channel = new MessageChannel();
    vi.stubGlobal(
      "addEventListener",
      channel.port1.addEventListener.bind(channel.port1),
    );
    vi.stubGlobal(
      "removeEventListener",
      channel.port1.removeEventListener.bind(channel.port1),
    );
    vi.stubGlobal("postMessage", channel.port1.postMessage.bind(channel.port1));
    vi.stubGlobal("start", channel.port1.start.bind(channel.port1));
    let remote: Comlink.Remote<Lib> | undefined;

    try {
      await import("./worker");
      remote = Comlink.wrap<Lib>(channel.port2 as unknown as Comlink.Endpoint);

      expect(await remote.getIssues(validGeoJSON)).toEqual([]);
      const buffered = await remote.bufferFeature(point, {
        radius: 0.1,
        units: "kilometers",
        quadrantSegments: 4,
      });
      expect(buffered.geometry?.type).toBe("Polygon");
      expect(buffered.properties).toEqual(point.properties);
    } finally {
      remote?.[Comlink.releaseProxy]();
      channel.port1.close();
      channel.port2.close();
    }
  });
});
