import React, { memo, useId, useMemo, useRef, useState } from "react";
import type { User } from "src/auth-types";
import type { TranslateFn } from "src/hooks/use-translate";
import { FileInfo } from "src/components/file-info";
import * as DD from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { Tooltip } from "@epanet-js/ui-kit";
import { Button, DDContent, StyledItem } from "./elements";
import { GscwdBrand } from "./gscwd-brand";
import { GscwdWaterfront } from "./gscwd-waterfront";
import styles from "./menu-bar.module.css";
import { useTranslate } from "src/hooks/use-translate";
import { helpCenterUrl, roadmapUrl, utilitiesUrl } from "src/global-config";
import { useAuth } from "src/hooks/use-auth";
import { SignedIn, SignedOut, UserButton } from "src/components/auth";
import { useAccountManager } from "src/hooks/use-account-manager";
import { useOrganization } from "src/hooks/use-organization";
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
      <GscwdWaterfront className={styles.waterfront} variant="header" />
      <GscwdBrand />
    </header>
  );
}

export const HeaderLogoUpdated = () => {
  return <GscwdBrand />;
};

export const MenuBarPlay = memo(function MenuBar() {
  const translate = useTranslate();
  const showWelcome = useShowWelcome();
  const isMdOrLarger = useBreakpoint("md");
  const isSmOrLarger = useBreakpoint("sm");

  return (
    <header className={styles.header}>
      <GscwdWaterfront className={styles.waterfront} variant="header" />
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
        <AccountActions layout="navbar" showLogin={isMdOrLarger} />
        <SideMenu />
      </div>
    </header>
  );
});

export const MapAccountControls = ({
  compact = false,
}: {
  compact?: boolean;
}) => (
  <div
    className="map-account-controls map-overlay-theme map-overlay-surface pointer-events-auto flex shrink-0 items-center gap-1 rounded-md border px-1 py-1 shadow-lg"
    onKeyDown={(event) => event.stopPropagation()}
    onKeyPress={(event) => event.stopPropagation()}
    onKeyUp={(event) => event.stopPropagation()}
    onPointerDown={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}
  >
    {compact ? (
      <>
        <CompactMapAccountMenu />
        <SignedIn>
          <span className="shrink-0 [&_button]:min-h-11 [&_button]:min-w-11">
            <UserButton />
          </span>
        </SignedIn>
      </>
    ) : (
      <>
        <HelpDot floating />
        <LanguageSelector floating />
        <span aria-hidden="true" className="mx-1 h-5 border-l" />
        <AccountActions layout="floating" floating />
      </>
    )}
  </div>
);

