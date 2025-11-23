import { Request, Response } from 'express';
import Figure, { IFigure } from '../models/Figure';
import mongoose from 'mongoose';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface MFCScrapedData {
  imageUrl?: string;
  manufacturer?: string;
  name?: string;
  scale?: string;
}

// Axios-based MFC scraping function
const scrapeDataFromMFCWithAxios = async (mfcLink: string): Promise<MFCScrapedData> => {
  console.log(`[MFC SCRAPER] Starting scrape for URL: ${mfcLink}`);
  
  try {
    console.log('[MFC SCRAPER] Making HTTP request...');
    const response = await axios.get(mfcLink, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      },
      timeout: 15000, // 15 second timeout
      maxRedirects: 5,
      validateStatus: (status) => status < 500 // Accept redirects and client errors
    });
    
    console.log(`[MFC SCRAPER] HTTP Response Status: ${response.status}`);
    console.log(`[MFC SCRAPER] Response Content-Type: ${response.headers['content-type']}`);
    console.log(`[MFC SCRAPER] Response data length: ${response.data ? response.data.length : 'undefined'}`);
    
    if (!response.data) {
      console.error('[MFC SCRAPER] No response data received');
      return {};
    }
    
    // Check if we got a Cloudflare challenge page
    if (response.data.includes('Just a moment...') || response.data.includes('cf-challenge') || response.status === 403) {
      console.error('[MFC SCRAPER] Detected Cloudflare challenge or 403 - scraping blocked');
      console.log('[MFC SCRAPER] Response contains Cloudflare protection. This may require manual extraction.');
      return {};
    }
    
    console.log('[MFC SCRAPER] Loading HTML with cheerio...');
    const $ = cheerio.load(response.data);
    const scrapedData: MFCScrapedData = {};
    
    console.log(`[MFC SCRAPER] HTML loaded successfully, document length: ${$.html().length}`);
    
    // Scrape image URL from main item-picture
    console.log('[MFC SCRAPER] Looking for image element...');
    const imageElement = $('.item-picture .main img').first();
    console.log(`[MFC SCRAPER] Found ${$('.item-picture').length} .item-picture elements`);
    console.log(`[MFC SCRAPER] Found ${$('.item-picture .main').length} .item-picture .main elements`);
    console.log(`[MFC SCRAPER] Found ${imageElement.length} image elements in .item-picture .main`);
    if (imageElement.length) {
      scrapedData.imageUrl = imageElement.attr('src');
      console.log(`[MFC SCRAPER] Image URL found: ${scrapedData.imageUrl}`);
    } else {
      console.log('[MFC SCRAPER] No image element found');
    }
    
    // Scrape manufacturer from span with switch attribute
    console.log('[MFC SCRAPER] Looking for manufacturer span...');
    const manufacturerSpan = $('span[switch]').first();
    console.log(`[MFC SCRAPER] Found ${$('span[switch]').length} span[switch] elements`);
    if (manufacturerSpan.length) {
      scrapedData.manufacturer = manufacturerSpan.text().trim();
      console.log(`[MFC SCRAPER] Manufacturer found: ${scrapedData.manufacturer}`);
    } else {
      console.log('[MFC SCRAPER] No manufacturer span found');
    }
    
    // Scrape name - look for span with Japanese characters (second span with switch)
    console.log('[MFC SCRAPER] Looking for name span...');
    const nameSpan = $('span[switch]').eq(1);
    if (nameSpan.length) {
      scrapedData.name = nameSpan.text().trim();
      console.log(`[MFC SCRAPER] Name found: ${scrapedData.name}`);
    } else {
      console.log('[MFC SCRAPER] No name span found');
    }
    
    // Scrape scale from item-scale class
    console.log('[MFC SCRAPER] Looking for scale element...');
    const scaleElement = $('.item-scale a[title="Scale"]');
    console.log(`[MFC SCRAPER] Found ${$('.item-scale').length} .item-scale elements`);
    console.log(`[MFC SCRAPER] Found ${$('.item-scale a').length} .item-scale a elements`);
    console.log(`[MFC SCRAPER] Found ${scaleElement.length} .item-scale a[title="Scale"] elements`);
    if (scaleElement.length) {
      let scaleText = scaleElement.text().trim();
      scrapedData.scale = scaleText;
      console.log(`[MFC SCRAPER] Scale found: ${scrapedData.scale}`);
    } else {
      console.log('[MFC SCRAPER] No scale element found');
    }
    
    console.log('[MFC SCRAPER] Final scraping results:', scrapedData);
    return scrapedData;
    
  } catch (error: any) {
    console.error(`[MFC SCRAPER] Error scraping MFC data: ${error.message}`);
    console.error(`[MFC SCRAPER] Error details:`, {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      headers: error.response?.headers
    });
    
    if (error.response) {
      console.error(`[MFC SCRAPER] Error response data (first 500 chars):`, 
        error.response.data ? error.response.data.toString().substring(0, 500) : 'No response data');
    }
    
    return {};
  }
};

