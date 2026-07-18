import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const watchRooms = sqliteTable("watch_rooms", {
  id: text("id").primaryKey(),
  inviteProofHash: text("invite_proof_hash").notNull(),
  hostParticipantId: text("host_participant_id").notNull(),
  provider: text("provider").notNull(),
  controlMode: text("control_mode").notNull().default("host"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  endedAt: integer("ended_at"),
}, (table) => [index("watch_rooms_expires_idx").on(table.expiresAt)]);

export const watchParticipants = sqliteTable("watch_participants", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("guest"),
  joinedAt: integer("joined_at").notNull(),
  lastSeenAt: integer("last_seen_at").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [
  index("watch_participants_room_idx").on(table.roomId),
  index("watch_participants_seen_idx").on(table.lastSeenAt),
]);

export const watchEvents = sqliteTable("watch_events", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  roomId: text("room_id").notNull(),
  senderId: text("sender_id").notNull(),
  targetId: text("target_id"),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [
  index("watch_events_room_seq_idx").on(table.roomId, table.seq),
  index("watch_events_expires_idx").on(table.expiresAt),
]);

export const watchRateLimits = sqliteTable("watch_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(1),
  resetAt: integer("reset_at").notNull(),
}, (table) => [index("watch_rate_limits_reset_idx").on(table.resetAt)]);
