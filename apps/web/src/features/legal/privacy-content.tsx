import type { ReactNode } from "react";
import { CONTACT_EMAIL, contactHref } from "@/features/landing/constants";

export const PRIVACY_UPDATED = "29 September 2026";

const emailUs = (
  <a
    href={contactHref("Privacy")}
    className="font-medium text-accent-ink underline underline-offset-4"
  >
    {CONTACT_EMAIL}
  </a>
);

export interface PrivacySection {
  title: string;
  body: ReactNode;
}

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    title: "Who we are",
    body: (
      <>
        <p>
          graspy is a learning app built by Latentic. A parent or guardian sets
          up the account and adds each learner, or is the learner. Questions
          about privacy: {emailUs}.
        </p>
      </>
    ),
  },
  {
    title: "What we collect",
    body: (
      <ul>
        <li>
          <strong>Your Google account.</strong> Signing in uses Google, which
          tells our servers the account&rsquo;s id, name and email address. We
          keep the id, and the name only to name a first learner. We
          don&rsquo;t store the email address, but it stays in graspy&rsquo;s
          Google sign-in records. Your name and email are also kept on your
          device.
        </li>
        <li>
          <strong>Each learner.</strong> A name, country, language, class or
          level (which can include an age) and chosen subjects. As they learn:
          topics finished, answers to questions and progress.
        </li>
        <li>
          <strong>Tutor chats.</strong> What a learner types to the tutor, its
          replies, and a short summary that helps it remember, including what
          the child says about themselves.
        </li>
        <li>
          <strong>Voice.</strong> In voice lessons, a recording of what the
          learner says and a text transcript of it. The microphone is used only
          while a learner is answering, and only after they allow it.
        </li>
        <li>
          <strong>On the web without signing in.</strong> A random device id
          keeps the learner&rsquo;s progress with that browser. We also store a
          hash of the browser&rsquo;s fingerprint.
        </li>
        <li>
          <strong>Technical data.</strong> Our servers see the IP address of
          each request, to limit abuse, and Cloudflare may keep request logs.
        </li>
      </ul>
    ),
  },
  {
    title: "What we don’t do",
    body: (
      <ul>
        <li>No ads, and we never sell data.</li>
        <li>
          No analytics or crash-reporting tools in the Android app or on the
          web.
        </li>
        <li>
          No location, contacts, camera or photos. Learners can&rsquo;t message
          each other, and there are no public profiles.
        </li>
      </ul>
    ),
  },
  {
    title: "How we use it",
    body: (
      <p>
        To teach: to write lessons, answer questions, check spoken answers,
        remember where each learner is, and show progress. We don&rsquo;t use it
        for anything else.
      </p>
    ),
  },
  {
    title: "Who else handles it",
    body: (
      <ul>
        <li>
          <strong>Google</strong> confirms who you are when you sign in.
        </li>
        <li>
          <strong>Cloudflare</strong> hosts graspy and stores its data. Its AI
          models may listen to a recording to tell what language it is in, read
          the transcript to mark an answer, choose the next step from how the
          learner has done, write the teacher&rsquo;s reply, and check that
          reply is safe.
        </li>
        <li>
          <strong>Amazon Web Services</strong> (Bedrock, in the United States)
          runs the tutor and writes lessons. It receives what the learner types
          and the conversation so far with its summary, their country, language
          and class, the subject and topic, the topics they have finished, and
          how they have done on practice.
          It does not receive the learner&rsquo;s saved name.
        </li>
        <li>
          <strong>Intron</strong> turns a child&rsquo;s recording into text.{" "}
          <strong>Spitch</strong> turns the teacher&rsquo;s reply into speech;
          it receives only the teacher&rsquo;s words.
        </li>
      </ul>
    ),
  },
  {
    title: "How long we keep it",
    body: (
      <p>
        Until you remove the learner or the account. That includes recordings
        and transcripts. Lesson copies expire after 180 days. On Android, chats
        and recordings also stay on the phone until you sign out or remove the
        learner there. On the web, chats and offline copies stay in the browser
        until you sign out, or for good if you never signed in. The Android app
        is excluded from cloud backups.
      </p>
    ),
  },
  {
    title: "Deleting and copies",
    body: (
      <ul>
        <li>
          In the app, use <strong>Remove</strong> on a learner to delete their
          chats, progress, plan, recordings and transcripts from our servers.{" "}
          <strong>Delete account</strong> does this for every learner on the
          account. What a phone or browser learned before anyone signed in is
          kept separately: email us to delete it.
        </li>
        <li>
          Deleting the account does not delete graspy&rsquo;s Google sign-in
          record of it (its email and name); email us to have that removed.
          Manage the Google account itself at{" "}
          <a
            href="https://myaccount.google.com"
            className="font-medium text-accent-ink underline underline-offset-4"
          >
            myaccount.google.com
          </a>
          .
        </li>
        <li>
          Spoken replies are made from text and reused for anyone who hears the
          same text. They aren&rsquo;t linked to a child, and they aren&rsquo;t
          removed with a learner.
        </li>
        <li>
          To get a copy of a learner&rsquo;s data, or to have data deleted when
          you can&rsquo;t reach the app (a browser used without signing in, for
          example), email {emailUs}.
        </li>
      </ul>
    ),
  },
  {
    title: "Keeping it safe",
    body: (
      <p>
        Everything travels over HTTPS. The voice teacher&rsquo;s replies are
        checked for safety, and a second model checks that no line asks for
        personal details. The typed tutor has no such check, so please tell
        children not to type any into questions.
      </p>
    ),
  },
  {
    title: "Changes",
    body: (
      <p>
        If this changes in a way that matters, we&rsquo;ll update the date
        above.
      </p>
    ),
  },
];