// Call dedicated scraper service
const scrapeDataFromMFC = async (mfcLink: string, mfcAuth?: string): Promise<MFCScrapedData> => {
  console.log(`[MFC MAIN] Starting scrape via scraper service for: ${mfcLink}`);
  if (mfcAuth) {
    console.log('[MFC MAIN] Including MFC authentication cookies');
  }

  const scraperServiceUrl = process.env.SCRAPER_SERVICE_URL || 'http://scraper-dev:3000'; // NOSONAR

  try {
    console.log(`[MFC MAIN] Calling scraper service at: ${scraperServiceUrl}`);

    const requestBody: any = { url: mfcLink };
    if (mfcAuth) {
      requestBody.mfcAuth = mfcAuth;
    }

    const response = await axios.post(`${scraperServiceUrl}/scrape/mfc`, requestBody, {
      timeout: 45000, // 45 second timeout for browser automation
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data && response.data.success && response.data.data) {
      console.log('[MFC MAIN] Scraper service successful:', response.data.data);
      return response.data.data;
    } else {
      console.log('[MFC MAIN] Scraper service returned no data');
      return {};
    }
    
  } catch (error: any) {
    console.error('[MFC MAIN] Scraper service failed:', error.message);

    // Check if this is a user-facing error that should be shown to the user
    // (like NSFW auth requirements or MFC 404 messages)
    const errorMessage = error.response?.data?.message || error.message || '';
    if (errorMessage.includes('MFC_ITEM_NOT_ACCESSIBLE') ||
        errorMessage.includes('NSFW_AUTH_REQUIRED') ||
        errorMessage.includes('requires MFC authentication')) {
      // Re-throw user-facing errors so they reach the user
      console.log('[MFC MAIN] Re-throwing user-facing error');
      throw new Error(errorMessage);
    }

    // If scraper service is down (network/connection error), try local fallback
    console.log('[MFC MAIN] Falling back to local axios method...');
    try {
      const axiosResult = await scrapeDataFromMFCWithAxios(mfcLink);
      if (axiosResult.imageUrl || axiosResult.manufacturer || axiosResult.name) {
        console.log('[MFC MAIN] Local fallback successful');
        return axiosResult;
      }
    } catch (fallbackError: any) {
      console.error('[MFC MAIN] Local fallback also failed:', fallbackError.message);
    }

    // Return manual extraction guidance if all methods fail
    return {
      imageUrl: `MANUAL_EXTRACT:${mfcLink}`,
      manufacturer: '',
      name: '',
      scale: ''
    };
  }
};

// New endpoint for frontend to call when MFC link changes
export const scrapeMFCData = async (req: Request, res: Response) => {
  console.log('[MFC ENDPOINT] Received scrape request');
  console.log('[MFC ENDPOINT] Request body:', req.body);
  console.log('[MFC ENDPOINT] Request headers:', req.headers);
  
  try {
    const { mfcLink, mfcAuth } = req.body;

    if (!mfcLink) {
      console.log('[MFC ENDPOINT] No MFC link provided in request');
      return res.status(400).json({
        success: false,
        message: 'MFC link is required'
      });
    }

    console.log(`[MFC ENDPOINT] Processing MFC link: ${mfcLink}`);
    if (mfcAuth) {
      console.log('[MFC ENDPOINT] MFC authentication cookies provided');
    }
    
    // Validate URL format
    try {
      new URL(mfcLink);
      console.log('[MFC ENDPOINT] URL format validation passed');
    } catch (urlError) {
      console.log('[MFC ENDPOINT] Invalid URL format:', urlError);
      return res.status(400).json({
        success: false,
        message: 'Invalid URL format'
      });
    }
    
    // Check if it's an MFC URL
    if (!mfcLink.includes('myfigurecollection.net')) {
      console.log('[MFC ENDPOINT] URL is not from myfigurecollection.net');
      return res.status(400).json({
        success: false,
        message: 'URL must be from myfigurecollection.net'
      });
    }
    
    console.log('[MFC ENDPOINT] Starting scraping process...');
    const scrapedData = await scrapeDataFromMFC(mfcLink, mfcAuth);
    console.log('[MFC ENDPOINT] Scraping completed, data:', scrapedData);
    
    return res.status(200).json({
      success: true,
      data: scrapedData
    });
  } catch (error: any) {
    console.error('[MFC ENDPOINT] Error in scrapeMFCData:', error);

    // Return the actual error message from the scraper for better UX
    // This includes helpful messages like NSFW auth requirements
    return res.status(500).json({
      success: false,
      message: error.message || 'Server Error',
      error: error.message
    });
  }
};

// Get all figures for the logged-in user with pagination
export const getFigures = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    const userId = req.user.id;
    const validationErrors: string[] = [];
    
    // Validate page parameter
    const pageParam = req.query.page as string;
    const page = parseInt(pageParam, 10);
    if (pageParam && (isNaN(page) || page <= 0)) {
      validationErrors.push('Page must be a positive integer');
    }
    
    // Validate limit parameter
    const limitParam = req.query.limit as string;
    const limit = parseInt(limitParam, 10);
    if (limitParam && (isNaN(limit) || limit <= 0 || limit > 100)) {
      validationErrors.push('Limit must be between 1 and 100');
    }
    
    // Return validation errors if any
    if (validationErrors.length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation Error',
        errors: validationErrors
      });
    }
    
    // Use default values if not specified
    const validPage = page || 1;
    const validLimit = limit || 10;
    const skip = (validPage - 1) * validLimit;

    const total = await Figure.countDocuments({ userId });
    const pages = Math.ceil(total / validLimit);

    // Additional page validation
    if (validPage > pages && total > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation Error',
        errors: ['Requested page is beyond available pages']
      });
    }

    const figures = await Figure.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(validLimit);

    return res.status(200).json({
      success: true,
      count: figures.length,
      page: validPage,
      pages,
      total,
      data: figures
    });
  } catch (error: any) {
    console.error('Get Figures Error:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while fetching figures'
    });
  }
};

