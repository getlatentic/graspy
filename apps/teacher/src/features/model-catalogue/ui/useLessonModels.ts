import { useEffect, useState } from "react";

import type { LessonModelGateway } from "../application/LessonModelGateway";
import type { LessonModelChoice } from "../domain/lessonModel";

export interface LessonModelController {
  readonly choices: readonly LessonModelChoice[];
  readonly changing: boolean;
  readonly failure?: string;
  choose(modelId: string): Promise<void>;
}

export function useLessonModels(
  gateway: LessonModelGateway,
): LessonModelController {
  const [choices, setChoices] = useState<readonly LessonModelChoice[]>([]);
  const [changing, setChanging] = useState(false);
  const [failure, setFailure] = useState<string>();

  useEffect(() => {
    let disposed = false;
    void gateway.listModels().then(
      (models) => {
        if (!disposed) setChoices(models);
      },
      () => {
        // A catalogue that cannot be read leaves the teacher on the model they
        // already have, which is the one this screen is set up for.
        if (!disposed) setChoices([]);
      },
    );
    return () => {
      disposed = true;
    };
  }, [gateway]);

  const choose = async (modelId: string) => {
    setChanging(true);
    setFailure(undefined);
    try {
      await gateway.chooseModel(modelId);
      setChoices(await gateway.listModels());
    } catch (error) {
      setFailure(
        error instanceof Error
          ? error.message
          : "That choice could not be saved. Try again.",
      );
    } finally {
      setChanging(false);
    }
  };

  return { choices, changing, failure, choose };
}
