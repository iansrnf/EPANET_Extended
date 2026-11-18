type ModelBuilderUrlOptions = {
  url: string;
  enabledFlags: string[];
  locale: string;
  access: "full" | "limited";
  embedded: boolean;
};

export const buildModelBuilderUrl = ({
  url,
  enabledFlags,
  locale,
  access,
  embedded,
}: ModelBuilderUrlOptions): string => {
  const builderUrl = new URL(url);
  for (const flag of enabledFlags) {
    builderUrl.searchParams.set(flag, "true");
  }
  builderUrl.searchParams.set("locale", locale);
  builderUrl.searchParams.set("access", access);
  if (embedded) builderUrl.searchParams.set("embedded", "true");
  else builderUrl.searchParams.delete("embedded");
  return builderUrl.toString();
};
