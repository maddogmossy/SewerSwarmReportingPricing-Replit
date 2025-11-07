import { db } from './db';
import { sectionInspections } from '@shared/schema';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { SimpleRulesRunner } from './rules-runner-simple';
import { MSCC5_DEFECTS } from './mscc5-classifier';
import { filterObservations } from './observation-filter.js';
import { groupObservationsByCodeAndDescription } from './wincan-db-reader.js';

interface ParsedSection {
  itemNo: number;
  projectNo?: string;
  startMH: string;
  finishMH: string;
  pipeSize: string;
  pipeMaterial: string;
  totalLength: string;
  lengthSurveyed: string;
  rawObservations: string[];
  inspectionDate: string;
  inspectionTime: string;
  // MSCC5 classification results (matching DB3 process)
  classification: {
    severityGrade: number;
    defectType: string;
    recommendations: string;
    adoptable: string;
  };
}

/**
 * Parse PDF defect line into DB3 observation format with MSCC5 descriptions: "CODE DISTANCEm (DESCRIPTION)"
 * Examples:
 *   "DES - Settled deposits at 13.27m" → "DES 13.27m (Settled deposits, fine)"
 *   "DER 2.88m" → "DER 2.88m (Settled deposits, coarse)"
 *   "FC 1.35m" → "FC 1.35m (Fracture - circumferential)"
 *   "D 5%" → "D (Deformed sewer or drain, 5% cross-sectional area loss)"
 */
