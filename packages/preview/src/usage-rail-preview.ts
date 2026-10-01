import { createUsageIndicator, USAGE_INDICATOR_CSS } from "../../plugin/src/ui/usage-indicator.ts";

const style = document.createElement("style");
style.textContent = USAGE_INDICATOR_CSS;
document.head.append(style);
const widget = createUsageIndicator();
widget.setState({
  kind: "ready",
  limits: {
    primary: { remainingPercent: 72, windowDurationMins: 300, resetsAt: Date.now() + 3 * 60 * 60 * 1000 },
    secondary: { remainingPercent: 61, windowDurationMins: 10080, resetsAt: Date.now() + 4 * 24 * 60 * 60 * 1000 },
    resetCreditsAvailable: 1,
  },
  updatedAt: Date.now(),
});
document.querySelector("#usage-slot")?.append(widget.root);
