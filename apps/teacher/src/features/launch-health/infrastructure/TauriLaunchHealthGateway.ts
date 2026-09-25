import { invoke } from "@tauri-apps/api/core";

import type { LaunchHealthGateway } from "../application/LaunchHealthGateway";
import type { LaunchFailure } from "../domain/launchHealth";

export class TauriLaunchHealthGateway implements LaunchHealthGateway {
  async check(): Promise<LaunchFailure | null> {
    return (await invoke<LaunchFailure | null>("launch_health")) ?? null;
  }

  async retry(): Promise<LaunchFailure | null> {
    return (await invoke<LaunchFailure | null>("retry_launch")) ?? null;
  }
}
