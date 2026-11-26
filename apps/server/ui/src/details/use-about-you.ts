import { useRef, useState } from "react";
import type { App } from "@modelcontextprotocol/ext-apps";
import type { AboutYou } from "@/lib/content";
import { readViewState, writeViewState } from "@/shared/view-state";

interface Answers {
  country: string;
  className: string;
  course: string;
}

interface Kept extends Answers {
  sent: boolean;
}

const isKept = (value: unknown): value is Kept => {
  const kept = value as Partial<Kept> | null;
  return (
    typeof kept?.country === "string" &&
    typeof kept.className === "string" &&
    typeof kept.course === "string" &&
    typeof kept.sent === "boolean"
  );
};

/** The message the form sends, in the words the server reads back (agent/about_you.py), whatever
 * language the learner reads the form in. The server finds the country by its code. */
export function answerText(form: AboutYou, answers: Answers): string {
  const where = `Country: ${form.names[answers.country]} (${answers.country}). Class: ${answers.className}`;
  return answers.course ? `${where}. Course: ${answers.course}.` : `${where}.`;
}

/** The classes of a country, and none for one the form does not know. */
export const classesOf = (form: AboutYou, country: string): string[] =>
  form.classLists[form.classListOf[country]] ?? [];

/** The form's answers. They are sent to the chat once, as the learner's next message, and kept as
 * sent only once the host has taken the message: a form closed while it was being sent opens again
 * for another try. A form answered stays answered, showing what was chosen; one the host refuses
 * is not. */
export function useAboutYou(app: App, viewUUID: string, form: AboutYou) {
  const stateKey = `graspy.details.${viewUUID}`;
  const [answers, setAnswers] = useState<Kept>(() =>
    readViewState(stateKey, isKept, {
      // A country the form does not list is no country: the select starts on its placeholder.
      country:
        form.country && form.countries.includes(form.country)
          ? form.country
          : "",
      className: "",
      course: "",
      sent: false,
    }),
  );
  // Not the state: a second press in the same frame reads the state before it changes.
  const sending = useRef(false);
  const [pending, setPending] = useState(false);
  const [refused, setRefused] = useState(false);

  const keep = (next: Kept) => {
    setAnswers(next);
    writeViewState(stateKey, next);
  };

  const classes = classesOf(form, answers.country);
  const needsCourse = form.afterSchool.includes(answers.className);
  const ready =
    classes.includes(answers.className) &&
    (!needsCourse || answers.course.trim() !== "");
  const locked = answers.sent || pending;

  const chooseCountry = (country: string) => {
    if (locked) return;
    const stays = classesOf(form, country).includes(answers.className);
    keep({ ...answers, country, className: stays ? answers.className : "" });
  };
  const chooseClass = (className: string) =>
    locked || keep({ ...answers, className });
  const writeCourse = (course: string) =>
    locked || keep({ ...answers, course });

  const submit = async () => {
    if (sending.current || locked || !ready) return;
    sending.current = true;
    setPending(true);
    const answered = {
      country: answers.country,
      className: answers.className,
      course: needsCourse ? answers.course.trim() : "",
    };
    try {
      const { isError } = await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: answerText(form, answered) }],
      });
      setRefused(Boolean(isError));
      if (!isError) keep({ ...answered, sent: true });
    } catch (error) {
      console.error("Sending the details failed:", error);
    } finally {
      sending.current = false;
      setPending(false);
    }
  };

  return {
    ...answers,
    sent: locked,
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
