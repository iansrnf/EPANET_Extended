export const buildCheckValveSvg = ({
  width = 64,
  height = 64,
  borderColor = "none",
  fillColor = "white",
  triangleColor = "black",
  lineColor = triangleColor,
  lineWidth = 70,
}: {
  width?: number;
  height?: number;
  borderColor?: string;
  triangleColor?: string;
  fillColor?: string;
  lineColor?: string;
  lineWidth?: number;
} = {}) => {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
         viewBox="0 0 815.5 815.5" shape-rendering="crispEdges">
      <g transform="rotate(-90,407.75,390)">
        <rect
          x="31.2"
          y="31.2"
          width="717.6"
          height="717.6"
          ry="171.86"
          style="fill:${fillColor};stroke:${borderColor};
                 stroke-width:35.5;stroke-linecap:round;stroke-linejoin:round"
        />
        <!-- Triangle tip nudged right to exactly meet the line -->
        <path
          d="M451.5,390 L190,645 V135 Z"
          style="fill:${triangleColor};stroke:${triangleColor};
                 stroke-width:47.11;stroke-linecap:round;stroke-linejoin:round"
        />
        <!-- Line returned to original x position -->
        <line
          x1="451.5"
          y1="135"
          x2="451.5"
          y2="645"
          style="stroke:${lineColor};stroke-width:${lineWidth};stroke-linecap:round"
        />
      </g>
    </svg>
  `;
};

export const buildPumpSvg = ({
  width = 64,
  height = 64,
  borderColor = "black",
  fillColor = "white",
  triangleColor = "black",
}: {
  width?: number;
  height?: number;
  borderColor?: string;
  fillColor?: string;
  triangleColor?: string;
}) => {
  return `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    width="${width}"
    height="${height}"
  >
    <!-- Circle -->
    <circle
      cx="50"
      cy="50"
      r="48"
      stroke="${borderColor}"
      stroke-width="2"
      fill="${fillColor}"
    />

    <!-- Isosceles triangle (arrow, slightly smaller) -->
    <polygon
      points="50,20 70,65 30,65"
      fill="${triangleColor}"
      stroke="${triangleColor}"
      stroke-width="2"
    />
  </svg>
  `;
};

export const buildPrvSvg = ({
  width = 64,
  height = 64,
  borderColor = "none",
  fillColor = "white",
  triangleColor = "black",
}: {
  width?: number;
  height?: number;
  borderColor?: string;
  triangleColor?: string;
  fillColor?: string;
} = {}) => {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 815.5 815.5" version="1.1">
  <g transform="rotate(-90,407.75,390)" style="stroke-width:62.4">
    <rect
      x="31.2"
      y="31.2"
      width="717.6"
      height="717.6"
      ry="171.86"
      style="fill:${fillColor};stroke:${borderColor};stroke-width:35.5;stroke-linecap:round;stroke-linejoin:round"
    />
    <path
      d="M436.8,390L600.6,239.57v299.95z"
      style="fill:${fillColor};stroke:${triangleColor};stroke-width:44.95;stroke-linecap:butt;stroke-linejoin:round"
    />
    <path
      d="M447.98,390L179.6,631.54V149.91z"
      style="fill:${triangleColor};stroke:${triangleColor};stroke-width:47.11;stroke-linecap:butt;stroke-linejoin:round"
    />
  </g>
</svg>

  `;
};

