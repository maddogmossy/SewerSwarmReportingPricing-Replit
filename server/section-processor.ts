/**
 * Section Processor - Clean separation between data extraction and processing
 * 
 * Architecture:
 * 1. Raw data stored in database (rawObservations, secstatGrades)
 * 2. Processing applied on-demand using current MSCC5 rules
 * 3. Results cached in processed fields for performance
 */

import { MSCC5Classifier } from './mscc5-classifier';
import { db } from './db';
import { sectionInspections } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface ProcessedSectionData {
  defects: string;
  defectType: 'structural' | 'service' | 'observation';
  severityGrade: number;
  severityGrades: { structural: number | null; service: number | null };
  recommendations: string;
  adoptable: 'Yes' | 'No' | 'Conditional';
  srmGrading?: any; // Complete SRM4 grading data
  cost?: string;
}

export class SectionProcessor {
  
  /**
   * Process all sections for an upload with current MSCC5 rules (legacy method - kept for compatibility)
   */
  static async processUploadSectionsLegacy(uploadId: number, sector: string = 'utilities'): Promise<void> {
    console.log(`🔄 Processing all sections for upload ${uploadId} with current MSCC5 rules`);
    
    const sections = await db.select().from(sectionInspections)
      .where(eq(sectionInspections.fileUploadId, uploadId));
    
    for (const section of sections) {
      if (section.rawObservations && section.rawObservations.length > 0) {
        const processed = await this.processSection(
          section.rawObservations,
          section.secstatGrades,
          sector,
          section.itemNo
        );
        
        // DEPRECATED: No longer write to processed* fields - superseded by observation_rules + rules_runs
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
            // Legacy fields for backward compatibility
            defects: processed.defects,
            defectType: processed.defectType,
            severityGrade: processed.severityGrade.toString(),
            recommendations: processed.recommendations,
            severityGrades: processed.severityGrades,
            adoptable: processed.adoptable
          })
          .where(eq(sectionInspections.id, section.id));
      }
    }
    
    console.log(`✅ Completed processing ${sections.length} sections`);
  }
  
  /**
   * Process raw section data using current MSCC5 rules
   */
  static async processSection(
    rawObservations: string[], 
    secstatGrades: any,
    sector: string = 'utilities',
    itemNo?: number
  ): Promise<ProcessedSectionData> {
    
    // Handle empty observations
    if (!rawObservations || rawObservations.length === 0) {
      return {
        defects: 'No service or structural defect found',
        defectType: 'service',
        severityGrade: 0,
        severityGrades: { structural: 0, service: 0 },
        recommendations: 'No action required this pipe section is at an adoptable condition',
        adoptable: 'Yes'
      };
    }
    
    // Format observations text
    const defectText = await this.formatObservationText(rawObservations, sector);
    
    // Apply MSCC5 classification (our updated rules)
    const classification = await MSCC5Classifier.classifyDefect(defectText, sector);
    
    // Use SECSTAT grades if available, otherwise use MSCC5 classification
    let finalGrade = classification.severityGrade;
    let finalType = classification.defectType;
    
    // Define normalized text for consistent use throughout function
    const normalizedDefectText = defectText.toLowerCase();
    
    if (secstatGrades && (secstatGrades.structural !== null || secstatGrades.service !== null || secstatGrades.observation !== null)) {
      console.log(`🔍 SECSTAT override for item ${itemNo}:`, secstatGrades);
      
      // CRITICAL FIX: Use MSCC5 classification defect type unless SECSTAT indicates actual structural defects
      // Only override to structural if SECSTAT structural grade > 0 AND contains actual structural defects
      const hasActualStructuralDefects = normalizedDefectText.includes('deformity') || 
                                       normalizedDefectText.includes('deformed') || 
                                       normalizedDefectText.includes('fracture') || 
                                       normalizedDefectText.includes('crack') ||
                                       normalizedDefectText.includes('joint displacement') || 
                                       normalizedDefectText.includes('collapse');
      
      // Determine final grade and type from SECSTAT with defect content validation
      if (secstatGrades.structural !== null && secstatGrades.structural !== undefined) {
        finalGrade = secstatGrades.structural;
        // Only set to structural if there are actual structural defects OR SECSTAT structural grade > 0
        if (hasActualStructuralDefects || secstatGrades.structural > 0) {
          finalType = 'structural';
          
          // Ensure minimum structural grade of 2 for deformity defects
          if (hasActualStructuralDefects && (normalizedDefectText.includes('deformity') || normalizedDefectText.includes('deformed'))) {
            finalGrade = Math.max(finalGrade, 2);
            console.log(`✅ DEFORMITY FIX: Item ${itemNo} corrected to structural Grade ${finalGrade}`);
          }
        } else {
          // SECSTAT structural Grade 0 with no actual structural defects -> use MSCC5 classification
          finalType = classification.defectType;
          console.log(`🔧 DES/DER FIX: Item ${itemNo} - SECSTAT structural Grade 0 with service defects, using MSCC5 type: ${classification.defectType}`);
        }
      } else if (secstatGrades.service !== null && secstatGrades.service !== undefined) {
        finalGrade = secstatGrades.service;
        finalType = 'service';
      } else if (secstatGrades.observation !== null && secstatGrades.observation !== undefined) {
        finalGrade = secstatGrades.observation;
        finalType = 'observation' as 'structural' | 'service';
      }
    }
    
    // Special handling for observation-only sections - reuse existing structural defect detection
    if (this.isObservationOnly(defectText)) {
      const hasActualStructuralDefects = normalizedDefectText.includes('deformity') || 
                                       normalizedDefectText.includes('deformed') || 
                                       normalizedDefectText.includes('fracture') || 
                                       normalizedDefectText.includes('crack') ||
                                       normalizedDefectText.includes('joint displacement') || 
                                       normalizedDefectText.includes('collapse');
      
      if (!hasActualStructuralDefects) {
        finalGrade = 0;
        finalType = 'observation' as 'structural' | 'service';
        console.log(`🔍 OBSERVATION CLASSIFICATION: Item ${itemNo} - no structural defects detected`);
      } else {
        console.log(`🚫 OBSERVATION OVERRIDE BLOCKED: Item ${itemNo} has structural defects, maintaining ${finalType} Grade ${finalGrade}`);
      }
    }
    
    // Generate recommendations based on final classification
    const recommendations = await this.generateRecommendations(defectText, finalType, finalGrade, sector);
    const adoptable = this.determineAdoptability(finalType, finalGrade);
    
    return {
      defects: defectText,
      defectType: finalType,
      severityGrade: finalGrade,
      severityGrades: {
        structural: finalType === 'structural' ? finalGrade : null,
        service: finalType === 'service' ? finalGrade : null
      },
      recommendations,
      adoptable,
      srmGrading: classification.srmGrading // Include SRM4 grading data
    };
  }
  
  /**
   * Process all sections for a specific upload and store results
   */
  static async processUploadSections(uploadId: number, sector: string = 'utilities'): Promise<void> {
    console.log(`🔄 Processing all sections for upload ${uploadId} with current MSCC5 rules`);
    
    // Get all raw sections
    const sections = await db.select()
      .from(sectionInspections)
      .where(eq(sectionInspections.fileUploadId, uploadId));
    
    console.log(`📊 Found ${sections.length} sections to process`);
    
    for (const section of sections) {
      try {
        const processed = await this.processSection(
          section.rawObservations || [],
          section.secstatGrades,
          sector,
          section.itemNo
        );
        
        // DEPRECATED: No longer store processed results in processed* fields - superseded by observation_rules + rules_runs
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
            // Also update legacy fields for backward compatibility
            defectType: processed.defectType,
            severityGrade: processed.severityGrade.toString(),
            severityGrades: processed.severityGrades,
            recommendations: processed.recommendations,
            adoptable: processed.adoptable,
            defects: processed.defects
          })
          .where(eq(sectionInspections.id, section.id));
        
        console.log(`✅ Processed and stored section ${section.itemNo}: ${processed.defectType} Grade ${processed.severityGrade}`);
        
      } catch (error) {
        console.error(`❌ Error processing section ${section.itemNo}:`, error);
      }
    }
    
    console.log(`🎯 Processing complete for upload ${uploadId}`);
  }
  
  /**
   * Format observation text from raw observations
   */
  private static async formatObservationText(observations: string[], sector: string): Promise<string> {
    if (!observations || observations.length === 0) {
      return 'No service or structural defect found';
    }
    
    // Filter out empty observations
    const validObservations = observations.filter(obs => obs && obs.trim() !== '');
    
    if (validObservations.length === 0) {
      return 'No service or structural defect found';
    }
    
    // Join observations with proper formatting
    return validObservations.join('. ').trim();
  }
  
  /**
   * Check if section contains only observational data (Grade 0)
   * Per WRc MSCC5: Line deviations without structural/service defects = Grade 0
   */
  private static isObservationOnly(defectText: string): boolean {
    const lowerText = defectText.toLowerCase();
    
    // Check for line deviations only
    const hasLineDeviation = lowerText.includes('line deviates') || lowerText.includes('line deviation');
    
    // Check for real defects that would require grading
    const hasStructuralDefects = lowerText.includes('crack') || lowerText.includes('fracture') || 
                                lowerText.includes('deformation') || lowerText.includes('deformity') ||
                                lowerText.includes('deformed') || lowerText.includes('joint') ||
                                lowerText.includes('displacement') || lowerText.includes('missing');
                                
    const hasServiceDefects = lowerText.includes('deposit') || lowerText.includes('root') ||
                             lowerText.includes('blockage') || lowerText.includes('obstruction') ||
                             lowerText.includes('infiltration') || lowerText.includes('water level');
    
    // OBI (Obstacle Intruding) should be Grade 0 observation only
    const hasOBI = lowerText.includes('obi') || lowerText.includes('obstacle intruding');
    
    // Grade 0 if: line deviations only, OBI only, or no defects at all
    return (hasLineDeviation && !hasStructuralDefects && !hasServiceDefects) || 
           (hasOBI && !hasStructuralDefects && !hasServiceDefects) ||
           (!hasLineDeviation && !hasStructuralDefects && !hasServiceDefects);
  }
  
  /**
   * Generate recommendations based on classification
   */
  private static async generateRecommendations(
    defectText: string, 
    defectType: string, 
    grade: number, 
    sector: string
  ): Promise<string> {
    
    // Use MSCC5 classifier for recommendations
    const classification = await MSCC5Classifier.classifyDefect(defectText, sector);
    return classification.recommendations || 'No action required this pipe section is at an adoptable condition';
  }
  
  /**
   * Determine adoptability based on classification
   */
  private static determineAdoptability(defectType: string, grade: number): 'Yes' | 'No' | 'Conditional' {
    if (grade === 0) return 'Yes';
    if (grade >= 4) return 'No';
    return 'Conditional';
  }
}