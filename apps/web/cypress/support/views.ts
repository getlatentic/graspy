import { MODEL, SERVER } from "./learner-db";

// The frame titled for the view holds the sandbox proxy's frame, which holds
// the view's own, whose root is labelled as the outer frame is titled.
export function view(
  title: string,
  index = 0,
): Cypress.Chainable<JQuery<HTMLElement>> {
  return cy
    .get(`iframe[title="${title}"]`, MODEL)
    .eq(index)
    .its("0.contentDocument.body", MODEL)
    .should("not.be.empty")
    .then(cy.wrap)
    .find("iframe", MODEL)
    .its("0.contentDocument.body", MODEL)
    .should("not.be.empty")
    .then(cy.wrap)
    .find(`section[aria-label="${title}"]`, MODEL);
}

export const lessonView = () => view("Lesson");

export function watchLessonsOpened(): void {
  cy.intercept("POST", `${SERVER}/mcp`).as("mcpCalls");
}

// "ready" for a lesson the server had, "making" for one it is making. React
// opens a page twice in development, so an answer repeated in a row is one.
export function expectLessonsOpened(expected: string[]): void {
  cy.get<Interception[]>("@mcpCalls.all", MODEL).should((calls) => {
    const answers = calls
      .filter((call) => call.request.body?.params?.name === "give_lesson")
      .map((call) => call.response?.body?.result?.structuredContent?.status)
      .filter((status, index, all) => status !== all[index - 1]);
    expect(answers).to.deep.equal(expected);
  });
}

type Interception = {
  request: { body?: { params?: { name?: string } } };
  response?: {
    body?: { result?: { structuredContent?: { status?: string } } };
  };
};