export const buildPsvSvg = ({
  width = 64,
  height = 64,
  borderColor = "none",
  fillColor = "white",
  triangleColor = "black",
}: {
  width?: number;
  height?: number;
  borderColor?: string;
  triangleColor?: string;
  fillColor?: string;
} = {}) => {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 815.5 815.5" version="1.1">
  <g transform="rotate(-90,407.75,390)" style="stroke-width:62.4">
    <rect
      x="31.2"
      y="31.2"
      width="717.6"
      height="717.6"
      ry="171.86"
      style="fill:${fillColor};stroke:${borderColor};stroke-width:35.5;stroke-linecap:round;stroke-linejoin:round"
    />
    <path
      d="M343.2,390L179.4,239.57v299.95z"
      style="fill:${triangleColor};stroke:${triangleColor};stroke-width:44.95;stroke-linecap:butt;stroke-linejoin:round"
    />
    <path
      d="M332.02,390L600.4,631.54V149.91z"
      style="fill:${fillColor};stroke:${triangleColor};stroke-width:47.11;stroke-linecap:butt;stroke-linejoin:round"
    />
  </g>
</svg>
  `;
};

export const buildGpvSvg = ({
  width = 64,
  height = 64,
  borderColor = "none",
  fillColor = "white",
  triangleColor = "black",
}: {
  width?: number;
  height?: number;
  borderColor?: string;
  triangleColor?: string;
  fillColor?: string;
} = {}) => {
  return `
  <svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width}"
  height="${height}"
  viewBox="0 0 815.5 815.5"
  version="1.1"
>
  <g transform="rotate(-90,407.75,390)" style="stroke-width:62.4">
    <rect
      x="31.2"
      y="31.2"
      width="717.6"
      height="717.6"
      ry="171.86"
      style="fill:${fillColor};stroke:${borderColor};stroke-width:35.5;stroke-linecap:round;stroke-linejoin:round"
    />
    <path
      d="M390.38,388.66L592.8,206.83v362.57z"
      style="fill:${triangleColor};stroke:${triangleColor};stroke-width:35.5;stroke-linecap:butt;stroke-linejoin:round"
    />
    <path
      d="M386.44,390L184.02,571.83V209.26z"
      style="fill:${triangleColor};stroke:${triangleColor};stroke-width:35.49;stroke-linecap:butt;stroke-linejoin:round"
    />
  </g>
</svg>
`;
};

export const buildFcvSvg = ({
  width = 64,
  height = 64,
  borderColor = "none",
  fillColor = "white",
  triangleColor = "black",
}: {
  width?: number;
  height?: number;
  borderColor?: string;
  triangleColor?: string;
  fillColor?: string;
} = {}) => {
  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width}"
  height="${height}"
  viewBox="0 0 815.5 815.5"
  version="1.1"
>
  <g transform="rotate(-90,407.75,390)" style="stroke-width:62.4">
    <rect
      x="-748.8"
      y="31.2"
      width="717.6"
      height="717.6"
      ry="171.86"
      style="fill:${fillColor};stroke:${borderColor};stroke-width:35.5;stroke-linecap:round;stroke-linejoin:round"
      transform="scale(-1,1)"
    />
    <path
      d="M389.62,388.66L187.2,206.83v362.57z"
      style="fill:${fillColor};stroke:${triangleColor};stroke-width:35.5;stroke-linecap:butt;stroke-linejoin:round"
    />
    <path
      d="M595.98,390l-202.42,181.83V209.26z"
      style="fill:${triangleColor};stroke:${triangleColor};stroke-width:35.5;stroke-linecap:butt;stroke-linejoin:round"
    />
  </g>
</svg>
`;
};

