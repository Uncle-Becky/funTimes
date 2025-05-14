export class Pool<T> {
  private available: T[];
  private func: () => T;

  constructor(func: () => T) {
    this.available = [];
    this.func = func;
  }

  public get(): T {
    if (this.available.length === 0) {
      return this.func();
    }
    return this.available.pop() as T;
  }

  public release(item: T): void {
    this.available.push(item);
  }
}
