import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { topicsOf } from "@/lib/curriculum-record";
import { useI18n } from "@/lib/i18n-context";
import { useUserProfile } from "@/lib/use-user-profile";
import { subjectOf } from "@/features/learn/lib/chat-targets";
import { goalIndex } from "@/features/learn/lib/curriculum-edit";
import { lessonPath } from "@/lib/learn-paths";
import {
  SubjectHeader,
  SubjectProgress,
} from "@/features/learn/components/subject-header";
import { TopicList } from "@/features/learn/components/topic-list";
import { usePlan, useProgress } from "@/features/learn/learner-context";

export default function SubjectPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const userProfile = useUserProfile();
  const { curriculum } = usePlan();
  const { standing, reread } = useProgress();
  // A lesson goes on being made after the learner leaves it.
  useEffect(reread, [reread]);

  const slug = decodeURIComponent(params.subject ?? "");
  const topics = topicsOf(curriculum, slug);
  const standings = topics.map((topic, index) => standing(slug, index, topic));
  const learnt = standings.filter((s) => s === "learnt").length;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <SubjectHeader
        name={subjectOf(curriculum, slug)?.name ?? slug}
        source={curriculum?.sources?.[slug]}
        onBack={() => navigate("/app/learn/subjects")}
      />
      {topics.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-8 text-center text-muted">
          {t("subject.topicsLoading")}
        </p>
      ) : (
        <>
          <SubjectProgress learnt={learnt} total={topics.length} />
          <TopicList
            topics={topics}
            standings={standings}
            goal={goalIndex(curriculum, slug)}
            onOpen={(index) => userProfile && navigate(lessonPath(slug, index))}
          />
        </>
      )}
    </div>
  );
}
