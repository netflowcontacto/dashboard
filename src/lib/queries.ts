import "server-only";
import { all, one } from "./db";
import type { Client, Lead, User } from "./types";

/** Consultas de lectura compartidas entre pantallas. */

export async function usersList(): Promise<User[]> {
  return all<User>(
    "SELECT id, name, email, role, area, job_title, active FROM users WHERE active = 1 ORDER BY name",
  );
}

export async function userMap(): Promise<Map<number, User>> {
  const users = await usersList();
  return new Map(users.map((u) => [u.id, u]));
}

export interface LeadFilters {
  stage?: string;
  ownerId?: number;
  outcome?: string;
  source?: string;
  q?: string;
}

export async function leadsList(filters: LeadFilters = {}): Promise<Lead[]> {
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
    clauses.push("(name ILIKE ? OR company ILIKE ? OR specialty ILIKE ? OR contact_email ILIKE ?)");
    const like = `%${filters.q}%`;
    params.push(like, like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all<Lead>(
    `SELECT * FROM leads ${where}
     ORDER BY (outcome = 'open') DESC,
              COALESCE(next_action_date, '9999-12-31') ASC,
              id DESC`,
    params,
  );
}

export async function leadById(id: number): Promise<Lead | undefined> {
  return one<Lead>("SELECT * FROM leads WHERE id = ?", [id]);
}

export interface LeadEventRow {
  id: number;
  type: string;
  from_stage: string | null;
  to_stage: string | null;
  detail: string;
  at: string;
  user_name: string | null;
}

export async function leadEvents(leadId: number): Promise<LeadEventRow[]> {
  return all<LeadEventRow>(
    `SELECT e.id, e.type, e.from_stage, e.to_stage, e.detail, e.at, u.name AS user_name
     FROM lead_events e
     LEFT JOIN users u ON u.id = e.user_id
     WHERE e.lead_id = ? ORDER BY e.at DESC, e.id DESC`,
    [leadId],
  );
}

export async function clientsList(includeChurned = false): Promise<Client[]> {
  const where = includeChurned ? "" : "WHERE churned_at IS NULL";
  return all<Client>(
    `SELECT * FROM clients ${where} ORDER BY (churned_at IS NOT NULL), name`,
  );
}

export async function clientById(id: number): Promise<Client | undefined> {
  return one<Client>("SELECT * FROM clients WHERE id = ?", [id]);
}

export async function leadSources(): Promise<string[]> {
  const rows = await all<{ source: string }>("SELECT DISTINCT source FROM leads ORDER BY source");
  return rows.map((r) => r.source);
}
