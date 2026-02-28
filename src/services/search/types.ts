import mongoose from 'mongoose';

export interface FigureSearchResult {
  _id: mongoose.Types.ObjectId;
  name: string;
  manufacturer?: string;
  scale?: string;
  mfcLink?: string;
  imageUrl?: string;
  origin?: string;
  category?: string;
  tags?: string[];
  companyRoles?: Array<{ companyName: string; roleName: string }>;
  artistRoles?: Array<{ artistName: string; roleName: string }>;
  userId?: mongoose.Types.ObjectId;
  searchScore?: number;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
}
