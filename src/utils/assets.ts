/** Resolves a file in /public/assets honouring Vite's base path. */
export const asset = (name: string): string => `${import.meta.env.BASE_URL}assets/${name}`;
export const ROBOTS = ['robot-1.jpg', 'robot-2.jpg', 'robot-3.jpg', 'robot-4.jpg'].map(asset);
