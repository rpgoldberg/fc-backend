/**
 * Lookup Controller
 *
 * Provides endpoints for fetching companies, artists, and role types
 * used by form autocomplete and dropdowns.
 */

import { Request, Response } from 'express';
import Company from '../models/Company';
import Artist from '../models/Artist';
import RoleType from '../models/RoleType';

/**
 * GET /lookup/role-types
 * Get all role types, optionally filtered by kind
 */
export const getRoleTypes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { kind } = req.query;

    const query: any = {};
    if (kind && (kind === 'company' || kind === 'artist')) {
      query.kind = kind;
    }

    const roleTypes = await RoleType.find(query).sort({ name: 1 });

    res.json({
      success: true,
      data: roleTypes,
    });
  } catch (error: any) {
    console.error('Error fetching role types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch role types',
      error: error.message,
    });
  }
};

/**
 * GET /lookup/companies
 * Get all companies, optionally filtered by search term
 */
export const getCompanies = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search } = req.query;

    let query: any = {};
    if (search && typeof search === 'string') {
      query.name = { $regex: search, $options: 'i' };
    }

    const companies = await Company.find(query)
      .populate('subType', 'name kind')
      .sort({ name: 1 })
      .limit(100);

    res.json({
      success: true,
      data: companies,
    });
  } catch (error: any) {
    console.error('Error fetching companies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch companies',
      error: error.message,
    });
  }
};

/**
 * GET /lookup/artists
 * Get all artists, optionally filtered by search term
 */
export const getArtists = async (req: Request, res: Response): Promise<void> => {
  try {
    const { search } = req.query;

    let query: any = {};
    if (search && typeof search === 'string') {
      query.name = { $regex: search, $options: 'i' };
    }

    // Artist model doesn't have defaultRoleType - role is assigned at figure level
    const artists = await Artist.find(query)
      .sort({ name: 1 })
      .limit(100);

    res.json({
      success: true,
      data: artists,
    });
  } catch (error: any) {
    console.error('Error fetching artists:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch artists',
      error: error.message,
    });
  }
};
