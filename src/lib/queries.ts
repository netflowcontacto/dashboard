import "server-only";
import { getDb } from "./db";
import type { Client, Lead, User } from "./types";

/** Consultas de lectura compartidas entre paginas. */

export function usersList(): User[] {
  return getDb()
    .prepare("SELECT id, name, email, role, area, job_title, active FROM users WHERE active = 1 ORDER BY name")
    .all() as User[];
}

export function userMap(): Map<number, User> {
  return new Map(usersList().map((u) => [u.id, u]));
}

export interface LeadFilters {
  stage?: string;
  ownerId?: number;
  outcome?: string;
  source?: string;
  q?: string;
}

export function leadsList(filters: LeadFilters = {}): Lead[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.outcome && filters.outcome !== "todas") {
    clauses.push("outcome = ?");
    params.push(filters.outcome);
  }
  if (filters.stage && filters.stage !== "todas") {
    clauses.push("stage = ?");
    params.push(filters.stage);
  }
  if (filters.ownerId) {
    clauses.push("owner_id = ?");
    params.push(filters.ownerId);
  }
  if (filters.source && filters.source !== "todas") {
    clauses.push("source = ?");
    params.push(filters.source);
  }
  if (filters.q) {
    clauses.push("(name LIKE ? OR company LIKE ? OR specialty LIKE ? OR contact_email LIKE ?)");
    const like = `%${filters.q}%`;
    params.push(like, like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return getDb()
    .prepare(
      `SELECT * FROM leads ${where}
       ORDER BY (outcome = 'open') DESC,
                COALESCE(next_action_date, '9999-12-31') ASC,
                id DESC`,
    )
    .all(...params) as Lead[];
}

export function leadById(id: number): Lead | undefined {
  return getDb().prepare("SELECT * FROM leads WHERE id = ?").get(id) as Lead | undefined;
}

export function leadEvents(leadId: number) {
  return getDb()
    .prepare(
      `SELECT e.*, u.name AS user_name FROM lead_events e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.lead_id = ? ORDER BY e.at DESC, e.id DESC`,
    )
    .all(leadId) as {
      id: number; type: string; from_stage: string | null; to_stage: string | null;
      detail: string; at: string; user_name: string | null;
    }[];
}

export function clientsList(includeChurned = false): Client[] {
  const where = includeChurned ? "" : "WHERE churned_at IS NULL";
  return getDb()
    .prepare(`SELECT * FROM clients ${where} ORDER BY churned_at IS NOT NULL, name`)
    .all() as Client[];
}

export function clientById(id: number): Client | undefined {
  return getDb().prepare("SELECT * FROM clients WHERE id = ?").get(id) as Client | undefined;
}

export function leadSources(): string[] {
  const rows = getDb().prepare("SELECT DISTINCT source FROM leads ORDER BY source").all() as
    { source: string }[];
  return rows.map((r) => r.source);
}
