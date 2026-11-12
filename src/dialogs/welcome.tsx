import { useNewProject } from "src/commands/create-new-project";
import { useOpenDemoNetwork } from "src/commands/open-demo-network";
import { useOpenModelBuilder } from "src/commands/open-model-builder";
import { useOpenProject } from "src/commands/open-project";
import { useOpenRecentFile } from "src/commands/open-recent-file";
import { useTranslate } from "src/hooks/use-translate";
import { useAuth } from "src/hooks/use-auth";
import { useRecentFiles } from "src/hooks/use-recent-files";
import { useUserTracking } from "src/infra/user-tracking";
import { languageConfig } from "@epanet-js/i18n/locale";
import { useLocale, LocaleProvider } from "src/hooks/use-locale";
import {
  helpCenterUrl,
  landingPageUrl,
  privacyPolicyUrl,
  quickStartTutorialUrl,
  termsAndConditionsUrl,
} from "src/global-config";
import { Button, Loading } from "../components/elements";
import { GscwdBrand } from "src/components/gscwd-brand";
import { GscwdWaterfront } from "src/components/gscwd-waterfront";
import {
  ArrowRightIcon,
  CloseIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FolderOpenIcon,
  GlobeIcon,
  HelpIcon,
  EarlyAccessIcon,
} from "src/icons";
import { BaseDialog, useDialogState } from "../components/dialog";
import * as Dialog from "@radix-ui/react-dialog";
import { Callout } from "@epanet-js/ui-kit";
import { DRUMCHAPEL, WATERDOWN } from "src/demo/demo-networks";
import { useIsDrawingAvailable } from "src/hooks/use-is-drawing-available";
import { useIsModelBuilderAvailable } from "src/hooks/use-is-model-builder-available";
import type { RecentFileEntry } from "src/lib/recent-files";
import Image from "next/image";