function parsePDFObservation(line: string): string | null {
  // Extract defect code (2-4 letter code at start or after bullet/dash)
  // Includes joint-specific codes (CCJ, CLJ, DEEJ, RFJ, etc.) and markers (MH, MHF, REM)
  // CRITICAL: Match codes WITHOUT word boundaries to handle concatenated text like "MHStart" or "FCJFracture"
  // Valid codes list for matching - synchronized with MSCC5_DEFECTS
  const validCodes = Object.keys(MSCC5_DEFECTS).concat([
    // Additional codes not in MSCC5_DEFECTS but valid in PDF observations
    'MH', 'MHF', 'OCF', 'LU', 'LD'
  ]);
  
  // Try to find any valid code in the line (longest match first for multi-char codes)
  let codeMatch: RegExpMatchArray | null = null;
  let matchedCode: string = '';
  
  for (const testCode of validCodes.sort((a, b) => b.length - a.length)) {
    const regex = new RegExp(`(^|\\s|\\d\\.\\d+\\s)${testCode}(?=[A-Z][a-z]|\\s|[,:\\-\\.]|$)`, 'i');
    const match = line.match(regex);
    if (match) {
      codeMatch = match;
      matchedCode = testCode;
      break;
    }
  }
  
  if (!codeMatch) {
    return null; // Not a valid observation line
  }
  
  const code = matchedCode.toUpperCase();
  const matchIndex = codeMatch.index! + codeMatch[1].length; // Skip the prefix (spaces, numbers, etc.)
  const beforeCode = line.substring(0, matchIndex).trim();
  const restOfLine = line.substring(matchIndex + code.length).trim();
  
  // CRITICAL: Extract meterage - check BEFORE code first (format: "0.22 CCJ ..."), then AFTER code
  let meterage: string | null = null;
  
  // Priority 0: Look for leading metre value BEFORE the code (PDF format: "0.22 CCJ ...")
  const leadingMeterageMatch = beforeCode.match(/(\d+\.?\d*)\s*$/);
  if (leadingMeterageMatch) {
    meterage = leadingMeterageMatch[1];
  }
  
  // If no leading meterage, search AFTER the code
  if (!meterage) {
    // Priority 1: Explicit "at XXm" or "@XXm" pattern (must have explicit 'm' or 'metres')
    let meterageMatch = restOfLine.match(/(?:at|@)\s+(\d+\.?\d*)\s*(?:m\b|metres?|meters?)/i);
    
    // Priority 2: Standalone distance with explicit metre unit (must NOT be 'mm')
    if (!meterageMatch) {
      meterageMatch = restOfLine.match(/\b(\d+\.?\d*)\s*(?:metres?|meters?)\b/i);
    }
    
    // Priority 3: Number followed by standalone 'm' (not 'mm', not '%')
    if (!meterageMatch) {
      meterageMatch = restOfLine.match(/\b(\d+\.?\d*)\s*m(?!\w)/);
    }
    
    // Priority 4: Just the number if it's at the very start (after removing separators)
    // CRITICAL: Only if not followed by % or letters (prevents "20mm", "5%", etc.)
    if (!meterageMatch) {
      const cleanStart = restOfLine.replace(/^[\s\-:•]+/, '');
      const startNumberMatch = cleanStart.match(/^(\d+\.?\d*)(?!\s*[%a-zA-Z])/);
      if (startNumberMatch) {
        meterageMatch = startNumberMatch;
      }
    }
    
    meterage = meterageMatch ? meterageMatch[1] : null;
  }
  
  // Extract percentage if present (for deformation, deposits, water level, etc.)
  const percentageMatch = restOfLine.match(/(\d+(?:-\d+)?)\s*%/);
  const percentage = percentageMatch ? percentageMatch[1] : null;
  
  // Build MSCC5 description from defect code lookup
  let mscc5Description = '';
  const mscc5Data = MSCC5_DEFECTS[code];
  
  if (mscc5Data) {
    mscc5Description = mscc5Data.description;
    
    // Enhance description for specific defect types with percentage
    if (percentage) {
      if (code === 'DER' || code === 'DES') {
        // Deposits: add percentage and standard phrase
        const depositType = code === 'DER' ? 'coarse' : 'fine';
        mscc5Description = `Settled deposits, ${depositType}, ${percentage}% cross-sectional area loss`;
      } else if (code === 'D' || code === 'DEF') {
        // Deformation: add percentage
        mscc5Description = `Deformed sewer or drain, ${percentage}% cross-sectional area loss`;
      } else if (code === 'WL') {
        // Water level: add percentage
        mscc5Description = `Water level, ${percentage}% of the vertical dimension`;
      } else {
        // Other defects with percentage: append it
        mscc5Description += `, ${percentage}%`;
      }
    } else {
      // No percentage: use plain MSCC5 description
      // For deposits without percentage, add standard detail
      if (code === 'DER') {
        mscc5Description = 'Settled deposits, coarse';
      } else if (code === 'DES') {
        mscc5Description = 'Settled deposits, fine';
      }
    }
  } else {
    // Fallback: use any description from PDF or code itself
    const cleanDescription = restOfLine
      .replace(/^[\s\-:•]+/, '')
      .replace(/(?:at|@)\s+\d+\.?\d*\s*(?:m\b|metres?|meters?)/gi, '')
      .replace(/\b\d+\.?\d*\s*(?:metres?|meters?)\b/gi, '')
      .replace(/\b\d+\.?\d*\s*m(?!\w)/g, '')
      .replace(/^(\d+\.?\d*)(?!\s*[%a-zA-Z])/, '')
      .trim();
    mscc5Description = cleanDescription || code;
  }
  
  // Build observation in DB3 format: "CODE METERAGEm (DESCRIPTION)"
  // Matching DB3 format exactly: "DER 21.6m (Settled deposits, coarse, 5% cross-sectional area loss)"
  let observation: string;
  
  if (meterage) {
    observation = `${code} ${meterage}m (${mscc5Description})`;
  } else {
    observation = `${code} (${mscc5Description})`;
  }
  
  return observation;
}

export async function processPDF(filePath: string, fileUploadId: number, sector: string): Promise<ParsedSection[]> {
  
  try {
    console.log('📄 PDF Processing started:', filePath);
    
    // Read PDF file
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    
    console.log('📄 PDF Pages:', data.numpages);
    console.log('📄 PDF Text length:', data.text.length);
    
    // Extract text content
    const pdfText = data.text;
    
    // Parse sections from PDF text
    const sections = await parseDrainageReportFromPDF(pdfText, sector);
    
    console.log(`📄 Extracted ${sections.length} sections from PDF`);
    
    // Store sections in database
    if (sections.length > 0) {
      await storePDFSections(sections, fileUploadId);
      
      // CRITICAL: Trigger versioned derivations pipeline to apply MSCC5 classification and SER/STR splitting
      console.log(`🔄 Triggering versioned derivations pipeline for PDF upload ${fileUploadId}`);
      await SimpleRulesRunner.createSimpleRun(fileUploadId);
      console.log(`✅ Versioned derivations pipeline completed for PDF upload ${fileUploadId}`);
    }
    
    return sections;
    
  } catch (error) {
    console.error('❌ Error processing PDF:', error);
    throw new Error(`PDF processing failed: ${error.message}`);
  }
}

