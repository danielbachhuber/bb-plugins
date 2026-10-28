import { PersonFinder } from "./components/person-finder";

export default {
  title: "contributor-dashboard/Person finder",
};

// Invented logins, most recently active first, as the server sends them.
const EVERYONE = ["octocat", "hubber", "mona", "monalisa", "spacecat", "webcat", "yeti", "dinotocat", "wavetocat", "snowtocat", "privateinvestocat"];

/** Focused with nothing typed: the eight most recently active people. */
export const Focused = () => (
  <div data-screenshot-frame className="h-80 p-4">
    <PersonFinder everyone={EVERYONE} onOpenPerson={() => undefined} initialOpen />
  </div>
);

/** Typing narrows the list, names starting with the text first. */
export const Typed = () => (
  <div data-screenshot-frame className="h-60 p-4">
    <PersonFinder everyone={EVERYONE} onOpenPerson={() => undefined} initialQuery="cat" initialOpen />
  </div>
);

/** On a person's page, their own name is marked. */
export const OnAPersonsPage = () => (
  <div data-screenshot-frame className="h-60 p-4">
    <PersonFinder everyone={EVERYONE} current="monalisa" onOpenPerson={() => undefined} initialQuery="mona" initialOpen />
  </div>
);

/** Nothing matches what was typed. */
export const NoMatch = () => (
  <div data-screenshot-frame className="h-28 p-4">
    <PersonFinder everyone={EVERYONE} onOpenPerson={() => undefined} initialQuery="zebra" initialOpen />
  </div>
);
