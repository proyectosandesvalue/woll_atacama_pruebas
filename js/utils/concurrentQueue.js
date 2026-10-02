/**
 * Cola de ejecución concurrente para limitar el número de tareas simultáneas.
 * Útil para evitar saturar el navegador con demasiadas peticiones fetch o workers.
 */
export class ConcurrentQueue {
  /**
   * @param {number} concurrency - Número máximo de tareas simultáneas
   */
  constructor(concurrency = 4) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  /**
   * Agrega una tarea a la cola.
   * @param {Function} task - Función que retorna una promesa
   * @returns {Promise<any>} - Promesa que resuelve con el resultado de la tarea
   */
  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.next();
    });
  }

  async next() {
    // Si ya estamos ejecutando el máximo o no hay tareas pendientes, salir
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const { task, resolve, reject } = this.queue.shift();
    this.running++;

    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.next(); // Procesar siguiente tarea
    }
  }

  /**
   * Retorna el número de tareas pendientes en cola
   */
  get pending() {
    return this.queue.length;
  }
}
