import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createDefaultPumpDefinition,
  type PumpDefinition,
} from "@epanet-js/hydraulic-model";
import { presets } from "@epanet-js/project-settings";
import { PumpDefinitionEditor } from "./pump-definition-editor";

vi.mock("./definition-graph", () => ({
  DefinitionGraph: ({ title }: { title: string }) => <div>{title}</div>,
}));

describe("PumpDefinitionEditor", () => {
  it("keeps BEP settings when navigating between definition tabs", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const Editor = () => {
      const [definition, setDefinition] = useState(
        createDefaultPumpDefinition("pump-a", "Booster A"),
      );
      return (
        <PumpDefinitionEditor
          definition={definition}
          units={presets.LPS.units}
          onChange={(next) => {
            setDefinition(next);
            onChange(next);
          }}
        />
      );
    };
    render(<Editor />);

    await user.click(screen.getByRole("tab", { name: "Efficiency" }));
    await user.click(screen.getByRole("combobox", { name: "Efficiency type" }));
    await user.click(
      screen.getByRole("option", { name: "Best efficiency point (BEP)" }),
    );
    const flowInput = screen.getByRole("textbox", {
      name: /Flow at best efficiency/,
    });
    await user.clear(flowInput);
    await user.type(flowInput, "15{Enter}");
    await user.click(screen.getByRole("tab", { name: "Motor" }));
    await user.click(screen.getByRole("tab", { name: "Efficiency" }));

    expect(
      screen.getByRole("textbox", { name: /Flow at best efficiency/ }),
    ).toHaveValue("15");
    const changed = onChange.mock.lastCall?.[0] as PumpDefinition;
    expect(changed.efficiency).toMatchObject({ type: "bep", bepFlow: 15 });
    expect(changed.head.type).toBe("standard");
    expect(changed.motor.efficiency).toBe(95);
  });

  it("supports arrow, Home, and End keys for tab navigation", async () => {
    const user = userEvent.setup();
    render(
      <PumpDefinitionEditor
        definition={createDefaultPumpDefinition("pump-a", "Booster A")}
        units={presets.LPS.units}
        onChange={vi.fn()}
      />,
    );

    screen.getByRole("tab", { name: "Head" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Efficiency" })).toHaveFocus();
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Efficiency");
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Motor" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Head" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Motor" })).toHaveFocus();
  });
});
