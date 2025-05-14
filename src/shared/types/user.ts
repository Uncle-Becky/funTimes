/** Immutable R2 user data. */
export type User = {
  /** Player user ID. t2_0 for anons. */
  id: string;
  /** Player username. eg, spez. */
  username: string;
  /** The user's avatar URL. */
  snoovatarUrl: string;
};

export const noSnoovatarURL: string =
  'https://www.redditstatic.com/shreddit/assets/thinking-snoo.png';

export const noUsername: string = 'anonymous';

export const noId: string = 't2_0';
