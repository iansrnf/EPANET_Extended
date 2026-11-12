import React, { memo, useMemo, useRef, useState } from "react";
import type { User } from "src/auth-types";
import type { TranslateFn } from "src/hooks/use-translate";
import { FileInfo } from "src/components/file-info";
import * as DD from "@radix-ui/react-dropdown-menu";
import { Button, DDContent, StyledItem } from "./elements";
import { GscwdBrand } from "./gscwd-brand";
import { GscwdWaterfront } from "./gscwd-waterfront";
import styles from "./menu-bar.module.css";
import { useTranslate } from "src/hooks/use-translate";
import { helpCenterUrl, roadmapUrl, utilitiesUrl } from "src/global-config";
import { useAuth } from "src/hooks/use-auth";
import { SignedIn, SignedOut, UserButton } from "src/components/auth";
import { useAccountManager } from "src/hooks/use-account-manager";
import { useShowWelcome } from "src/commands/show-welcome";
import { useUserTracking } from "src/infra/user-tracking";
import { useShowShortcuts } from "src/commands/show-shortcuts";
import { TrialCta, resolveTrialCta } from "@epanet-js/account-plans";
import { useEffectivePlan } from "src/hooks/use-effective-plan";
import { usePermissions } from "src/hooks/use-permissions";
import { useBillingPortal } from "src/hooks/use-billing-portal";
import { PlanLabel } from "./plan-label";
import { useSetAtom } from "jotai";
import { dialogAtom } from "src/state/dialog";
import { useBreakpoint } from "src/hooks/use-breakpoint";
import { LanguageSelector } from "./language-selector";
import { useScriptingDocs } from "src/hooks/use-scripting-docs";
import { getScripting } from "src/lib/scripting";

import {
  GlobeIcon,
  HelpIcon,
  RoadmapIcon,
  UtilitiesIcon,
  KeyboardIcon,
  MenuIcon,
  UpgradeIcon,
  NewFromExampleIcon,
  CloseIcon,
  UserIcon,
  ScriptsIcon,
} from "src/icons";

export function MenuBarFallback() {
  return (
    <header className={styles.header}>
      <GscwdWaterfront className={styles.waterfront} />
      <GscwdBrand />
    </header>
  );
}

export const HeaderLogoUpdated = () => {
  return <GscwdBrand />;
};

export const MenuBarPlay = memo(function MenuBar() {
  const translate = useTranslate();
  const userTracking = useUserTracking();
  const { user } = useAuth();
  const setDialogState = useSetAtom(dialogAtom);
  const showWelcome = useShowWelcome();
  const isMdOrLarger = useBreakpoint("md");
  const isSmOrLarger = useBreakpoint("sm");
  const effectivePlan = useEffectivePlan();
  const { openOrganizationProfile } = useAccountManager();
  const { canManageOrganization } = usePermissions();

  return (
    <header className={styles.header}>
      <GscwdWaterfront className={styles.waterfront} />
      <div className={styles.identity}>
        <button
          type="button"
          className={styles.home}
          aria-label={translate("welcomePage")}
          title={translate("welcomePage")}
          onClick={() => showWelcome({ source: "menu" })}
        >
          <HeaderLogoUpdated />
        </button>
        {isSmOrLarger && (
          <div className={styles.file}>
            <FileInfo />
          </div>
        )}
      </div>
      <div className={styles.actions}>
        {isMdOrLarger && (
          <>
            <HelpDot />
            <LanguageSelector />
            <Divider />
          </>
        )}
        <SignedIn>
          <div className="relative flex items-center gap-x-2">
            <AccountSection layout="navbar">
              {effectivePlan === "free" ? (
                <TrialOrUpgradeButton
                  user={user}
                  translate={translate}
                  onUpgrade={() => {
                    userTracking.capture({
                      name: "upgradeButton.clicked",
                      source: "menu",
                    });
                    setDialogState({
                      type: "upgrade",
                      feature: "upgradeMenu",
                      source: "menu",
                    });
                  }}
                />
              ) : (
                <PlanLabel
                  plan={effectivePlan}
                  onOrgClick={
                    canManageOrganization
                      ? () => openOrganizationProfile()
                      : undefined
                  }
                />
              )}
              <UserButton />
            </AccountSection>
          </div>
        </SignedIn>
        <SignedOut>
          <div className="flex items-center gap-x-1">
            {isMdOrLarger && (
              <Button
                type="button"
                variant="default"
                disabled
                className={styles.accountButton}
              >
                {translate("login")}
              </Button>
            )}
            <Button
              type="button"
              variant="default"
              disabled
              className={styles.accountButton}
            >
              <UserIcon />
              {translate("register")}
            </Button>
          </div>
        </SignedOut>
        <SideMenu />
      </div>
    </header>
  );
});

