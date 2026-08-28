"use client";

import { toggleTask } from "@/actions/tasks";

export default function TaskToggle({ id, done }: { id: number; done: boolean }) {
  return (
    <form action={toggleTask}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="btn shrink-0 py-0.5 text-xs"
        aria-label={done ? "Reabrir tarea" : "Marcar como hecha"}
      >
        {done ? "Reabrir" : "Hecha"}
      </button>
    </form>
  );
}