export const WelcomeDialog = () => {
  const translate = useTranslate();
  const createNew = useNewProject();
  const openProject = useOpenProject();
  const openModelBuilder = useOpenModelBuilder();
  const userTracking = useUserTracking();
  const isDrawingAvailable = useIsDrawingAvailable();
  const isModelBuilderAvailable = useIsModelBuilderAvailable();
  const { isSignedIn, isLoaded } = useAuth();
  const showEarlyAccess = isLoaded && !isSignedIn;
  const currentLocale = useLocale();
  const currentLanguage = languageConfig.find(
    (lang) => lang.code === currentLocale.locale,
  );
  const isExperimental = currentLanguage?.experimental ?? false;
  const { closeDialog } = useDialogState();

  return (
    <BaseDialog
      size="xl"
      accessibleTitle={translate("gscwd.welcome")}
      isOpen={true}
      onClose={closeDialog}
      contentStyle={{ borderRadius: 24, overflow: "hidden" }}
      overlayClassName="gscwd-welcome-overlay"
    >
      <LocaleProvider>
        <div className="gscwd-welcome">
          <Dialog.Close
            className="gscwd-welcome-close"
            aria-label={translate("dialog.close")}
          >
            <CloseIcon />
          </Dialog.Close>
          <aside className="gscwd-welcome-sidebar">
            <GscwdBrand variant="welcome" />
            <div className="gscwd-workspace-label">
              <span aria-hidden="true" />
              {translate("gscwd.workspace")}
            </div>
            <nav
              className="gscwd-welcome-actions"
              aria-label={translate("gscwd.projectActions")}
            >
              {isDrawingAvailable && (
                <Button
                  variant="quiet"
                  className="gscwd-welcome-action gscwd-welcome-action-start"
                  onClick={() => void createNew({ source: "welcome" })}
                >
                  <FileIcon />
                  {translate("startBlankProject")}
                  <ArrowRightIcon className="ml-auto" />
                </Button>
              )}
              <Button
                variant="quiet"
                className="gscwd-welcome-action"
                onClick={() => openProject({ source: "welcome" })}
              >
                <FolderOpenIcon />
                {translate("openModel")}
              </Button>
              {isModelBuilderAvailable && (
                <Button
                  variant="quiet"
                  className="gscwd-welcome-action"
                  onClick={() => openModelBuilder({ source: "welcome" })}
                >
                  <GlobeIcon />
                  {translate("importFromGIS")}
                  {showEarlyAccess && <EarlyAccessIcon size="sm" />}
                </Button>
              )}
              <a
                className="gscwd-welcome-action gscwd-help-link"
                href={helpCenterUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  userTracking.capture({
                    name: "helpCenter.visited",
                    source: "welcome",
                  })
                }
              >
                <HelpIcon />
                {translate("helpCenter")}
              </a>
              <a
                className="gscwd-quick-start"
                href={quickStartTutorialUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  userTracking.capture({
                    name: "quickStart.visited",
                    source: "welcome",
                  })
                }
              >
                {translate("quickStartTutorial")}
                <ArrowRightIcon />
              </a>
            </nav>
            <div className="gscwd-welcome-legal">
              <a
                href={termsAndConditionsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {translate("termsAndConditions")}
              </a>
              <a
                href={privacyPolicyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {translate("privacyPolicy")}
              </a>
            </div>
            <div className="gscwd-sidebar-message">
              <WaterMark />
              <p>{translate("gscwd.servicePromise")}</p>
              <span>General Santos City</span>
            </div>
          </aside>
          <section
            className="gscwd-welcome-content"
            aria-labelledby="gscwd-welcome-title"
          >
            <div className="gscwd-welcome-intro">
              <p className="gscwd-eyebrow">{translate("gscwd.welcome")}</p>
              <h1 id="gscwd-welcome-title">
                {translate("gscwd.welcomeTitle")}
              </h1>
              <p className="gscwd-welcome-description">
                {translate("gscwd.welcomeDescription")}
              </p>
            </div>
            {isExperimental && (
              <Callout
                variant="info"
                title={translate("startNotificationLanguageTitle")}
                className="border rounded-lg mb-4"
              >
                {translate("startNotificationLanguageDescription")}
              </Callout>
            )}
            <RecentNetworks />
            <footer className="gscwd-welcome-footer">
              <WaterMark />
              <div>
                <p>{translate("gscwd.footerTitle")}</p>
                <span>General Santos City Water District</span>
              </div>
              <span className="gscwd-footer-line" aria-hidden="true" />
            </footer>
          </section>
          <GscwdWaterfront className="gscwd-welcome-waterfront" />
        </div>
        <div className="md:hidden p-4 border-t">
          <SmallDeviceWarning />
        </div>
      </LocaleProvider>
    </BaseDialog>
  );
};

const WaterMark = () => (
  <svg
    viewBox="0 0 32 40"
    fill="none"
    aria-hidden="true"
    className="gscwd-water-mark"
  >
    <path
      d="M16 2S3 17 3 25a13 13 0 0 0 26 0C29 17 16 2 16 2Z"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path
      d="M8 26c0 5 4 8 8 8M9 22c5-5 9 5 15 0"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const SmallDeviceWarning = () => {
  const translate = useTranslate();
  return (
    <Callout
      variant="warning"
      title={translate("headsUpSmallScreen")}
      className="border rounded-lg"
    >
      <p>{translate("smallScreenExplain")}</p>
      <hr className="my-4" />
      <p className="pb-2">{translate("hereYourOptions")}:</p>
      <ul className="ml-2 space-y-2">
        <li>
          <strong>{translate("continueAnyway")}</strong>:{" "}
          {translate("continueAnywayExplain")}
        </li>
        <li>
          <a className="underline" href={quickStartTutorialUrl}>
            <strong>{translate("watchQuickDemo")}</strong>
          </a>
          : {translate("watchQuickDemoExplain")}
        </li>
        <li>
          <a className="underline" href={landingPageUrl}>
            <strong>{translate("visitLandingPage")}</strong>
          </a>
          : {translate("visitLandingPageExplain")}
        </li>
      </ul>
    </Callout>
  );
};

const DemoNetworks = () => {
  const translate = useTranslate();
  return (
    <section className="gscwd-networks" aria-labelledby="gscwd-demo-title">
      <div className="gscwd-section-heading">
        <h2 id="gscwd-demo-title">{translate("demoNetworksTitle")}</h2>
        <span>{translate("gscwd.sampleModels")}</span>
      </div>
      <p className="gscwd-section-description">
        {translate("gscwd.demoDescription")}
      </p>
      <div className="gscwd-demo-grid">
        <DemoNetworkCard
          demoNetwork={{
            ...DRUMCHAPEL,
            description: translate("demoUKStyleDescription"),
          }}
        />
        <DemoNetworkCard
          demoNetwork={{
            ...WATERDOWN,
            description: translate("demoUSStyleDescription"),
          }}
        />
      </div>
    </section>
  );
};

const RecentNetworks = () => {
  const translate = useTranslate();
  const { recentFiles, isLoading, removeRecent, isSupported } =
    useRecentFiles();
  const openRecentFile = useOpenRecentFile();

  if (!isSupported || (!isLoading && recentFiles.length === 0))
    return <DemoNetworks />;
  if (isLoading)
    return (
      <div className="flex h-[300px]">
        <Loading />
      </div>
    );

  return (
    <section className="gscwd-networks" aria-labelledby="gscwd-recent-title">
      <div className="gscwd-section-heading">
        <h2 id="gscwd-recent-title">{translate("recentNetworks")}</h2>
      </div>
      <div className="gscwd-recent-grid scroll-shadows">
        {recentFiles.map((entry) => (
          <RecentFileCard
            key={entry.id}
            entry={entry}
            onOpen={() => openRecentFile(entry, "welcome")}
            onRemove={() => void removeRecent(entry.id)}
          />
        ))}
        <DemoNetworkCard
          demoNetwork={{
            ...DRUMCHAPEL,
            description: translate("demoUKStyleDescription"),
          }}
          compact
        />
        <DemoNetworkCard
          demoNetwork={{
            ...WATERDOWN,
            description: translate("demoUSStyleDescription"),
          }}
          compact
        />
      </div>
    </section>
  );
};

const RecentFileCard = ({
  entry,
  onOpen,
  onRemove,
}: {
  entry: RecentFileEntry;
  onOpen: () => void;
  onRemove: () => void;
}) => {
  const translate = useTranslate();
  const { locale } = useLocale();
  return (
    <div className="gscwd-recent-card">
      <button
        type="button"
        className="gscwd-network-card gscwd-network-card-compact"
        onClick={onOpen}
      >
        <div className="gscwd-card-preview">
          {entry.thumbnail ? (
            <img
              src={entry.thumbnail}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <FileSpreadsheetIcon />
          )}
        </div>
        <div className="gscwd-card-copy">
          <span className="gscwd-card-name" title={entry.name}>
            {entry.name}
          </span>
          <span className="gscwd-card-description">
            {new Date(entry.openedAt).toLocaleString(locale)}
          </span>
        </div>
      </button>
      <button
        type="button"
        className="gscwd-remove-recent"
        onClick={onRemove}
        aria-label={translate("gscwd.removeRecent", entry.name)}
      >
        <CloseIcon />
      </button>
    </div>
  );
};

type DemoModel = {
  name: string;
  description: string;
  url: string;
  thumbnailUrl: string;
};

const DemoNetworkCard = ({
  demoNetwork,
  compact = false,
}: {
  demoNetwork: DemoModel;
  compact?: boolean;
}) => {
  const translate = useTranslate();
  const userTracking = useUserTracking();
  const { openDemoNetwork } = useOpenDemoNetwork();
  const handleOpenDemoModel = () => {
    userTracking.capture({
      name: "exampleModel.clicked",
      modelName: demoNetwork.name,
    });
    void openDemoNetwork(demoNetwork.url);
  };
  return (
    <button
      type="button"
      className={
        compact
          ? "gscwd-network-card gscwd-network-card-compact"
          : "gscwd-network-card"
      }
      onClick={handleOpenDemoModel}
    >
      <div className="gscwd-card-preview">
        <Image
          src={demoNetwork.thumbnailUrl}
          alt=""
          width={400}
          height={240}
          quality={90}
          className="w-full h-full object-cover"
        />
        <span className="gscwd-demo-badge">{translate("demoShort")}</span>
      </div>
      <div className="gscwd-card-copy">
        <div className="flex items-center gap-3 min-w-0">
          {!compact && <WaterMark />}
          <span className="gscwd-card-name">{demoNetwork.name}</span>
          <ArrowRightIcon className="ml-auto shrink-0 text-accent" />
        </div>
        <span className="gscwd-card-description">
          {demoNetwork.description}
        </span>
      </div>
    </button>
  );
};
