export function getPath() {
  const path = window.location.pathname
  if (['/login', '/register', '/verify', '/history', '/analytics', '/profile', '/'].includes(path)) return path
  return '/login'
}

export function navigate(path, setPathname) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path)
  }
  setPathname(path)
}
