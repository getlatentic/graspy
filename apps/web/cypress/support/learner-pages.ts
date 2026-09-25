import { MODEL } from "./learner-db";
import { lessonView } from "./views";

const ARRIVING = "More slides are on their way.";

export function expectStandings(expected: string[]): void {
  cy.get("main ol > li").should((rows) => {
    const shown = [...rows].map((row) =>
      ["Learnt", "Ready", "Not started"].find((s) => row.innerText.includes(s)),
    );
    expect(shown).to.deep.equal(expected);
  });
}

// A lesson with a final check ends after it; one without, at the last slide.
export function finishLesson(): void {
  const atTheEnd = (lesson: JQuery<HTMLElement>) =>
    lesson.find('button:contains("Start the final check")').length > 0 ||
    lesson.find('button:contains("Finish lesson")').length > 0;
  // The last slide ends the lesson only once every slide has arrived.
  lessonView().find('nav[aria-label="Slides"]', MODEL).should("be.visible");
  lessonView().should("not.contain", ARRIVING);
  const toTheEnd = (): void => {
    lessonView().then((lesson) => {
      if (atTheEnd(lesson)) return;
      cy.wrap(lesson).contains("button", "Next").click();
      toTheEnd();
    });
  };
  toTheEnd();
  lessonView().then((lesson) => {
    if (!lesson.find('button:contains("Start the final check")').length) return;
    cy.wrap(lesson).contains("button", "Start the final check").click();
    cy.wrap(lesson).find("button[aria-pressed]").first().click();
    cy.wrap(lesson).contains("button", "Check answer").click();
  });
  lessonView().contains("button", "Finish lesson").click();
}

// A hidden desktop menu has the same name.
export function tab(name: string): void {
  cy.get('nav[aria-label="Main"]:visible').contains(name).click();
}

/** From the You page, once the catalogue has named the learner's class. */
export function openDetails(): void {
  cy.contains("a", "Change").click();
  cy.location("pathname").should("eq", "/app/learn/you/details");
  cy.get("#grade").invoke("val").should("not.be.empty");
}

/** On the details page: the learner's details changed, keeping their plan. */
export function keepPlanWith(change: () => void): void {
  change();
  cy.contains("button", "Save changes").click();
  cy.contains("button", "Keep my plan").click();
  cy.location("pathname").should("eq", "/app/learn/you");
}

export const inClass = (name: string) => () => {
  cy.get("#grade").click().type(name);
  cy.contains("button", name).click();
};

export const learningIn = (name: string) => () => {
  cy.get("#language").click().type(name);
  cy.contains("button", name).click();
};