async function parseDrainageReportFromPDF(pdfText: string, sector: string): Promise<ParsedSection[]> {
  const sections: ParsedSection[] = [];
  
  try {
    // Split text into lines for parsing
    const lines = pdfText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    console.log('📄 Parsing PDF with', lines.length, 'lines');
    
    // First pass: Look for table-like structures
    const tableData = await extractTableData(lines, sector);
    
    if (tableData.length > 0) {
      console.log(`📊 Found ${tableData.length} table rows`);
      return tableData;
    }
    
    // NEW STRATEGY: Find observation tables first, then build sections around them
    // This prevents duplicate sections from multiple "Section Inspection" headers
    
    const observationTablePattern = /Scale[:\s]*\d+[:\s]*\d+\s*Position\s*\[m\]/i;
    const tableHeaderPattern = /(?:STR\s+No\.?\s+Def|SER\s+No\.?\s+Def|Construction\s+Features|Structural\s+Defects|Service\s+&\s+Operational)/i;
    
    // Find all observation table start indices
    const observationTableIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (observationTablePattern.test(lines[i])) {
        observationTableIndices.push(i);
        console.log(`📊 Found observation table at line ${i}: ${lines[i].substring(0, 60)}`);
      }
    }
    
    console.log(`📊 Total observation tables found: ${observationTableIndices.length}`);
    
    // Process each observation table
    for (let tableIdx = 0; tableIdx < observationTableIndices.length; tableIdx++) {
      const tableStartLine = observationTableIndices[tableIdx];
      const nextTableStartLine = tableIdx + 1 < observationTableIndices.length 
        ? observationTableIndices[tableIdx + 1] 
        : lines.length;
      
      // Look backwards from table start to find section metadata (up to 50 lines)
      const lookbackStart = Math.max(0, tableStartLine - 50);
      const metadataLines = lines.slice(lookbackStart, tableStartLine);
      
      // Extract section metadata
      let startMH = '';
      let finishMH = '';
      let pipeSize = '150';
      let pipeMaterial = 'VC';
      let totalLength = '0';
      
      // Search metadata lines for section info
      for (const line of metadataLines) {
        // Extract manholes - Pattern 1: Upstream Node/Downstream Node
        const upstreamMatch = line.match(/Upstream\s+Node[:\s]+([A-Z0-9]+)/i);
        const downstreamMatch = line.match(/Downstream\s+Node[:\s]+([A-Z0-9]+)/i);
        if (upstreamMatch && !finishMH) {
          finishMH = upstreamMatch[1];
          console.log(`🔍 DEBUG: Extracted finishMH: "${finishMH}" from line: "${line}"`);
        }
        if (downstreamMatch && !startMH) {
          startMH = downstreamMatch[1];
          console.log(`🔍 DEBUG: Extracted startMH: "${startMH}" from line: "${line}"`);
        }
        
        // Extract pipe size
        const diaHeightMatch = line.match(/Dia\/Height[:\s]+(\d+)\s*mm/i);
        if (diaHeightMatch && pipeSize === '150') {
          pipeSize = diaHeightMatch[1];
        }
        
        // Extract material
        const assetMaterialMatch = line.match(/Asset\s+Material[:\s]+(Vitrified\s+clay|PVC|Concrete|HDPE|PE|Clay)/i);
        if (assetMaterialMatch && pipeMaterial === 'VC') {
          const material = assetMaterialMatch[1].toLowerCase();
          if (material.includes('vitrified') || material.includes('clay')) {
            pipeMaterial = 'VC';
          } else if (material.includes('pvc')) {
            pipeMaterial = 'PVC';
          } else if (material.includes('concrete')) {
            pipeMaterial = 'Concrete';
          } else if (material.includes('hdpe') || material.includes('pe')) {
            pipeMaterial = 'HDPE';
          }
        }
        
        // Extract length
        const inspectedLengthMatch = line.match(/Inspected\s+Length[:\s]+(\d+\.?\d*)\s*m/i);
        const totalLengthMatch = line.match(/Total\s+Length[:\s]+(\d+\.?\d*)\s*m/i);
        if (inspectedLengthMatch && totalLength === '0') {
          totalLength = parseFloat(inspectedLengthMatch[1]).toString();
        } else if (totalLengthMatch && totalLength === '0') {
          totalLength = parseFloat(totalLengthMatch[1]).toString();
        }
      }
      
      // Collect observations from table (start after the Scale:... line)
      const defectLines: string[] = [];
      let foundTableBoundary = false;
      
      for (let i = tableStartLine + 1; i < nextTableStartLine && !foundTableBoundary; i++) {
        const line = lines[i];
        
        // Stop at table boundary
        if (tableHeaderPattern.test(line)) {
          foundTableBoundary = true;
          break;
        }
        
        // Check if line has meterage pattern at start (observation format)
        const hasMeterageAtStart = /^\d+\.?\d*\s+[A-Z]{2,4}/.test(line);
        
        if (hasMeterageAtStart) {
          const parsedObservation = parsePDFObservation(line);
          if (parsedObservation) {
            defectLines.push(parsedObservation);
          }
        }
      }
      
      // STEP 1: Apply WRc MSCC5 filtering logic (same as DB3 processing)
      const filterResult = filterObservations(defectLines);
      const filteredObservations = filterResult.filtered;
      
      console.log(`📝 Section ${tableIdx + 1}: ${startMH}→${finishMH} (${pipeSize}mm, ${totalLength}m)`);
      console.log(`   Raw observations: ${defectLines.length}, Filtered: ${filteredObservations.length}`);
      console.log(`   Has structural: ${filterResult.hasStructural}, Has service: ${filterResult.hasService}`);
      
      // STEP 2: Group observations by code and description (SAME AS DB3 PROCESS)
      // This aggregates running defects: "DES 13.27m (...)", "DES 16.63m (...)" → "DES ... at 13.27m, 16.63m"
      const groupedObservations = groupObservationsByCodeAndDescription(filteredObservations);
      
      console.log(`   Grouped observations: ${groupedObservations.length} (from ${filteredObservations.length} filtered)`);
      
      // STEP 3: Apply MSCC5 classification (SAME AS DB3 PROCESS)
      const { classifyDefectByMSCC5Standards } = await import('./wincan-db-reader');
      let classification;
      
      if (groupedObservations.length === 0) {
        // No observations - apply Grade 0 classification
        classification = {
          severityGrade: 0,
          defectType: 'service',
          recommendations: 'No action required this pipe section is at an adoptable condition',
          adoptable: 'Yes'
        };
      } else {
        // Apply MSCC5 classification to GROUPED observations (matching DB3)
        classification = await classifyDefectByMSCC5Standards(groupedObservations, sector);
      }
      
      console.log(`   Classification: Grade ${classification.severityGrade}, Type: ${classification.defectType}, Adoptable: ${classification.adoptable}`);
      
      // Create section with GROUPED observations and REAL classification values (matching DB3 process)
      sections.push({
        itemNo: tableIdx + 1,
        startMH: startMH || 'MH' + (tableIdx + 1),
        finishMH: finishMH || 'MH' + (tableIdx + 2),
        pipeSize: pipeSize,
        pipeMaterial: pipeMaterial,
        totalLength: totalLength,
        lengthSurveyed: totalLength,
        rawObservations: groupedObservations, // Use GROUPED observations, not filtered
        inspectionDate: new Date().toISOString().split('T')[0],
        inspectionTime: '00:00:00',
        // REAL MSCC5 classification values (matching DB3 process)
        classification: classification
      });
    }
    
    
    console.log(`✅ Parsed ${sections.length} sections from PDF`);
    
  } catch (error) {
    console.error('❌ Error parsing PDF text:', error);
  }
  
  return sections;
}

