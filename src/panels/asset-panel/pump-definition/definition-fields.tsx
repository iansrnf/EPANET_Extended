import type { ReactNode } from "react";
import { localizeDecimal } from "@epanet-js/i18n";
import { NumericField } from "src/components/form/numeric-field";

export const DefinitionNumberField = ({
  label,
  value,
  unit,
  onChange,
  readOnly = false,
  validate,
}: {
  label: string;
  value: number;
  unit?: string;
  onChange: (value: number) => void;
  readOnly?: boolean;
  validate?: (value: number) => boolean;
}) => {
  const accessibleLabel = unit ? `${label} (${unit})` : label;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-size-base text-subtle">{label}</span>
      <div className="flex items-center gap-2 [&_input]:min-h-11">
        <NumericField
          label={accessibleLabel}
          displayValue={localizeDecimal(value)}
          onChangeValue={(next, isEmpty) => {
            if (!isEmpty) onChange(next);
          }}
          isRequired
          commitInvalidValues
          validate={validate}
          readOnly={readOnly}
          styleOptions={{ padding: "md", ghostBorder: readOnly }}
        />
        {unit && (
          <span className="shrink-0 text-size-small text-subtle">{unit}</span>
        )}
      </div>
    </div>
  );
};

export const DefinitionCard = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <section className="min-w-0 rounded-lg border bg-base p-4">
    <div className="mb-4 space-y-1">
      <h3 className="text-size-base font-semibold text-default">{title}</h3>
      {description && (
        <p className="text-size-small leading-relaxed text-subtle">
          {description}
        </p>
      )}
    </div>
    {children}
  </section>
);
