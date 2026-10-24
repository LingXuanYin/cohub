-- Board settings become background layers. Idempotent: rerun after the deploy
-- to convert rows old instances wrote meanwhile.
CREATE OR REPLACE FUNCTION pg_temp.board_public_url(url text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT url ~* '^https?://[^/?#@\[\]\s]+([/?#]|$)'
    AND host !~ '(^|\.)(localhost|local|internal)$'
    AND (host !~ '^(0x[0-9a-f]*|\d+)(\.(0x[0-9a-f]*|\d+))*$' OR coalesce(NOT (
      a IN (0, 10, 127) OR a >= 224
      OR (a = 100 AND b BETWEEN 64 AND 127) OR (a = 169 AND b = 254)
      OR (a = 172 AND b BETWEEN 16 AND 31) OR (a = 192 AND b = 168)
      OR (a = 192 AND b = 0 AND c IN (0, 2)) OR (a = 192 AND b = 88 AND c = 99)
      OR (a = 198 AND b IN (18, 19)) OR (a = 198 AND b = 51 AND c = 100)
      OR (a = 203 AND b = 0 AND c = 113)
    ), false))
  FROM (SELECT lower(rtrim(substring(url FROM '^[a-zA-Z]+://([^/:?#]+)'), '.')) AS host) h,
  LATERAL (SELECT
    CASE WHEN host ~ '^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$' THEN split_part(host, '.', 1)::int END AS a,
    CASE WHEN host ~ '^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$' THEN split_part(host, '.', 2)::int END AS b,
    CASE WHEN host ~ '^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$' THEN split_part(host, '.', 3)::int END AS c
  ) ip
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION pg_temp.board_background_layers(settings jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT CASE
    WHEN jsonb_typeof(settings) <> 'object'
      OR NOT (b ?| array['kind', 'imageUrl', 'fit', 'opacity'] OR coalesce(g ? 'visible', false))
      THEN settings
    ELSE settings - 'background' - 'grid'
      || jsonb_build_object('background', jsonb_strip_nulls(jsonb_build_object(
        'color', b->'color',
        'pattern', CASE WHEN g->'visible' = 'true' THEN to_jsonb(CASE WHEN b->>'kind' = 'grid' THEN 'grid' ELSE 'dots' END) END,
        'image', CASE
          WHEN b->>'kind' = 'image' AND coalesce(pg_temp.board_public_url(b->>'imageUrl'), false) THEN jsonb_build_object('src', b->'imageUrl', 'fit', coalesce(b->'fit', '"cover"'))
            || CASE WHEN b ? 'opacity' THEN jsonb_build_object('opacity', b->'opacity') ELSE '{}'::jsonb END
        END
      )))
      || CASE WHEN jsonb_typeof(g) = 'object'
        THEN jsonb_build_object('grid', (g - 'visible') || jsonb_build_object('snap', coalesce(g->'visible' = 'true', false)))
        ELSE '{}'::jsonb
      END
  END
  FROM (SELECT coalesce(settings->'background', '{}'::jsonb) AS b, settings->'grid' AS g) AS parts
$$;
--> statement-breakpoint
UPDATE "v2"."board_transactions" t SET "changes" = n."changes"
FROM (
  SELECT "id", "changes"
    || CASE WHEN "changes"->'before' ? 'board' THEN jsonb_build_object('before', ("changes"->'before') || jsonb_build_object('board', pg_temp.board_background_layers("changes"->'before'->'board'))) ELSE '{}'::jsonb END
    || CASE WHEN "changes"->'after' ? 'board' THEN jsonb_build_object('after', ("changes"->'after') || jsonb_build_object('board', pg_temp.board_background_layers("changes"->'after'->'board'))) ELSE '{}'::jsonb END
    AS "changes"
  FROM "v2"."board_transactions"
  WHERE "receipt"->'changed'->>'board' = 'true'
    AND ("changes"->'before' ? 'board' OR "changes"->'after' ? 'board')
) n
WHERE t."id" = n."id" AND t."changes" IS DISTINCT FROM n."changes";
--> statement-breakpoint
UPDATE "v2"."board_checkpoints" SET "snapshot" = "snapshot"
  || jsonb_build_object('version', 4, 'board', pg_temp.board_background_layers(coalesce("snapshot"->'board', '{}'::jsonb)))
WHERE "snapshot"->>'version' = '3';
--> statement-breakpoint
UPDATE "v2"."boards" SET "settings" = pg_temp.board_background_layers("settings")
WHERE "settings" IS DISTINCT FROM pg_temp.board_background_layers("settings");
