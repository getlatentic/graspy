/** What reauthenticateWithGoogle throws when Firebase holds nobody signed in, though the app's
 * session is alive (site data was cleared): the parent must sign in again. Kept apart from
 * google-auth.ts, the one module that imports Firebase, so it can be read without loading it. */
export const NOT_SIGNED_IN = "graspy/not-signed-in";