// Get a single figure by ID
export const getFigureById = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    const userId = req.user.id;
    const figure = await Figure.findOne({
      _id: req.params.id,
      userId
    });
    
    if (!figure) {
      return res.status(404).json({
        success: false,
        message: 'Figure not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: figure
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// Updated createFigure with enhanced scraping
export const createFigure = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    const userId = req.user.id;
    const { manufacturer, name, scale, mfcLink, location, boxNumber, imageUrl } = req.body;
    
    // Basic validation is now handled by Joi middleware
    // Only need to validate URLs here since Joi doesn't have custom URL domain validation
    const validationErrors: string[] = [];
    
    if (mfcLink) {
      try {
        const parsedUrl = new URL(mfcLink);
        if (!parsedUrl.hostname.includes('myfigurecollection.net')) {
          validationErrors.push('Invalid MFC link domain');
        }
      } catch {
        validationErrors.push('Invalid MFC link format');
      }
    }
    
    if (imageUrl) {
      try {
        new URL(imageUrl);
      } catch {
        validationErrors.push('Invalid image URL format');
      }
    }
    
    // Return validation errors if any
    if (validationErrors.length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation Error',
        errors: validationErrors
      });
    }
    
    // Check for duplicate figure for the user (only if we have manufacturer and name)
    if (manufacturer && manufacturer.trim() && name && name.trim()) {
      const existingFigure = await Figure.findOne({
        userId,
        manufacturer: manufacturer.trim(),
        name: name.trim()
      });
      
      if (existingFigure) {
        return res.status(409).json({
          success: false,
          message: 'A figure with the same name and manufacturer already exists'
        });
      }
    }
    
    // Start with provided data
    let finalData = {
      manufacturer: manufacturer ? manufacturer.trim() : '',
      name: name ? name.trim() : '',
      scale: scale ? scale.trim() : '',
      imageUrl: imageUrl ? imageUrl.trim() : '',
      location: location ? location.trim() : '',
      boxNumber: boxNumber ? boxNumber.trim() : ''
    };
    
    // If MFC link is provided, scrape missing data
    if (mfcLink && mfcLink.trim()) {
      const scrapedData = await scrapeDataFromMFC(mfcLink.trim());
      
      // Only use scraped data if the field is empty
      if (!finalData.imageUrl && scrapedData.imageUrl) {
        finalData.imageUrl = scrapedData.imageUrl;
      }
      if (!finalData.manufacturer && scrapedData.manufacturer) {
        finalData.manufacturer = scrapedData.manufacturer;
      }
      if (!finalData.name && scrapedData.name) {
        finalData.name = scrapedData.name;
      }
      if (!finalData.scale && scrapedData.scale) {
        finalData.scale = scrapedData.scale;
      }
    }
    
    // Post-scraping validation: ensure required fields are now available
    const postScrapingErrors: string[] = [];
    if (!finalData.manufacturer || finalData.manufacturer.trim().length === 0) {
      postScrapingErrors.push('Manufacturer is required and could not be scraped from MFC');
    }
    if (!finalData.name || finalData.name.trim().length === 0) {
      postScrapingErrors.push('Name is required and could not be scraped from MFC');
    }
    
    if (postScrapingErrors.length > 0) {
      return res.status(422).json({
        success: false,
        message: 'Validation failed after MFC scraping',
        errors: postScrapingErrors
      });
    }
    
    const figure = await Figure.create({
      manufacturer: finalData.manufacturer,
      name: finalData.name,
      scale: finalData.scale,
      mfcLink: mfcLink ? mfcLink.trim() : '',
      location: finalData.location,
      boxNumber: finalData.boxNumber,
      imageUrl: finalData.imageUrl,
      userId
    });
    
    return res.status(201).json({
      success: true,
      data: figure
    });
  } catch (error: any) {
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map((err: any) => err.message);
      return res.status(422).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Log server errors for debugging
    console.error('Create Figure Error:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred during figure creation'
    });
  }
};

