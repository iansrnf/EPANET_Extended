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
    {mode === "roadmap" && (
      <>
        <g className="fill-current text-subtle" opacity="0.14">
          <path d="M0 0h30v13H0zM38 0h29v13H38zM75 0h45v13H75zM0 21h30v27H0zM38 21h29v27H38zM75 21h45v27H75z" />
        </g>
        <path
          d="M86 24h26v18H86z"
          className="fill-current text-success"
          opacity="0.2"
        />
        <path
          d="M-4 40 14 31h20V17h37V-4M71 17h53"
          className="stroke-current text-accent"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="71" cy="17" r="3" className="fill-current text-accent" />
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
    {mode === "monochrome" && (
      <>
        <g className="fill-current text-subtle" opacity="0.2">
          <path d="M0 0h25v15H0zM32 0h31v15H32zM70 0h23v15H70zM100 0h20v15h-20zM0 23h25v25H0zM32 23h31v25H32zM70 23h23v25H70zM100 23h20v25h-20z" />
        </g>
        <path
          d="M-5 45 42 19h83M67-4v56"
          className="stroke-current text-subtle"
          fill="none"
          strokeWidth="2"
          opacity="0.45"
        />
      </>
    )}
    {mode === "outdoors" && (
      <>
        <path
          d="M0 48V30L23 8l22 23L72 5l48 43z"
          className="fill-current text-success"
          opacity="0.14"
        />
        <g className="stroke-current text-success" fill="none" opacity="0.4">
          <path d="M-7 32C11 5 23 1 39 17s22 19 34 4 30-13 54 3" />
          <path d="M-7 41C11 14 23 10 39 26s22 19 34 4 30-13 54 3" />
          <path d="M-7 50C11 23 23 19 39 35s22 19 34 4 30-13 54 3" />
        </g>
        <path
          d="M24 52 46 32l17 5 31-30"
          className="stroke-current text-accent"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="3 3"
        />
      </>
    )}
  </svg>
);
