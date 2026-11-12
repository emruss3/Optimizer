// Where the workspace keeps, on the device, whether the inspector beside the plan and the schedule
// under it are open. The CI battery (scripts/visual-battery/battery.mjs) sets these same keys to
// open both before it reads them, and fails if the inspector is not open: keep the names in step.
export const INSPECTOR_KEY = 'pp.inspector';
export const DOCK_KEY = 'pp.dock';