async function extractTableData(lines: string[], sector: string): Promise<ParsedSection[]> {
  const sections: ParsedSection[] = [];
  
  // Look for common table headers
  const headerPatterns = [
    /Item.*(?:From|Start).*(?:To|Finish).*(?:Pipe|Size)/i,
    /Section.*Manhole.*Manhole.*Diameter/i
  ];
  
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerPatterns.some(pattern => pattern.test(lines[i]))) {
      headerIndex = i;
      console.log(`📋 Found table header at line ${i}: ${lines[i]}`);
      break;
    }
  }
  
  if (headerIndex === -1) {
    return sections;
  }
  
  // Parse rows after header
  // This is a basic implementation - real PDFs may need more sophisticated parsing
  const dataPattern = /(\d+)\s+([A-Z0-9]+)\s+([A-Z0-9]+)\s+(\d+)/;
  
  for (let i = headerIndex + 1; i < Math.min(headerIndex + 100, lines.length); i++) {
    const match = lines[i].match(dataPattern);
    if (match) {
      // No observations in basic table format - apply Grade 0 classification
      sections.push({
        itemNo: parseInt(match[1]),
        startMH: match[2],
        finishMH: match[3],
        pipeSize: match[4],
        pipeMaterial: 'VC',
        totalLength: '10',
        lengthSurveyed: '10',
        rawObservations: [],
        inspectionDate: new Date().toISOString().split('T')[0],
        inspectionTime: '00:00:00',
        classification: {
          severityGrade: 0,
          defectType: 'service',
          recommendations: 'No action required this pipe section is at an adoptable condition',
          adoptable: 'Yes'
        }
      });
    }
  }
  
  return sections;
}

