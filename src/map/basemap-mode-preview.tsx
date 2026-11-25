import type { BasemapModeId } from "./basemap-providers";

export const BasemapModePreview = ({ mode }: { mode: BasemapModeId }) => (
  <svg
    viewBox="0 0 120 48"
    className="h-12 w-full"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
    focusable="false"
  >
    <rect
      width="120"
      height="48"
      className="fill-current text-subtle"
      opacity="0.06"
    />
    {mode === "black" && (
      <>
        <rect width="120" height="48" fill="#10151d" />
        <g className="fill-current text-subtle" opacity="0.14">
          <path d="M0 0h30v13H0zM38 0h29v13H38zM75 0h45v13H75zM0 21h30v27H0zM38 21h29v27H38zM75 21h45v27H75z" />
        </g>
        <path d="M86 24h26v18H86z" fill="#102a43" opacity="0.2" />
        <path
          d="M-4 40 14 31h20V17h37V-4M71 17h53"
          stroke="#3b82f6"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="71" cy="17" r="3" fill="#3b82f6" />
      </>
    )}
    {mode === "satellite" && (
      <>
        <rect
          width="120"
          height="48"
          className="fill-current text-success"
          opacity="0.18"
        />
        <g className="fill-current text-success" opacity="0.24">
          <path d="M0 0h39l-7 20L0 27zM46 0h30l-3 16-33 4zM0 35l28-7 11 20H0zM82 24l38-9v33H92z" />
        </g>
        <path
          d="M83-5C66 5 95 15 73 25S51 38 65 54"
          className="stroke-current text-info"
          fill="none"
          strokeWidth="10"
          opacity="0.45"
        />
        <path
          d="M-4 39 42 24l82 7"
          className="stroke-current text-subtle"
          fill="none"
          strokeWidth="2"
          opacity="0.6"
        />
      </>
    )}
  </svg>
);
