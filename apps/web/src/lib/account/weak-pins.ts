// A PIN a person is likely to try first is not offered (the server refuses it too:
// apps/server/src/app/account/parent_pin_kdf.py). `tests/fixtures/weak-pins.json` is read by both
// sides' tests, so the two cannot drift.

const COMMON = new Set(
  "0000000 00000000 000123 007007 010101 010203 01020304 0123456 020202 020406 030303 030507 040404 050505 060606 070707 080808 090909 100200 101010 102030 10203040 1111111 11111111 11112222 11221122 112233 1122334 11223344 112358 121212 12121212 123000 123123 12312312 123123123 123321 12341234 12344321 1234512 123456 1234567 12345678 123654 123789 124578 131313 13131313 1314520 135246 13572468 135790 141414 147258 147369 147852 151515 159357 159753 161616 171717 181818 191919 200100 202020 20202020 212121 21212121 22221111 2222222 232323 242424 246810 24681357 252525 258369 258741 262626 271828 272727 282828 292929 303030 314159 321321 321654 332211 3333333 343434 353535 357159 357951 363636 369147 369258 369741 373737 383838 393939 404040 44332211 454545 456123 456456 456789 464646 474747 484848 494949 505050 5201314 520520 521521 5555555 565656 575757 585858 595959 606060 654123 654321 6543210 654987 66666666 676767 686868 696969 700700 707070 741852 753951 7654321 787878 789123 789456 797979 808080 852963 87654321 88888888 898989 909090 951753 963852 987321 987654 99999999".split(
    " ",
  ),
);

const KEYPAD = [
  "147258369",
  "741852963",
  "369258147",
  "963852741",
  "159357",
  "357159",
  "951753",
  "753951",
  "2580",
  "0852",
  "1470",
  "0741",
  "3690",
  "0963",
  "1590",
  "0951",
  "3570",
  "0753",
  "14702580",
  "25808520",
  "1397",
  "7931",
  "1793",
  "3971",
  "13795",
  "97531",
  "24680",
  "08642",
  "135790",
  "097531",
  "246802",
  "208642",
];

const reversed = (text: string) => [...text].reverse().join("");

/** Digits that all go up by one, or all down by one, wrapping past 9 and 0. */
function runs(pin: string): boolean {
  const steps = new Set<number>();
  for (let at = 1; at < pin.length; at += 1) {
    steps.add((Number(pin[at]) - Number(pin[at - 1]) + 10) % 10);
  }
  return steps.size === 1 && (steps.has(1) || steps.has(9));
}

/** One block of digits said over (121212, 123123), or each digit doubled (112233). */
function periodic(pin: string): boolean {
  const n = pin.length;
  for (let period = 1; period <= n / 2; period += 1) {
    if (pin === pin.slice(0, period).repeat(n).slice(0, n)) return true;
  }
  if (n % 2 !== 0) return false;
  let doubled = true;
  for (let at = 0; at < n; at += 2) doubled &&= pin[at] === pin[at + 1];
  return doubled;
}

const onKeypad = (pin: string) =>
  KEYPAD.some((path) => path.includes(pin) || reversed(path).includes(pin));

const dayMonth = (first: number, second: number) =>
  (first >= 1 && first <= 31 && second >= 1 && second <= 12) ||
  (second >= 1 && second <= 31 && first >= 1 && first <= 12);

const year = (text: string) =>
  text.length === 2 || (Number(text) >= 1900 && Number(text) <= 2035);

/** A day, month and year in any order, or a month and year: the dates a person has to hand. */
function date(pin: string): boolean {
  const n = pin.length;
  const two = (from: number) => Number(pin.slice(from, from + 2));
  if (n === 6) {
    return (
      dayMonth(two(0), two(2)) ||
      dayMonth(two(2), two(4)) ||
      (two(0) >= 1 && two(0) <= 12 && year(pin.slice(2))) ||
      (year(pin.slice(0, 4)) && two(4) >= 1 && two(4) <= 12)
    );
  }
  if (n === 8) {
    return (
      (dayMonth(two(0), two(2)) && year(pin.slice(4))) ||
      (year(pin.slice(0, 4)) && dayMonth(two(4), two(6)))
    );
  }
  if (n === 7) {
    return (
      (year(pin.slice(3)) && dayMonth(Number(pin[0]), two(1))) ||
      (year(pin.slice(3)) && dayMonth(two(0), Number(pin[2]))) ||
      (year(pin.slice(0, 4)) && dayMonth(Number(pin[4]), two(5)))
    );
  }
  return false;
}

export function tooEasy(pin: string): boolean {
  return (
    new Set(pin).size === 1 ||
    COMMON.has(pin) ||
    COMMON.has(reversed(pin)) ||
    runs(pin) ||
    periodic(pin) ||
    onKeypad(pin) ||
    date(pin)
  );
}
