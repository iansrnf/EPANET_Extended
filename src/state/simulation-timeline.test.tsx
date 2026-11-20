import { createStore } from "jotai";
import { setInitialState } from "src/__helpers__/state";
import { resetAppState } from "src/hooks/persistence/use-start-new-project";
import {
  simulationPreviewStepAtom,
  simulationStartDateTimeAtom,
} from "./simulation-timeline";

describe("simulation timeline initialization", () => {
  afterEach(() => vi.mocked(Date.now).mockRestore());

  it("initializes From when first read and keeps whole seconds", () => {
    const now = new Date(2026, 10, 19, 14, 23, 45, 987).getTime();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now - 10000);
    const store = createStore();
    clock.mockReturnValue(now);

    const timestamp = store.get(simulationStartDateTimeAtom);

    expect(timestamp).toBe(now - 987);
    expect(store.get(simulationPreviewStepAtom)).toBe(0);
  });

  it("resets From and preview when starting or opening another project", () => {
    const now = new Date(2026, 10, 20, 9, 10, 11, 123).getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const store = setInitialState();
    store.set(simulationStartDateTimeAtom, new Date(2026, 10, 19, 8).getTime());
    store.set(simulationPreviewStepAtom, 4);

    resetAppState(store.set, []);

    expect(store.get(simulationStartDateTimeAtom)).toBe(now - 123);
    expect(store.get(simulationPreviewStepAtom)).toBe(0);
  });
});
