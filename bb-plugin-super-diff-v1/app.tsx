// bb-plugin-super-diff — frontend entry. One thread panel; the behaviour lives
// in components/ and review/.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ReviewPanel } from "@/components/review-panel";

export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    id: "review",
    title: "Super Diff",
    icon: "Layers",
    component: ({ threadId }) => <ReviewPanel threadId={threadId} />,
  });
});
