/** `7:30a`. Lower case and no padding, so a column of times stays quiet. */
export function clockTime(startsAt: string): string {
  return new Date(startsAt)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(":00", "")
    .replace(" AM", "a")
    .replace(" PM", "p");
}
