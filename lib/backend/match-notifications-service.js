import {
  DEFAULT_RESEND_FROM,
  PROFILE_FIELDS,
  TRIP_NOTIFICATION_FIELDS
} from "./constants";
import { HttpError } from "./errors";
import { withKeyedLock } from "./locks";
import {
  allowsSex,
  assertTripIntegrity,
  assertTripStatusesKnown,
  getSlotForEmail,
  windowsOverlap
} from "./match-utils";
import { requireNonEmptyString } from "./request";

const notificationLockKey = (tripId) => `match-notifications:${tripId}`;

async function sendNotification(emailClient, fromAddress, trip, tripProfile) {
  if (!emailClient) {
    return { error: "Missing Resend configuration" };
  }

  const subject = "Airport ride share match available";
  const recipientName = tripProfile?.name || "there";
  const text = [
    `Hi ${recipientName},`,
    "",
    "A new CMU student with a compatible trip just matched with you on TartanTrips.",
    "",
    "Log in to view your updated matches and coordinate if this one works for you.",
    "",
    "- TartanTrips"
  ].join("\n");

  try {
    const { error } = await emailClient.emails.send({
      from: fromAddress || DEFAULT_RESEND_FROM,
      to: trip.user_email,
      subject,
      text
    });

    if (error) {
      return { error: error.message || "Failed to send email" };
    }

    return { error: null };
  } catch (error) {
    return { error: error.message || "Failed to send email" };
  }
}

export async function executeMatchNotifications({
  repo,
  emailClient,
  resendFrom = DEFAULT_RESEND_FROM,
  tripId,
  now = () => new Date().toISOString()
}) {
  const normalizedTripId = requireNonEmptyString(tripId, "tripId");

  return withKeyedLock(notificationLockKey(normalizedTripId), async () => {
    const trip = await repo.getTripById(normalizedTripId, TRIP_NOTIFICATION_FIELDS);
    if (!trip) {
      throw new HttpError(404, "Trip not found");
    }

    assertTripIntegrity(trip, "Trip");
    assertTripStatusesKnown(trip);

    const timestamp = now();
    const isNewTrip = !trip.baseline_match_check_at;
    let baseline = trip.baseline_match_check_at || timestamp;

    if (!trip.baseline_match_check_at) {
      try {
        await repo.updateTrip(trip.id, { baseline_match_check_at: timestamp });
      } catch (error) {
        baseline = timestamp;
      }
    }

    const allContextTrips = await repo.getTripsByDirectionAndFlightDate(
      trip.direction,
      trip.flight_date,
      TRIP_NOTIFICATION_FIELDS
    );

    const candidates = allContextTrips.filter((candidate) => {
      return candidate.id !== trip.id && candidate.user_email !== trip.user_email;
    });

    candidates.forEach((candidate) => {
      assertTripIntegrity(candidate, "Candidate trip");
      assertTripStatusesKnown(candidate);
    });

    const profileRows = await repo.getProfilesByEmails([
      trip.user_email,
      ...new Set(candidates.map((candidate) => candidate.user_email))
    ]);

    const profileMap = new Map(profileRows.map((profile) => [profile.email, profile]));
    const tripProfile = profileMap.get(trip.user_email);

    if (!tripProfile?.sex) {
      throw new HttpError(400, "Trip owner profile is missing sex.");
    }

    const candidateById = new Map();
    candidates.forEach((candidate) => {
      if (!candidateById.has(candidate.id)) {
        candidateById.set(candidate.id, candidate);
      }
    });

    const compatible = [...candidateById.values()]
      .filter((candidate) => {
        if (getSlotForEmail(trip, candidate.user_email) !== -1) {
          return false;
        }

        if (getSlotForEmail(candidate, trip.user_email) !== -1) {
          return false;
        }

        if (
          !windowsOverlap(
            trip.window_start,
            trip.window_end,
            candidate.window_start,
            candidate.window_end
          )
        ) {
          return false;
        }

        const candidateProfile = profileMap.get(candidate.user_email);
        if (!candidateProfile?.sex) {
          return false;
        }

        return (
          allowsSex(trip.allowed_partner_sex, candidateProfile.sex) &&
          allowsSex(candidate.allowed_partner_sex, tripProfile.sex)
        );
      })
      .sort((left, right) => {
        return left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id);
      });

    const notifications = [];
    const failures = [];
    const processedPairs = new Set();

    for (const candidate of compatible) {
      const pairKey = `${trip.id}:${candidate.id}`;
      if (processedPairs.has(pairKey)) {
        continue;
      }

      processedPairs.add(pairKey);

      const candidateCreatedAfterBaseline = candidate.created_at > baseline;
      if (candidateCreatedAfterBaseline) {
        let exists = false;

        try {
          exists = Boolean(await repo.getNotificationRecord(trip.id, candidate.id));
        } catch (error) {
          exists = true;
        }

        if (!exists) {
          const sendResult = await sendNotification(emailClient, resendFrom, trip, tripProfile);
          if (!sendResult.error) {
            await repo.insertNotification({
              trip_id: trip.id,
              matched_trip_id: candidate.id,
              notified_at: now()
            });
            notifications.push({ tripId: trip.id, matchedTripId: candidate.id });
          } else {
            failures.push({
              tripId: trip.id,
              matchedTripId: candidate.id,
              error: sendResult.error
            });
          }
        }
      }

      const reverseKey = `${candidate.id}:${trip.id}`;
      if (processedPairs.has(reverseKey)) {
        continue;
      }

      const otherBaseline = candidate.baseline_match_check_at || candidate.created_at;
      if (trip.created_at <= otherBaseline) {
        continue;
      }

      processedPairs.add(reverseKey);

      let reverseExists = false;

      try {
        reverseExists = Boolean(await repo.getNotificationRecord(candidate.id, trip.id));
      } catch (error) {
        reverseExists = true;
      }

      if (reverseExists) {
        continue;
      }

      const candidateProfile = profileMap.get(candidate.user_email);
      const sendResult = await sendNotification(emailClient, resendFrom, candidate, candidateProfile);
      if (!sendResult.error) {
        await repo.insertNotification({
          trip_id: candidate.id,
          matched_trip_id: trip.id,
          notified_at: now()
        });
        notifications.push({ tripId: candidate.id, matchedTripId: trip.id });
      } else {
        failures.push({
          tripId: candidate.id,
          matchedTripId: trip.id,
          error: sendResult.error
        });
      }
    }

    return {
      notified: notifications.length,
      notifications,
      failures,
      summary: {
        tripId: trip.id,
        baselineMatchCheckAt: baseline,
        compatibleTrips: compatible.length,
        isNewTrip
      }
    };
  });
}
