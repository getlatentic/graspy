import { CURRICULUM_STORE, openDB, promisify } from "@/lib/idb";
import { planIdFor, type CurriculumData } from "@/lib/curriculum-record";

const KEY = "current";

async function planStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDB();
  return db.transaction(CURRICULUM_STORE, mode).objectStore(CURRICULUM_STORE);
}

/** Keeps a plan, as a new plan unless `planId` says which one it is. */
export async function saveCurriculum(
  data: Omit<CurriculumData, "id" | "createdAt" | "updatedAt" | "planId"> & {
    planId?: string;
  },
): Promise<void> {
  const now = Date.now();
  const curriculum: CurriculumData = {
    ...data,
    id: KEY,
    planId: data.planId ?? planIdFor(now),
    createdAt: now,
    updatedAt: now,
  };
  await promisify((await planStore("readwrite")).put(curriculum));
}

export async function getCurriculum(): Promise<CurriculumData | null> {
  const store = await planStore("readonly");
  return (await promisify<CurriculumData | undefined>(store.get(KEY))) ?? null;
}

/** Keeps a change to the plan; its id, plan id and creation date stay. */
export async function savePlanChange(next: CurriculumData): Promise<void> {
  const store = await planStore("readwrite");
  const existing = await promisify<CurriculumData | undefined>(store.get(KEY));
  if (!existing) return;
  const { id: _id, planId: _planId, createdAt: _createdAt, ...changes } = next;
  await promisify(
    store.put({ ...existing, ...changes, updatedAt: Date.now() }),
  );
}

/** Keeps the plan as the learner's account holds it: its ids and dates as they came. */
export async function holdCurriculum(plan: CurriculumData): Promise<void> {
  await promisify((await planStore("readwrite")).put({ ...plan, id: KEY }));
}

export async function deleteCurriculum(): Promise<void> {
  await promisify((await planStore("readwrite")).delete(KEY));
}
