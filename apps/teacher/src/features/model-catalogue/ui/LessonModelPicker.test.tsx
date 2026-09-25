import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LessonModelGateway } from "../application/LessonModelGateway";
import type { LessonModelChoice } from "../domain/lessonModel";
import { LessonModelPicker } from "./LessonModelPicker";
import { useLessonModels } from "./useLessonModels";

const standard: LessonModelChoice = {
  id: "standard",
  displayName: "Standard",
  summary: "The fullest lesson quality graspy can produce.",
  downloadBytes: 2_841_481_184,
  memoryRequiredBytes: 4_341_481_184,
  fitsThisMachine: true,
  isInstalled: true,
  isSelected: true,
};

const light: LessonModelChoice = {
  id: "light",
  displayName: "Light",
  summary: "Built for older laptops with less memory to spare.",
  downloadBytes: 695_751_488,
  memoryRequiredBytes: 2_195_751_488,
  fitsThisMachine: true,
  isInstalled: false,
  isSelected: false,
};

function gatewayWith(
  choices: readonly LessonModelChoice[],
  overrides: Partial<LessonModelGateway> = {},
): LessonModelGateway {
  return {
    listModels: vi.fn().mockResolvedValue(choices),
    chooseModel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function Harness({ gateway }: { readonly gateway: LessonModelGateway }) {
  return <LessonModelPicker controller={useLessonModels(gateway)} />;
}

afterEach(cleanup);

describe("choosing what this computer does", () => {
  it("says nothing when there is only one option", async () => {
    render(<Harness gateway={gatewayWith([standard])} />);

    // Assert on the heading a teacher would actually see, not a role query
    // that returns nothing whether the picker rendered or not.
    await waitFor(() => {
      expect(screen.queryByLabelText(/Standard/)).not.toBeInTheDocument();
    });
    expect(
      screen.queryByText("How much should graspy do on this computer?"),
    ).not.toBeInTheDocument();
  });

  it("states what each option needs and what it costs to add", async () => {
    render(<Harness gateway={gatewayWith([standard, light])} />);

    expect(await screen.findByLabelText(/Light/)).toBeInTheDocument();
    expect(screen.getByText(/Needs about 2\.2 GB of memory free/)).toBeVisible();
    expect(screen.getByText(/664 MB to add/)).toBeVisible();
    expect(screen.getByText(/Already on this computer/)).toBeVisible();
  });

  it("saves the choice the teacher makes", async () => {
    const chooseModel = vi.fn().mockResolvedValue(undefined);
    const gateway = gatewayWith([standard, light], { chooseModel });
    const user = userEvent.setup();
    render(<Harness gateway={gateway} />);

    await user.click(await screen.findByLabelText(/Light/));

    expect(chooseModel).toHaveBeenCalledWith("light");
  });

  /// A teacher cannot pick something this machine cannot hold; the reason is on
  /// screen rather than arriving as a failure after they commit to a download.
  it("will not let a teacher choose an option this computer cannot hold", async () => {
    const tooBig = { ...light, fitsThisMachine: false };
    render(<Harness gateway={gatewayWith([standard, tooBig])} />);

    expect(await screen.findByLabelText(/Light/)).toBeDisabled();
    expect(
      screen.getByText(/more than this computer has to spare/),
    ).toBeVisible();
  });

  it("says so when the choice could not be saved", async () => {
    const chooseModel = vi.fn().mockRejectedValue(new Error("Storage is full."));
    const user = userEvent.setup();
    render(<Harness gateway={gatewayWith([standard, light], { chooseModel })} />);

    await user.click(await screen.findByLabelText(/Light/));

    expect(await screen.findByText("Storage is full.")).toBeVisible();
  });
});