async function storePDFSections(sections: ParsedSection[], fileUploadId: number) {
  try {
    console.log(`💾 Storing ${sections.length} PDF sections in database with REAL MSCC5 classification`);
    
    const sectionsToInsert = sections.map(section => {
      // Join rawObservations into defects string for display
      const defectsText = section.rawObservations.length > 0 
        ? section.rawObservations.join('. ')
        : 'No service or structural defect found';
      
      console.log(`🔍 DEBUG: Storing section ${section.itemNo} with startMH="${section.startMH}", finishMH="${section.finishMH}"`);
      console.log(`🔍 DEBUG: Classification - Grade: ${section.classification.severityGrade}, Type: ${section.classification.defectType}`);
      
      return {
        fileUploadId: fileUploadId,
        itemNo: section.itemNo,
        letterSuffix: null,
        projectNo: section.projectNo || '0000',
        
        // IMPORTANT: Schema uses startMH/finishMH with capital H
        startMH: section.startMH || 'UNKNOWN',
        finishMH: section.finishMH || 'UNKNOWN',
        startMHDepth: 'No data',
        finishMHDepth: 'No data',
        
        pipeSize: section.pipeSize || '150',
        pipeMaterial: section.pipeMaterial || 'VC',
        totalLength: section.totalLength || '0',
        lengthSurveyed: section.lengthSurveyed || '0',
        date: section.inspectionDate,
        time: section.inspectionTime,
        
        // REAL MSCC5 CLASSIFICATION VALUES (matching DB3 process)
        defects: defectsText,
        defectType: section.classification.defectType,
        recommendations: section.classification.recommendations,
        severityGrade: section.classification.severityGrade.toString(),
        adoptable: section.classification.adoptable,
        
        // Optional fields
        deformationPct: null,
        inspectionDirection: null,
        cost: null,
        
        // RAW DATA - Store observations array for reference
        rawObservations: section.rawObservations,
        secstatGrades: null
      };
    });
    
    // Validate before insert
    for (const section of sectionsToInsert) {
      if (!section.startMH || !section.finishMH) {
        console.warn(`⚠️ Section ${section.itemNo} missing manhole data, using defaults`);
      }
    }
    
    await db.insert(sectionInspections).values(sectionsToInsert);
    
    console.log(`✅ Successfully stored ${sections.length} sections from PDF`);
    
  } catch (error) {
    console.error('❌ Error storing PDF sections:', error);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      constraint: error.constraint
    });
    throw error;
  }
}
