// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(), owner: text('owner').notNull(),
  kind: text('kind').notNull(), entityId: text('entity_id').notNull(),
  createdAt: text('created_at').notNull(), body: text('body').notNull(),
}, t => [index('documents_owner_kind_created').on(t.owner,t.kind,t.createdAt), index('documents_owner_entity').on(t.owner,t.kind,t.entityId)]);
export const audit = sqliteTable('audit', {
  id: text('id').primaryKey(), owner: text('owner').notNull(),
  createdAt: text('created_at').notNull(), action: text('action').notNull(),
  accepted: integer('accepted').notNull(), body: text('body').notNull(),
});
