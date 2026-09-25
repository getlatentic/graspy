import {
  OLD_PLAN,
  OLD_PLAN_ID,
  oldDevice,
  serverIsUp,
  stored,
} from "../support/learner-db";

beforeEach(() => {
  serverIsUp();
  cy.viewport(402, 860);
  oldDevice(OLD_PLAN, {});
  cy.visit("/app/learn/you");
});

function toJss2(): void {
  cy.contains("a", "Change").click();
  cy.location("pathname").should("eq", "/app/learn/you/details");
  cy.contains("button", "Save changes").should("be.disabled");
  cy.get("#grade").click().type("JSS 2");
  cy.contains("button", "JSS 2").click();
  cy.contains("button", "Save changes").click();
  cy.contains("Make a new plan for these details?");
}

it("keeps the plan, now for the new class", () => {
  toJss2();
  cy.contains("button", "Keep my plan").click();

  cy.location("pathname").should("eq", "/app/learn/you");
  cy.contains("main", "JSS 2");
  stored().then((device) => {
    expect(device.plan.planId).to.equal(OLD_PLAN_ID);
    expect(device.plan.gradeLevel).to.equal(
      "JSS 2 (Junior Secondary School), Nigeria, age 13",
    );
    expect(device.plan).to.include({ system: "NG", level: "jss-2" });
  });
});

it("makes a new plan from the subjects for the new class", () => {
  toJss2();
  cy.contains("button", "Make a new plan").click();

  cy.location("pathname").should("eq", "/app/onboarding");
  cy.contains("Step 2 of 2");
  cy.contains("button", "Back").click();
  cy.location("pathname").should("eq", "/app/learn/you/details");
  cy.get("#grade").should("have.value", "JSS 2");
});

it("takes the class of the plan the device holds", () => {
  const jss1 = "JSS 1 (Junior Secondary School), Nigeria, age 12";
  oldDevice(
    { ...OLD_PLAN, gradeLevel: jss1 },
    {
      graspy_user_profile: JSON.stringify({
        id: "e2e",
        country: "NG",
        language: "en",
        system: "NG",
        level: "jss-3",
        levelNames: { en: "JSS 3", local: {} },
        course: "",
        gradeLevel: "JSS 3 (Junior Secondary School), Nigeria, age 14",
        preferredSubjects: ["English Studies", "Mathematics"],
        onboardingCompleted: true,
      }),
    },
  );
  cy.visit("/app/learn/you");

  cy.contains("dd", /^JSS 1$/);
  cy.contains("dd", "JSS 3").should("not.exist");
  cy.window()
    .its("localStorage")
    .invoke("getItem", "graspy_user_profile")
    .then((saved) => JSON.parse(saved as string))
    .should("include", { gradeLevel: jss1, level: "jss-1", system: "NG" });
});
