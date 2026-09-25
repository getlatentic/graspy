import { useCallback, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { schoolSystems } from "@/lib/education-api";
import { isAfterSchool, schoolDescriptor } from "@/lib/learner-level";
import type { DetailsSchema } from "../schemas/onboarding-schema";

/** A class belongs to one system, so another system, or a country without
    the chosen one, asks for the class again; a level after school stays. */
export function useSchoolClass() {
  const { watch, setValue } = useFormContext<DetailsSchema>();
  const systemId = watch("system");
  const level = watch("level");
  const country = watch("country");
  const systems = useQuery({
    queryKey: ["school-systems", country],
    queryFn: () => schoolSystems(country),
    enabled: Boolean(country),
    // They change only with a deploy.
    staleTime: Infinity,
  });
  const system = systems.data?.find((s) => s.id === systemId);

  const setSystem = useCallback(
    (id: string, validate: boolean) => {
      setValue("system", id, { shouldValidate: validate });
      if (!isAfterSchool(level)) {
        setValue("level", "");
        setValue("school", null);
      }
    },
    [level, setValue],
  );

  useEffect(() => {
    if (!systems.data || systems.data.some((s) => s.id === systemId)) return;
    setSystem(systems.data[0]?.id ?? "", false);
  }, [systems.data, systemId, setSystem]);

  const chooseLevel = (value: string) => {
    const chosen = system?.levels.find((l) => l.id === value);
    setValue(
      "school",
      chosen && system
        ? { names: chosen.name, descriptor: schoolDescriptor(system, chosen) }
        : null,
    );
    setValue("level", value, { shouldValidate: true });
  };

  return {
    systems,
    system,
    systemId,
    level,
    chooseSystem: (id: string) => setSystem(id, true),
    chooseLevel,
  };
}