export function HelpDot({
  floating = false,
  onNavigate,
}: {
  floating?: boolean;
  onNavigate?: () => void;
}) {
  const translate = useTranslate();
  const showWelcome = useShowWelcome();
  const showShortcuts = useShowShortcuts();
  const userTracking = useUserTracking();
  const scriptingDocs = useScriptingDocs();
  const MenuPortal = floating ? DD.Portal : React.Fragment;

  return (
    <DD.Root>
      <DD.Trigger asChild>
        <Button
          variant="quiet"
          size={floating ? "xxs" : undefined}
          aria-label={translate("help")}
          className={
            floating
              ? "h-11 min-w-11 justify-center px-2 text-size-small"
              : undefined
          }
        >
          {translate("help")}
        </Button>
      </DD.Trigger>
      <MenuPortal>
        <DDContent
          side="bottom"
          align="end"
          sideOffset={floating ? 6 : undefined}
          collisionPadding={floating ? 8 : undefined}
          className={
            floating
              ? "map-overlay-theme map-overlay-surface map-overlay-popover placemark-scrollbar z-50 max-w-[calc(100vw-1rem)] overflow-y-auto [&_[data-highlighted]]:bg-base-hover"
              : undefined
          }
          style={
            floating
              ? {
                  maxHeight:
                    "min(calc(100dvh - 1rem), var(--radix-dropdown-menu-content-available-height))",
                }
              : undefined
          }
          onKeyDown={floating ? (event) => event.stopPropagation() : undefined}
          onKeyPress={floating ? (event) => event.stopPropagation() : undefined}
          onKeyUp={floating ? (event) => event.stopPropagation() : undefined}
        >
          <StyledItem
            onSelect={() => {
              onNavigate?.();
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
              onNavigate?.();
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
              onNavigate?.();
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
              onNavigate?.();
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
                onNavigate?.();
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
              onNavigate?.();
              showShortcuts();
            }}
          >
            <KeyboardIcon />
            {translate("keyboardShortcuts.title")}
          </StyledItem>
        </DDContent>
      </MenuPortal>
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

const CompactMapAccountMenu = () => {
  const translate = useTranslate();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const navigatingRef = useRef(false);
  const closeForNavigation = () => {
    navigatingRef.current = true;
    setOpen(false);
    setTooltipOpen(false);
  };

  return (
    <Popover.Root
      modal={false}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setTooltipOpen(false);
      }}
    >
      <Tooltip
        content={translate("gscwd.navigation")}
        side="bottom"
        sideOffset={6}
        zIndex={60}
        className="map-overlay-theme map-overlay-surface map-overlay-tooltip pointer-events-none"
        open={tooltipOpen && !open}
        onOpenChange={setTooltipOpen}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={translate("gscwd.navigation")}
            className="flex h-11 w-11 items-center justify-center rounded-sm text-default hover:bg-base-hover focus-visible:outline-2 focus-visible:outline-accent aria-expanded:bg-accent-tint"
          >
            <MenuIcon aria-hidden="true" />
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={8}
          aria-labelledby={titleId}
          className="map-overlay-theme map-overlay-surface map-overlay-popover placemark-scrollbar z-50 w-64 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md border p-3 text-default shadow-xl outline-none"
          style={{
            maxHeight:
              "min(calc(100dvh - 1rem), var(--radix-popover-content-available-height))",
          }}
          onKeyDown={(event) => event.stopPropagation()}
          onKeyPress={(event) => event.stopPropagation()}
          onKeyUp={(event) => event.stopPropagation()}
          onCloseAutoFocus={(event) => {
            if (navigatingRef.current) {
              event.preventDefault();
              navigatingRef.current = false;
            }
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id={titleId} className="font-semibold text-accent">
              {translate("gscwd.navigation")}
            </h2>
            <Popover.Close asChild>
              <button
                type="button"
                aria-label={translate("dialog.close")}
                className="-mr-2 flex h-11 w-11 items-center justify-center rounded-sm text-subtle hover:bg-base-hover hover:text-default focus-visible:outline-2 focus-visible:outline-accent"
              >
                <CloseIcon aria-hidden="true" />
              </button>
            </Popover.Close>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <HelpDot floating onNavigate={closeForNavigation} />
            <LanguageSelector floating align="start" />
          </div>
          <hr className="my-3" />
          <AccountActions
            layout="sidebar"
            floating
            showUserButton={false}
            onNavigate={closeForNavigation}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

const AccountActions = ({
  layout,
  floating = false,
  showLogin = true,
  showUserButton = true,
  onNavigate,
}: {
  layout: "navbar" | "sidebar" | "floating";
  floating?: boolean;
  showLogin?: boolean;
  showUserButton?: boolean;
  onNavigate?: () => void;
}) => {
  const translate = useTranslate();
  const userTracking = useUserTracking();
  const { user } = useAuth();
  const setDialogState = useSetAtom(dialogAtom);
  const effectivePlan = useEffectivePlan();
  const { openOrganizationProfile } = useAccountManager();
  const { canManageOrganization } = usePermissions();
  const onOrgClick = canManageOrganization
    ? () => {
        onNavigate?.();
        openOrganizationProfile();
      }
    : undefined;
  const planLabel = <PlanLabel plan={effectivePlan} onOrgClick={onOrgClick} />;

  return (
    <>
      <SignedIn>
        <div className="relative flex items-center gap-x-2">
          <AccountSection layout={layout} floating={floating}>
            {effectivePlan === "free" ? (
              <TrialOrUpgradeButton
                user={user}
                translate={translate}
                size={layout === "sidebar" ? "full-width" : undefined}
                constrained={floating && layout === "floating"}
                onUpgrade={() => {
                  userTracking.capture({
                    name: "upgradeButton.clicked",
                    source: "menu",
                  });
                  onNavigate?.();
                  setDialogState({
                    type: "upgrade",
                    feature: "upgradeMenu",
                    source: "menu",
                  });
                }}
                onNavigate={onNavigate}
              />
            ) : floating && layout === "floating" ? (
              <BoundedAccountPlan>{planLabel}</BoundedAccountPlan>
            ) : (
              planLabel
            )}
            {showUserButton &&
              (floating ? (
                <span className="shrink-0">
                  <UserButton />
                </span>
              ) : (
                <UserButton />
              ))}
          </AccountSection>
        </div>
      </SignedIn>
      <SignedOut>
        <div
          className={
            layout === "sidebar"
              ? "flex w-full flex-col items-stretch gap-2"
              : "flex items-center gap-x-1"
          }
        >
          {showLogin && (
            <Button
              type="button"
              variant="default"
              size={floating ? "xxs" : undefined}
              disabled
              className={
                floating
                  ? "h-11 min-w-11 justify-center px-2 text-size-small"
                  : styles.accountButton
              }
            >
              {translate("login")}
            </Button>
          )}
          <Button
            type="button"
            variant="default"
            size={floating ? "xxs" : undefined}
            disabled
            className={
              floating
                ? "h-11 min-w-11 justify-center px-2 text-size-small"
                : styles.accountButton
            }
          >
            <UserIcon />
            {translate("register")}
          </Button>
        </div>
      </SignedOut>
    </>
  );
};

const BoundedAccountPlan = ({ children }: { children: React.ReactNode }) => {
  const { organization } = useOrganization();

  return (
    <span
      title={organization?.name}
      className="flex min-w-0 max-w-36 items-center overflow-hidden [&>button]:min-w-0 [&>button]:max-w-full [&>button]:truncate [&>span]:block [&>span]:truncate"
    >
      {children}
    </span>
  );
};

const AccountSection = ({
  children,
  layout,
  floating = false,
}: {
  children: React.ReactNode;
  layout: "navbar" | "sidebar" | "floating";
  floating?: boolean;
}) => {
  if (layout === "sidebar") {
    return (
      <div
        className={`flex flex-col items-start gap-2 ${floating ? "[&_button]:min-h-11 [&_button]:min-w-11" : ""}`}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className={
        layout === "floating"
          ? "flex min-w-0 items-center gap-x-2 [&_button]:min-h-11 [&_button]:min-w-11"
          : "hidden md:flex items-center gap-x-2"
      }
    >
      {children}
    </div>
  );
};

export const TrialOrUpgradeButton = ({
  user,
  translate,
  size,
  onUpgrade,
  onNavigate,
  constrained = false,
}: {
  user: User;
  translate: TranslateFn;
  size?: "full-width";
  onUpgrade: () => void;
  onNavigate?: () => void;
  constrained?: boolean;
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
        className={constrained ? "min-w-0 max-w-36" : undefined}
        title={constrained ? label : undefined}
        aria-label={constrained ? label : undefined}
      >
        <span
          className={`${colorClass} font-medium ${constrained ? "min-w-0 truncate" : ""}`}
        >
          {label}
        </span>
      </Button>
    );
  }

  if (!canUpgrade) return null;

  return (
    <Button
      variant="primary"
      size={size}
      onClick={onUpgrade}
      className={constrained ? "min-w-0 max-w-36" : undefined}
      title={constrained ? translate("upgrade") : undefined}
    >
      <UpgradeIcon />
      {translate("upgrade")}
    </Button>
  );
};
