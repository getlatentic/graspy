import { useCallback, useMemo, useState } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { createSSEStream } from "@/lib/api/sse";
import { API_BASE_URL } from "@/lib/env";
import { getCountryName, getLanguageName } from "@/lib/locale";
import type { GeneratedSubject } from "../types";

type SubjectsQueryState = {
  subjects: GeneratedSubject[];
  error: string | null;
};

const INITIAL_SUBJECTS_STATE: SubjectsQueryState = {
  subjects: [],
  error: null,
};

type SubjectStreamEvent =
  | { type: "status"; message: string }
  | { type: "error"; message: string }
  | { type: "subjects"; subjects: GeneratedSubject[]; message?: string }
  | { type: "complete"; message?: string };

type SubjectsParams = {
  country: string;
  language: string;
  gradeLevel: string;
  /** Makes a retry for the same level a new query. */
  timestamp: number;
};

function subjectsUrl({ country, language, gradeLevel }: SubjectsParams) {
  const params = new URLSearchParams({
    country: getCountryName(country),
    language: getLanguageName(language),
  });
  if (gradeLevel) params.append("gradeLevel", gradeLevel);
  return `${API_BASE_URL}/subjects/generate-stream?${params.toString()}`;
}

/** Status events carry the server's English progress text; the page shows
    its own line. */
function addSubjects(
  state: SubjectsQueryState,
  event: SubjectStreamEvent,
): SubjectsQueryState {
  if (event.type === "error") {
    return { ...state, error: event.message || "Failed to load subjects" };
  }
  if (event.type !== "subjects") return state;
  const subjects = [...state.subjects];
  const ids = new Set(subjects.map((subject) => subject.id));
  for (const raw of Array.isArray(event.subjects) ? event.subjects : []) {
    if (!raw?.id || ids.has(raw.id)) continue;
    subjects.push({
      id: raw.id,
      label: raw.label,
      recommended: Boolean(raw.recommended),
    });
    ids.add(raw.id);
  }
  return { ...state, subjects };
}

/** The stream folded into the query's cached data as each event arrives. */
async function streamSubjects(
  queryClient: QueryClient,
  queryKey: QueryKey,
  params: SubjectsParams,
): Promise<SubjectsQueryState> {
  let state = INITIAL_SUBJECTS_STATE;
  const events = createSSEStream<SubjectStreamEvent>(subjectsUrl(params));
  for await (const event of events) {
    state = addSubjects(state, event);
    queryClient.setQueryData(queryKey, state);
  }
  return state;
}

export function useSubjects() {
  const queryClient = useQueryClient();
  const [params, setParams] = useState<SubjectsParams | null>(null);
  const queryKey = useMemo(() => ["onboarding-subjects", params], [params]);

  const { data, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      params
        ? streamSubjects(queryClient, queryKey, params)
        : INITIAL_SUBJECTS_STATE,
    enabled: !!params,
    staleTime: Infinity,
  });

  const fetchSubjects = useCallback(
    (next: Omit<SubjectsParams, "timestamp">) =>
      setParams({ ...next, timestamp: Date.now() }),
    [],
  );

  const subjectsState = data ?? INITIAL_SUBJECTS_STATE;
  // The stream writes state from its first event, which has no subject, so
  // having state is not having subjects. Not yet asked counts as loading.
  const loading =
    (isFetching || params === null) &&
    subjectsState.subjects.length === 0 &&
    !subjectsState.error;
  return { subjectsState, isSubjectsQueryLoading: loading, fetchSubjects };
}
