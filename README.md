# EPANET application

The application runs from the repository root. Its 25 shared workspace packages are included in `libs/`.

## Setup

Use Node.js 24 and pnpm 9.15.9. Configure local settings in `.env` using `.env.example` as a reference. The existing local `.env` is preserved and ignored by Git.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3100/`. The development command explicitly uses port `3100` to avoid Windows reservations that can include Next.js's default port `3000`. This port is configured in the `dev` script in `package.json` and takes precedence over the `PORT` environment variable.

If Windows reports `listen EACCES`, check reserved ports with `netsh interface ipv4 show excludedportrange protocol=tcp` and choose an available port outside those ranges in the `dev` script.

## Checks and production

```sh
pnpm check-types
pnpm test src/selection/selection.test.ts src/import/inp/parse-pattern-types.test.ts src/simulation/build-inp-for-export.test.ts
pnpm build
pnpm start
```

Build preparation copies the installed SQLite WASM binary and generates any public assets supplied by workspace libraries. See [AGENTS.md](AGENTS.md) and [guidelines](guidelines/) for development conventions.

See [LICENSE](LICENSE) for the upstream license terms.

## Upstream core maintenance

See the [November 18, 2026 core update report](UPSTREAM_CORE_UPDATE_2026-11-18.md) for the full change explanation, preserved GSCWD features, compatibility decisions, and validation results.

The November 18, 2026 core update was reviewed against `C:/Project/OTHER/EPANET2` at commit `804d7aa0d`. It brings in hydraulic controls and simulation fixes, tracing, customer-point and GIS imports, model validation, map recovery, and project integrity reporting. The GSCWD map providers, pipe flow animation, loggers and graphs, dashboard, pump definitions, native GIS builder, and browser-storage fallback remain in place.

Run a read-only comparison against a newer source checkout with:

```sh
node scripts/audit-upstream-core.mjs C:/Project/OTHER/EPANET2
```

The report in `logs/upstream-core-audit.json` records source commits, source working changes, differing files, and destination-only files. Differences require review: many represent GSCWD features or upstream features outside this core update. The script maps the source's `apps/app/src/` into this repository's `src/`; workspace libraries retain their paths.

Customer-point changeset import and Synergi flow-modulating valve parsing retain their upstream flags, `FLAG_CP_IMPORT_CHANGESET` and `FLAG_SYNERGI_FLOW_MODULATING_VALVES`. Upstream map-theme persistence and automatic selection-set path migration are deferred: their migration numbers 29 and 30 are already used here for loggers and pump definitions. Existing migration files must remain unchanged; any future adoption needs new migration numbers and compatibility tests. Project files produced by the newer upstream schema have not been verified as compatible with this custom schema. Billing, sensor imports, and AI assistant changes are outside this update.

The updated regression coverage replaces obsolete assertions that FMV pressures must increase monotonically and that INP generation automatically reverses remote flow targets. Explicit pump-direction and backfeed validation now covers those cases. The customer-point import opener tests moved into their own suite when the open and apply commands were separated. Two obsolete asset-panel wiring tests for the inline pump-power field and old pump-type selector were removed; dedicated pump-definition editor, persistence, and simulation suites cover their replacement.

## GIS model builder

**Import from GIS** opens the native model builder inside this app. Its five steps cover model settings, data sources, layer assignment, attribute mapping, and building/reviewing the model. Files are parsed locally. Terrain elevations use the app's configured elevation sources when enabled.

The builder supports pipes, junctions, reservoirs, tanks, pumps, valves, customer points, and zones. Saved build recipes retain settings and source filenames; add the source files again when reopening a recipe. Building leaves the current project open until **Open model**, which applies the usual unsaved-changes check. The resulting project can be saved as `.ejsdb` or exported to INP through the normal app commands.

The native implementation follows the [upstream model-builder guide](https://help.epanetjs.com/workflows/build-a-model/). It is independently implemented; topology and mapped values should be reviewed before simulation. To explicitly use an external embedded builder instead, set `NEXT_PUBLIC_MODEL_BUILDER_V2_URL` or `NEXT_PUBLIC_MODEL_BUILDER_URL` with `?embedded=true`. That deployment must permit framing by your app's origin and support the `.ejsdb` message protocol. Production deployments require a rebuild after changing these settings.

Supported inputs include GeoJSON/GeoJSONL, Shapefile sidecars, DXF, coordinate CSV/TSV, and ZIP bundles with one nested archive level. Mapping offers a 100-record imported-value preview, including defaults and invalid-value fallbacks. The source preview uses a Mapbox basemap when available and an interactive geometry view otherwise; preview sampling does not limit imported records.

The implementation was checked against the official [Rosebery GIS example](https://help.epanetjs.com/workflows/worked-example-roseberry/): 338 junctions, 348 pipes, one tank, one reservoir, and 665 optional customer points. Public documentation and observed behavior guide compatibility; the unpublished upstream implementation and visual layout are not guaranteed to match exactly.

## Pump definitions

Select a Pump on the map, then choose **Configure pump definition** in its asset sidebar. The editor is available from a selected pump and includes Head, Efficiency, and Motor tabs with live graphs, zoom, pan, and curve coefficients.

Definitions support constant power, design point, standard three point, standard extended, custom extended, and multipoint head curves. Multipoint curves can use linear interpolation or a fitted power curve. Efficiency can be constant, based on a best efficiency point, or defined by multiple points; motor efficiency and optional drive efficiency are separate inputs.

Create, name, duplicate, and reuse definitions across pumps. **Apply to pump** saves the draft and assigns the selected definition; edits to a shared definition update every assigned pump. Cancel offers to discard unsaved edits. Direct head or efficiency overrides in a data table detach that pump from its definition.

The `.ejsdb` project format preserves complete definitions and their assignments, including undo and scenarios. Existing projects migrate automatically. EPANET INP export contains the derived head and combined efficiency curves; the additional definition settings remain in the project file.

Energy calculations combine pump, motor, and drive efficiency at the initial relative speed. During changing-speed operation, EPANET applies its native efficiency approximation. The editor shows this limitation and EPANET's minimum simulated efficiency of 1%.

## HTTPS on the local VM

The VM currently serves the app at `http://172.20.110.84:3006/`. Simulation automatically uses memory when browser file storage is unavailable, including when opening that HTTP address. The Simulate button remains available. Results use the browser's memory and are released when the page closes or reloads; large simulations can require more memory. Browser file storage remains the preferred mode when available.

