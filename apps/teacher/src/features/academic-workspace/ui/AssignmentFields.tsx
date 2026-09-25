import { Select, SelectItem, TextInput } from "@carbon/react";
import { useId } from "react";

import type { AcademicWorkspaceSnapshot } from "../domain/academicWorkspace";

interface AssignmentFieldsProps {
  readonly values: AssignmentFieldValues;
  readonly subjects: AcademicWorkspaceSnapshot["subjects"];
  readonly gradeLevels: AcademicWorkspaceSnapshot["gradeLevels"];
  readonly onChange: (values: AssignmentFieldValues) => void;
}

export interface AssignmentFieldValues {
  readonly subject: string;
  readonly gradeLevelId: string;
  readonly classSection: string;
}

export function AssignmentFields({
  values,
  subjects,
  gradeLevels,
  onChange,
}: AssignmentFieldsProps) {
  const subjectListId = useId();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-lg sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] sm:[&>:last-child]:col-span-full">
      <div>
        <TextInput
          id={`${subjectListId}-input`}
          labelText="Subject"
          list={subjectListId}
          maxLength={100}
          required
          value={values.subject}
          onChange={(event) =>
            onChange({ ...values, subject: event.currentTarget.value })
          }
        />
        <datalist id={subjectListId}>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.name} />
          ))}
        </datalist>
      </div>
      <Select
        id={`${subjectListId}-grade`}
        labelText="Grade or class level"
        required
        value={values.gradeLevelId}
        onChange={(event) =>
          onChange({ ...values, gradeLevelId: event.currentTarget.value })
        }
      >
        <SelectItem disabled value="" text="Choose a grade" />
        {gradeLevels.map((gradeLevel) => (
          <SelectItem
            key={gradeLevel.id}
            value={gradeLevel.id}
            text={gradeLevel.displayName}
          />
        ))}
      </Select>
      <TextInput
        id={`${subjectListId}-section`}
        labelText="Class or section (optional)"
        helperText="For example: A, Blue, or Science."
        maxLength={50}
        value={values.classSection}
        onChange={(event) =>
          onChange({ ...values, classSection: event.currentTarget.value })
        }
      />
    </div>
  );
}
