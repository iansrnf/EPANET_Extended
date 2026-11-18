import { buildModelBuilderUrl } from "./model-builder-url";

describe("buildModelBuilderUrl", () => {
  it("uses standalone download mode with full access", () => {
    const url = new URL(
      buildModelBuilderUrl({
        url: "https://builder.example/?embedded=true&access=limited&project=water",
        enabledFlags: ["FLAG_TEST_ERRORS"],
        locale: "es",
        access: "full",
        embedded: false,
      }),
    );

    expect(url.searchParams.has("embedded")).toBe(false);
    expect(url.searchParams.get("access")).toBe("full");
    expect(url.searchParams.get("locale")).toBe("es");
    expect(url.searchParams.get("FLAG_TEST_ERRORS")).toBe("true");
    expect(url.searchParams.get("project")).toBe("water");
  });

  it("opts into the configured embedded transport", () => {
    const url = new URL(
      buildModelBuilderUrl({
        url: "https://builder.example/?embedded=false",
        enabledFlags: [],
        locale: "en",
        access: "limited",
        embedded: true,
      }),
    );

    expect(url.searchParams.get("embedded")).toBe("true");
    expect(url.searchParams.get("access")).toBe("limited");
  });
});
