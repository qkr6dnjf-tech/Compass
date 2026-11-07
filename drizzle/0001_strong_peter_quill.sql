CREATE INDEX `documents_owner_kind_created` ON `documents` (`owner`,`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `documents_owner_entity` ON `documents` (`owner`,`kind`,`entity_id`);