import { writable } from 'svelte/store';

export interface RoomFile {
  key: string;
  name: string;
  size: number;
  type: string;
  url: string;
  expiresAt: number;
}

export const files = writable<RoomFile[]>([]);
