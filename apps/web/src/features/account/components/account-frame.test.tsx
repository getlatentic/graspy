// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import { AccountFrame } from "./account-frame";

afterEach(cleanup);

describe("AccountFrame", () => {
  it("puts its card in the middle of the room under the header, both ways", () => {
    render(
      <MemoryRouter>
        <I18nContext.Provider
          value={
            {
              t: (key: string) => key,
              locale: "en",
              setLocale: () => {},
            } as never
          }
        >
          <AccountFrame>
            <p>the card</p>
          </AccountFrame>
        </I18nContext.Provider>
      </MemoryRouter>,
    );

    const room = screen.getByRole("main");
    expect(room.className).toContain("flex-1");
    expect(room.className).toContain("items-center");
    expect(room.className).toContain("justify-center");
    expect(room.textContent).toBe("the card");
  });
});
