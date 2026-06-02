import { writable } from 'svelte/store';

export interface Question {
  id: string;
  text: string;
  votes: number;
  createdAt: number;
}

export const questions = writable<Question[]>([]);
