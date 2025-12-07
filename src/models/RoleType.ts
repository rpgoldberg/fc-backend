import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Role kinds for categorizing different types of roles in the system.
 * - company: Roles for companies (Manufacturer, Distributor, Retailer)
 * - artist: Roles for artists/creators (Illustrator, Sculptor, Painter, Designer)
 * - relation: Types of relationships between items (Variant, Reissue, Bundle)
 */
export enum RoleKind {
  COMPANY = 'company',
  ARTIST = 'artist',
  RELATION = 'relation'
}

/**
 * Plain interface for RoleType data (without Mongoose Document methods).
 * Used for seed data and API responses.
 */
export interface IRoleTypeData {
  name: string;
  kind: 'company' | 'artist' | 'relation';
  mfcName?: string;
  displayOrder: number;
  isSystem: boolean;
}

/**
 * Full interface for RoleType Mongoose documents.
 * Extends Document and includes MongoDB-specific fields.
 */
export interface IRoleType extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  kind: 'company' | 'artist' | 'relation';
  mfcName?: string;
  displayOrder: number;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RoleTypeSchema = new Schema<IRoleType>(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    kind: {
      type: String,
      required: true,
      enum: ['company', 'artist', 'relation']
    },
    mfcName: {
      type: String,
      trim: true
    },
    displayOrder: {
      type: Number,
      required: true,
      default: 0
    },
    isSystem: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

// Compound unique index on name + kind
RoleTypeSchema.index({ name: 1, kind: 1 }, { unique: true });

// Index for querying by kind with ordering
RoleTypeSchema.index({ kind: 1, displayOrder: 1 });

/**
 * System roles that are seeded on application startup.
 * These roles are protected (isSystem: true) and cannot be deleted by users.
 */
export const SYSTEM_ROLES: IRoleTypeData[] = [
  // Company roles
  { name: 'Manufacturer', kind: 'company', displayOrder: 1, isSystem: true },
  { name: 'Distributor', kind: 'company', displayOrder: 2, isSystem: true },
  { name: 'Retailer', kind: 'company', displayOrder: 3, isSystem: true },

  // Artist roles
  { name: 'Illustrator', kind: 'artist', mfcName: 'Original Illustrator', displayOrder: 1, isSystem: true },
  { name: 'Sculptor', kind: 'artist', displayOrder: 2, isSystem: true },
  { name: 'Painter', kind: 'artist', displayOrder: 3, isSystem: true },
  { name: 'Designer', kind: 'artist', displayOrder: 4, isSystem: true },

  // Relation types
  { name: 'Variant', kind: 'relation', displayOrder: 1, isSystem: true },
  { name: 'Reissue', kind: 'relation', displayOrder: 2, isSystem: true },
  { name: 'Limited Edition', kind: 'relation', displayOrder: 3, isSystem: true },
  { name: 'Bundle', kind: 'relation', displayOrder: 4, isSystem: true }
];

export interface SeedResult {
  seeded: number;
  skipped: number;
}

/**
 * Seeds the RoleType collection with system roles.
 * Uses upsert to avoid duplicates and preserve existing role IDs.
 *
 * @returns Object with counts of seeded and skipped roles
 */
export async function seedRoleTypes(): Promise<SeedResult> {
  let seeded = 0;
  let skipped = 0;

  for (const role of SYSTEM_ROLES) {
    const existing = await RoleType.findOne({ name: role.name, kind: role.kind });

    if (!existing) {
      await RoleType.create(role);
      seeded++;
    } else {
      skipped++;
    }
  }

  return { seeded, skipped };
}

const RoleType: Model<IRoleType> = mongoose.model<IRoleType>('RoleType', RoleTypeSchema);

export default RoleType;
