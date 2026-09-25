import {
  Button,
  InlineNotification,
  Select,
  SelectItem,
} from "@carbon/react";
import { type ChangeEvent, useRef, useState } from "react";

import type { TeachingAssignment } from "../../academic-workspace/domain/academicWorkspace";
import {
  compatibleCurriculumCourses,
  type CurriculumCatalogSnapshot,
} from "../domain/curriculumCatalog";
import { eyebrow } from "../../../ui/chrome";
import { StatusPill } from "../../../ui/StatusPill";

interface CurriculumLibraryProps {
  readonly className?: string;
  readonly catalog: CurriculumCatalogSnapshot;
  readonly installing: boolean;
  readonly error: string | null;
  readonly onInstall: (contents: string) => Promise<boolean>;
}

export function CurriculumLibrary({
  className,
  catalog,
  installing,
  error,
  onInstall,
}: CurriculumLibraryProps) {
  const input = useRef<HTMLInputElement>(null);
  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileInput = event.currentTarget;
    const file = fileInput.files?.[0];
    if (!file) return;
    await onInstall(await file.text());
    fileInput.value = "";
  };

  return (
    <section className={`mt-xl grid gap-lg border border-rule bg-paper p-lg ${className ?? ""}`} aria-labelledby="curriculum-library-title">
      <div className="flex flex-col items-start gap-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className={eyebrow}>Curriculum library</p>
          <h2 className="m-0 font-display text-xl font-extrabold leading-display tracking-[-0.025em] text-ink" id="curriculum-library-title">Curricula available to your classes</h2>
          <p className="mt-xs mb-0 max-w-[62ch] leading-body text-ink-secondary">
            Add a curriculum file supplied by your school or an approved publisher.
          </p>
        </div>
        <input
          ref={input}
          className="sr-only"
          type="file"
          aria-label="Curriculum file"
          accept=".graspy-curriculum,.json,application/json"
          onChange={(event) => void readFile(event)}
        />
        <Button
          kind="tertiary"
          disabled={installing}
          onClick={() => input.current?.click()}
        >
          {installing ? "Adding curriculum…" : "Add curriculum file"}
        </Button>
      </div>
      {error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Curriculum not added"
          subtitle={error}
        />
      ) : null}
      {catalog.packages.length ? (
        <div className="grid border-t border-rule" role="list">
          {catalog.packages.map((curriculumPackage) => (
            <article className="flex flex-col items-start gap-sm border-b border-rule py-md last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between" key={curriculumPackage.id} role="listitem">
              <div>
                <h3 className="m-0 text-base text-ink">{curriculumPackage.title}</h3>
                <p className="mt-xs mb-0 max-w-[62ch] text-sm leading-body text-ink-secondary">
                  {curriculumPackage.publisher} · {curriculumPackage.jurisdiction} · {curriculumPackage.edition}
                </p>
                {curriculumPackage.earlierVersionsKept > 0 ? (
                  <p className="mt-2xs mb-0 max-w-[62ch] text-sm leading-body text-muted">
                    An earlier version is kept for lessons that already use it.
                  </p>
                ) : null}
              </div>
              <StatusPill tone={curriculumPackage.trust === "verified" ? "positive" : "neutral"}>
                {curriculumPackage.trust === "verified"
                  ? "Publisher verified"
                  : curriculumPackage.origin === "bundled"
                    ? "Included with graspy"
                    : "Added by your school"}
              </StatusPill>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-xs mb-0 max-w-[62ch] leading-body text-ink-secondary">
          No curriculum has been added yet. Classes can be organised now, but lessons
          start after a matching curriculum is selected.
        </p>
      )}
    </section>
  );
}

interface CurriculumCoursePickerProps {
  readonly className?: string;
  readonly assignment: TeachingAssignment;
  readonly catalog: CurriculumCatalogSnapshot;
  readonly pending: boolean;
  readonly onAssign: (curriculumCourseId: string) => Promise<boolean>;
}

export function CurriculumCoursePicker({
  className,
  assignment,
  catalog,
  pending,
  onAssign,
}: CurriculumCoursePickerProps) {
  const courses = compatibleCurriculumCourses(
    catalog,
    assignment.subjectId,
    assignment.gradeLevelId,
  );
  const [selection, setSelection] = useState(assignment.curriculumCourseId ?? "");

  if (!courses.length) {
    return (
      <div className="grid gap-2xs border-s-2 border-rule-strong ps-md text-ink">
        <strong>No matching curriculum</strong>
        <span className="text-ink-secondary">
          Add a curriculum that includes {assignment.subject} for {assignment.gradeLevel}.
        </span>
      </div>
    );
  }

  return (
    <div className={`grid min-w-0 grid-cols-[minmax(0,1fr)] items-end gap-sm sm:grid-cols-[minmax(0,1fr)_auto] [&_.cds--select]:w-full [&_.cds--select]:max-w-none [&_.cds--select-input]:w-full [&_.cds--select-input]:max-w-none [&_.cds--select-input]:min-h-[2.75rem] [&_.cds--select-input]:bg-paper-soft ${className ?? ""}`}>
      <Select
        id={`curriculum-course-${assignment.id}`}
        labelText="Curriculum"
        value={selection}
        required
        onChange={(event) => setSelection(event.currentTarget.value)}
      >
        <SelectItem value="" text="Choose a curriculum" disabled />
        {courses.map((course) => (
          <SelectItem
            key={course.id}
            value={course.id}
            text={`${course.framework} · ${course.publisher} · ${course.edition}`}
          />
        ))}
      </Select>
      <Button
        size="sm"
        disabled={pending || !selection || selection === assignment.curriculumCourseId}
        onClick={() => void onAssign(selection)}
      >
        {pending
          ? "Saving…"
          : assignment.curriculumCourseId
            ? "Change curriculum"
            : "Use curriculum"}
      </Button>
    </div>
  );
}

interface CurriculumRequiredProps extends CurriculumLibraryProps {
  readonly assignment: TeachingAssignment;
  readonly assigning: boolean;
  readonly onAssign: (curriculumCourseId: string) => Promise<boolean>;
}

export function CurriculumRequired({
  assignment,
  catalog,
  installing,
  error,
  assigning,
  onInstall,
  onAssign,
}: CurriculumRequiredProps) {
  return (
    <main className="mx-auto grid min-h-full w-[min(100%,76rem)] content-start gap-xl px-lg pt-2xl pb-3xl [&>header]:max-w-[52rem]">
      <header>
        <p className={eyebrow}>Before this class begins</p>
        <h1 className="m-0 max-w-[20ch] font-display text-display font-extrabold leading-display tracking-[-0.025em] text-ink [overflow-wrap:anywhere]">Choose what {assignment.displayName} will follow.</h1>
        <p className="mt-xs mb-0 max-w-[62ch] leading-body text-ink-secondary">
          graspy uses the selected curriculum to organise weekly work, learning goals,
          and classwork for this class.
        </p>
      </header>
      <CurriculumCoursePicker
        className="border border-rule bg-paper p-lg"
        assignment={assignment}
        catalog={catalog}
        pending={assigning}
        onAssign={onAssign}
      />
      <CurriculumLibrary
        className="mt-0"
        catalog={catalog}
        installing={installing}
        error={error}
        onInstall={onInstall}
      />
    </main>
  );
}
