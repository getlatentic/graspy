import { useEffect, useState } from "react";
import { readViewState, writeViewState } from "@/shared/view-state";

export type SlideMove = "none" | "forward" | "back";

export interface SlidePlace {
  index: number;
  move: SlideMove;
  total: number;
  /** The lesson's last slide, once the lesson has finished arriving. */
  isFinal: boolean;
  go: (index: number) => void;
}

const isPlace = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) > 0;

const within = (place: number, total: number) =>
  Math.max(0, Math.min(place, total - 1));

export function useSlidePlace(
  viewUUID: string,
  total: number,
  making: boolean,
): SlidePlace {
  const stateKey = `graspy.lesson.${viewUUID}`;
  const [place, setPlace] = useState(() => readViewState(stateKey, isPlace, 0));
  const [move, setMove] = useState<SlideMove>("none");
  const index = within(place, total);

  useEffect(() => writeViewState(stateKey, index), [stateKey, index]);

  return {
    index,
    move,
    total,
    isFinal: !making && index === total - 1,
    go: (to) => {
      setMove(to > index ? "forward" : "back");
      setPlace(within(to, total));
    },
  };
}
