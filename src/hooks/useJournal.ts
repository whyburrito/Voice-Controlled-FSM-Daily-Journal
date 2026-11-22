import { useSyncExternalStore } from 'react';
import { controller } from '../core/controller';

export function useJournal() {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}

export function useLevel() {
  return useSyncExternalStore(controller.subscribeLevel, controller.getLevel);
}
