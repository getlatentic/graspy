import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import { ClassTimetableEditor } from "../../features/class-timetable/ui/ClassTimetableEditor";
import { DEFAULT_SCHOOL_DAY, type SchoolDay } from "../../features/class-timetable/domain/schoolDay";
import type { TeachingSlot } from "../../features/class-timetable/domain/classTimetable";

/**
 * The timetable grid at a real width, where the break rows, their controls and
 * the clock on every row can be measured rather than reasoned about.
 */
export function Timetable() {
  const [day, setDay] = useState<SchoolDay>(DEFAULT_SCHOOL_DAY);
  const slots: TeachingSlot[] = [
    { weekday: "monday", period: 1 },
    { weekday: "wednesday", period: 3 },
    { weekday: "friday", period: 6 },
  ];
  return (
    <ClassTimetableEditor
      className="Mathematics · JSS 1"
      day={day}
      slots={slots}
      pending={false}
      error={null}
      onCancel={() => undefined}
      onSave={() => undefined}
      onChangeDay={setDay}
    />
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("The visual-check root is missing.");
createRoot(root).render(
  <div className="mx-auto grid max-w-[60rem] gap-3xl p-xl">
    <Timetable />
  </div>,
);
