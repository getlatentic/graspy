import { InlineLoading } from "@carbon/react";
import { useEffect, useState } from "react";

import type { ClassworkGateway } from "../application/ClassworkGateway";
import type { ClassworkFigure as Figure } from "../domain/classwork";
import type { LessonContextRequest } from "../../lesson-planning/domain/lessonPlanning";

type FigureState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly dataUrl: string }
  | { readonly status: "failed" };

interface Props {
  readonly context: LessonContextRequest;
  readonly figure: Figure;
  readonly gateway: ClassworkGateway;
  readonly lessonId: string;
  readonly sourceName: string;
}

export function ClassworkFigure({ context, figure, gateway, lessonId, sourceName }: Props) {
  const [state, setState] = useState<FigureState>({ status: "loading" });
  const { academicSessionId, academicPeriodId, teachingAssignmentId } = context;

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    gateway.getFigureData({
      context: { academicSessionId, academicPeriodId, teachingAssignmentId },
      lessonId,
      figureId: figure.id,
    })
      .then((dataUrl) => {
        if (active) setState({ status: "ready", dataUrl });
      })
      .catch(() => {
        if (active) setState({ status: "failed" });
      });
    return () => { active = false; };
  }, [academicSessionId, academicPeriodId, figure.id, gateway, lessonId, teachingAssignmentId]);

  if (state.status === "loading") {
    return (
      <div className="m-0 border-b border-rule py-lg text-ink-secondary">
        <InlineLoading description="Opening source figure" status="active" />
      </div>
    );
  }
  if (state.status === "failed") {
    return <p className="m-0 border-b border-rule py-lg text-ink-secondary" role="status">This source figure could not be opened.</p>;
  }
  return (
    <figure className="m-0 grid w-[min(100%,65ch)] gap-sm border-b border-rule-strong py-xl break-inside-avoid print:w-[min(100%,120mm)] print:py-[6mm] [&_cite]:not-italic [&_cite]:text-muted [&_figcaption]:grid [&_figcaption]:gap-2xs [&_figcaption]:text-sm [&_figcaption]:leading-body [&_figcaption]:text-ink-secondary [&_img]:block [&_img]:h-auto [&_img]:w-full [&_img]:max-h-[42rem] [&_img]:object-contain [&_img]:bg-paper [&_img]:text-ink print:[&_img]:max-h-[110mm]">
      <img
        src={state.dataUrl}
        alt={figure.altText}
        width={figure.widthPx}
        height={figure.heightPx}
        loading="eager"
        decoding="async"
      />
      <figcaption>
        <span>{figure.caption}</span>
        <cite>{sourceName}</cite>
      </figcaption>
    </figure>
  );
}
