import * as React from "react";
import { CustomIconProps, getPixels } from "../index";

export const CustomWaterLoggerIcon = React.forwardRef<
  SVGSVGElement,
  CustomIconProps & {
    dropletFillColor?: string;
    signalColor?: string;
  }
>(
  (
    {
      size: rawSize = "md",
      dropletFillColor = "currentColor",
      signalColor = "currentColor",
      ...props
    },
    ref,
  ) => {
    const size = getPixels(rawSize);

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        width={size}
        height={size}
        {...props}
      >
        <g>
          {/* Outer circle (same style as pump icon for consistency) */}
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />

          {/* Logger device body */}
          <rect
            x="9"
            y="7"
            width="6"
            height="8"
            rx="1.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />

          {/* Small screen */}
          <rect
            x="10"
            y="8"
            width="4"
            height="2"
            rx="0.5"
            fill="currentColor"
            opacity="0.4"
          />

          {/* Water droplet */}
          <path
            fill={dropletFillColor}
            d="
              M12 11
              C11.2 12.2, 10.2 13.4, 10.2 14.4
              A1.8 1.8 0 0 0 13.8 14.4
              C13.8 13.4, 12.8 12.2, 12 11
              Z
            "
          />

          {/* Signal waves (logger transmitting data) */}
          <path
            d="M16.5 9.5 Q17.5 12 16.5 14.5"
            stroke={signalColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            opacity="0.8"
          />

          <path
            d="M18.5 8 Q20 12 18.5 16"
            stroke={signalColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
            opacity="0.6"
          />

          {/* Bottom connector */}
          <line
            x1="12"
            y1="15"
            x2="12"
            y2="17"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>
      </svg>
    );
  },
);

CustomWaterLoggerIcon.displayName = "CustomWaterLoggerIcon";
