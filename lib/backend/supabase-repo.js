import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

import { DEFAULT_RESEND_FROM } from "./constants";
import { HttpError } from "./errors";

const selectFields = (fields) => fields.join(",");

export function createSupabaseAdminFromEnv(env = process.env) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });
}

export function createResendClientFromEnv(env = process.env) {
  return env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
}

export function getResendFromAddress(env = process.env) {
  return env.RESEND_FROM || DEFAULT_RESEND_FROM;
}

export function createSupabaseBackendRepository(supabase) {
  return {
    async getAuthUserByToken(token) {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        throw new HttpError(401, "Invalid auth token");
      }

      return data.user;
    },

    async getTripsByIds(ids, fields) {
      const { data, error } = await supabase
        .from("trips")
        .select(selectFields(fields))
        .in("id", ids);

      if (error) {
        throw new Error(error.message || "Failed to load trips");
      }

      return data ?? [];
    },

    async getTripById(id, fields) {
      const { data, error } = await supabase
        .from("trips")
        .select(selectFields(fields))
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(error.message || "Failed to load trip");
      }

      return data ?? null;
    },

    async getTripsByUserEmails(userEmails, fields) {
      if (!userEmails.length) {
        return [];
      }

      const { data, error } = await supabase
        .from("trips")
        .select(selectFields(fields))
        .in("user_email", userEmails);

      if (error) {
        throw new Error(error.message || "Failed to load trips");
      }

      return data ?? [];
    },

    async getTripsByOwner(userEmail, fields) {
      const { data, error } = await supabase
        .from("trips")
        .select(selectFields(fields))
        .eq("user_email", userEmail);

      if (error) {
        throw new Error(error.message || "Failed to load trips");
      }

      return data ?? [];
    },

    async getTripsByDirectionAndFlightDate(direction, flightDate, fields) {
      const { data, error } = await supabase
        .from("trips")
        .select(selectFields(fields))
        .eq("direction", direction)
        .eq("flight_date", flightDate);

      if (error) {
        throw new Error(error.message || "Failed to load trips");
      }

      return data ?? [];
    },

    async createTrip(payload, fields = ["id"]) {
      const { data, error } = await supabase
        .from("trips")
        .insert(payload)
        .select(selectFields(fields))
        .single();

      if (error) {
        throw new Error(error.message || "Failed to create trip");
      }

      return data ?? null;
    },

    async updateTrip(id, updates) {
      const { error } = await supabase.from("trips").update(updates).eq("id", id);
      if (error) {
        throw new Error(error.message || "Failed to update trip");
      }
    },

    async deleteTrip(id) {
      const { error } = await supabase.from("trips").delete().eq("id", id);
      if (error) {
        throw new Error(error.message || "Failed to delete trip");
      }
    },

    async getProfilesByEmails(emails) {
      if (!emails.length) {
        return [];
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("email,name,sex")
        .in("email", emails);

      if (error) {
        throw new Error(error.message || "Failed to load profiles");
      }

      return data ?? [];
    },

    async getNotificationRecord(tripId, matchedTripId) {
      const { data, error } = await supabase
        .from("match_notifications")
        .select("trip_id")
        .eq("trip_id", tripId)
        .eq("matched_trip_id", matchedTripId)
        .limit(1);

      if (error) {
        throw new Error(error.message || "Failed to load notification");
      }

      return (data ?? [])[0] ?? null;
    },

    async insertNotification(record) {
      const { error } = await supabase.from("match_notifications").insert(record);
      if (error) {
        throw new Error(error.message || "Failed to insert notification");
      }
    },

    async upsertNotificationJob(record) {
      const { data, error } = await supabase
        .from("notification_jobs")
        .upsert(record, { onConflict: "job_key" })
        .select("id,job_key,job_type,trip_id,status,attempt_count,last_error,available_at,locked_at,processed_at,created_at,updated_at")
        .single();

      if (error) {
        throw new Error(error.message || "Failed to enqueue notification job");
      }

      return data ?? null;
    },

    async getProcessableNotificationJobs({ limit, jobType, now }) {
      const { data, error } = await supabase
        .from("notification_jobs")
        .select("id,job_key,job_type,trip_id,status,attempt_count,last_error,available_at,locked_at,processed_at,created_at,updated_at")
        .eq("job_type", jobType)
        .in("status", ["pending", "failed"])
        .lte("available_at", now)
        .order("available_at", { ascending: true })
        .limit(limit);

      if (error) {
        throw new Error(error.message || "Failed to load notification jobs");
      }

      return data ?? [];
    },

    async updateNotificationJob(id, updates) {
      const { error } = await supabase.from("notification_jobs").update(updates).eq("id", id);
      if (error) {
        throw new Error(error.message || "Failed to update notification job");
      }
    },

    async executeMatchTransition({ action, tripId, matchedTripId, requesterEmail }) {
      const { data, error } = await supabase.rpc("match_transition", {
        p_action: action,
        p_trip_id: tripId,
        p_matched_trip_id: matchedTripId,
        p_requester_email: requesterEmail
      });

      if (error) {
        throw new Error(error.message || "Failed to execute match transition");
      }

      return data ?? { ok: true };
    }
  };
}
