interface Task {
  at: number;
  fn: () => void;
  id: number;
}

/**
 * Temporizador sobre el tiempo de juego (respeta la pausa).
 * Permite escribir secuencias narrativas con `await wait(2)`.
 */
export class Scheduler {
  private tasks: Task[] = [];
  private now = 0;
  private nextId = 1;
  /** Se incrementa al cancelar todo: las secuencias async viejas quedan descartadas. */
  generation = 0;

  update(time: number): void {
    this.now = time;
    if (!this.tasks.length) return;
    const due = this.tasks.filter((t) => t.at <= time);
    if (!due.length) return;
    this.tasks = this.tasks.filter((t) => t.at > time);
    due.sort((a, b) => a.at - b.at).forEach((t) => t.fn());
  }

  after(seconds: number, fn: () => void): number {
    const id = this.nextId++;
    this.tasks.push({ at: this.now + seconds, fn, id });
    return id;
  }

  cancel(id: number): void {
    this.tasks = this.tasks.filter((t) => t.id !== id);
  }

  cancelAll(): void {
    this.tasks = [];
    this.generation++;
  }

  wait(seconds: number): Promise<void> {
    return new Promise((resolve) => this.after(seconds, resolve));
  }
}
