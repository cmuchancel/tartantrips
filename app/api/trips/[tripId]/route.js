import {
  createTripDeleteRoute,
  createTripPatchRoute
} from "../../../../lib/backend/trips-route";

export const PATCH = createTripPatchRoute();
export const DELETE = createTripDeleteRoute();
