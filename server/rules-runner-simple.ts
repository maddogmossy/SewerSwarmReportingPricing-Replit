/**
 * Enhanced Rules Runner with SER/STR splitting for versioned derivations
 */

import { db } from './db';
import { rulesRuns, observationRules, sectionInspections, fileUploads } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { MSCC5Classifier } from './mscc5-classifier';

export class SimpleRulesRunner {
  
  /**
   * Create a simple rules run for testing
   */
  static async createSimpleRun(uploadId: number) {
    // Start transaction for atomic operation
    return await db.transaction(async (tx) => {
      try {
        // CRITICAL: Fetch sector from file_uploads to apply P002 guidelines
        const [fileUpload] = await tx.select()
          .from(fileUploads)
          .where(eq(fileUploads.id, uploadId));
        
        if (!fileUpload) {
          throw new Error(`File upload ${uploadId} not found`);
        }
        
        const sector = fileUpload.sector || 'utilities';
        console.log(`🎯 SECTOR CONTEXT: Processing upload ${uploadId} with sector: ${sector}`);
        
        // Create rules run record (initially pending)
        const insertData = {
          uploadId: uploadId,
          parserVersion: '1.0.0',
          rulesetVersion: 'MSCC5-2024.1',
          startedAt: new Date(),
          status: 'pending', // Start as pending, mark success only after all inserts
          finishedAt: null,
        };
        console.log(`🔍 DEBUG: Inserting rules run with data:`, JSON.stringify(insertData));
        const [run] = await tx.insert(rulesRuns).values(insertData).returning();
        
        console.log(`✅ Created rules run ${run.id} for upload ${uploadId}`);
        
        // Get sections and create observation rules
        const sections = await tx.select()
          .from(sectionInspections)
          .where(eq(sectionInspections.fileUploadId, uploadId));
        
        console.log(`📊 Processing ${sections.length} sections for observation rules with sector: ${sector}`);
        
        let totalObservationRules = 0;
        
        // Process each section and create observation rules
        for (const section of sections) {
          // Apply SER/STR splitting logic if section has mixed defects (with sector context)
          const splitSections = await this.applySplittingLogic(section, sector);
          
          for (let i = 0; i < splitSections.length; i++) {
            const splitSection = splitSections[i];
            
            console.log(`📝 Creating observation rule for section ${section.itemNo}, split ${i+1}/${splitSections.length}`);
            
            await tx.insert(observationRules).values({
              rulesRunId: run.id,
              sectionId: section.id, // Original section ID for reference
              observationIdx: i, // Index for split sections
              mscc5Json: JSON.stringify({
                itemNo: splitSection.itemNo,
                originalItemNo: section.itemNo,
                defectType: splitSection.defectType || 'service',
                letterSuffix: splitSection.letterSuffix || null,
                splitCount: splitSections.length,
                grade: parseInt(splitSection.severityGrade) || 0,
                splitType: splitSections.length > 1 ? 'split' : 'original'
              }),
              defectType: splitSection.defectType || 'service',
              severityGrade: parseInt(splitSection.severityGrade) || 0,
              recommendationText: splitSection.recommendations || 'No action required',
              adoptability: splitSection.adoptable || 'Yes',
            });
            
            totalObservationRules++;
          }
        }
        
        // CRITICAL: Fail fast if no observation rules created
        if (totalObservationRules === 0) {
          console.error(`❌ No observation rules created for upload ${uploadId} - marking as failed`);
          await tx.update(rulesRuns)
            .set({ 
              status: 'failed', 
              finishedAt: new Date(),
              derivedCount: 0 
            })
            .where(eq(rulesRuns.id, run.id));
          throw new Error(`Failed: No observation rules derived for upload ${uploadId}`);
        }
        
        // Mark run as successful with count
        await tx.update(rulesRuns)
          .set({ 
            status: 'success', 
            finishedAt: new Date(),
            derivedCount: totalObservationRules 
          })
          .where(eq(rulesRuns.id, run.id));
        
        console.log(`✅ Successfully created ${totalObservationRules} observation rules for run ${run.id}`);
        return run;
        
      } catch (error) {
        console.error('❌ Rules run failed in transaction:', error);
        throw error; // Transaction will rollback automatically
      }
    });
  }
  
  /**
   * Get latest successful run
   */
  static async getLatestRun(uploadId: number) {
    return await db.select()
      .from(rulesRuns)
      .where(eq(rulesRuns.uploadId, uploadId))
      .orderBy(desc(rulesRuns.id))
      .limit(1);
  }
  