// Update a figure
export const updateFigure = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    const userId = req.user.id;
    const { manufacturer, name, scale, mfcLink, location, boxNumber, imageUrl } = req.body;
    
    // Find figure and check ownership
    let figure = await Figure.findOne({
      _id: req.params.id,
      userId
    });
    
    if (!figure) {
      return res.status(404).json({
        success: false,
        message: 'Figure not found or you do not have permission'
      });
    }
    
    let finalData = {
      manufacturer,
      name,
      scale,
      imageUrl,
      location: location || '',
      boxNumber: boxNumber || ''
    };

    // Only scrape if MFC link is provided, not empty, and different from existing
    if (mfcLink && mfcLink.trim() && mfcLink.trim() !== figure.mfcLink) {
      const scrapedData = await scrapeDataFromMFC(mfcLink.trim());

      // Only use scraped data if the field is empty
      if (!finalData.imageUrl && scrapedData.imageUrl) {
        finalData.imageUrl = scrapedData.imageUrl;
      }
      if (!finalData.manufacturer && scrapedData.manufacturer) {
        finalData.manufacturer = scrapedData.manufacturer;
      }
      if (!finalData.name && scrapedData.name) {
        finalData.name = scrapedData.name;
      }
      if (!finalData.scale && scrapedData.scale) {
        finalData.scale = scrapedData.scale;
      }
    } else if (!imageUrl && !mfcLink) {
      // Keep existing image if no new image URL and no MFC link
      finalData.imageUrl = figure.imageUrl;
    }
    
    // Update figure
    figure = await Figure.findByIdAndUpdate(
      req.params.id,
      {
	manufacturer: finalData.manufacturer,
        name: finalData.name,
        scale: finalData.scale,
        mfcLink: mfcLink || '', // Allow empty string
        location: finalData.location,
        boxNumber: finalData.boxNumber,
        imageUrl: finalData.imageUrl
      },
      { new: true }
    );
    
    return res.status(200).json({
      success: true,
      data: figure
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// Delete a figure
export const deleteFigure = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    const userId = req.user.id;
    
    // Find figure and check ownership
    const figure = await Figure.findOne({
      _id: req.params.id,
      userId
    });
    
    if (!figure) {
      return res.status(404).json({
        success: false,
        message: 'Figure not found or you do not have permission'
      });
    }
    
    // Delete from MongoDB
    await Figure.deleteOne({ _id: req.params.id });
    
    return res.status(200).json({
      success: true,
      message: 'Figure removed successfully'
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// Search figures using MongoDB Atlas Search
export const searchFigures = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    const userId = req.user.id;
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    // Convert userId to ObjectId for the filter
    let userObjectId: mongoose.Types.ObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch (error) {
      console.error('Invalid userId for ObjectId conversion:', error);
      return res.status(400).json({
        success: false,
        message: 'Invalid user identifier'
      });
    }
    
    // Use different search logic based on environment
    let searchResults;
    
    // Enhanced check: Use fallback for test environments OR when Atlas Search is unavailable
    const useAtlasSearch = process.env.NODE_ENV === 'production' && 
                          process.env.TEST_MODE !== 'memory' &&
                          !process.env.INTEGRATION_TEST;
    
    if (!useAtlasSearch) {
      // Fallback search for test environment that simulates Atlas Search behavior
      console.log('[SEARCH] Using fallback search (regex) for non-Atlas environment');
      const searchTerms = (query as string).split(' ').filter(term => term.trim().length > 0);
      
      // Create regex patterns for each search term
      const regexConditions = searchTerms.map(term => ({
        $or: [
          { manufacturer: { $regex: term, $options: 'i' } },
          { name: { $regex: term, $options: 'i' } },
          { location: { $regex: term, $options: 'i' } },
          { boxNumber: { $regex: term, $options: 'i' } }
        ]
      }));
      
      searchResults = await Figure.find({
        userId: userObjectId,
        $and: regexConditions // All search terms must be found (simulates Atlas Search behavior)
      });
    } else {
      // MongoDB Atlas Search query for production
      console.log('[SEARCH] Using Atlas Search for production environment');
      searchResults = await Figure.aggregate([
        {
          $search: {
            index: 'figures',
            compound: {
              must: [
                {
                  text: {
                    query: query as string,
                    path: ['manufacturer', 'name', 'location', 'boxNumber'],
                    fuzzy: {
                      maxEdits: 1,
                      prefixLength: 2
                    }
                  }
                }
              ],
              filter: [
                {
                  equals: {
                    path: 'userId',
                    value: userObjectId
                  }
                }
              ]
            }
          }
        },
        {
          $project: {
            _id: 1,
            manufacturer: 1,
            name: 1,
            scale: 1,
            mfcLink: 1,
            location: 1,
            boxNumber: 1,
            imageUrl: 1,
            userId: 1
          }
        }
      ]);
    }
    
    // Transform to match expected API format
    const hits = searchResults.map(doc => ({
      id: doc._id,
      manufacturer: doc.manufacturer,
      name: doc.name,
      scale: doc.scale,
      mfcLink: doc.mfcLink,
      location: doc.location,
      boxNumber: doc.boxNumber,
      imageUrl: doc.imageUrl,
      userId: doc.userId
    }));
    
    return res.status(200).json({
      success: true,
      count: hits.length,
      data: hits
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// Advanced filter figures
export const filterFigures = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    const userId = req.user.id;
    const { manufacturer, scale, location, boxNumber } = req.query;
    
    const query: any = { userId };
    
    if (manufacturer) query.manufacturer = { $regex: manufacturer as string, $options: 'i' };
    if (scale) query.scale = { $regex: scale as string, $options: 'i' };
    if (location) query.location = { $regex: location as string, $options: 'i' };
    if (boxNumber) query.boxNumber = { $regex: boxNumber as string, $options: 'i' };
    
    const pageParam = req.query.page as string;
    const page = parseInt(pageParam, 10);
    if (pageParam && (isNaN(page) || page <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Pagination validation failed',
        errors: ['Page must be a positive integer']
      });
    }

    const limitParam = req.query.limit as string;
    const limit = parseInt(limitParam, 10);
    if (limitParam && (isNaN(limit) || limit <= 0 || limit > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Pagination validation failed',
        errors: ['Limit must be between 1 and 100']
      });
    }
    
    const validPage = page || 1;
    const validLimit = limit || 10;
    const skip = (validPage - 1) * validLimit;
    
    const total = await Figure.countDocuments(query);
    const pages = Math.ceil(total / validLimit);

    // Validate page is within total pages
    if (validPage > pages && total > 0) {
      return res.status(400).json({
        success: false,
        message: 'Pagination validation failed',
        errors: [`Requested page ${validPage} is beyond the total of ${pages} pages`]
      });
    }
    
    const figures = await Figure.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(validLimit);
    
    return res.status(200).json({
      success: true,
      count: figures.length,
      page: validPage,
      pages,
      total,
      data: figures
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// Get statistics
export const getFigureStats = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }
    const userId = req.user.id;
    let userObjectId: mongoose.Types.ObjectId;
    
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch (error) {
      console.error('Invalid userId for ObjectId conversion:', error);
      return res.status(400).json({
        success: false,
        message: 'Invalid user identifier'
      });
    }
    
    // Total count
    const totalCount = await Figure.countDocuments({ userId: userObjectId });
    
    // Count by manufacturer
    const manufacturerStats = await Figure.aggregate([
      { $match: { userId: userObjectId } },
      { $group: { _id: '$manufacturer', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Count by scale
    const scaleStats = await Figure.aggregate([
      { $match: { userId: userObjectId } },
      { $group: { _id: '$scale', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Count by location
    const locationStats = await Figure.aggregate([
      { $match: { userId: userObjectId } },
      { $group: { _id: '$location', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    return res.status(200).json({
      success: true,
      data: {
        totalCount,
        manufacturerStats,
        scaleStats,
        locationStats
      }
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};