export function HelpDot() {
  const translate = useTranslate();
  const showWelcome = useShowWelcome();
  const showShortcuts = useShowShortcuts();
  const userTracking = useUserTracking();
  const scriptingDocs = useScriptingDocs();

  return (
    <DD.Root>
      <DD.Trigger asChild>
        <Button variant="quiet">{translate("help")}</Button>
      </DD.Trigger>
      <DDContent side="bottom" align="end">
        <StyledItem
          onSelect={() => {
            showWelcome({ source: "menu" });
          }}
        >
          <NewFromExampleIcon />
          {translate("welcomePage")}
        </StyledItem>
        <a
          href={helpCenterUrl}
          target="_blank"
          onClick={() => {
            userTracking.capture({
              name: "helpCenter.visited",
              source: "menu",
            });
          }}
        >
          <StyledItem>
            <HelpIcon />
            {translate("helpCenter")}
          </StyledItem>
        </a>
        <a
          href={roadmapUrl}
          target="_blank"
          onClick={() => {
            userTracking.capture({
              name: "roadmap.visited",
              source: "menu",
            });
          }}
        >
          <StyledItem>
            <RoadmapIcon />
            {translate("roadmap")}
          </StyledItem>
        </a>
        <a
          href={utilitiesUrl}
          target="_blank"
          onClick={() => {
            userTracking.capture({
              name: "utilities.visited",
              source: "menu",
            });
          }}
        >
          <StyledItem>
            <UtilitiesIcon />
            {translate("utilities")}
          </StyledItem>
        </a>
        {getScripting() && (
          <a
            href={scriptingDocs.apiPath}
            target="_blank"
            onClick={() => {
              userTracking.capture({
                name: "scriptingApi.visited",
                source: "menu",
              });
            }}
          >
            <StyledItem>
              <ScriptsIcon />
              {translate("scripting.apiReference")}
            </StyledItem>
          </a>
        )}
        <StyledItem
          onSelect={() => {
            userTracking.capture({
              name: "shortcuts.opened",
              source: "menu",
            });
            showShortcuts();
          }}
        >
          <KeyboardIcon />
          {translate("keyboardShortcuts.title")}
        </StyledItem>
      </DDContent>
    </DD.Root>
  );
}

export const Divider = () => {
  return <div className="border-r-2 h-8 mr-1"></div>;
};