  /**
   * Get composed section data with derivations
   */
  static async getComposedData(uploadId: number) {
    try {
      console.log(`🔄 getComposedData: Starting for upload ${uploadId}`);
      
      const runs = await this.getLatestRun(uploadId);
      if (runs.length === 0) {
        console.log('🔄 No rules run found, creating new run for upload', uploadId);
        const newRun = await this.createSimpleRun(uploadId);
        console.log('✅ Created new run:', newRun.id);
        const result = await this.buildComposedSections(uploadId, newRun);
        console.log('📊 Built composed sections:', result.length);
        return result;
      }
      
      console.log('♻️ Using existing run:', runs[0].id);
      const result = await this.buildComposedSections(uploadId, runs[0]);
      console.log('📊 Composed sections from existing run:', result.length);
      return result;
      
    } catch (error) {
      console.error('❌ getComposedData failed:', error);
      console.error('❌ Stack trace:', error.stack);
      throw error;
    }
  }
  
  /**
   * Apply SER/STR splitting logic to a section
   */
  private static async applySplittingLogic(section: any, sector: string = 'utilities'): Promise<any[]> {
    // CRITICAL FIX: Check if section ALREADY has MSCC5 classification (from PDF upload)
    // If so, preserve those values instead of reclassifying from scratch
    const hasExistingClassification = 
      section.severityGrade !== null && 
      section.severityGrade !== undefined && 
      section.defectType && 
      section.recommendations && 
      section.adoptable;
    
    if (hasExistingClassification) {
      console.log(`✅ Section ${section.itemNo} already has MSCC5 classification (PDF upload) - preserving values:`);
      console.log(`   Grade: ${section.severityGrade}, Type: ${section.defectType}, Adoptable: ${section.adoptable}`);
      // Return section as-is with existing classification intact
      return [section];
    }
    
    // Check if we have observations to process (either defects string or rawObservations array)
    const hasDefectsString = section.defects && typeof section.defects === 'string' && section.defects.trim() !== '';
    const hasRawObservations = section.rawObservations && Array.isArray(section.rawObservations) && section.rawObservations.length > 0;
    
    // If no defects and no rawObservations, apply Grade 0 classification
    if (!hasDefectsString && !hasRawObservations) {
      console.log(`📝 No observations for section ${section.itemNo} - applying Grade 0 classification`);
      
      // Apply MSCC5 classification to get proper Grade 0 metadata
      const splitSections = await MSCC5Classifier.splitMultiDefectSection(
        '', // Empty defects
        section.itemNo,
        section,
        sector
      );
      
      return splitSections.length > 0 ? splitSections : [section];
    }
    
    // If we have rawObservations but no defects string, join them for processing
    const defectsToProcess = hasDefectsString 
      ? section.defects 
      : section.rawObservations.join('. ');
    
    console.log(`📝 Processing section ${section.itemNo} with ${hasDefectsString ? 'defects string' : 'rawObservations'}`);
    
    // Use MSCC5Classifier splitting logic for sections with defects (with sector context)
    try {
      const splitSections = await MSCC5Classifier.splitMultiDefectSection(
        defectsToProcess,
        section.itemNo,
        section,
        sector
      );
      
      // If no split sections returned, keep original
      if (!splitSections || splitSections.length === 0) {
        console.log(`📝 No split sections for ${section.itemNo}, keeping original`);
        return [section];
      }
      
      // Apply letter suffixes: service first (no suffix), structural gets "a"
      const processedSections = [];
      let hasService = false;
      let hasStructural = false;
      
      // Process service defects first (original item number)
      for (const splitSection of splitSections) {
        if (splitSection.defectType === 'service' && !hasService) {
          hasService = true;
          processedSections.push({
            ...splitSection,
            letterSuffix: null,
            itemNo: section.itemNo
          });
        }
      }
      
      // Process structural defects second (with 'a' suffix)
      for (const splitSection of splitSections) {
        if (splitSection.defectType === 'structural' && !hasStructural) {
          hasStructural = true;
          
          // Validate no double suffixes exist (preventive measure)
          if (splitSection.itemNo && splitSection.itemNo.toString().includes('aa')) {
            throw new Error(`Double suffix detected in structural section: ${splitSection.itemNo}`);
          }
          
          processedSections.push({
            ...splitSection,
            letterSuffix: splitSection.letterSuffix, // Trust pre-processed suffix from MSCC5Classifier
            itemNo: splitSection.itemNo  // Use pre-processed itemNo to prevent double-suffix
          });
        }
      }
      
      // If no processed sections, return original
      return processedSections.length > 0 ? processedSections : [section];
      
    } catch (error) {
      console.log(`⚠️ Splitting failed for section ${section.itemNo}, using original:`, error.message);
      return [section];
    }
  }
  
