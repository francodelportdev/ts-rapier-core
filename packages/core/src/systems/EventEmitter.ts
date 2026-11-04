export type Listener<T> = (payload: T) => void;

/**
 * A minimal typed event emitter. `Events` maps each event name to its payload type,
 * for example `{ jump: { height: number } }`. `on()` returns a function that removes the listener.
 */
export class EventEmitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  public on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (set === undefined) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => this.off(event, listener);
  }

  /** Like `on()`, but the listener runs only the first time. */
  public once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  public off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(listener);
  }

  public emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event) as Set<Listener<Events[K]>> | undefined;
    if (set === undefined) return;
    for (const listener of [...set]) listener(payload); // copy: listeners may unsubscribe while running
  }
}
