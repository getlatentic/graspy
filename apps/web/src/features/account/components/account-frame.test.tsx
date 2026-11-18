// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { I18nContext } from "@/lib/i18n-context";
import { AccountFrame } from "./account-frame";

afterEach(cleanup);

describe("AccountFrame", () => {
  it("keeps its card in a padded room that centres it with auto margins, so a tall card is not cut off", () => {
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
    expect(room.className).toContain("py-6");
    expect(room.className).not.toMatch(/\bitems-center\b|\bjustify-center\b/);
    expect(room.firstElementChild?.className).toContain("m-auto");
    expect(room.textContent).toBe("the card");
  });
});
