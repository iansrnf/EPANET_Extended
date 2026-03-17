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
      <path d="M12 4V2.5" />
      <rect x="7" y="4.5" width="10" height="15" rx="2.5" />
      <path d="M10 9.5a2 2 0 1 1 4 0" />
      <path d="M12 9.5v2.5" />
      <path d="M9.5 15.5h5" />
      <circle cx="16.5" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
});

CustomPressureLoggerIcon.displayName = "CustomPressureLoggerIcon";
