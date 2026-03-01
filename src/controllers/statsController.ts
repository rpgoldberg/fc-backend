import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Figure from '../models/Figure';
import { createLogger } from '../utils/logger';

const logger = createLogger('STATS');

/**
 * Get figure collection statistics for the authenticated user.
 * Includes counts by manufacturer, scale, origin, category, tags, tag groups,
 * company roles, and collection status.
 */
export const getFigureStats = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }
    const userId = req.user.id;
    let userObjectId: mongoose.Types.ObjectId;

    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch (error: any) {
      logger.error('Invalid userId for ObjectId conversion:', error.message);
      return res.status(400).json({
        success: false,
        message: 'Invalid user identifier',
      });
    }

    // Optional collection status filter
    const statusFilter = req.query.status as string | undefined;
    const validStatuses = ['owned', 'ordered', 'wished'];
    const collectionStatus = statusFilter && validStatuses.includes(statusFilter) ? statusFilter : undefined;

    // Base match filter - always filter by user
    // Handle legacy figures: null/undefined collectionStatus treated as 'owned'
    const baseMatch: Record<string, any> = { userId: userObjectId };
    if (collectionStatus) {
      if (collectionStatus === 'owned') {
        baseMatch.$or = [
          { collectionStatus: 'owned' },
          { collectionStatus: { $exists: false } },
          { collectionStatus: null },
        ];
      } else {
        baseMatch.collectionStatus = collectionStatus;
      }
    }

    // Status counts (always return all three, unfiltered by status param)
    // Legacy figures with null/undefined collectionStatus are counted as 'owned'
    const statusCounts = await Figure.aggregate([
      { $match: { userId: userObjectId } },
      {
        $group: {
          _id: {
            $ifNull: ['$collectionStatus', 'owned'],
          },
          count: { $sum: 1 },
        },
      },
    ]);
    const statusCountsMap = {
      owned: 0,
      ordered: 0,
      wished: 0,
    };
    statusCounts.forEach((s: { _id: string; count: number }) => {
      if (s._id && validStatuses.includes(s._id)) {
        statusCountsMap[s._id as keyof typeof statusCountsMap] = s.count;
      }
    });

    // Total count (filtered by status if provided)
    const totalCount = await Figure.countDocuments(baseMatch);

    // Count by manufacturer (filtered) - case-insensitive grouping
    const manufacturerStats = await Figure.aggregate([
      { $match: baseMatch },
      { $group: { _id: { $toLower: '$manufacturer' }, displayName: { $first: '$manufacturer' }, count: { $sum: 1 } } },
      { $project: { _id: '$displayName', count: 1 } },
      { $sort: { count: -1 } },
    ]);

    // Count by scale (filtered) - case-insensitive grouping
    const scaleStats = await Figure.aggregate([
      { $match: baseMatch },
      { $group: { _id: { $toLower: '$scale' }, displayName: { $first: '$scale' }, count: { $sum: 1 } } },
      { $project: { _id: '$displayName', count: 1 } },
      { $sort: { count: -1 } },
    ]);

    // Count by origin/franchise (filtered) - case-insensitive grouping
    const originStats = await Figure.aggregate([
      { $match: baseMatch },
      { $group: { _id: { $toLower: '$origin' }, displayName: { $first: '$origin' }, count: { $sum: 1 } } },
      { $project: { _id: '$displayName', count: 1 } },
      { $sort: { count: -1 } },
    ]);

    // Count by category/type (filtered) - case-insensitive grouping
    const categoryStats = await Figure.aggregate([
      { $match: baseMatch },
      { $group: { _id: { $toLower: '$category' }, displayName: { $first: '$category' }, count: { $sum: 1 } } },
      { $project: { _id: '$displayName', count: 1 } },
      { $sort: { count: -1 } },
    ]);

    // Schema v3: Count manufacturers from companyRoles (filtered) - case-insensitive
    const v3ManufacturerStats = await Figure.aggregate([
      { $match: baseMatch },
      { $unwind: { path: '$companyRoles', preserveNullAndEmptyArrays: false } },
      { $match: { 'companyRoles.roleName': 'Manufacturer' } },
      { $group: { _id: { $toLower: '$companyRoles.companyName' }, displayName: { $first: '$companyRoles.companyName' }, count: { $sum: 1 } } },
      { $project: { _id: '$displayName', count: 1 } },
      { $sort: { count: -1 } },
    ]);

    // Schema v3: Count distributors from companyRoles (filtered) - case-insensitive
    const distributorStats = await Figure.aggregate([
      { $match: baseMatch },
      { $unwind: { path: '$companyRoles', preserveNullAndEmptyArrays: false } },
      { $match: { 'companyRoles.roleName': 'Distributor' } },
      { $group: { _id: { $toLower: '$companyRoles.companyName' }, displayName: { $first: '$companyRoles.companyName' }, count: { $sum: 1 } } },
      { $project: { _id: '$displayName', count: 1 } },
      { $sort: { count: -1 } },
    ]);

    // Schema v3: Count sculptors from artistRoles (filtered) - case-insensitive
    const sculptorStats = await Figure.aggregate([
      { $match: baseMatch },
      { $unwind: { path: '$artistRoles', preserveNullAndEmptyArrays: false } },
      { $match: { 'artistRoles.roleName': 'Sculptor' } },
      { $group: { _id: { $toLower: '$artistRoles.artistName' }, displayName: { $first: '$artistRoles.artistName' }, count: { $sum: 1 } } },
      { $project: { _id: '$displayName', count: 1 } },
      { $sort: { count: -1 } },
    ]);

    // Schema v3: Count illustrators from artistRoles (filtered) - case-insensitive
    const illustratorStats = await Figure.aggregate([
      { $match: baseMatch },
      { $unwind: { path: '$artistRoles', preserveNullAndEmptyArrays: false } },
      { $match: { 'artistRoles.roleName': 'Illustrator' } },
      { $group: { _id: { $toLower: '$artistRoles.artistName' }, displayName: { $first: '$artistRoles.artistName' }, count: { $sum: 1 } } },
      { $project: { _id: '$displayName', count: 1 } },
      { $sort: { count: -1 } },
    ]);

    // Schema v3: Count by classification (filtered) - case-insensitive
    const classificationStats = await Figure.aggregate([
      { $match: baseMatch },
      { $group: { _id: { $toLower: '$classification' }, displayName: { $first: '$classification' }, count: { $sum: 1 } } },
      { $project: { _id: '$displayName', count: 1 } },
      { $sort: { count: -1 } },
    ]);

    // Schema v3: Tag statistics - count occurrences of each tag
    const tagStats = await Figure.aggregate([
      { $match: baseMatch },
      { $unwind: { path: '$tags', preserveNullAndEmptyArrays: false } },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Schema v3: Tag group statistics - group tags by their prefix (e.g., "character:", "series:")
    const tagGroupStats = await Figure.aggregate([
      { $match: baseMatch },
      { $unwind: { path: '$tags', preserveNullAndEmptyArrays: false } },
      {
        $addFields: {
          tagGroup: {
            $cond: {
              if: { $gt: [{ $indexOfCP: ['$tags', ':'] }, -1] },
              then: { $arrayElemAt: [{ $split: ['$tags', ':'] }, 0] },
              else: 'ungrouped',
            },
          },
        },
      },
      {
        $group: {
          _id: '$tagGroup',
          count: { $sum: 1 },
          tags: { $addToSet: '$tags' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    // Prevent caching of stats - always fetch fresh data
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).json({
      success: true,
      data: {
        totalCount,
        statusCounts: statusCountsMap,
        manufacturerStats,
        v3ManufacturerStats,
        distributorStats,
        scaleStats,
        originStats,
        categoryStats,
        sculptorStats,
        illustratorStats,
        classificationStats,
        tagStats,
        tagGroupStats,
        activeStatus: collectionStatus || null,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message,
    });
  }
};
