import { z } from "zod";
import { COURSE_MAX, isAfterSchool } from "@/lib/learner-level";

const names = z.object({
  en: z.string(),
  local: z.record(z.string(), z.string()).optional(),
});

export const detailsSchema = z
  .object({
    // Messages are translation keys.
    country: z.string().min(1, "onboarding.errors.country"),
    language: z.string().min(1, "onboarding.errors.language"),
    system: z.string(),
    level: z.string().min(1, "onboarding.errors.grade"),
    school: z.object({ names, descriptor: z.string() }).nullable(),
    course: z.string().max(COURSE_MAX),
  })
  .superRefine((data, ctx) => {
    if (isAfterSchool(data.level) && !data.course.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["course"],
        message: "onboarding.errors.course",
      });
    }
  });

export const onboardingSchema = detailsSchema.and(
  z.object({
    selectedSubjects: z.array(z.string()).min(1, "onboarding.errors.subjects"),
  }),
);

export type DetailsSchema = z.infer<typeof detailsSchema>;
export type OnboardingSchema = z.infer<typeof onboardingSchema>;
