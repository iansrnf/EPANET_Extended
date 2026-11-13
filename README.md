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

## Google Maps basemaps

The map control starts collapsed and shows the current provider and mode. Click its header or chevron to expand or collapse the controls.

Use the **Map provider** control at the lower-left of the map to select **Google Maps** or **Mapbox**, then choose one of that provider's **Map mode** cards. Google Maps offers Roadmap and Satellite; Mapbox offers Roadmap, Satellite, Monochrome, and Outdoors. Switching providers keeps the current mode when it is available, otherwise it selects Roadmap. These basemaps are also available in the Map panel. To enable Google Maps, fill in the empty setting in your local `.env`:

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

Enable the [Google Map Tiles API](https://developers.google.com/maps/documentation/tile/get-api-key) in a Google Cloud project with billing enabled. Restrict this browser-visible key to the Map Tiles API and your application websites, including localhost for local development. Restart the development server after setting the key; production deployments need a rebuild.

For a production server, run `pnpm build` after changing source code or public environment settings, then restart `pnpm start`. Restarting `pnpm start` alone continues serving the previous compiled interface. Use `pnpm dev` while editing to load source changes automatically.

Google tiles use expiring sessions that renew automatically. The map displays Google Maps attribution and the data-provider credits for the current viewport. Google basemaps remain unavailable while the key is empty; existing Mapbox basemaps remain available.
