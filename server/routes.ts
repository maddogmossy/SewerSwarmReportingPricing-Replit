import express, { type Express, type Request, type Response } from "express";
import { createServer } from "http";
import multer from "multer";
import path from "path";
import fs, { existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { db } from "./db";
import { storage } from "./storage";
import { fileUploads, users, sectionInspections, sectionDefects, equipmentTypes, pricingRules, sectorStandards, projectFolders, repairMethods, reportPricing, workCategories, depotSettings, travelCalculations, vehicleTravelRates } from "@shared/schema";
import { eq, desc, asc, and } from "drizzle-orm";
import { MSCC5Classifier } from "./mscc5-classifier";
import { SEWER_CLEANING_MANUAL } from "./sewer-cleaning";
import { DataIntegrityValidator, validateBeforeInsert } from "./data-integrity";
import { WorkflowTracker } from "./workflow-tracker";
import { searchUKAddresses } from "./address-autocomplete.js";

import Stripe from "stripe";
import { setupAuth } from "./replitAuth";
import fetch from "node-fetch";
import { handleVehicleDefaults } from "./vehicle-defaults";
import { initializeFuelPriceMonitoring, FuelPriceMonitor } from "./fuel-price-monitor";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Missing STRIPE_SECRET_KEY - running in demo mode');
}
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.db', '.db3', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    const isMetaFile = file.originalname.toLowerCase().includes('meta') && ext === '.db3';
    
    if (allowedTypes.includes(ext) || isMetaFile) {
      cb(null, true);
    } else {
      cb(new Error('Only .db3 and .pdf files are allowed'));
    }
  }
});

// Multiple file upload for paired .db3 files
const uploadMultiple = multer({
  dest: "uploads/",
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit per file
    files: 5 // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.db', '.db3', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    const isMetaFile = file.originalname.toLowerCase().includes('meta') && ext === '.db3';
    
    if (allowedTypes.includes(ext) || isMetaFile) {
      cb(null, true);
    } else {
      cb(new Error('Only .db3 and .pdf files are allowed'));
    }
  }
});

// Separate multer configuration for image uploads (logos)
const logoUpload = multer({
  dest: "uploads/logos/",
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for logos
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, GIF, WebP) are allowed'));
    }
  }
});

// Function to automatically fetch logo from company website
async function fetchLogoFromWebsite(websiteUrl: string): Promise<string | null> {
  try {
    // Normalize the URL
    let url = websiteUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    // Try multiple common logo paths
    const logoUrls = [
      `${url}/favicon.ico`,
      `${url}/logo.png`,
      `${url}/logo.jpg`,
      `${url}/assets/logo.png`,
      `${url}/images/logo.png`,
      `${url}/static/logo.png`
    ];

    // First try direct logo URLs
    for (const logoUrl of logoUrls) {
      try {
        const logoResponse = await fetch(logoUrl);
        if (logoResponse.ok && logoResponse.headers.get('content-type')?.startsWith('image/')) {
          const buffer = await logoResponse.buffer();
          const fileExtension = logoUrl.split('.').pop()?.split('?')[0] || 'png';
          const filename = `auto-logo-${Date.now()}.${fileExtension}`;
          const filepath = path.join('uploads/logos', filename);
          
          await fs.promises.mkdir('uploads/logos', { recursive: true });
          await fs.promises.writeFile(filepath, buffer);
          
          return filepath;
        }
      } catch (error) {
        continue;
      }
    }

    // If direct URLs fail, try to parse HTML for meta tags
    try {
      const htmlResponse = await fetch(url);
      if (htmlResponse.ok) {
        const html = await htmlResponse.text();
        
        // Look for various logo meta tags
        const metaPatterns = [
          /<meta property="og:image" content="([^"]+)"/i,
          /<meta name="twitter:image" content="([^"]+)"/i,
          /<link rel="icon" href="([^"]+)"/i,
          /<link rel="shortcut icon" href="([^"]+)"/i,
          /<meta property="og:image:url" content="([^"]+)"/i
        ];

        for (const pattern of metaPatterns) {
          const match = html.match(pattern);
          if (match) {
            let logoUrl = match[1];
            
            // Handle relative URLs
            if (logoUrl.startsWith('/')) {
              logoUrl = url + logoUrl;
            } else if (!logoUrl.startsWith('http')) {
              logoUrl = url + '/' + logoUrl;
            }

            try {
              const logoResponse = await fetch(logoUrl);
              if (logoResponse.ok && logoResponse.headers.get('content-type')?.startsWith('image/')) {
                const buffer = await logoResponse.buffer();
                const fileExtension = logoUrl.split('.').pop()?.split('?')[0] || 'png';
                const filename = `auto-logo-${Date.now()}.${fileExtension}`;
                const filepath = path.join('uploads/logos', filename);
                
                await fs.promises.mkdir('uploads/logos', { recursive: true });
                await fs.promises.writeFile(filepath, buffer);
                
                return filepath;
              }
            } catch (error) {
              continue;
            }
          }
        }
      }
    } catch (error) {
    }

    return null;
  } catch (error) {
    return null;
  }
}

// Handler function following the pattern you provided
async function validateDb3Handler(req: Request, res: Response) {
  try {
    const directory = req.body.directory || req.query.directory || '/mnt/data';
    const { validateGenericDb3Files } = await import('./db3-validator');
    
    const validation = validateGenericDb3Files(directory as string);

    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
    }

    // Check if meta file is present
    const hasMetaDb = !!validation.files?.meta;

    // Proceed to read both .db3 and _Meta.db3 files using sqlite3 or better-sqlite3
    // TODO: extract grading, observations, node refs, etc
    res.status(200).json({ 
      message: validation.message,
      warning: validation.warning,
      hasMetaDb
    });
  } catch (error) {
    console.error('Database validation error:', error);
    res.status(500).json({ error: 'Internal server error during validation' });
  }
}

