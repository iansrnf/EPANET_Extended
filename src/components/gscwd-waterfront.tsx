import clsx from "clsx";
import styles from "./gscwd-waterfront.module.css";

export const GscwdWaterfront = ({
  className,
  variant = "welcome",
}: {
  className?: string;
  variant?: "header" | "welcome";
}) => (
  <div
    className={clsx(
      styles.waterfront,
      variant === "header" && styles.header,
      className,
    )}
    aria-hidden="true"
  >
    <Skyline wide={variant === "header"} />
    <WaterWaves />
  </div>
);

const Skyline = ({ wide }: { wide: boolean }) => (
  <svg
    viewBox={wide ? "0 0 1800 170" : "420 0 480 170"}
    width={wide ? 1800 : 480}
    height="170"
    preserveAspectRatio={wide ? "xMaxYMax slice" : "xMidYMax meet"}
    focusable="false"
    className={styles.skyline}
    fill="none"
  >
    {wide && (
      <>
        <g fill="var(--gscwd-cyan)" opacity="0.16">
          <path d="M0 159v-31h24v-18h30v49h15V92h40v67h15v-44h30V82h29v77h17V67h44v92h15v-46h27V96h31v63h17V84h35v75h16v-42h29v-17h24v59Z" />
          <path d="M865 159v-48h24V96h30v63h17V74h39v85h17v-42h30V98h29v61h16V61h46v98h18v-47h34V89h31v70h17v-38h34v38Z" />
          <path d="M1200 159v-49h23V91h33v68h17V71h43v88h17v-37h30V97h34v62h18V57h45v102h18v-45h32V88h33v71h17V76h41v83h18v-47h31V95h32v64h18V64h44v95h18v-39h32V99h31v60h17v-32h29v32Z" />
          <path d="M211 67v-9h12V45h3v13h12v9ZM1077 61V50h12V37h3v13h12v11Z" />
          <path d="M1283 71V61h12V48h3v13h12v10ZM1426 57V46h12V33h3v13h12v11ZM1664 64V54h12V41h3v13h12v10Z" />
        </g>
        <g fill="var(--color-accent)" opacity="0.2">
          <path d="M15 159v-20h32v-14h32v34h17v-37h39v37h18v-25h30v-19h35v44h18v-35h37v35h17v-49h34v49h18v-23h29v-14h31v37Z" />
          <path d="M872 159v-25h39v25h19v-36h33v36h17v-23h30v-21h34v44h18v-38h38v38h17v-28h27v-17h32v45h18v-22h26v22Z" />
          <path d="M1212 159v-24h37v24h17v-38h35v38h18v-23h29v-19h34v42h18v-36h39v36h17v-26h29v-17h35v43h18v-40h38v40h17v-23h31v-19h33v42h18v-36h37v36h18v-22h28v-14h31v36h18v-26h29v26Z" />
        </g>
        <g fill="var(--color-white)" opacity="0.28">
          <path d="M78 101h6v8h-6Zm14 0h6v8h-6Zm-14 15h6v8h-6Zm14 0h6v8h-6ZM210 78h6v8h-6Zm15 0h6v8h-6Zm-15 15h6v8h-6Zm15 0h6v8h-6ZM944 84h6v8h-6Zm15 0h6v8h-6Zm-15 15h6v8h-6Zm15 0h6v8h-6ZM1078 72h6v8h-6Zm16 0h6v8h-6Zm-16 16h6v8h-6Zm16 0h6v8h-6Z" />
          <path d="M1283 81h6v8h-6Zm16 0h6v8h-6Zm-16 16h6v8h-6Zm16 0h6v8h-6ZM1425 68h6v8h-6Zm16 0h6v8h-6Zm-16 16h6v8h-6Zm16 0h6v8h-6ZM1540 86h6v8h-6Zm16 0h6v8h-6ZM1663 74h6v8h-6Zm16 0h6v8h-6Zm-16 16h6v8h-6Zm16 0h6v8h-6Z" />
        </g>
      </>
    )}
    <g fill="var(--gscwd-cyan)" opacity="0.16">
      <path d="M435 145V104h18V91h24v54h13V72h31v73h15V98h21V82h23v63h14V59h36v86h17V91h29v54h13V78h20V66h22v79h17V106h20V93h31v52h14V83h34v62h16V111h29v34h27v10H421v-10Z" />
      <path d="M501 72V64h8V51h3v13h9v8ZM607 59V48h10V34h3v14h10v11ZM763 83V74h12V61h3v13h19v9Z" />
    </g>
    <g fill="var(--color-accent)" opacity="0.2">
      <path d="M489 149V113h27V98h23v51h18V89h34v60h15V112h27V97h27v52h21V112h22V99h23v50h19V121h32V106h29v43h19V119h29v30h19v10H468v-10Z" />
      <path d="M697 40h65l-5 31-13 8h-29l-13-8ZM694 39l35-13 36 13ZM711 78h5l-8 70h-5ZM743 78h5l9 70h-5Z" />
      <path d="M710 104h39v4h-39ZM707 130h46v4h-46Z" />
    </g>
    <g stroke="var(--gscwd-cyan)" strokeWidth="2" opacity="0.22">
      <path d="m713 83 35 49m-3-49-36 49M726 27V16" />
    </g>
    <g fill="var(--color-white)" opacity="0.28">
      <path d="M498 81h4v7h-4ZM510 81h4v7h-4ZM498 95h4v7h-4ZM510 95h4v7h-4ZM603 68h5v8h-5ZM617 68h5v8h-5ZM603 84h5v8h-5ZM617 84h5v8h-5ZM603 100h5v8h-5ZM617 100h5v8h-5ZM566 99h5v7h-5ZM578 99h5v7h-5ZM566 113h5v7h-5ZM578 113h5v7h-5ZM640 108h5v7h-5ZM650 108h5v7h-5ZM771 91h5v8h-5ZM784 91h5v8h-5ZM780 116h5v7h-5ZM792 116h5v7h-5Z" />
    </g>
  </svg>
);

const WaterWaves = () => (
  <svg
    viewBox="0 0 900 170"
    preserveAspectRatio="none"
    focusable="false"
    className={styles.waves}
    fill="none"
  >
    <path
      d="M0 126C92 122 125 62 244 62c142 0 189 67 327 73 139 6 224-25 329-10v45H0Z"
      fill="var(--gscwd-cyan)"
      opacity="0.15"
    />
    <path
      d="M0 146c113-1 145-65 267-63 141 2 191 66 326 63 121-3 204-30 307-9v33H0Z"
      fill="var(--gscwd-cyan)"
      opacity="0.3"
    />
    <path
      d="M0 164c105-8 157-59 277-56 142 3 203 55 348 48 109-6 181-27 275-6v20H0Z"
      fill="var(--gscwd-cyan)"
      opacity="0.65"
    />
    <path
      d="M0 170c111-8 185-45 296-39 142 8 209 47 359 31 91-10 169-17 245-2v10Z"
      fill="var(--color-accent)"
      opacity="0.85"
    />
  </svg>
);
