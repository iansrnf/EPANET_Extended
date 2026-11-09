# EPANET application

The application runs from the repository root. Its 25 shared workspace packages are included in `libs/`.

## Setup

Use Node.js 24 and pnpm 9.15.9. Configure local settings in `.env` using `.env.example` as a reference. The existing local `.env` is preserved and ignored by Git.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

## Checks and production

```sh
pnpm check-types
pnpm test src/selection/selection.test.ts src/import/inp/parse-pattern-types.test.ts src/simulation/build-inp-for-export.test.ts
pnpm build
pnpm start
```

Build preparation copies the installed SQLite WASM binary and generates any public assets supplied by workspace libraries. See [AGENTS.md](AGENTS.md) and [guidelines](guidelines/) for development conventions.

See [LICENSE](LICENSE) for the upstream license terms.

## Google Maps basemaps

The map control starts collapsed and shows the current provider and mode. Click its header or chevron to expand or collapse the controls.

Use the **Map provider** control at the lower-left of the map to select **Google Maps** or **Mapbox**, then choose one of that provider's **Map mode** cards. Google Maps offers Roadmap and Satellite; Mapbox offers Roadmap, Satellite, Monochrome, and Outdoors. Switching providers keeps the current mode when it is available, otherwise it selects Roadmap. These basemaps are also available in the Map panel. To enable Google Maps, fill in the empty setting in your local `.env`:

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

Enable the [Google Map Tiles API](https://developers.google.com/maps/documentation/tile/get-api-key) in a Google Cloud project with billing enabled. Restrict this browser-visible key to the Map Tiles API and your application websites, including localhost for local development. Restart the development server after setting the key; production deployments need a rebuild.

For a production server, run `pnpm build` after changing source code or public environment settings, then restart `pnpm start`. Restarting `pnpm start` alone continues serving the previous compiled interface. Use `pnpm dev` while editing to load source changes automatically.

Google tiles use expiring sessions that renew automatically. The map displays Google Maps attribution and the data-provider credits for the current viewport. Google basemaps remain unavailable while the key is empty; existing Mapbox basemaps remain available.
