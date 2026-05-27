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
      className="flex min-h-0 flex-col grow px-4 overflow-y-auto"
      style={{ minHeight }}
    >
      {children}
    </div>
  );
};
