"use client";

import { deleteObjective } from "@/actions/objectives";

export default function DeleteObjective({ id }: { id: number }) {
  return (
    <form action={deleteObjective}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn py-0.5 text-xs" aria-label="Eliminar objetivo">
        Quitar
      </button>
    </form>
  );
}