export const buildPbvSvg = ({
  width = 64,
  height = 64,
  borderColor = "none",
  fillColor = "white",
  triangleColor = "black",
}: {
  width?: number;
  height?: number;
  borderColor?: string;
  triangleColor?: string;
  fillColor?: string;
} = {}) => {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 815.5 815.5" version="1.1">
  <g transform="rotate(-90,407.75,390)" style="stroke-width:62.4">
    <rect
      x="31.2"
      y="31.2"
      width="717.6"
      height="717.6"
      ry="171.86"
      style="fill:${fillColor};stroke:${borderColor};stroke-width:35.5;stroke-linecap:round;stroke-linejoin:round"
    />
    <path
      d="M390.38,388.66L592.8,206.83v362.57z"
      style="fill:${fillColor};stroke:${triangleColor};stroke-width:35.5;stroke-linecap:butt;stroke-linejoin:round"
    />
    <path
      d="M386.44,390L184.02,571.83V209.26z"
      style="fill:${triangleColor};stroke:${triangleColor};stroke-width:35.5;stroke-linecap:butt;stroke-linejoin:round"
    />
    <path
      d="M390,195v382.2"
      style="fill:none;stroke:${triangleColor};stroke-width:35.5;stroke-linecap:round;stroke-linejoin:miter"
    />
  </g>
</svg>
`;
};

export const buildTankSvg = ({
  width = 64,
  height = 64,
  borderColor = "black",
  fillColor = "white",
}: {
  width?: number;
  height?: number;
  borderColor?: string;
  fillColor?: string;
}) => {
  const viewboxWidth = 32;
  const viewboxHeight = 32;

  const rectWidth = 28;
  const rectHeight = 22;

  const rectX = (viewboxWidth - rectWidth) / 2;
  const rectY = (viewboxHeight - rectHeight) / 2;

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 ${viewboxWidth} ${viewboxHeight}"
      fill="none"
      stroke="currentColor"
      width="${width}"
      height="${height}"
    >
      <rect
        x="${rectX}"
        y="${rectY}"
        width="${rectWidth}"
        height="${rectHeight}"
        stroke="${borderColor}"
        stroke-width="2"
        fill="${fillColor}"
        rx="2" />
    </svg>
  `;
};

export const buildReservoirSvg = ({
  width = 64,
  height = 64,
  borderColor = "black",
  fillColor = "white",
}: {
  width?: number;
  height?: number;
  borderColor?: string;
  fillColor?: string;
}) => {
  const viewboxWidth = 32;
  const viewboxHeight = 32;

  const triangleHeight = 24;
  const triangleBase = 28;

  const p1x = (viewboxWidth - triangleBase) / 2;
  const p1y = (viewboxHeight + triangleHeight) / 2;

  const p2x = (viewboxWidth + triangleBase) / 2;
  const p2y = (viewboxHeight + triangleHeight) / 2;

  const p3x = viewboxWidth / 2;
  const p3y = (viewboxHeight - triangleHeight) / 2;

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 ${viewboxWidth} ${viewboxHeight}"
      fill="none"
      stroke="currentColor"
      width="${width}"
      height="${height}"
    >
      <polygon
        points="${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}"
        stroke="${borderColor}"
        stroke-width="2"
        fill="${fillColor}"
      />
    </svg>
  `;
};

export const buildLoggerPointSvg = ({
  width = 64,
  height = 64,
  borderColor = "black",
  fillColor = "white",
  signalColor = "black",
  dropletColor = "black",
}: {
  width?: number;
  height?: number;
  borderColor?: string;
  fillColor?: string;
  signalColor?: string;
  dropletColor?: string;
}) => {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${width}" height="${height}" fill="none">
      <circle cx="12" cy="12" r="10" fill="${fillColor}" stroke="${borderColor}" stroke-width="2" />
      <rect x="9" y="7" width="6" height="8" rx="1.5" fill="none" stroke="${borderColor}" stroke-width="1.5" />
      <rect x="10" y="8" width="4" height="2" rx="0.5" fill="${signalColor}" opacity="0.4" />
      <path fill="${dropletColor}" d="M12 11 C11.2 12.2, 10.2 13.4, 10.2 14.4 A1.8 1.8 0 0 0 13.8 14.4 C13.8 13.4, 12.8 12.2, 12 11 Z" />
      <path d="M16.5 9.5 Q17.5 12 16.5 14.5" stroke="${signalColor}" stroke-width="1.5" stroke-linecap="round" />
      <path d="M18.5 8 Q20 12 18.5 16" stroke="${signalColor}" stroke-width="1.5" stroke-linecap="round" opacity="0.7" />
      <line x1="12" y1="15" x2="12" y2="17" stroke="${borderColor}" stroke-width="1.5" stroke-linecap="round" />
    </svg>
  `;
};