export async function registerRoutes(app: Express) {
  const server = createServer(app);

  // Test auth bypass - provide unlimited access without trial
  app.get('/api/auth/user', async (req, res) => {
    res.json({
      id: 'test-user',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      subscriptionStatus: 'unlimited',
      access: 'unlimited',
      role: 'admin',
      trialReportsRemaining: 999,
      hasActiveSubscription: true
    });
  });

  // Company Settings API endpoints - positioned early to avoid route conflicts
  app.get("/api/company-settings", async (req: Request, res: Response) => {
    try {
      const userId = "test-user"; // Default user for testing
      const companySettings = await storage.getCompanySettings(userId);
      res.json(companySettings || {});
    } catch (error) {
      console.error("Error fetching company settings:", error);
      res.status(500).json({ error: "Failed to fetch company settings" });
    }
  });

  app.put("/api/company-settings", logoUpload.single("companyLogo"), async (req: Request, res: Response) => {
    try {
      const userId = "test-user"; // Default user for testing
      let updates = req.body;
      
      // Get current settings to check for existing logo file
      const currentSettings = await storage.getCompanySettings(userId);
      const currentLogoPath = currentSettings?.companyLogo;
      
      // Handle logo upload if present
      if (req.file) {
        updates.companyLogo = req.file.path;
        
        // Delete old logo file if it exists and we're replacing it
        if (currentLogoPath && fs.existsSync(currentLogoPath)) {
          try {
            fs.unlinkSync(currentLogoPath);
          } catch (error) {
            console.warn("⚠️ Could not delete old logo file:", error);
          }
        }
      }
      
      // Handle logo deletion (when companyLogo is explicitly set to empty string)
      if (updates.companyLogo === '' && currentLogoPath) {
        // Delete the physical file
        if (fs.existsSync(currentLogoPath)) {
          try {
            fs.unlinkSync(currentLogoPath);
          } catch (error) {
            console.warn("⚠️ Could not delete logo file:", error);
          }
        }
        updates.companyLogo = null; // Set to null in database
      }
      
      const updatedSettings = await storage.updateCompanySettings(userId, updates);
      res.json(updatedSettings);
    } catch (error) {
      console.error("Error updating company settings:", error);
      res.status(500).json({ error: "Failed to update company settings" });
    }
  });

  // Depot Settings API endpoints
  app.get("/api/depot-settings", async (req: Request, res: Response) => {
    try {
      const userId = "test-user"; // Default user for testing
      const depotSettings = await storage.getDepotSettings(userId);
      res.json(depotSettings || []);
    } catch (error) {
      console.error("Error fetching depot settings:", error);
      res.status(500).json({ error: "Failed to fetch depot settings" });
    }
  });

  app.post("/api/depot-settings", async (req: Request, res: Response) => {
    try {
      const userId = "test-user"; // Default user for testing
      const depotData = { ...req.body, adminUserId: userId };
      const newDepot = await storage.createDepotSettings(depotData);
      res.json(newDepot);
    } catch (error) {
      console.error("Error creating depot settings:", error);
      res.status(500).json({ error: "Failed to create depot settings" });
    }
  });

  app.put("/api/depot-settings/:id", async (req: Request, res: Response) => {
    try {
      const depotId = parseInt(req.params.id);
      const updates = req.body;
      const updatedDepot = await storage.updateDepotSettings(depotId, updates);
      res.json(updatedDepot);
    } catch (error) {
      console.error("Error updating depot settings:", error);
      res.status(500).json({ error: "Failed to update depot settings" });
    }
  });

  // Team Members API endpoints
  app.get("/api/team-members", async (req: Request, res: Response) => {
    try {
      const userId = "test-user"; // Default user for testing
      const teamMembers = await storage.getTeamMembers(userId);
      res.json(teamMembers || []);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ error: "Failed to fetch team members" });
    }
  });

  app.post("/api/invite-team-member", async (req: Request, res: Response) => {
    try {
      const userId = "test-user"; // Default user for testing
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      // Create invitation
      const invitation = {
        adminUserId: userId,
        email,
        token: Math.random().toString(36).substring(2, 15),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        status: 'pending' as const
      };
      
      const createdInvitation = await storage.createTeamInvitation(invitation);
      res.json({ message: "Invitation sent successfully", invitation: createdInvitation });
    } catch (error) {
      console.error("Error inviting team member:", error);
      res.status(500).json({ error: "Failed to send invitation" });
    }
  });

  // Payment Methods API endpoints (placeholder for Stripe integration)
  app.get("/api/payment-methods", async (req: Request, res: Response) => {
    try {
      // Placeholder response for payment methods
      res.json([]);
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      res.status(500).json({ error: "Failed to fetch payment methods" });
    }
  });

  app.post("/api/update-payment-method", async (req: Request, res: Response) => {
    try {
      const { paymentMethodId } = req.body;
      // Placeholder for payment method update
      res.json({ message: "Payment method updated successfully" });
    } catch (error) {
      console.error("Error updating payment method:", error);
      res.status(500).json({ error: "Failed to update payment method" });
    }
  });

  // Vehicle Travel Rates API endpoints
  app.get("/api/vehicle-travel-rates", async (req: Request, res: Response) => {
    try {
      const userId = "test-user"; // Default user for testing
      const vehicleRates = await storage.getVehicleTravelRates(userId);
      res.json(vehicleRates || []);
    } catch (error) {
      console.error("Error fetching vehicle travel rates:", error);
      res.status(500).json({ error: "Failed to fetch vehicle travel rates" });
    }
  });

  app.post("/api/vehicle-travel-rates", async (req: Request, res: Response) => {
    try {
      const userId = "test-user"; // Default user for testing
      const rateData = { ...req.body, userId };
      const newRate = await storage.createVehicleTravelRate(rateData);
      res.json(newRate);
    } catch (error) {
      console.error("Error creating vehicle travel rate:", error);
      res.status(500).json({ error: "Failed to create vehicle travel rate" });
    }
  });

  app.put("/api/vehicle-travel-rates/:id", async (req: Request, res: Response) => {
    try {
      const rateId = parseInt(req.params.id);
      const updates = req.body;
      const updatedRate = await storage.updateVehicleTravelRate(rateId, updates);
      res.json(updatedRate);
    } catch (error) {
      console.error("Error updating vehicle travel rate:", error);
      res.status(500).json({ error: "Failed to update vehicle travel rate" });
    }
  });

  app.delete("/api/vehicle-travel-rates/:id", async (req: Request, res: Response) => {
    try {
      const rateId = parseInt(req.params.id);
      await storage.deleteVehicleTravelRate(rateId);
      res.json({ message: "Vehicle travel rate deleted successfully" });
    } catch (error) {
      console.error("Error deleting vehicle travel rate:", error);
      res.status(500).json({ error: "Failed to delete vehicle travel rate" });
    }
  });

  // Reprocess existing upload endpoint - reads fresh from .db3 files
  app.post('/api/reprocess/:uploadId', async (req, res) => {
    try {
      const uploadId = parseInt(req.params.uploadId);
      
      console.log(`🔄 REPROCESS REQUEST: Starting reprocessing for upload ${uploadId}`);
      
      // Get the upload record to find the original files
      const upload = await db.select().from(fileUploads)
        .where(eq(fileUploads.id, uploadId))
        .limit(1);
      
      if (upload.length === 0) {
        return res.status(404).json({ error: 'Upload not found' });
      }
      
      const fileUpload = upload[0];
      console.log(`🔄 REPROCESS: Found upload record for ${fileUpload.fileName}`);
      
      // Update status to processing
      await db.update(fileUploads)
        .set({ status: "processing" })
        .where(eq(fileUploads.id, uploadId));
      
      // Clear existing sections completely
      console.log(`🔄 REPROCESS: Clearing existing ${uploadId} section data`);
      await db.delete(sectionInspections).where(eq(sectionInspections.fileUploadId, uploadId));
      
      // Detect if this is a PDF or DB3 file
      const mainFilePath = fileUpload.filePath;
      const isPDF = fileUpload.fileName.toLowerCase().endsWith('.pdf');
      
      console.log(`🔄 REPROCESS: File type: ${isPDF ? 'PDF' : 'DB3'}`);
      console.log(`🔄 REPROCESS: Reading fresh from: ${mainFilePath}`);
      
      // Validate file exists
      const fs = await import('fs');
      if (!fs.existsSync(mainFilePath)) {
        await db.update(fileUploads)
          .set({ status: "failed" })
          .where(eq(fileUploads.id, uploadId));
        return res.status(400).json({ error: 'File not found on filesystem' });
      }
      
      try {
        let sections: any[] = [];
        let detectedFormat = 'UNIFIED';
        let defPercentsBySection: Record<number, number> = {};
        
        if (isPDF) {
          // Process PDF file (processPDF handles section storage and rules run internally)
          console.log(`🔄 REPROCESS: Processing PDF with sector ${fileUpload.sector}`);
          const { processPDF } = await import('./pdf-processor');
          sections = await processPDF(mainFilePath, uploadId, fileUpload.sector || 'utilities');
          console.log(`🔄 REPROCESS: PDF extracted ${sections.length} sections (rules run completed by processPDF)`);
        } else {
          // Process DB3 file
          const metaDbPath = mainFilePath.replace('.db3', '_Meta.db3');
          console.log(`🔄 REPROCESS: Processing DB3 files`);
          console.log(`🔄 Main DB: ${mainFilePath}`);
          console.log(`🔄 Meta DB: ${metaDbPath}`);
          
          const { readWincanDatabase, storeWincanSections } = await import('./wincan-db-reader');
          const result = await readWincanDatabase(mainFilePath, fileUpload.sector || 'utilities', uploadId);
          sections = result.sections;
          detectedFormat = result.detectedFormat;
          defPercentsBySection = result.defPercentsBySection;
          
          console.log(`🔄 REPROCESS: DB3 extracted ${sections.length} sections, format: ${detectedFormat}`);
          
          // Store sections with latest storage logic (includes pipe size corrections)
          if (sections.length > 0) {
            await storeWincanSections(sections, uploadId, defPercentsBySection);
          }
          
          // Create rules run for versioned derivations pipeline (DB3 only)
          console.log(`🔄 REPROCESS: Creating rules run for DB3 upload ${uploadId}`);
          try {
            const { SimpleRulesRunner } = await import('./rules-runner-simple');
            await SimpleRulesRunner.createSimpleRun(uploadId);
            console.log(`✅ REPROCESS: Rules run created successfully for upload ${uploadId}`);
          } catch (rulesError) {
            console.error(`❌ REPROCESS: Failed to create rules run:`, rulesError);
            throw rulesError;
          }
        }
        
        // Update status to completed
        await db.update(fileUploads)
          .set({ 
            status: "completed",
            extractedData: JSON.stringify({
              sectionsCount: sections.length,
              extractionType: isPDF ? "reprocessed_from_pdf" : "reprocessed_from_db3",
              detectedFormat: detectedFormat,
              reprocessedAt: new Date().toISOString()
            })
          })
          .where(eq(fileUploads.id, uploadId));
        
        console.log(`✅ REPROCESS COMPLETE: ${sections.length} sections reprocessed successfully from ${isPDF ? 'PDF' : 'DB3'}`);
        
        res.json({
          success: true,
          message: `Successfully reprocessed ${sections.length} sections from ${isPDF ? 'PDF' : 'DB3 files'}`,
          sectionsCount: sections.length,
          detectedFormat: detectedFormat,
          uploadId: uploadId
        });
        
      } catch (processingError) {
        console.error(`❌ REPROCESS ERROR:`, processingError);
        await db.update(fileUploads)
          .set({ status: "failed" })
          .where(eq(fileUploads.id, uploadId));
        
        res.status(500).json({ 
          error: 'Reprocessing failed: ' + processingError.message,
          uploadId: uploadId
        });
      }
      
    } catch (error) {
      console.error('Reprocess endpoint error:', error);
      res.status(500).json({ error: 'Reprocessing failed: ' + error.message });
    }
  });

  // File upload endpoint for database files only
  app.post("/api/upload", uploadMultiple.any(), async (req: Request, res: Response) => {
    try {
      console.log('🔍 UPLOAD ROUTE - Start processing');
      console.log('🔍 req.files:', req.files);
      console.log('🔍 req.body:', req.body);
      
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        console.log('❌ No files uploaded');
        return res.status(400).json({ error: "No files uploaded" });
      }
      
      // Handle both single and multiple file uploads
      const files = req.files as Express.Multer.File[];
      const mainFile = files.find(f => !f.originalname.toLowerCase().includes('meta'));
      const metaFile = files.find(f => f.originalname.toLowerCase().includes('meta'));
      
      if (!mainFile) {
        console.log('❌ No main database file found');
        return res.status(400).json({ error: "Main database file (.db3) is required" });
      }

      const userId = "test-user";
      const projectMatch = mainFile.originalname.match(/(\d{4})/);
      const projectNo = projectMatch ? projectMatch[1] : "0000";
      
      // Check if this file already exists and has a sector assigned
      const existingUpload = await db.select().from(fileUploads)
        .where(and(
          eq(fileUploads.userId, userId),
          eq(fileUploads.fileName, mainFile.originalname)
        ))
        .limit(1);
      
      // If file exists with sector, reprocess it with existing sector instead of requiring selection
      if (existingUpload.length > 0 && existingUpload[0].sector && !req.body.sector) {
        req.body.sector = existingUpload[0].sector;
      }
      
      // Handle folder assignment and visit number
      let folderId = null;
      let visitNumber = 1;
      
      if (req.body.folderId) {
        folderId = parseInt(req.body.folderId);
        
        // Count existing files in this folder to determine visit number
        const existingFiles = await db.select().from(fileUploads)
          .where(eq(fileUploads.folderId, folderId));
        visitNumber = existingFiles.length + 1;
      } else if (existingUpload.length > 0 && existingUpload[0].folderId) {
        // Use existing folder if no new folder specified
        folderId = existingUpload[0].folderId;
      }

      // Create or update file upload record
      let fileUpload;
      if (existingUpload.length > 0) {
        // Update existing upload record
        [fileUpload] = await db.update(fileUploads)
          .set({
            fileSize: mainFile.size,
            fileType: mainFile.mimetype,
            filePath: mainFile.path,
            status: "processing",
            sector: req.body.sector || existingUpload[0].sector,
            folderId: folderId !== null ? folderId : existingUpload[0].folderId,
            updatedAt: new Date()
          })
          .where(eq(fileUploads.id, existingUpload[0].id))
          .returning();
      } else {
        // Create new upload record
        [fileUpload] = await db.insert(fileUploads).values({
          userId: userId,
          folderId: folderId,
          fileName: mainFile.originalname,
          fileSize: mainFile.size,
          fileType: mainFile.mimetype,
          filePath: mainFile.path,
          status: "processing",
          projectNumber: projectNo,
          visitNumber: visitNumber,
          sector: req.body.sector || "utilities"
        }).returning();
      }

      // Check file type and process accordingly
      if (mainFile.originalname.endsWith('.db') || mainFile.originalname.endsWith('.db3')) {
        // Process database files with validation
        
        // Check if Meta file is present - REQUIRED for DB3 files only
        if (!metaFile) {
          console.error('❌ Meta.db3 file is missing - required for WRc MSCC5 grading');
          await db.update(fileUploads)
            .set({ 
              status: "failed",
              extractedData: JSON.stringify({
                error: "Meta.db3 file required for accurate WRc MSCC5 classification",
                extractionType: "meta_file_missing"
              })
            })
            .where(eq(fileUploads.id, fileUpload.id));
          
          return res.status(400).json({ 
            error: "Meta.db3 file required. Please upload both files together for accurate WRc MSCC5 classification.",
            uploadId: fileUpload.id,
            status: "failed"
          });
        }
        
        try {
          const mainFilePath = mainFile.path;
          const metaFilePath = metaFile.path;
          const uploadDirectory = path.dirname(mainFilePath);
          
          // Copy both files to the same directory to ensure proper pairing
          const targetMainPath = path.join(uploadDirectory, mainFile.originalname);
          const targetMetaPath = path.join(uploadDirectory, metaFile.originalname);
          
          if (mainFilePath !== targetMainPath) {
            fs.copyFileSync(mainFilePath, targetMainPath);
          }
          if (metaFilePath !== targetMetaPath) {
            fs.copyFileSync(metaFilePath, targetMetaPath);
          }
          
          
          // Import validation function
          const { validateGenericDb3Files } = await import('./db3-validator');
          
          // Import file pairing validator
          const { FilePairingValidator } = await import('./file-pairing-validator');
          
          // Check file pairing status
          const pairingResult = await FilePairingValidator.validateUploadedFile(
            mainFile.originalname, 
            projectNo, 
            userId
          );
          
          // Validate that both .db3 and _Meta.db3 files are present
          const validation = validateGenericDb3Files(uploadDirectory);
          
          if (!validation.valid) {
            // Update status to failed due to missing files, but include pairing warning
            await db.update(fileUploads)
              .set({ 
                status: "failed",
                extractedData: JSON.stringify({
                  error: validation.message,
                  pairingWarning: pairingResult.warning,
                  pairingStatus: pairingResult.pairStatus,
                  extractionType: "wincan_database_validation_failed"
                })
              })
              .where(eq(fileUploads.id, fileUpload.id));
            
            return res.status(400).json({ 
              error: validation.message,
              uploadId: fileUpload.id,
              status: "failed"
            });
          }
          
          
          // Log warning if meta file is missing
          if (validation.warning) {
            console.warn(validation.warning);
          }
          
          // Clear any existing sections for this file upload to prevent duplicates
          await db.delete(sectionInspections).where(eq(sectionInspections.fileUploadId, fileUpload.id));
          
          // Import and use Wincan database reader (restored main version)
          const { readWincanDatabase, storeWincanSections } = await import('./wincan-db-reader');
          
          // Use the uploaded file for processing
          const mainDbPath = targetMainPath;
          
          // Extract authentic data from database with enhanced debugging
          console.log('🔍 Processing database file:', mainDbPath);
          console.log('🔍 Sector:', req.body.sector || 'utilities');
          console.log('🔍 File exists:', fs.existsSync(mainDbPath));
          
          let sections, detectedFormat, defPercentsBySection;
          try {
            console.log('🔍 Calling readWincanDatabase...');
            const result = await readWincanDatabase(mainDbPath, req.body.sector || 'utilities', fileUpload.id);
            sections = result.sections;
            detectedFormat = result.detectedFormat;
            defPercentsBySection = result.defPercentsBySection;
            console.log(`✅ readWincanDatabase completed successfully - Detected format: ${detectedFormat}`);
          } catch (readError) {
            console.error('❌ readWincanDatabase failed:', readError);
            console.error('❌ Error details:', {
              message: readError.message,
              stack: readError.stack,
              name: readError.name
            });
            throw new Error(`Database reading failed: ${readError.message}`);
          }
          
          console.log('📊 SECSTAT Processing Results:');
          console.log(`📊 Total sections extracted: ${sections.length}`);
          
          // Log severity grade samples for verification
          const sectionsWithGrades = sections.filter(s => s.severityGrade > 0);
          console.log(`📊 Sections with severity grades: ${sectionsWithGrades.length}`);
          
          if (sectionsWithGrades.length > 0) {
            console.log('📊 Sample severity data:', sectionsWithGrades.slice(0, 3).map(s => ({
              item: s.itemNo,
              severity: s.severityGrade,
              defectType: s.defectType,
              defects: s.defects.substring(0, 50) + '...'
            })));
          }
          
          
          // Store sections in database
          if (sections.length > 0) {
            await storeWincanSections(sections, fileUpload.id, defPercentsBySection);
          }
          
          // Update file upload status to completed
          await db.update(fileUploads)
            .set({ 
              status: "completed",
              extractedData: JSON.stringify({
                sectionsCount: sections.length,
                extractionType: "wincan_database",
                validationMessage: validation.message,
                status: "completed"
              })
            })
            .where(eq(fileUploads.id, fileUpload.id));
          
          res.json({
            message: "Database file processed successfully",
            uploadId: fileUpload.id,
            sectionsExtracted: sections.length,
            status: "completed",
            validation: validation.message,
            warning: validation.warning,
            hasMetaDb: true
          });
          
        } catch (dbError) {
          console.error("Database processing error:", dbError);
          // Update status to failed since we couldn't extract sections
          await db.update(fileUploads)
            .set({ extractedData: "failed" })
            .where(eq(fileUploads.id, fileUpload.id));
          
          throw new Error(`Database processing failed: ${dbError.message}`);
        }
      } else if (mainFile.originalname.toLowerCase().endsWith('.pdf')) {
        // Process PDF files
        try {
          
          // Clear any existing sections for this file upload to prevent duplicates
          await db.delete(sectionInspections).where(eq(sectionInspections.fileUploadId, fileUpload.id));
          
          // Import PDF processing functionality
          const { processPDF } = await import('./pdf-processor');
          
          // Process PDF and extract sections
          const sections = await processPDF(mainFile.path, fileUpload.id, req.body.sector || 'utilities');
          
          console.log(`📄 PDF Processing complete: ${sections.length} sections extracted`);
          
          // Create rules run for versioned derivations pipeline
          console.log(`🔄 PDF: Creating rules run for upload ${fileUpload.id}`);
          try {
            const { SimpleRulesRunner } = await import('./rules-runner-simple');
            await SimpleRulesRunner.createSimpleRun(fileUpload.id);
            console.log(`✅ PDF: Rules run created successfully for upload ${fileUpload.id}`);
          } catch (rulesError) {
            console.error(`❌ PDF: Failed to create rules run:`, rulesError);
            // Continue anyway - rules run can be created later via reprocess
          }
          
          // Update file upload status to completed
          await db.update(fileUploads)
            .set({ 
              status: "completed",
              extractedData: JSON.stringify({
                sectionsCount: sections.length,
                extractionType: "pdf",
                status: "completed"
              })
            })
            .where(eq(fileUploads.id, fileUpload.id));
          
          res.json({
            message: "PDF file processed successfully",
            uploadId: fileUpload.id,
            sectionsExtracted: sections.length,
            status: "completed"
          });
          
        } catch (pdfError) {
          console.error("PDF processing error:", pdfError);
          // Update status to failed since we couldn't extract sections
          await db.update(fileUploads)
            .set({ extractedData: "failed" })
            .where(eq(fileUploads.id, fileUpload.id));
          
          throw new Error(`PDF processing failed: ${pdfError.message}`);
        }
      } else {
        // Unsupported file type
        await db.update(fileUploads)
          .set({ extractedData: "failed" })
          .where(eq(fileUploads.id, fileUpload.id));
        
        return res.status(400).json({ 
          error: "Unsupported file type. Only database files (.db, .db3, meta.db3) and PDF files are supported." 
        });
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  // Get file uploads
  app.get("/api/uploads", async (req: Request, res: Response) => {
    try {
      const userId = "test-user";
      const uploads = await db.select()
        .from(fileUploads)
        .where(eq(fileUploads.userId, userId))
        .orderBy(desc(fileUploads.createdAt));
      res.json(uploads);
    } catch (error) {
      console.error("Error fetching uploads:", error);
      res.status(500).json({ error: "Failed to fetch uploads" });
    }
  });

  // Get sections for an upload - VERSIONED DERIVATIONS PIPELINE
  app.get("/api/uploads/:id/sections", async (req: Request, res: Response) => {
    try {
      const uploadId = parseInt(req.params.id);
      const sector = req.query.sector as string || 'utilities';
      
      console.log(`🔍 VERSIONED DERIVATIONS - Fetching sections for upload ${uploadId} with sector ${sector}`);
      
      // Import feature flag
      const { USE_LATEST_RULES_RUN } = await import('./config/flags');
      
      // NEW: Use latest rules run pipeline if enabled
      if (USE_LATEST_RULES_RUN) {
        const { SimpleRulesRunner } = await import('./rules-runner-simple');
        
        try {
          console.log(`🔄 SECTIONS API (NEW): Using versioned derivations for upload ${uploadId}`);
          
          // Get composed data with derivations
          const composedSections = await SimpleRulesRunner.getComposedData(uploadId);
          
          // Apply proper numeric sorting for 1→24 systematic ordering
          const sortedSections = composedSections.sort((a, b) => {
            // Extract numeric part from itemNo (handle both "13" and "13a" formats)
            const aNum = parseInt(String(a.itemNo).replace(/[^0-9]/g, '')) || 999;
            const bNum = parseInt(String(b.itemNo).replace(/[^0-9]/g, '')) || 999;
            
            // Primary sort: numeric order
            if (aNum !== bNum) {
              return aNum - bNum;
            }
            
            // Secondary sort: letter suffix (service before structural)
            const aHasSuffix = String(a.itemNo).includes('a');
            const bHasSuffix = String(b.itemNo).includes('a');
            
            if (!aHasSuffix && bHasSuffix) return -1; // Service (13) before structural (13a)
            if (aHasSuffix && !bHasSuffix) return 1;
            
            return 0;
          });
          
          console.log(`🚀 SECTIONS API (NEW): Returning ${sortedSections.length} sections with versioned derivations (sorted 1→24)`);
          
          return res.json(sortedSections);
          
        } catch (error) {
          console.error(`❌ SECTIONS API (NEW): Versioned derivations failed:`, error);
          // Fall through to legacy path
        }
      }
      
      // FALLBACK: Legacy path for backwards compatibility
      console.log(`🔍 SECTIONS API (LEGACY): Using legacy processed fields path`);
      
      // Get raw sections from database
      const sections = await db.select()
        .from(sectionInspections)
        .where(eq(sectionInspections.fileUploadId, uploadId))
        .orderBy(asc(sectionInspections.itemNo), asc(sectionInspections.letterSuffix));
      
      console.log(`🔍 SECTIONS API - Found ${sections.length} sections total`);
      
      // DEBUG: Check raw data availability
      const sectionsWithRawData = sections.filter(s => s.rawObservations && s.rawObservations.length > 0);
      console.log(`🔍 SECTIONS DEBUG - Raw data available for ${sectionsWithRawData.length}/${sections.length} sections`);
      
      // Check if we need to migrate to raw data format
      const needsMigration = sections.some(section => !section.rawObservations || section.rawObservations.length === 0);
      
      if (needsMigration) {
        console.log(`🔄 SECTIONS API - Migrating to raw data format`);
        const { RawDataMigrator } = await import('./raw-data-migrator');
        await RawDataMigrator.migrateUpload(uploadId);
        
        // Refetch after migration
        const migratedSections = await db.select()
          .from(sectionInspections)
          .where(eq(sectionInspections.fileUploadId, uploadId))
          .orderBy(asc(sectionInspections.itemNo), asc(sectionInspections.letterSuffix));
        
        // Process on-demand and return processed results
        const { SectionProcessor } = await import('./section-processor');
        const processedSections = await Promise.all(
          migratedSections.map(async (section) => {
            if (section.rawObservations && section.rawObservations.length > 0) {
              const processed = await SectionProcessor.processSection(
                section.rawObservations,
                section.secstatGrades,
                sector,
                section.itemNo
              );
              return { ...section, ...processed };
            }
            return section;
          })
        );
        
        return res.json(processedSections);
      }
      
      // PERFORMANCE OPTIMIZATION: Check if sections need reprocessing
      const sectionsNeedingProcessing = sections.filter(s => 
        !s.processedAt || // Never processed
        !s.processedDefectType || // No cached defect type
        !s.processedSrmGrading || // No cached SRM grading
        (s.rawObservations && s.rawObservations.length > 0 && !s.processedDefectType) // Has raw data but no processed results
      );
      
      if (sectionsNeedingProcessing.length > 0) {
        console.log(`🔄 SECTIONS API - Processing ${sectionsNeedingProcessing.length}/${sections.length} sections that need updates`);
        
        const { SectionProcessor } = await import('./section-processor');
        
        // Process only sections that need updating
        await Promise.all(
          sectionsNeedingProcessing.map(async (section) => {
            if (section.rawObservations && section.rawObservations.length > 0) {
              const processed = await SectionProcessor.processSection(
                section.rawObservations,
                section.secstatGrades,
                sector,
                section.itemNo
              );
              
              // DEPRECATED: No longer store in processed* fields - superseded by observation_rules + rules_runs
              // Update only legacy fields for backward compatibility during transition
              await db.update(sectionInspections)
                .set({
                  // DEPRECATED: processedDefectType: processed.defectType,
                  // DEPRECATED: processedSeverityGrade: processed.severityGrade,
                  // DEPRECATED: processedSeverityGrades: processed.severityGrades,
                  // DEPRECATED: processedRecommendations: processed.recommendations,
                  // DEPRECATED: processedAdoptable: processed.adoptable,
                  // DEPRECATED: processedSrmGrading: processed.srmGrading,
                  // DEPRECATED: processedAt: new Date(),
                  // Update legacy fields for compatibility
                  defectType: processed.defectType,
                  severityGrade: processed.severityGrade.toString(),
                  severityGrades: processed.severityGrades,
                  recommendations: processed.recommendations,
                  adoptable: processed.adoptable,
                  defects: processed.defects
                })
                .where(eq(sectionInspections.id, section.id));
              
              console.log(`✅ Processed and cached section ${section.itemNo}: ${processed.defectType} Grade ${processed.severityGrade}`);
            }
          })
        );
        
        // Refetch updated sections
        const updatedSections = await db.select()
          .from(sectionInspections)
          .where(eq(sectionInspections.fileUploadId, uploadId))
          .orderBy(asc(sectionInspections.itemNo), asc(sectionInspections.letterSuffix));
        
        console.log(`🚀 SECTIONS API - Returning ${updatedSections.length} cached sections (fast path)`);
        return res.json(updatedSections);
      }
      
      // Fast path: All sections have cached processed results
      console.log(`🚀 SECTIONS API - Returning ${sections.length} cached sections (instant load)`);
      const processedSections = sections;
      
      console.log(`🔍 SECTIONS API - Returning ${processedSections.length} processed sections`);
      
      // DEBUG: Log a few processed sections to verify data
      const debugSections = processedSections.filter(s => [13, 19, 20, 21, 22].includes(s.itemNo));
      console.log('🔧 API RESPONSE DEBUG:', debugSections.map(s => ({
        itemNo: s.itemNo,
        defectType: s.defectType,
        severityGrade: s.severityGrade,
        adoptable: s.adoptable
      })));
      
      res.json(processedSections);
      
    } catch (error) {
      console.error('❌ SECTIONS API - Error:', error);
      res.status(500).json({ error: 'Failed to fetch sections' });
    }
  });

  // Get standard categories for pricing
  app.get("/api/standard-categories", async (req: Request, res: Response) => {
    try {
      const categories = await db.select().from(sectorStandards).orderBy(asc(sectorStandards.standardName));
      res.json(categories);
    } catch (error) {
      console.error("Error fetching standard categories:", error);
      
      // Check if it's a database connection error and provide fallback
      if (error && (error as any).code === 'XX000' && (error as any).message?.includes('endpoint has been disabled')) {
        console.log('🔄 Database unavailable, using fallback work categories for standard categories');
        const { FALLBACK_WORK_CATEGORIES } = await import('./fallback-data');
        return res.json(FALLBACK_WORK_CATEGORIES);
      }
      
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  // Get equipment types
  app.get("/api/equipment-types", async (req: Request, res: Response) => {
    try {
      const equipment = await db.select().from(equipmentTypes).orderBy(asc(equipmentTypes.name));
      res.json(equipment);
    } catch (error) {
      console.error("Error fetching equipment types:", error);
      res.status(500).json({ error: "Failed to fetch equipment types" });
    }
  });

  // Get sector standards
  app.get("/api/sector-standards/:sector", async (req: Request, res: Response) => {
    try {
      const { sector } = req.params;
      const standards = await db.select()
        .from(sectorStandards)
        .where(eq(sectorStandards.sector, sector))
        .orderBy(asc(sectorStandards.standardName));
      res.json(standards);
    } catch (error) {
      console.error("Error fetching sector standards:", error);
      res.status(500).json({ error: "Failed to fetch sector standards" });
    }
  });

  // Sector standards endpoint specifically for sectors like utilities
  app.get("/api/sector-standards", async (req: Request, res: Response) => {
    try {
      const { sector } = req.query;
      let standards;
      
      if (sector) {
        standards = await db.select()
          .from(sectorStandards)
          .where(eq(sectorStandards.sector, sector as string))
          .orderBy(asc(sectorStandards.standardName));
      } else {
        standards = await db.select()
          .from(sectorStandards)
          .orderBy(asc(sectorStandards.sector), asc(sectorStandards.standardName));
      }
      
      res.json(standards);
    } catch (error) {
      console.error("Error fetching sector standards:", error);
      res.status(500).json({ error: "Failed to fetch sector standards" });
    }
  });

  // Delete upload and its sections
  app.delete("/api/uploads/:id", async (req: Request, res: Response) => {
    try {
      const uploadId = parseInt(req.params.id);
      
      // Delete all sections first
      await db.delete(sectionInspections).where(eq(sectionInspections.fileUploadId, uploadId));
      
      // Get file info to delete physical file
      const upload = await db.select().from(fileUploads).where(eq(fileUploads.id, uploadId)).limit(1);
      
      // Delete upload record
      await db.delete(fileUploads).where(eq(fileUploads.id, uploadId));
      
      // Delete physical file if it exists
      if (upload.length > 0 && upload[0].filePath) {
        try {
          if (existsSync(upload[0].filePath)) {
            fs.unlinkSync(upload[0].filePath);
          }
        } catch (error) {
          console.warn("Could not delete physical file:", error);
        }
      }
      
      res.json({ message: "Upload deleted successfully" });
    } catch (error) {
      console.error("Error deleting upload:", error);
      res.status(500).json({ error: "Failed to delete upload" });
    }
  });

  // Project folders API
  app.get("/api/folders", async (req: Request, res: Response) => {
    try {
      const userId = "test-user";
      const folders = await db.select()
        .from(projectFolders)
        .where(eq(projectFolders.userId, userId))
        .orderBy(desc(projectFolders.createdAt));
      res.json(folders);
    } catch (error) {
      console.error("Error fetching folders:", error);
      res.status(500).json({ error: "Failed to fetch folders" });
    }
  });

  app.post("/api/folders", async (req: Request, res: Response) => {
    try {
      const userId = "test-user";
      const { folderName, projectAddress, projectPostcode, projectNumber, travelDistance, travelTime, addressValidated } = req.body;
      
      console.log('🔍 Folder creation request body:', { folderName, projectAddress, typeof_folderName: typeof folderName });
      
      // Validate that folderName is provided and not empty
      if (!folderName || typeof folderName !== 'string' || folderName.trim().length === 0) {
        console.log('❌ Folder validation failed:', { folderName, typeof_folderName: typeof folderName });
        return res.status(400).json({ error: "Folder name is required" });
      }
      
      console.log('✅ Folder validation passed, creating folder:', folderName.trim());
      
      const [folder] = await db.insert(projectFolders).values({
        userId,
        folderName: folderName.trim(),
        projectAddress: projectAddress || "Not specified",
        projectPostcode: projectPostcode || null,
        projectNumber: projectNumber || null,
        travelDistance: travelDistance || null,
        travelTime: travelTime || null,
        addressValidated: addressValidated || false
      }).returning();
      
      console.log('✅ Folder created successfully:', folder);
      res.json(folder);
    } catch (error) {
      console.error("Error creating folder:", error);
      res.status(500).json({ error: "Failed to create folder" });
    }
  });

  // Address autocomplete endpoint
  app.get("/api/address-autocomplete", async (req: Request, res: Response) => {
    try {
      const { query } = req.query;
      if (!query || typeof query !== 'string') {
        return res.json([]);
      }
      
      const addresses = await searchUKAddresses(query);
      res.json(addresses);
    } catch (error) {
      console.error("Error in address autocomplete:", error);
      res.status(500).json({ error: "Failed to search addresses" });
    }
  });

  // Logo upload endpoint
  app.post("/api/upload-logo", logoUpload.single("logo"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No logo file uploaded" });
      }

      res.json({
        message: "Logo uploaded successfully",
        filename: req.file.filename,
        path: req.file.path
      });
    } catch (error) {
      console.error("Error uploading logo:", error);
      res.status(500).json({ error: "Failed to upload logo" });
    }
  });

  // Auto-fetch logo from website
  app.post("/api/auto-fetch-logo", async (req: Request, res: Response) => {
    try {
      const { websiteUrl } = req.body;
      
      if (!websiteUrl) {
        return res.status(400).json({ error: "Website URL is required" });
      }

      const logoPath = await fetchLogoFromWebsite(websiteUrl);
      
      if (logoPath) {
        res.json({
          message: "Logo fetched successfully",
          logoPath: logoPath.replace('uploads/', '')
        });
      } else {
        res.status(404).json({ error: "Could not find a suitable logo from the website" });
      }
    } catch (error) {
      console.error("Error auto-fetching logo:", error);
      res.status(500).json({ error: "Failed to fetch logo from website" });
    }
  });



  // Database validation endpoint
  app.post("/api/validate-db3", validateDb3Handler);
  app.get("/api/validate-db3", validateDb3Handler);
  
  // Load survey endpoint using the validation pattern
  app.get("/api/load-survey", validateDb3Handler);

  // Serve logo files through API endpoint - MOVED TO TOP OF registerRoutes function
  app.get('/api/logo/:filename', (req, res) => {
    const filename = req.params.filename;
    const logoPath = path.join(process.cwd(), 'uploads', 'logos', filename);
    
    
    if (fs.existsSync(logoPath)) {
      // Set proper content type for PNG images
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      
      // Use absolute path and proper method
      const absolutePath = path.resolve(logoPath);
      
      res.sendFile(absolutePath, (err) => {
        if (err) {
          console.error('Error sending file:', err);
          res.status(500).json({ error: 'Failed to send logo file' });
        } else {
        }
      });
    } else {
      res.status(404).json({ error: 'Logo not found' });
    }
  });

  // Payment methods endpoints
  app.get('/api/payment-methods', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // This would get customer's payment methods from Stripe/PayPal
      // For demo purposes, returning sample data showing all three types
      const sampleMethods = [
        {
          id: 'card_1',
          type: 'card',
          card: {
            brand: 'visa',
            last4: '4242',
            exp_month: 12,
            exp_year: 2026
          },
          isDefault: true
        },
        {
          id: 'applepay_1',
          type: 'apple_pay',
          isDefault: false
        },
        {
          id: 'paypal_1', 
          type: 'paypal',
          isDefault: false
        }
      ];

      // For now return empty array - user can add methods
      res.json([]);
    } catch (error: any) {
      console.error('Error fetching payment methods:', error);
      res.status(500).json({ error: 'Failed to fetch payment methods' });
    }
  });

  app.post('/api/payment-methods', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { paymentMethodId, type, enabled } = req.body;


      // Handle different payment method types
      switch (type) {
        case 'card':
          // This would attach Stripe payment method to customer
          break;
        case 'apple_pay':
          // This would enable Apple Pay for the customer
          break;
        case 'paypal':
          // This would connect PayPal account
          break;
        default:
          return res.status(400).json({ error: 'Invalid payment method type' });
      }

      // Return success with mock ID
      res.json({ 
        success: true, 
        id: `${type}_${Date.now()}`,
        type,
        paymentMethodId 
      });
    } catch (error: any) {
      console.error('Error adding payment method:', error);
      res.status(500).json({ error: 'Failed to add payment method' });
    }
  });

  app.post('/api/update-default-payment-method', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { paymentMethodId } = req.body;


      // This would update default payment method across all payment providers
      // Stripe, Apple Pay, or PayPal depending on the method type
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error updating default payment method:', error);
      res.status(500).json({ error: 'Failed to update default payment method' });
    }
  });

  app.delete('/api/payment-methods/:paymentMethodId', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { paymentMethodId } = req.params;


      // This would handle removal based on method type:
      // - Stripe: detach payment method
      // - Apple Pay: disable for customer
      // - PayPal: disconnect account
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting payment method:', error);
      res.status(500).json({ error: 'Failed to delete payment method' });
    }
  });

  // PayPal payment routes temporarily disabled
  app.get("/paypal/setup", async (req, res) => {
      res.status(503).json({ error: "PayPal integration temporarily disabled" });
  });

  app.post("/paypal/order", async (req, res) => {
    res.status(503).json({ error: "PayPal integration temporarily disabled" });
  });

  app.post("/paypal/order/:orderID/capture", async (req, res) => {
    res.status(503).json({ error: "PayPal integration temporarily disabled" });
  });

  // Sections endpoint for dashboard data
  app.get("/api/sections", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string || "test-user";
      
      // Get all section inspections for the user
      const sections = await db.select()
        .from(sectionInspections)
        .innerJoin(fileUploads, eq(sectionInspections.fileUploadId, fileUploads.id))
        .where(and(
          eq(fileUploads.userId, userId),
          eq(fileUploads.status, "completed")
        ))
        .orderBy(desc(sectionInspections.id));
      
      // Format the response data
      const formattedSections = sections.map(row => ({
        id: row.section_inspections.id,
        fileUploadId: row.section_inspections.fileUploadId,
        itemNo: row.section_inspections.itemNo,
        letterSuffix: row.section_inspections.letterSuffix,
        projectNo: row.section_inspections.projectNo,
        startMH: row.section_inspections.startMH,
        finishMH: row.section_inspections.finishMH,
        pipeSize: row.section_inspections.pipeSize,
        pipeMaterial: row.section_inspections.pipeMaterial,
        totalLength: row.section_inspections.totalLength,
        defects: row.section_inspections.defects,
        // RAW DATA ARCHITECTURE FIELDS - Item 4 Integration
        rawObservations: row.section_inspections.rawObservations,
        secstatGrades: row.section_inspections.secstatGrades,
        inspectionDirection: row.section_inspections.inspectionDirection,
        defectType: row.section_inspections.defectType,
        severityGrade: row.section_inspections.severityGrade,
        severityGrades: row.section_inspections.severityGrades,
        recommendations: row.section_inspections.recommendations,
        adoptable: row.section_inspections.adoptable,
        cost: row.section_inspections.cost,
        sector: row.file_uploads.sector,
        fileName: row.file_uploads.fileName,
        projectNumber: row.file_uploads.projectNumber
      }));
      
      res.json(formattedSections);
    } catch (error) {
      console.error("Error fetching sections:", error);
      res.status(500).json({ error: "Failed to fetch sections" });
    }
  });

  // Categories for vehicle travel rates dropdown
  app.get("/api/pr2-configurations", async (req: Request, res: Response) => {
    try {
      const userId = "test-user"; // Default user for testing
      // Import pr2Configurations here to avoid circular imports
      const { pr2Configurations } = await import("@shared/schema");
      const configs = await db.select({
        id: pr2Configurations.id,
        categoryName: pr2Configurations.categoryName,
        sector: pr2Configurations.sector,
      }).from(pr2Configurations)
        .where(eq(pr2Configurations.userId, userId));
      
      res.json(configs);
    } catch (error) {
      console.error("Error fetching PR2 configurations:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  // Work categories for vehicle travel rates (standard categories 15-27)
  app.get("/api/work-categories", async (req: Request, res: Response) => {
    try {
      const categories = await storage.getWorkCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching work categories:", error);
      
      // Check if it's a database connection error and provide fallback
      if (error && (error as any).code === 'XX000' && (error as any).message?.includes('endpoint has been disabled')) {
        console.log('🔄 Database unavailable, using fallback work categories');
        const { FALLBACK_WORK_CATEGORIES } = await import('./fallback-data');
        return res.json(FALLBACK_WORK_CATEGORIES);
      }
      
      res.status(500).json({ error: "Failed to fetch work categories" });
    }
  });

  // Vehicle defaults endpoint - returns MPG averages and default values for vehicle types
  app.get('/api/vehicle-defaults/:vehicleType', handleVehicleDefaults);

  // Fuel price monitoring endpoints
  app.get('/api/fuel-prices/latest', async (req: Request, res: Response) => {
    try {
      const monitor = FuelPriceMonitor.getInstance();
      const latestPrices = await monitor.getLatestFuelPrices();
      
      if (!latestPrices) {
        // Return default prices if no data in database yet
        res.json({
          diesel: 1.4291, // £1.4291 per litre (current UK average)
          petrol: 1.3550, // £1.3550 per litre
          source: 'Default UK Average',
          lastUpdated: new Date().toISOString()
        });
      } else {
        res.json({
          diesel: latestPrices.diesel,
          petrol: latestPrices.petrol,
          source: 'Database',
          lastUpdated: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error getting latest fuel prices:', error);
      res.status(500).json({ error: 'Failed to get fuel prices' });
    }
  });

  // Manual fuel price update trigger (for testing)
  app.post('/api/fuel-prices/update', async (req: Request, res: Response) => {
    try {
      const monitor = FuelPriceMonitor.getInstance();
      await monitor.triggerUpdate();
      res.json({ message: 'Fuel price update triggered successfully' });
    } catch (error) {
      console.error('Error triggering fuel price update:', error);
      res.status(500).json({ error: 'Failed to trigger fuel price update' });
    }
  });

  return server;
}