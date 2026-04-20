// Receives SET_CACHE_UID messages from the page and stores the uid in the SW's
// globalThis so the cacheKeyWillBeUsed plugin (vite.config.ts T5) can prefix
// cache keys with the signed-in user's id.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_CACHE_UID') {
    self.__SB_UID__ = event.data.uid ?? 'anon'
  }
})
