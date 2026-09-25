import { homedir } from "node:os";
import { join } from "node:path";

export const NAVIGATOR_APP_NAME = "CodexNavigator";

export function navigatorDataDir(home = homedir()): string {
  return join(home, "Library", "Application Support", NAVIGATOR_APP_NAME);
}

export function navigatorDbPath(home = homedir()): string {
  return join(navigatorDataDir(home), "navigator.sqlite");
}
