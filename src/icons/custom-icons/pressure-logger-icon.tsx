import React from "react";
import { CustomIconProps, getPixels } from "..";

export const CustomPressureLoggerIcon = React.forwardRef<
  SVGSVGElement,
  CustomIconProps
>(({ size: rawSize = "md", ...props }, ref) => {
  const size = getPixels(rawSize);

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="5" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M3 9v6" />
      <path d="M3 12h2" />
      <rect x="10" y="7" width="6" height="4.5" rx="1" />
      <circle cx="8" cy="7.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="8" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="15.5" r="2.4" />
      <path d="M7.6 15.5h3.8" />
      <circle cx="15" cy="15.5" r="2.4" />
      <path d="M13.4 13.9l3.2 3.2" />
      <path d="M18 6.5h1.5" />
      <path d="M18 9.5h1.5" />
      <path d="M18 12.5h1.5" />
      <path d="M18 15.5h1.5" />
    </svg>
  );
});

CustomPressureLoggerIcon.displayName = "CustomPressureLoggerIcon";
