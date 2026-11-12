import { GscwdBrand } from "./gscwd-brand";

type AppLoaderProps = {
  progress: number;
};

export const AppLoader = ({ progress }: AppLoaderProps) => {
  return (
    <div className="h-dvh flex items-center justify-center bg-popover">
      <div className="text-center max-w-md mx-auto px-6">
        <div className="flex justify-center">
          <GscwdBrand variant="welcome" />
        </div>
        <div className="w-full mt-6">
          <div className="w-full bg-track rounded-full h-2">
            <div
              className="bg-accent h-2 rounded-full transition-all duration-200 ease-in-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
