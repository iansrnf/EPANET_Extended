import React from "react";
interface WizardContentProps {
  children: React.ReactNode;
  minHeight?: string;
}

export const WizardContent: React.FC<WizardContentProps> = ({
  children,
  minHeight = "300px",
}) => {
  return (
    <div
      className="flex flex-col flex-grow min-h-0 px-4 overflow-y-auto"
      style={{ minHeight }}
    >
      {children}
    </div>
  );
};
