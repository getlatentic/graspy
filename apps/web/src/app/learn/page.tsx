import { useNavigate } from "react-router";
import { useUserProfile } from "@/lib/use-user-profile";
import { useI18n } from "@/lib/i18n-context";
import { levelLabel } from "@/lib/learner-level";
import { curriculumRequest } from "@/features/learn/lib/curriculum-request";
import {
  currentTopic,
  type CurrentTopic,
} from "@/features/learn/lib/current-topic";
import type { CurriculumSubject } from "@/lib/curriculum-record";
import { lessonPath, subjectPath } from "@/features/learn/lib/learn-paths";
import { useAskIdeas } from "@/features/learn/hooks/use-ask-ideas";
import { HomeSection } from "@/features/learn/components/home-section";
import { PlanBuilding } from "@/features/learn/components/plan-building";
import { PlanErrorCard } from "@/features/learn/components/plan-error-card";
import { HomeRail } from "@/features/learn/components/home-rail";
import { ResumeCard } from "@/features/learn/components/resume-card";
import { SubjectTiles } from "@/features/learn/components/subject-tiles";
import { TrySomethingNew } from "@/features/learn/components/try-something-new";
import { usePlan, useProgress } from "@/features/learn/learner-context";

export default function HomePage() {
  const { t } = useI18n();
  const userProfile = useUserProfile();
  const { curriculum, isGenerating, error, nextSubject, generate } = usePlan();
  const current = currentTopic(curriculum, nextSubject);
  const subjects = curriculum?.subjects ?? [];
  const ask = useAskIdeas(current, subjects.length > 0 && !isGenerating);

  if (!userProfile) return null;

  const errorAlert = error ? (
    <PlanErrorCard
      message={error}
      onRetry={() => generate(curriculumRequest(userProfile), t)}
      retrying={isGenerating}
    />
  ) : null;

  if (isGenerating) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {errorAlert}
        <PlanBuilding />
      </div>
    );
  }

  return (
    // From lg, subjects span the full width: a column beside the lesson
    // would cramp them.
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-8 lg:max-w-6xl lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-x-10 lg:gap-y-12">
      {errorAlert && <div className="lg:col-span-2">{errorAlert}</div>}

      {current && <ContinueSection current={current} />}

      <div className="hidden lg:block">
        <HomeRail current={current} onAsk={ask} />
      </div>

      {subjects.length > 0 && <SubjectsSection subjects={subjects} />}

      <div className="lg:hidden">
        <HomeSection title={t("home.tryTitle")}>
          <TrySomethingNew onPick={ask} />
        </HomeSection>
      </div>
    </div>
  );
}

// Stretched to the column beside it, so the two end together.
function ContinueSection({ current }: { current: CurrentTopic }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const userProfile = useUserProfile();
  const { learntIn } = useProgress();
  return (
    <HomeSection
      title={t("home.continueTitle")}
      className="flex flex-col lg:h-full"
    >
      <ResumeCard
        current={current}
        grade={userProfile ? levelLabel(userProfile, t) : ""}
        completed={learntIn(current.subject.slug, current.topics)}
        onOpenTopic={(index) =>
          navigate(lessonPath(current.subject.slug, index))
        }
        className="flex-1"
      />
    </HomeSection>
  );
}

function SubjectsSection({ subjects }: { subjects: CurriculumSubject[] }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  return (
    <div className="min-w-0 lg:col-span-2">
      <HomeSection
        title={t("home.subjectsTitle")}
        more={{ label: t("home.seeAll"), to: "/app/learn/subjects" }}
      >
        <SubjectTiles
          subjects={subjects}
          onSelect={(subject) => navigate(subjectPath(subject.slug))}
        />
      </HomeSection>
    </div>
  );
}
