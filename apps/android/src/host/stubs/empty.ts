/** Modules the APK never runs (Sentry, updater, PDF reader, browser automation). */
const unavailable = () => {
  throw new Error('Not available in the Nomadic app for Android.');
};
export const init = () => undefined;
export const captureException = () => undefined;
export const captureMessage = () => undefined;
export const autoUpdater = { on: () => undefined, checkForUpdates: unavailable };
export const extractText = unavailable;
export const getDocumentProxy = unavailable;
export class AutoApplyEngine {
  constructor() {
    unavailable();
  }
}
export const findUserBrowser = () => null;
export const ensureUserBrowser = unavailable;
export default {};
