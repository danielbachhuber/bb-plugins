import type { Story } from "@ladle/react";

import { ViewedProgress } from "./viewed-ring";

export default { title: "component-library/Viewed Ring" };

/** None, some, and all of a concern's files viewed. */
export const States: Story = () => (
  <div data-screenshot-frame className="inline-flex flex-col gap-2 p-4 text-xs text-muted-foreground">
    <ViewedProgress viewed={0} total={5} />
    <ViewedProgress viewed={3} total={6} />
    <ViewedProgress viewed={6} total={6} />
  </div>
);
