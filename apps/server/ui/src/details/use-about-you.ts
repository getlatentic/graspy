import { useRef, useState } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import type { AboutYou } from "@/lib/content";
import { readViewState, writeViewState } from "@/shared/view-state";
import { countryName } from "./country-names";

interface Answers {
  country: string;
  className: string;
  course: string;
  sent: boolean;
}

const isAnswers = (value: unknown): value is Answers => {
  const kept = value as Partial<Answers> | null;
  return (
    typeof kept?.country === "string" &&
    typeof kept.className === "string" &&
    typeof kept.course === "string" &&
    typeof kept.sent === "boolean"
  );
};

/** The message the form sends, in the words the server reads back (agent/about_you.py), whatever
 * language the learner reads the form in. */
export function answerText(answers: Omit<Answers, "sent">): string {
  const where = `Country: ${countryName(answers.country, "en")} (${answers.country}). Class: ${answers.className}`;
  return answers.course ? `${where}. Course: ${answers.course}.` : `${where}.`;
}

/** The classes of a country, and none for one the form does not know. */
export const classesOf = (form: AboutYou, country: string): string[] =>
  form.classLists[form.classListOf[country]] ?? [];

/** The form's answers. They are sent to the chat once, as the learner's next message, and a form
 * answered stays answered, showing what was chosen; one the host refuses is not. */
export function useAboutYou(app: App, viewUUID: string, form: AboutYou) {
  const stateKey = `graspy.details.${viewUUID}`;
  const [answers, setAnswers] = useState<Answers>(() =>
    readViewState(stateKey, isAnswers, {
      country: form.country ?? "",
      className: "",
      course: "",
      sent: false,
    }),
  );
  // Not the state: a second press in the same frame reads the state before it changes.
  const sending = useRef(false);
  const [refused, setRefused] = useState(false);

  const keep = (next: Answers) => {
    setAnswers(next);
    writeViewState(stateKey, next);
  };

  const classes = classesOf(form, answers.country);
  const needsCourse = form.afterSchool.includes(answers.className);
  const ready =
    classes.includes(answers.className) &&
    (!needsCourse || answers.course.trim() !== "");

  const chooseCountry = (country: string) => {
    if (answers.sent) return;
    const stays = classesOf(form, country).includes(answers.className);
    keep({ ...answers, country, className: stays ? answers.className : "" });
  };
  const chooseClass = (className: string) =>
    answers.sent || keep({ ...answers, className });
  const writeCourse = (course: string) =>
    answers.sent || keep({ ...answers, course });

  const submit = async () => {
    if (sending.current || answers.sent || !ready) return;
    sending.current = true;
    const answered = {
      ...answers,
      course: needsCourse ? answers.course.trim() : "",
    };
    keep({ ...answered, sent: true });
    try {
      const { isError } = await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: answerText(answered) }],
      });
      setRefused(Boolean(isError));
      if (isError) keep({ ...answered, sent: false });
    } catch (error) {
      console.error("Sending the details failed:", error);
      keep({ ...answered, sent: false });
    } finally {
      sending.current = false;
    }
  };

  return {
    ...answers,
    classes,
    needsCourse,
    ready,
    refused,
    chooseCountry,
    chooseClass,
    writeCourse,
    submit,
  };
}
