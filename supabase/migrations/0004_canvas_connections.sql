-- ============================================================================
-- BookSpace — canvas connections as structured relationships
--
-- A connector is stored as a `space_objects` row so it inherits z-order,
-- locking, undo, duplication and page ownership like any other object. This
-- view exposes the same rows as what they actually are — typed edges between
-- two objects — so the knowledge graph, backlinks and relationship search can
-- query relationships without parsing anything visual.
--
-- One source of truth: writing goes through space_objects, reading goes
-- through here. Nothing can drift because there is nothing duplicated.
-- ============================================================================

create type relationship_type as enum (
  'none', 'causes', 'leads_to', 'related_to', 'supports', 'contradicts',
  'influences', 'results_in', 'depends_on', 'part_of', 'example_of',
  'inspired_by', 'similar_to', 'different_from', 'custom'
);

create or replace view canvas_connections
with (security_invoker = true) as
select
  o.id,
  o.space_id,
  o.page_id                                            as space_page_id,
  (o.content ->> 'fromId')::uuid                       as source_object_id,
  (o.content ->> 'toId')::uuid                         as target_object_id,
  coalesce(o.content ->> 'relationship', 'none')::relationship_type
                                                       as type,
  coalesce(o.content ->> 'label', '')                  as label,
  o.content ->> 'fromAnchor'                           as source_anchor,
  o.content ->> 'toAnchor'                             as target_anchor,
  coalesce((o.style ->> 'arrowStart')::boolean, false) as arrow_start,
  coalesce((o.style ->> 'arrowEnd')::boolean, true)    as arrow_end,
  -- Arrows at both ends is how a two-way relationship is expressed.
  coalesce((o.style ->> 'arrowStart')::boolean, false)
    and coalesce((o.style ->> 'arrowEnd')::boolean, true)
                                                       as bidirectional,
  o.style,
  o.user_id                                            as created_by,
  o.created_at,
  o.updated_at
from space_objects o
where o.type = 'connector'
  and o.content ? 'fromId'
  and o.content ? 'toId'
  and o.content ->> 'fromId' is not null
  and o.content ->> 'toId' is not null;

comment on view canvas_connections is
  'Typed edges between canvas objects, projected from space_objects rows of type connector. security_invoker means the underlying RLS on space_objects still applies.';

-- Speeds up "what is connected to this object" in both directions.
create index if not exists space_objects_connector_from_idx
  on space_objects ((content ->> 'fromId'))
  where type = 'connector';

create index if not exists space_objects_connector_to_idx
  on space_objects ((content ->> 'toId'))
  where type = 'connector';

grant select on canvas_connections to authenticated;