  /**
   * Build composed sections with derived metadata and splitting
   */
  private static async buildComposedSections(uploadId: number, run: any, sector?: string) {
    console.log(`🔧 buildComposedSections: uploadId=${uploadId}, runId=${run.id}`);
    
    // Fetch sector from file_uploads if not provided
    if (!sector) {
      const [fileUpload] = await db.select()
        .from(fileUploads)
        .where(eq(fileUploads.id, uploadId));
      sector = fileUpload?.sector || 'utilities';
    }
    
    console.log(`🎯 buildComposedSections using sector: ${sector}`);
    
    const sections = await db.select()
      .from(sectionInspections)
      .where(eq(sectionInspections.fileUploadId, uploadId));
    
    console.log(`📊 Found ${sections.length} sections to process`);
    
    // Apply splitting logic and create composed sections
    const composedSections: any[] = [];
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      console.log(`🔍 Processing section ${i+1}/${sections.length}: Item ${section.itemNo}`);
      
      const splitSections = await this.applySplittingLogic(section, sector);
      console.log(`  ↳ Split into ${splitSections.length} subsections`);
      
      for (const splitSection of splitSections) {
        console.log(`💰 Calculating costs for section ${splitSection.itemNo} (${splitSection.defectType})`);
        
        // Calculate costs for this section using the same logic as dashboard
        const sectionWithCosts = await this.calculateSectionCosts(splitSection, uploadId);
        
        console.log(`💰 Cost result for ${splitSection.itemNo}: cost=${sectionWithCosts.cost}, estimatedCost=${sectionWithCosts.estimatedCost}`);
        
        composedSections.push({
          ...sectionWithCosts,
          derivedAt: run.finishedAt,
          rulesRunId: run.id,
          rulesetVersion: run.rulesetVersion,
          // Preserve original section ID for reference
          originalSectionId: section.id
        });
      }
    }
    
