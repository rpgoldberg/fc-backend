import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Categories for companies/entities in the system.
 * - company: A business entity (corporation, LLC, etc.)
 * - person: An individual operating as a business
 */
export enum CompanyCategory {
  COMPANY = 'company',
  PERSON = 'person'
}

/**
 * Plain interface for Company data (without Mongoose Document methods).
 * Used for API payloads and seed data.
 */
export interface ICompanyData {
  name: string;
  category: 'company' | 'person';
  subType: mongoose.Types.ObjectId;
  mfcId?: number;
}

/**
 * Full interface for Company Mongoose documents.
 * Extends Document and includes MongoDB-specific fields.
 *
 * Note: A company can have multiple entries with different subTypes (roles).
 * For example, "Good Smile Company" might exist as both a Manufacturer and Distributor.
 */
export interface ICompany extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  category: 'company' | 'person';
  subType: mongoose.Types.ObjectId;
  mfcId?: number;
  createdAt: Date;
  updatedAt: Date;
}

const CompanySchema = new Schema<ICompany>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    category: {
      type: String,
      required: true,
      enum: ['company', 'person']
    },
    subType: {
      type: Schema.Types.ObjectId,
      ref: 'RoleType',
      required: true,
      index: true
    },
    mfcId: {
      type: Number,
      sparse: true,
      index: true
    }
  },
  { timestamps: true }
);

// Compound unique index: same entity can have multiple roles, but not duplicate role entries
CompanySchema.index({ name: 1, category: 1, subType: 1 }, { unique: true });

// Index for searching by name (case-insensitive queries)
CompanySchema.index({ name: 'text' });

const Company: Model<ICompany> = mongoose.model<ICompany>('Company', CompanySchema);

export default Company;
