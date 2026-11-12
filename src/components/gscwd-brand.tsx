import clsx from "clsx";
import gscwdLogo from "src/assets/images/logos/gscwd-logo.png";
import styles from "./gscwd-brand.module.css";

export const GscwdBrand = ({
  variant = "header",
  className,
}: {
  variant?: "header" | "welcome";
  className?: string;
}) => (
  <span className={clsx(styles.brand, styles[variant], className)}>
    <img
      src={gscwdLogo.src}
      alt=""
      width={200}
      height={200}
      className={styles.logo}
    />
    <span className={styles.wordmark}>
      <span className={styles.fullName}>
        <span>General Santos City</span>
        <span>Water District</span>
      </span>
      <span className={styles.shortName} aria-hidden="true">
        <span>GSCWD</span>
        <span>Water District</span>
      </span>
      <span className={styles.tagline}>
        Tubig at Serbisyo, Laging Konektado
      </span>
    </span>
  </span>
);
