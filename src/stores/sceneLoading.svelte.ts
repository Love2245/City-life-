import { createSceneLoading, type LoadingRequest, type LoadingView } from '../lib/sceneLoading';

export const sceneLoading = $state<{ current: LoadingView | null }>({ current: null });
const controller = createSceneLoading(view => { sceneLoading.current = view; });
export const beginSceneLoading = (request: LoadingRequest, restart = false) => controller.begin(request, restart);
export const markLoadingCovered = (id: number) => controller.markCovered(id);
export const cancelSceneLoading = () => controller.cancel();
export type { LoadingHandle, LoadingRequest } from '../lib/sceneLoading';
