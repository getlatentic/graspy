import { Select, SelectItem, TextInput } from "@carbon/react";

import {
  academicCalendarOptions,
  type AcademicCalendarKind,
} from "../domain/academicWorkspace";

interface AcademicCalendarFieldsProps {
  readonly idPrefix: string;
  readonly calendarKind: AcademicCalendarKind;
  readonly periodNames: readonly string[];
  readonly activePeriodOrdinal: number;
  readonly onCalendarKindChange: (kind: AcademicCalendarKind) => void;
  readonly onPeriodCountChange: (count: number) => void;
  readonly onPeriodNameChange: (index: number, name: string) => void;
  readonly onActivePeriodChange: (ordinal: number) => void;
}

export function AcademicCalendarFields({
  idPrefix,
  calendarKind,
  periodNames,
  activePeriodOrdinal,
  onCalendarKindChange,
  onPeriodCountChange,
  onPeriodNameChange,
  onActivePeriodChange,
}: AcademicCalendarFieldsProps) {
  const configurableCount = calendarKind === "terms" || calendarKind === "custom";
  const allowedCounts = calendarKind === "terms"
    ? [2, 3, 4]
    : Array.from({ length: 12 }, (_, index) => index + 1);

  return (
    <fieldset className="m-0 grid min-w-0 gap-lg border-0 p-0 [&>legend]:mb-sm [&>legend]:p-0 [&>legend]:font-body [&>legend]:text-md [&>legend]:font-extrabold [&>legend]:text-ink">
      <legend>School calendar</legend>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-lg sm:grid-cols-2">
        <Select
          id={`${idPrefix}-calendar-kind`}
          labelText="How the year is divided"
          value={calendarKind}
          onChange={(event) =>
            onCalendarKindChange(event.currentTarget.value as AcademicCalendarKind)
          }
        >
          {academicCalendarOptions.map((option) => (
            <SelectItem key={option.value} value={option.value} text={option.label} />
          ))}
        </Select>
        {configurableCount ? (
          <Select
            id={`${idPrefix}-period-count`}
            labelText={calendarKind === "terms" ? "Number of terms" : "Number of periods"}
            value={String(periodNames.length)}
            onChange={(event) => onPeriodCountChange(Number(event.currentTarget.value))}
          >
            {allowedCounts.map((count) => (
              <SelectItem key={count} value={String(count)} text={String(count)} />
            ))}
          </Select>
        ) : null}
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-md sm:grid-cols-2">
        {periodNames.map((name, index) => (
          <TextInput
            key={`${calendarKind}-${index}`}
            id={`${idPrefix}-period-${index + 1}`}
            labelText={`Period ${index + 1} name`}
            maxLength={80}
            required
            value={name}
            onChange={(event) => onPeriodNameChange(index, event.currentTarget.value)}
          />
        ))}
      </div>
      <Select
        id={`${idPrefix}-active-period`}
        labelText="Current period"
        value={String(activePeriodOrdinal)}
        onChange={(event) => onActivePeriodChange(Number(event.currentTarget.value))}
      >
        {periodNames.map((name, index) => (
          <SelectItem key={index} value={String(index + 1)} text={name} />
        ))}
      </Select>
    </fieldset>
  );
}
