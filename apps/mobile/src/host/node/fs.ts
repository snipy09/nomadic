/** Node `fs` is not available on the phone; reused code only reaches it on desktop-only paths. */
const unavailable = (name: string) => () => {
  throw new Error(`fs.${name} is not available in the Nomadic app for Android`);
};
export const existsSync = () => false;
export const readFileSync = unavailable('readFileSync');
export const writeFileSync = unavailable('writeFileSync');
export const mkdirSync = () => undefined;
export const readdirSync = () => [] as string[];
export const rmSync = () => undefined;
export const statSync = unavailable('statSync');
export const renameSync = unavailable('renameSync');
export const copyFileSync = unavailable('copyFileSync');
export const unlinkSync = () => undefined;
export const promises = {
  readFile: async () => {
    throw new Error('Files cannot be read in the Nomadic app for Android.');
  },
  writeFile: async () => {
    throw new Error('Files cannot be written in the Nomadic app for Android.');
  },
  stat: async () => {
    throw new Error('Files are not available in the Nomadic app for Android.');
  },
};
export default { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, statSync, renameSync, copyFileSync, unlinkSync, promises };
