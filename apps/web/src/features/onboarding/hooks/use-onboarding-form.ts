import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useI18n } from "@/lib/i18n-context";
import { isSupportedLanguage } from "@/lib/locale";
import type { DetectedLocale } from "@/lib/locale-detector";
import {
  onboardingSchema,
  type DetailsSchema,
  type OnboardingSchema,
} from "../schemas/onboarding-schema";

function suggestedDetails(detected: DetectedLocale): DetailsSchema {
  return {
    country: detected.country ?? "",
    language: isSupportedLanguage(detected.language) ? detected.language : "en",
    system: "",
    level: "",
    school: null,
    course: "",
  };
}

/** Subjects are for one level, so another level chooses them again. The
    interface switches to the language chosen as soon as it is chosen. */
export function useOnboardingForm(
  replan: DetailsSchema | undefined,
  detected: DetectedLocale,
) {
  const { locale, setLocale } = useI18n();
  const form = useForm<OnboardingSchema>({
    resolver: zodResolver(onboardingSchema),
    mode: "onChange",
    defaultValues: {
      ...(replan ?? suggestedDetails(detected)),
      selectedSubjects: [],
    },
  });
  const { watch, setValue } = form;
  const level = watch("level");
  const language = watch("language");

  useEffect(() => {
    setValue("selectedSubjects", []);
  }, [level, setValue]);

  useEffect(() => {
    if (language && language !== locale) void setLocale(language);
    // Keyed on the choice alone: when English stands in for an untranslated
    // language, locale differs from it and must not retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  return form;
}
