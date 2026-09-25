import { BackgroundTaskStore } from "./BackgroundTaskStore";
import { TauriBackgroundTaskGateway } from "../infrastructure/TauriBackgroundTaskGateway";

/**
 * The app's one task store, held at module scope so it outlives every screen.
 *
 * Work belongs to the app, not to whichever view happened to start it.
 */
export const appTaskStore = new BackgroundTaskStore(new TauriBackgroundTaskGateway());
