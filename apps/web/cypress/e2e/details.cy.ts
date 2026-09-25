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
