/** The JSON Schema for `aero.json`, derived from the zod schema the scope validates with. */

import * as z from 'zod/mini';
import type { JSONSchema } from 'zod/v4/core';

import { AeroSchema } from '../src/lib/mapdata';

const DRAFT = 'https://json-schema.org/draft/2020-12/schema' as const;

export interface AeroJsonSchema extends JSONSchema.BaseSchema {
  $schema: NonNullable<JSONSchema.BaseSchema['$schema']>;
  title: string;
  description: string;
  required: string[];
  properties: Record<string, JSONSchema._JSONSchema>;
}

/** In input form: the lists may be omitted, and unknown keys such as `$schema` are allowed. */
export function aeroJsonSchema(): AeroJsonSchema {
  const {
    $schema: draft = DRAFT,
    required,
    properties,
    ...rest
  } = z.toJSONSchema(AeroSchema, {
    target: 'draft-2020-12',
    io: 'input',
  });
  return {
    $schema: draft,
    title: 'papaquebec aero.json',
    description:
      'Aeronautical data the scope draws: waypoints, navaids, airways, airspace, sectors and airports, all positions lat/lon degrees.',
    required: required ?? [],
    properties: properties ?? {},
    ...rest,
  };
}
