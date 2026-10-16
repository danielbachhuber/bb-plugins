// A deadline typed in words, read into a calendar day. Todoist parses a due
// date's words itself, but its API takes a deadline only as `YYYY-MM-DD`, so
// the common forms are read here, by component-library's day parser, which
// Postpone and Review Sweep's Snooze share.
export {
  parseDay as parseDeadline,
  type ParsedDay as ParsedDeadline,
} from "@danielbachhuber/bb-plugin-component-library/parse-day";
