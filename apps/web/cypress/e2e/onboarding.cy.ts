import { MODEL, serverIsUp, stored } from "../support/learner-db";

beforeEach(() => {
  serverIsUp();
  cy.clearAllLocalStorage();
});

function inNigeriaInEnglish(): void {
  cy.visit("/app/onboarding");
  cy.get("#country").click().type("Nigeria");
  cy.contains("button", "Nigeria").click();
  cy.get("#language").click();
  cy.contains("button", "English").click();
}

// The model's recommendations start chosen.
function chosenSubjects(): Cypress.Chainable<string[]> {
  cy.get("[aria-pressed=true]", MODEL).should("have.length.at.least", 1);
  return cy
    .get("[aria-pressed=true]")
    .then((chosen) =>
      [...chosen].map((button) => button.innerText.split("\n")[0]),
    );
}

function toThePlan(): void {
  cy.contains("button", "Start learning").click();
  cy.contains("button", /^Start$/, { timeout: 300_000 }).click();
  cy.location("pathname").should("eq", "/app/learn");
  cy.contains("Continue learning");
}

const profile = () =>
  cy
    .window()
    .then((win) =>
      JSON.parse(win.localStorage.getItem("graspy_user_profile") ?? "{}"),
    );

it("takes a school learner from their class to a saved plan", () => {
  inNigeriaInEnglish();
  // Found by another name learners use for it.
  cy.get("#grade").click().type("js1");
  cy.contains("button", "JSS 1").click();
  cy.contains("button", "Next").should("not.be.disabled").click();

  chosenSubjects().then((names) => {
    toThePlan();
    stored().then((device) => {
      expect(device.version).to.equal(8);
      expect(device.plan.planId).to.match(/^plan-\d+$/);
      const subjects = device.plan.subjects as { name: string; slug: string }[];
      expect(subjects.map((subject) => subject.name)).to.have.members(names);
      const topics = device.plan.topics as Record<string, string[]>;
      for (const subject of subjects) {
        expect(topics[subject.slug], subject.name).to.have.length.at.least(1);
      }
      expect(device.progress).to.deep.equal([]);
      expect(device.plan.gradeLevel).to.equal(
        "JSS 1 (Junior Secondary School), Nigeria, age 12",
      );
    });
    profile().should("include", { system: "NG", level: "jss-1" });
  });
});

it("offers an undergraduate the courses of their programme", () => {
  inNigeriaInEnglish();
  cy.get("#course").should("not.exist");
  cy.get("#grade").click();
  cy.contains("button", "Undergraduate").click();
  cy.get("#course").type("Accounting");
  cy.contains("button", "Next").should("not.be.disabled").click();

  // Courses of the programme, not school subjects.
  chosenSubjects().then((names) => {
    expect(names.join(" ")).to.match(/Account|Audit|Tax/);
    expect(names).not.to.include("Basic Science");
    toThePlan();
    stored().then((device) => {
      expect(device.plan.gradeLevel).to.match(/Accounting/);
      expect(
        (device.plan.subjects as { name: string }[]).map((s) => s.name),
      ).to.have.members(names);
    });
    profile().should("include", {
      level: "undergraduate",
      course: "Accounting",
    });
  });
});

it("asks for the school system in a country with more than one", () => {
  cy.visit("/app/onboarding");
  cy.get("#country").click().type("United Kingdom");
  cy.contains("button", "United Kingdom").click();
  cy.contains("button", "England").should("have.attr", "aria-pressed", "true");
  cy.contains("button", "Scotland").click();
  cy.get("#grade").click();
  cy.contains("button", "Secondary 4").should("exist");
  cy.contains("button", "Year 10").should("not.exist");
});
