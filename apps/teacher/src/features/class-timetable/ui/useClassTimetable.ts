import { useCallback, useEffect, useRef, useState } from "react";

import type { ClassTimetableGateway } from "../application/ClassTimetableGateway";
import type { NextTeachingSlot, TeachingSlot } from "../domain/classTimetable";
import { DEFAULT_SCHOOL_DAY, schoolDayFault, type SchoolDay } from "../domain/schoolDay";

interface TermContext {
  readonly academicSessionId: string;
  readonly academicPeriodId: string;
}

/**
 * One class's timetable, loaded and saved.
 *
 * Reads carry a ticket so a slower answer for the class a teacher has left
 * cannot overwrite the one they are looking at.
 */
export function useClassTimetable(
  gateway: ClassTimetableGateway,
  context: TermContext,
  teachingAssignmentId: string,
) {
  const [slots, setSlots] = useState<readonly TeachingSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRead = useRef(0);
  const { academicSessionId, academicPeriodId } = context;

  useEffect(() => {
    const ticket = latestRead.current + 1;
    latestRead.current = ticket;
    setLoading(true);
    gateway
      .getTimetable({ academicSessionId, academicPeriodId, teachingAssignmentId, slots: [] })
      .then((found) => {
        if (latestRead.current !== ticket) return;
        setSlots(found);
        setError(null);
      })
      .catch((failure: unknown) => {
        if (latestRead.current !== ticket) return;
        setError(messageOf(failure));
      })
      .finally(() => {
        if (latestRead.current === ticket) setLoading(false);
      });
  }, [gateway, academicSessionId, academicPeriodId, teachingAssignmentId]);

  const save = useCallback(
    async (chosen: readonly TeachingSlot[]) => {
      setSaving(true);
      try {
        setSlots(
          await gateway.setTimetable({
            academicSessionId,
            academicPeriodId,
            teachingAssignmentId,
            slots: chosen,
          }),
        );
        setError(null);
        return true;
      } catch (failure: unknown) {
        setError(messageOf(failure));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [gateway, academicSessionId, academicPeriodId, teachingAssignmentId],
  );

  return { slots, loading, saving, error, save };
}

/** What a teacher teaches next, asked once when the screen opens. */
export function useNextClass(gateway: ClassTimetableGateway, context: TermContext) {
  const [next, setNext] = useState<NextTeachingSlot | null>(null);
  const { academicSessionId, academicPeriodId } = context;

  useEffect(() => {
    let current = true;
    gateway
      .getNextSlot({ academicSessionId, academicPeriodId })
      .then((found) => {
        if (current) setNext(found);
      })
      .catch(() => {
        // A timetable is an extra on this screen rather than the screen itself:
        // a teacher's classes still list below whether or not this could be
        // read, and the panel says the same thing as an empty timetable.
        if (current) setNext(null);
      });
    return () => {
      current = false;
    };
  }, [gateway, academicSessionId, academicPeriodId]);

  return next;
}

function messageOf(failure: unknown): string {
  if (failure instanceof Error && failure.message.trim()) return failure.message;
  if (typeof failure === "string" && failure.trim()) return failure;
  return "Your timetable could not be saved. Try again.";
}

/**
 * The periods one class is taught in, read only.
 *
 * A screen that needs to say when a class is taught — a lesson plan's Period
 * line — has no business being able to change it, so the saving half is not
 * handed over with the answer. Without a gateway there is no timetable, and
 * whatever asked says so rather than guessing.
 */
export function useTaughtPeriods(
  gateway: ClassTimetableGateway | null,
  context: TermContext & { readonly teachingAssignmentId: string },
): readonly TeachingSlot[] {
  const [slots, setSlots] = useState<readonly TeachingSlot[]>([]);
  const { academicSessionId, academicPeriodId, teachingAssignmentId } = context;

  useEffect(() => {
    if (!gateway) {
      setSlots([]);
      return;
    }
    let current = true;
    gateway
      .getTimetable({ academicSessionId, academicPeriodId, teachingAssignmentId, slots: [] })
      .then((found) => {
        if (current) setSlots(found);
      })
      .catch(() => {
        if (current) setSlots([]);
      });
    return () => {
      current = false;
    };
  }, [gateway, academicSessionId, academicPeriodId, teachingAssignmentId]);

  return slots;
}

/**
 * The school day, and the way to describe it.
 *
 * A day the app has not been told about is not guessed at: the default is used
 * and said to be a default, so a teacher knows the grid in front of them is a
 * stand-in until they say otherwise.
 */
export function useSchoolDay(gateway: ClassTimetableGateway | null) {
  const [day, setDay] = useState<SchoolDay>(DEFAULT_SCHOOL_DAY);
  const [described, setDescribed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gateway) return;
    let current = true;
    gateway
      .getSchoolDay()
      .then((found) => {
        if (!current || !found) return;
        setDay(found);
        setDescribed(true);
      })
      .catch(() => {
        if (current) setError("Your school day could not be read. Try again.");
      });
    return () => {
      current = false;
    };
  }, [gateway]);

  const save = useCallback(
    async (described: SchoolDay) => {
      if (!gateway) return false;
      const fault = schoolDayFault(described);
      if (fault) {
        setError(fault);
        return false;
      }
      setSaving(true);
      try {
        setDay(await gateway.setSchoolDay(described));
        setDescribed(true);
        setError(null);
        return true;
      } catch (failure: unknown) {
        setError(messageOf(failure));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [gateway],
  );

  return { day, described, saving, error, save };
}

/** The classes today holds, asked once when the front screen opens. */
export function useTodaysClasses(gateway: ClassTimetableGateway | null, context: TermContext) {
  const [classes, setClasses] = useState<readonly string[]>([]);
  const { academicSessionId, academicPeriodId } = context;

  useEffect(() => {
    if (!gateway) return;
    let current = true;
    gateway
      .getTodaysClasses({ academicSessionId, academicPeriodId })
      .then((found) => {
        if (current) setClasses(found);
      })
      .catch(() => {
        // The list below is a teacher's classes either way; a timetable that
        // could not be read means today cannot be named, not that the screen
        // has nothing to show.
        if (current) setClasses([]);
      });
    return () => {
      current = false;
    };
  }, [gateway, academicSessionId, academicPeriodId]);

  return classes;
}