    console.log(`✅ Composed ${composedSections.length} total sections`);
    return composedSections;
  }

  /**
   * Calculate costs for a section using PR2 configurations
   */
  private static async calculateSectionCosts(section: any, uploadId: number) {
    try {
      // Import cost calculation logic from dashboard
      const { db } = await import('./db');
      const { pr2Configurations } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      
      // Skip cost calculation for Grade 0 sections
      if (section.severityGrade === '0' || section.severityGrade === 0) {
        return {
          ...section,
          cost: 'Complete',
          estimatedCost: null
        };
      }
      
      // Get PR2 configurations for cost calculation - use utilities sector as default
      const { and } = await import('drizzle-orm');
      const configs = await db.select()
        .from(pr2Configurations)
        .where(and(
          eq(pr2Configurations.userId, 'system'),
          eq(pr2Configurations.sector, 'utilities')
        ));
      
      // Apply cost calculation based on defect type
      if (section.defectType === 'service') {
        return await this.calculateServiceCosts(section, configs);
      } else if (section.defectType === 'structural') {
        return await this.calculateStructuralCosts(section, configs);
      }
      
      return section;
      
    } catch (error) {
      console.log(`⚠️ Cost calculation failed for section ${section.itemNo}:`, error.message);
      return section;
    }
  }

  /**
   * Calculate service costs (CCTV/Jet Vac)
   */
  private static async calculateServiceCosts(section: any, configs: any[]) {
    // Find CCTV/Jet Vac configuration
    const cctvConfig = configs.find(c => c.categoryId === 'cctv-jet-vac');
    if (!cctvConfig?.mmData?.mm4DataByPipeSize) {
      return section;
    }

    const pipeSize = section.pipeSize?.replace('mm', '') || '150';
    const mm4Data = cctvConfig.mmData.mm4DataByPipeSize[`${pipeSize}-${pipeSize}1`];
    
    if (mm4Data && mm4Data.length > 0) {
      const dayRate = parseFloat(mm4Data[0].blueValue || '0');
      const sectionLength = parseFloat(section.totalLength) || 0;
      
      if (dayRate > 0 && sectionLength > 0) {
        return {
          ...section,
          cost: dayRate,
          estimatedCost: dayRate,
          costCalculation: 'MM4 Service Day Rate'
        };
      }
    }
    
    return section;
  }

  /**
   * Calculate structural costs (MM4 Patching) with deformation percentage consideration
   */
  private static async calculateStructuralCosts(section: any, configs: any[]) {
    // Find patching configuration
    const patchingConfig = configs.find(c => c.categoryId === 'patching');
    if (!patchingConfig?.mmData?.mm4DataByPipeSize) {
      return section;
    }

    const pipeSize = section.pipeSize?.replace('mm', '') || '150';
    const mm4Key = `${pipeSize}-${pipeSize}1`;
    const mm4Data = patchingConfig.mmData.mm4DataByPipeSize[mm4Key];
    
    // Extract deformation percentage for thickness escalation
    const deformationPct = section.deformationPct || section.deformation_pct || 0;
    
    console.log(`💰 STR Cost Debug: pipeSize=${pipeSize}, key=${mm4Key}, hasData=${!!mm4Data}, defPct=${deformationPct}%`, {
      configId: patchingConfig.id,
      available_keys: Object.keys(patchingConfig.mmData.mm4DataByPipeSize || {}),
      deformationThreshold: deformationPct > 15 ? 'HIGH' : 'NORMAL'
    });
    
    if (mm4Data && mm4Data.length > 0) {
      // Enhanced patch row selection based on deformation percentage
      let patchRow;
      
      if (deformationPct > 25) {
        // Severe deformation: Use triple layer patches (Row 3)
        patchRow = mm4Data.find(row => row.id === 3) || mm4Data.find(row => row.id === 2) || mm4Data[0];
        console.log(`🔧 Severe deformation (${deformationPct}%) → Triple layer patches`);
      } else if (deformationPct > 15) {
        // Moderate deformation: Use double layer patches (Row 2) 
        patchRow = mm4Data.find(row => row.id === 2) || mm4Data[0];
        console.log(`🔧 Moderate deformation (${deformationPct}%) → Double layer patches`);
      } else {
        // Standard/minor deformation: Use standard patches (Row 1)
        patchRow = mm4Data[0];
        console.log(`🔧 Standard deformation (${deformationPct}%) → Standard patches`);
      }
      const costPerPatch = parseFloat(patchRow.greenValue || '0');
      const dayRate = parseFloat(mm4Data[0].blueValue || '0');
      const minQuantity = parseInt(patchRow.purpleLength || '0');
      
      console.log(`💰 STR MM4 Access: Row ${patchRow.id}, Cost=${costPerPatch}, DayRate=${dayRate}, MinQty=${minQuantity}`);
      
      // Count structural defects for patch calculation
      const defectsText = section.defects || '';
      console.log(`💰 STR Defect Analysis for ${section.itemNo}: "${defectsText}"`);
      
      // Enhanced pattern to catch defect codes with locations (handle both 5. and 5m formats)
      // REMOVED LEGACY |D - Use only proper MSCC5 codes
      const structuralDefectPattern = /\b(FC|FL|CR|JDL|JDS|DEF|OJL|OJM|JDM|CN)\b.*?(\d+(?:\.\d+)?\.?m?)/g;
      
      let patchCount = 0;
      let match;
      while ((match = structuralDefectPattern.exec(defectsText)) !== null) {
        console.log(`🔍 Pattern match found: ${match[0]} | Code: ${match[1]} | Location: ${match[2]}`);
        const meterageText = match[2];
        if (meterageText) {
          const meteragesForThisDefect = meterageText.split(',').map(m => m.trim());
          patchCount += meteragesForThisDefect.length;
          console.log(`  ↳ Added ${meteragesForThisDefect.length} patches from: ${meterageText}`);
        }
      }
      
      // Check for junction proximity requiring reopening costs
      const { MSCC5Classifier } = await import('./mscc5-classifier');
      const junctionAnalysis = MSCC5Classifier.analyzeJunctionProximityToStructuralDefects(defectsText);
      
      let reopeningCost = 0;
      if (junctionAnalysis.recommendReopening && patchCount > 0) {
        // Add £150 reopening cost per nearby junction/connection
        reopeningCost = junctionAnalysis.connectionDetails.length * 150;
        console.log(`🔧 Junction Proximity: ${junctionAnalysis.connectionDetails.join(', ')} - Adding £${reopeningCost} reopening cost`);
      }
      
      console.log(`💰 STR Cost Summary: costPerPatch=${costPerPatch}, patchCount=${patchCount}, minQuantity=${minQuantity}, reopeningCost=${reopeningCost}`);
      
      if (costPerPatch > 0 && patchCount > 0) {
        // Always calculate patch cost (no day rate application)
        const totalCost = costPerPatch * patchCount + reopeningCost;
        const calculation = reopeningCost > 0 
          ? `${patchCount} patches × £${costPerPatch} + £${reopeningCost} reopening = £${totalCost}`
          : `${patchCount} patches × £${costPerPatch} = £${totalCost}`;
        
        // Check if patch count meets minimum quantity for status
        const meetsMinimum = patchCount >= minQuantity;
        const status = meetsMinimum ? 'meets_minimum' : 'below_minimum';
        
        console.log(`${meetsMinimum ? '✅' : '🔴'} STR Patch Cost: ${calculation} ${meetsMinimum ? '' : `(below min ${minQuantity})`}`);
        
        return {
          ...section,
          cost: totalCost,
          estimatedCost: totalCost,
          costCalculation: calculation,
          patchCount,
          minQuantity,
          meetsMinimum,
          status
        };
      }
    }
    
    return section;
  }
}