export const SideMenu = () => {
  const translate = useTranslate();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const userTracking = useUserTracking();
  const setDialogState = useSetAtom(dialogAtom);
  const showWelcome = useShowWelcome();
  const { user } = useAuth();
  const effectivePlan = useEffectivePlan();
  const { openOrganizationProfile } = useAccountManager();
  const { canManageOrganization } = usePermissions();
  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative">
      <div className="flex justify-end md:hidden">
        <Button
          className="h-11 w-11 justify-center"
          size="xxs"
          variant="quiet"
          aria-label={translate("gscwd.navigation")}
          aria-controls="gscwd-mobile-navigation"
          aria-expanded={isOpen}
          onClick={toggleMenu}
        >
          <MenuIcon />
        </Button>
      </div>

      <div
        id="gscwd-mobile-navigation"
        ref={menuRef}
        hidden={!isOpen}
        tabIndex={isOpen ? 0 : -1}
        className={`gscwd-sidebar fixed inset-y-0 right-0 w-full bg-base transform ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } transition-transform duration-300 ease-in-out md:hidden z-40`}
      >
        <div className="p-6">
          <div className="flex items-center justify-between pb-6">
            <HeaderLogoUpdated />
            <Button
              variant="quiet"
              className="h-11 w-11 justify-center"
              aria-label={translate("dialog.close")}
              onClick={toggleMenu}
            >
              <CloseIcon />
            </Button>
          </div>{" "}
          <nav aria-label={translate("gscwd.navigation")}>
            <ul className="flex flex-col items-start gap-2 text-default">
              <li>
                <Button variant="quiet">
                  <GlobeIcon />
                  <LanguageSelector align="start" padding={false} asChild />
                </Button>
              </li>
            </ul>
            <hr className="my-4" />
            <ul className="flex flex-col items-start gap-2 text-default">
              <li>
                <Button
                  variant="quiet"
                  onClick={() => {
                    setIsOpen(false);
                    showWelcome({ source: "menu" });
                  }}
                >
                  <NewFromExampleIcon />
                  {translate("welcomePage")}
                </Button>
              </li>

              <li>
                <a
                  href={helpCenterUrl}
                  target="_blank"
                  onClick={() => {
                    setIsOpen(false);
                    userTracking.capture({
                      name: "helpCenter.visited",
                      source: "menu",
                    });
                  }}
                >
                  <Button variant="quiet">
                    <HelpIcon />
                    {translate("helpCenter")}
                  </Button>
                </a>
              </li>
            </ul>
            <hr className="my-4" />
            <SignedIn>
              <AccountSection layout="sidebar">
                {effectivePlan !== "free" && (
                  <PlanLabel
                    plan={effectivePlan}
                    onOrgClick={
                      canManageOrganization
                        ? () => openOrganizationProfile()
                        : undefined
                    }
                  />
                )}
                {effectivePlan === "free" && (
                  <TrialOrUpgradeButton
                    user={user}
                    translate={translate}
                    size="full-width"
                    onUpgrade={() => {
                      userTracking.capture({
                        name: "upgradeButton.clicked",
                        source: "menu",
                      });
                      setIsOpen(false);
                      setDialogState({
                        type: "upgrade",
                        feature: "upgradeMenu",
                        source: "menu",
                      });
                    }}
                    onNavigate={() => setIsOpen(false)}
                  />
                )}
                <UserButton />
              </AccountSection>
            </SignedIn>
            <SignedOut>
              <ul className="flex-col items-start gap-4">
                <li>
                  <Button
                    type="button"
                    variant="default"
                    disabled
                    className={styles.accountButton}
                  >
                    {translate("login")}
                  </Button>
                </li>
                <li className="py-4">
                  <Button
                    type="button"
                    variant="default"
                    size="full-width"
                    disabled
                    className={styles.accountButton}
                  >
                    <UserIcon />
                    {translate("register")}
                  </Button>
                </li>
              </ul>
            </SignedOut>
          </nav>
        </div>
      </div>
    </div>
  );
};

const AccountSection = ({
  children,
  layout,
}: {
  children: React.ReactNode;
  layout: "navbar" | "sidebar";
}) => {
  if (layout === "sidebar") {
    return <div className="flex flex-col items-start gap-2">{children}</div>;
  }
  return <div className="hidden md:flex items-center gap-x-2">{children}</div>;
};

export const TrialOrUpgradeButton = ({
  user,
  translate,
  size,
  onUpgrade,
  onNavigate,
}: {
  user: User;
  translate: TranslateFn;
  size?: "full-width";
  onUpgrade: () => void;
  onNavigate?: () => void;
}) => {
  const { canUpgrade } = usePermissions();
  const userTracking = useUserTracking();
  const { openBillingPortal } = useBillingPortal();

  const trial = useMemo(() => {
    if (!canUpgrade) return { kind: "none" } as TrialCta;

    return resolveTrialCta(user);
  }, [canUpgrade, user]);

  if (trial.kind !== "none") {
    const isEnded = trial.kind === "ended";
    const label = isEnded
      ? translate("trial.expired")
      : translate("trial.status", trial.daysRemaining);
    const isUrgent = isEnded || trial.daysRemaining === 0;
    const colorClass = isUrgent ? "text-warning" : "text-accent-hover";

    const manageBilling = () => {
      userTracking.capture({
        name: "billingPortal.opened",
        source: "menu",
        trial: trial.kind,
      });
      onNavigate?.();
      openBillingPortal();
    };

    return (
      <Button
        variant="quiet"
        size={size}
        onClick={isEnded && !trial.payable ? onUpgrade : manageBilling}
      >
        <span className={`${colorClass} font-medium`}>{label}</span>
      </Button>
    );
  }

  if (!canUpgrade) return null;

  return (
    <Button variant="primary" size={size} onClick={onUpgrade}>
      <UpgradeIcon />
      {translate("upgrade")}
    </Button>
  );
};
