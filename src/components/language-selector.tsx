import React from "react";
import { Locale, languageConfig } from "@epanet-js/i18n/locale";
import * as DD from "@radix-ui/react-dropdown-menu";
import { Tooltip } from "@epanet-js/ui-kit";
import { Button, DDContent, StyledItem } from "./elements";
import { useTranslate } from "src/hooks/use-translate";
import { useLocale } from "src/hooks/use-locale";
import { useUserTracking } from "src/infra/user-tracking";
import { CheckIcon, WarningIcon } from "src/icons";

export const LanguageSelector = ({
  align = "end",
  padding = true,
  asChild = false,
  floating = false,
}: {
  align?: "start" | "center" | "end";
  padding?: boolean;
  asChild?: boolean;
  floating?: boolean;
}) => {
  const translate = useTranslate();
  const { locale, setLocale } = useLocale();
  const userTracking = useUserTracking();

  const availableLanguages = languageConfig;
  const MenuPortal = floating ? DD.Portal : React.Fragment;

  const handleLanguageChange = (newLocale: Locale) => {
    userTracking.capture({
      name: "language.changed",
      language: newLocale,
    });
    void setLocale(newLocale);
  };

  return (
    <DD.Root
      onOpenChange={(open) => {
        if (open) {
          userTracking.capture({ name: "languageList.opened" });
        }
      }}
    >
      <DD.Trigger asChild>
        {asChild ? (
          <span className={padding ? "" : "p-0!"}>{translate("language")}</span>
        ) : (
          <Button
            variant="quiet"
            size={floating ? "xxs" : undefined}
            aria-label={translate("language")}
            className={
              floating
                ? "h-11 min-w-11 justify-center px-2 text-size-small"
                : padding
                  ? ""
                  : "p-0!"
            }
          >
            {translate("language")}
          </Button>
        )}
      </DD.Trigger>
      <MenuPortal>
        <DDContent
          side="bottom"
          align={align}
          sideOffset={floating ? 6 : undefined}
          collisionPadding={floating ? 8 : undefined}
          className={
            floating
              ? "map-overlay-theme map-overlay-surface map-overlay-popover placemark-scrollbar z-50 min-w-32 max-w-[calc(100vw-1rem)] overflow-y-auto [&_[data-highlighted]]:bg-base-hover"
              : "min-w-32"
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
          {availableLanguages.map((language) => {
            const item = (
              <StyledItem
                key={language.code}
                onSelect={() => handleLanguageChange(language.code)}
              >
                <div className="flex items-center w-full gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <span>{language.name}</span>
                    {language.experimental && (
                      <WarningIcon className="text-warning" />
                    )}
                  </div>
                  <div className="w-4 h-4 flex items-center justify-center">
                    {locale === language.code && (
                      <CheckIcon className="text-accent" />
                    )}
                  </div>
                </div>
              </StyledItem>
            );
            return language.experimental ? (
              <Tooltip
                key={language.code}
                content={translate("experimentalLanguage")}
                variant="contrast"
                side="top"
                sideOffset={5}
                delayDuration={500}
                zIndex={floating ? 60 : 50}
                className={
                  floating
                    ? "map-overlay-theme map-overlay-surface map-overlay-tooltip"
                    : undefined
                }
              >
                {item}
              </Tooltip>
            ) : (
              item
            );
          })}
        </DDContent>
      </MenuPortal>
    </DD.Root>
  );
};
