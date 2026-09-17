/** The names claimed so far, per uniqueness namespace, newest last.
 *
 *  A chunk prompt carries the most recent names of its namespace so a batch does not
 *  repeat what its neighbours just used, including the neighbours in other groups that
 *  share the namespace: every parcel kind shares one. The window is bounded because the
 *  whole list would be re-sent by every later chunk and grow with the square of the city;
 *  exact uniqueness is the coverage check and the repair loop, not the prompt. */
export class TakenNames {
  private readonly byNamespace = new Map<string, string[]>();

  add(namespace: string, name: string): void {
    const names = this.byNamespace.get(namespace);
    if (names) names.push(name);
    else this.byNamespace.set(namespace, [name]);
  }

  /** The last `window` names of the namespace, oldest of them first. */
  recent(namespace: string, window: number): string[] {
    const names = this.byNamespace.get(namespace) ?? [];
    return names.slice(Math.max(0, names.length - window));
  }
}
