import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const schemaPath = resolve(process.cwd(), "docs/backend-transaction-normalized-schema.sql");
const rpcPath = resolve(process.cwd(), "docs/backend-match-transition-rpc.sql");

describe("backend SQL artifacts", () => {
  it("defines the normalized pool, approval, and notification tables", () => {
    const sql = readFileSync(schemaPath, "utf8");

    expect(sql).toContain("create table if not exists public.ride_pools");
    expect(sql).toContain("create table if not exists public.ride_pool_members");
    expect(sql).toContain("create table if not exists public.pool_join_requests");
    expect(sql).toContain("create table if not exists public.pool_join_approvals");
    expect(sql).toContain("create table if not exists public.notification_jobs");
    expect(sql).toContain("match_notifications_trip_pair_key");
  });

  it("defines a transactional match_transition RPC on top of the normalized schema", () => {
    const sql = readFileSync(rpcPath, "utf8");

    expect(sql).toContain("create or replace function public.match_transition");
    expect(sql).toContain("for update");
    expect(sql).toContain("public.ride_pool_members");
    expect(sql).toContain("public.pool_join_requests");
    expect(sql).toContain("public.pool_join_approvals");
    expect(sql).toContain("Rideshare services only allow up to 6 riders");
  });
});
