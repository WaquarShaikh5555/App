/**
 * Session state, so the navigator can react to sign-in and sign-out.
 *
 * Before this existed, AppNavigator checked the stored token exactly once, on mount. After a
 * successful login the app still had isAuthed === false, so MainTabs was not registered in the
 * navigator at all and the screens' navigation.replace('MainTabs') had nowhere to go - the app
 * stayed on the login screen and looked like login had failed.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifySessionChange(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // a broken listener must not stop the others
    }
  });
}
