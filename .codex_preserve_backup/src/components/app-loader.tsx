import Image from "next/image";
import { LogoIcon } from "./elements";

type AppLoaderProps = {
  progress: number;
};

export const AppLoader = ({ progress }: AppLoaderProps) => {
  return (
    <div className="h-dvh flex items-center justify-center bg-white dark:bg-gray-800 brand-surface-subtle">
      <div className="text-center max-w-md mx-auto px-6">
        <div className="flex items-center justify-center gap-3">
          <span className="relative block h-12 w-12">
            <Image
              src="/images/logo-gscwd.png"
              alt="GSCWD logo"
              fill
              className="object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const fallback = e.currentTarget.nextElementSibling as
                  | HTMLElement
                  | undefined;
                if (fallback) fallback.style.display = "flex";
              }}
            />
            <span className="hidden absolute inset-0 items-center justify-center">
              <LogoIcon size={40} />
            </span>
          </span>
          <span className="text-xl font-semibold tracking-wide text-gray-900 dark:text-gray-100">
            GSCWD Epanet-JS
          </span>
        </div>
        <div className="w-full mt-6">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-purple-400 h-2 rounded-full transition-all duration-200 ease-in-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
