import { useClerk as useClerkUnsafe } from "@clerk/nextjs";
import { isAuthEnabled } from "src/global-config";

export const useClerk = isAuthEnabled
  ? useClerkUnsafe
  : () => ({
      openOrganizationProfile: () => {},
    });
