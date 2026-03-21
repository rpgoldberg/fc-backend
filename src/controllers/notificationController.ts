import { Request, Response } from 'express';
import Notification from '../models/Notification';
import mongoose from 'mongoose';

/**
 * GET /notifications
 * Get paginated notifications for the authenticated user.
 */
export const getNotifications = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const skip = (page - 1) * limit;

    const query = { userId: new mongoose.Types.ObjectId(req.user.id) };
    const total = await Notification.countDocuments(query);
    const pages = Math.ceil(total / limit);

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      count: notifications.length,
      page,
      pages,
      total,
      data: notifications,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while fetching notifications',
    });
  }
};

/**
 * GET /notifications/unread-count
 * Get the count of unread notifications for the authenticated user.
 */
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const count = await Notification.countDocuments({
      userId: new mongoose.Types.ObjectId(req.user.id),
      read: false,
    });

    return res.status(200).json({ success: true, count });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while counting unread notifications',
    });
  }
};

/**
 * PUT /notifications/:id/read
 * Mark a single notification as read.
 */
export const markAsRead = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(req.params.id as string),
        userId: new mongoose.Types.ObjectId(req.user.id),
      },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.status(200).json({ success: true, data: notification });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while marking notification as read',
    });
  }
};

/**
 * PUT /notifications/read-all
 * Mark all notifications as read for the authenticated user.
 */
export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const result = await Notification.updateMany(
      {
        userId: new mongoose.Types.ObjectId(req.user.id),
        read: false,
      },
      { read: true }
    );

    return res.status(200).json({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while marking all notifications as read',
    });
  }
};

/**
 * DELETE /notifications/:id
 * Delete a single notification.
 */
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const notification = await Notification.findOneAndDelete({
      _id: new mongoose.Types.ObjectId(req.params.id as string),
      userId: new mongoose.Types.ObjectId(req.user.id),
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while deleting notification',
    });
  }
};