Device location still requires HTTPS or localhost. Serve this app through HTTPS at `https://172.20.110.84/` using the included [Caddyfile](deploy/Caddyfile) to enable browser file storage and location together.

Save or export any open project before switching addresses. HTTP and HTTPS have separate browser storage, so an unsaved session at the old address will not appear at the new address.

Keep the existing app process on port `3006` running. When deploying source changes, rebuild and restart that process using its existing service configuration, or run these commands from the repository root:

```sh
pnpm build
pnpm start --port 3006
```

[Install Caddy](https://caddyserver.com/docs/install) on the VM, allow inbound TCP ports `80` and `443` in its firewall, and run Caddy from another terminal in the repository root. On PowerShell:

```powershell
$env:EPANET_HOST = "172.20.110.84"
caddy run --config deploy/Caddyfile --adapter caddyfile
```

On Linux or another POSIX shell:

```sh
EPANET_HOST=172.20.110.84 caddy run --config deploy/Caddyfile --adapter caddyfile
```

`EPANET_HOST` is required. The proxy forwards requests to `127.0.0.1:3006` by default; set `EPANET_UPSTREAM` if the app listens on a different address or port. Caddy also listens on port `80` to redirect HTTP to HTTPS; ports `80` and `443` must be free and Caddy must have permission to bind them. If Caddy is already running as a service, apply this configuration and environment through that service instead of starting a second instance. Keep both the application and Caddy running with the VM's service manager for persistent deployment.

This configuration uses Caddy's internal certificate authority. **Install its public root certificate on every computer that opens the app.** Run `caddy environ` as the same VM account that runs Caddy, find `caddy.AppDataDir`, and copy `pki/authorities/local/root.crt` from that directory to each client. Import it into that computer's trusted root certificate store; browsers with their own certificate store also need to trust it. On Windows, use the **Trusted Root Certification Authorities** store. Distribute only `root.crt`; keep the CA's private keys on the VM. See [Caddy's local HTTPS documentation](https://caddyserver.com/docs/automatic-https#local-https) for certificate storage and trust details.

Open `https://172.20.110.84/` after the certificate is trusted; the browser should show a secure connection without a certificate warning. Reopen the saved project, then use **Simulate** and allow the site's location request. Location also depends on the browser computer's operating system having a location fix. If the browser itself runs inside a VM, that VM may not provide one.

For access from one computer without installing a certificate, an SSH tunnel is another option if SSH is enabled and you can sign in to the VM. Run the following on the computer where the browser runs using the VM account's working SSH key or password:

```sh
ssh -N -L 3001:127.0.0.1:3006 ictd2025@172.20.110.84
```

Keep the tunnel open and visit `http://localhost:3001/`. Browsers treat localhost as a secure context. This address also has separate browser storage, so save/export before switching.

## Simulation timeline

Simulation controls float over the bottom of the map on a fully transparent background. Empty areas let clicks and drags pass through to the map, while buttons and the active timeline remain interactive. The lightning icon runs a simulation; the gear opens its settings, and the document icon opens its report. The timeline is visible before running, using the configured duration or a 24-hour preview for steady-state models. Its time scale stays fixed while the arrow moves across the run. Dragging follows the pointer and updates the calendar; releasing selects the nearest available interval. After an extended-period simulation, use Play/Pause, click or drag the timeline, or use the previous/next icons beside the date. The fast-forward icon cycles through 1x, 2x, and 4x playback; the current speed appears beside it. Hover or focus an action for its label.

Click the date/time card to set **From**, which defaults to the current local date and time, and choose hourly, minute, or second intervals. **To** adds the configured EPS duration to From: November 19 at 17:50 plus 24 hours ends November 20 at 17:50. Drag the selector or timeline to update the selected date/time, including before running. Each completed run retains its own From timestamp, and clock-based simulation controls use that start time. Editing From configures the next run; selecting a result day explores the completed run. Timeline scrubbing and calendar selection pause playback. Existing simulation keyboard shortcuts remain available.

During playback, the selector moves smoothly between result steps at the selected speed. Manual seeking responds immediately, and reduced-motion preferences disable the transitions.

## Google Maps basemaps

The lower-left map controls are compact icon buttons. Hover or focus an icon for its tooltip, then click it to open a menu beside the button. Press Escape or click outside to close a menu.

The cursor coordinate readout beside the map credits shows longitude and latitude in decimal degrees to six places. It follows the pointer as it moves over the map, updates during pan and zoom, and keeps the last coordinates when the pointer leaves. Tap a location on touchscreens to update it. Narrow map panels move the readout above the timeline to keep the credits visible.

Use the globe icon for **Map provider** to choose a mode from the **Google Maps** or **Mapbox** lists. A checkmark shows the current selection. Google Maps offers Roadmap and Satellite; Mapbox offers Roadmap, Satellite, Monochrome, and Outdoors. These basemaps are also available in the Map panel. The **Water flow** icon above it opens Play/Pause and Flow colors; playback requires simulation results. To enable Google Maps, fill in the empty setting in your local `.env`:

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

Enable the [Google Map Tiles API](https://developers.google.com/maps/documentation/tile/get-api-key) in a Google Cloud project with billing enabled. Restrict this browser-visible key to the Map Tiles API and your application websites, including localhost for local development. Restart the development server after setting the key; production deployments need a rebuild.

For a production server, run `pnpm build` after changing source code or public environment settings, then restart `pnpm start`. Restarting `pnpm start` alone continues serving the previous compiled interface. Use `pnpm dev` while editing to load source changes automatically.

Google tiles use expiring sessions that renew automatically. The map displays Google Maps attribution and the data-provider credits for the current viewport. Google basemaps remain unavailable while the key is empty; existing Mapbox basemaps remain available.
