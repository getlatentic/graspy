// Opening a lesson from a card in the chat: where, which lesson the chat made for it, and the way
// back. The learner leaves the chat only by pressing the card's button.

const LESSON_PATH = /^\/app\/learn\/[^/?#]+\/lesson\/\d{1,3}$/;
// A lesson's id, as the server makes it (a uuid's hex); anything longer is not one.
const MAX_LESSON_ID = 80;

/** What the lesson's page is given when it is opened from a chat (the router's location state). */
export interface LessonOpening {
  /** The chat to go back to, with its history as the learner left it. */
  backToChat?: string;
  /** The lesson the chat made, to be opened as it is. */
  lessonId?: string;
}

/** Where a card asks to go, if it is a lesson of the app's own: its path, and the lesson made
 * for it when the card names one. Anything else is not followed. */
export function lessonRequested(
  url: string,
): { path: string; lessonId?: string } | null {
  const [path, query = ""] = url.split("?", 2);
  if (!LESSON_PATH.test(path)) return null;
  const lessonId = new URLSearchParams(query).get("lesson");
  return lessonId && lessonId.length <= MAX_LESSON_ID
    ? { path, lessonId }
    : { path };
}

/** The chat a lesson was opened from, if it is a place in the app: never another site. */
export function chatToReturnTo(
  state: unknown,
): Pick<LessonOpening, "backToChat"> {
  const back = (state as LessonOpening | null)?.backToChat;
  return typeof back === "string" && /^\/(?!\/)/.test(back)
    ? { backToChat: back }
    : {};
}

/** The lesson the chat made for this topic, if the page was opened with one. */
export function lessonMadeInChat(state: unknown): string | undefined {
  const id = (state as LessonOpening | null)?.lessonId;
  return typeof id === "string" && id.length <= MAX_LESSON_ID ? id : undefined;
}
