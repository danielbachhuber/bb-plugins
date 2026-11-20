import { PersonFinder } from "./components/person-finder";

export default {
  title: "contributor-dashboard/Person finder",
};

// Invented logins, most recently active first, as the server sends them.
const EVERY_TEAM = ["widgets-team", "gadgets-team", "docs", "reviewers"];
const EVERYONE = ["octocat", "hubber", "mona", "monalisa", "spacecat", "webcat", "yeti", "dinotocat", "wavetocat", "snowtocat", "privateinvestocat"];

const open = { onOpenPerson: () => undefined, onOpenTeam: () => undefined };

/** Focused with nothing typed: the five most recently active people, then three teams. */
export const Focused = () => (
  <div data-screenshot-frame className="h-80 p-4">
    <PersonFinder everyone={EVERYONE} everyTeam={EVERY_TEAM} {...open} initialOpen />
  </div>
);

/** Typing narrows the list, names starting with the text first, people before teams. */
export const Typed = () => (
  <div data-screenshot-frame className="h-60 p-4">
    <PersonFinder everyone={EVERYONE} everyTeam={EVERY_TEAM} {...open} initialQuery="cat" initialOpen />
  </div>
);

/** A team matches what was typed. */
export const TypedTeam = () => (
  <div data-screenshot-frame className="h-40 p-4">
    <PersonFinder everyone={EVERYONE} everyTeam={EVERY_TEAM} {...open} initialQuery="gad" initialOpen />
  </div>
);

/** On a person's page, their own name is marked. */
export const OnAPersonsPage = () => (
  <div data-screenshot-frame className="h-60 p-4">
    <PersonFinder everyone={EVERYONE} everyTeam={EVERY_TEAM} current={{ kind: "person", name: "monalisa" }} {...open} initialQuery="mona" initialOpen />
  </div>
);

/** Nothing matches what was typed. */
export const NoMatch = () => (
  <div data-screenshot-frame className="h-28 p-4">
    <PersonFinder everyone={EVERYONE} everyTeam={EVERY_TEAM} {...open} initialQuery="zebra" initialOpen />
  </div>
);
