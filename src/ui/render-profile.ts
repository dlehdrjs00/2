/** iPadOS can identify itself as a Mac; touch points distinguish it from desktop Safari. */
export function usesAppleTouchRenderer(n: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  return /iPad|iPhone|iPod/.test(n.userAgent) || (/Mac/.test(n.platform) && n.maxTouchPoints > 1);
}

export function renderProfile(): 'standard' | 'apple-touch' {
  return typeof navigator !== 'undefined' && usesAppleTouchRenderer(navigator) ? 'apple-touch' : 'standard';
}
