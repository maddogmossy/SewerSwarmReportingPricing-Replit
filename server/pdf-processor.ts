import { db } from './db';
import { sectionInspections } from '@shared/schema';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { SimpleRulesRunner } from './rules-runner-simple';
import { MSCC5_DEFECTS } from './mscc5-classifier';

interface ParsedSection {
  itemNo: number;
  projectNo?: string;
  startMH: string;
  finishMH: string;
  pipeSize: string;
  pipeMaterial: string;
  totalLength: string;
  lengthSurveyed: string;
  rawObservations: string[]; // Store raw observations array instead of flattened string
  inspectionDate: string;
  inspectionTime: string;
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
  const codeMatch = line.match(/\b(FC|FL|CR|JDL|JDS|DEF|DER|OJL|OJM|JDM|CN|D|BRK|COL|DES|OB|OBI|RI|WL|SA|CUW|LL|LR|CCJ|CLJ|CCB|CL|DEEJ|DEE|DEB|RFJ|RF|RMJ|RM|RB|REM|MH|MHF)\b/i);
  
  if (!codeMatch) {
    return null; // Not a valid observation line
  }
  
  const code = codeMatch[1].toUpperCase();
  const beforeCode = line.substring(0, codeMatch.index!).trim();
  const restOfLine = line.substring(codeMatch.index! + code.length).trim();
  
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
  
  // Build observation in DB3 format: "CODE DESCRIPTION at METERAGEm"
  // Matching DB3 format exactly: "DER Settled deposits, coarse, 5% cross-sectional area loss at 21.6m"
  let observation = `${code} ${mscc5Description}`;
  
  if (meterage) {
    observation += ` at ${meterage}m`;
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
    const sections = parseDrainageReportFromPDF(pdfText, sector);
    
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

function parseDrainageReportFromPDF(pdfText: string, sector: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  
  try {
    // Split text into lines for parsing
    const lines = pdfText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    console.log('📄 Parsing PDF with', lines.length, 'lines');
    
    // Enhanced pattern matching for drainage inspection reports
    const sectionPatterns = {
      header: /(?:Item|Section|Pipe)\s*(?:No\.?|Number|#)?\s*[:\-]?\s*(\d+[a-z]?)/i,
      manhole: /(?:From|Start|MH)?\s*([A-Z]{2,3}\d+|[A-Z]+\d+|IC\d+)\s*(?:To|→|-|>)\s*([A-Z]{2,3}\d+|[A-Z]+\d+|IC\d+)/i,
      manholeAlt: /(?:Start|From)[:\s]+([A-Z0-9]+).*?(?:Finish|End|To)[:\s]+([A-Z0-9]+)/i,
      pipeSize: /(?:Pipe\s*Size|Diameter|DN)[:\s]*(\d+)\s*(?:mm)?/i,
      length: /(?:Length|Distance)[:\s]*(\d+\.?\d*)\s*(?:m|metres?|meters?)?/i,
      material: /(?:Material|Pipe\s*Material)[:\s]*(VC|PVC|Clay|Concrete|FC|AC|PE|HDPE)/i,
      grade: /(?:Grade|SECSTAT|Severity)[:\s]*(\d)/i,
      // Include all MSCC5 codes including joint-specific codes (CCJ, CLJ, DEEJ, RFJ, etc.)
      defectCodes: /\b(FC|FL|CR|JDL|JDS|DEF|DER|OJL|OJM|JDM|CN|D|BRK|COL|DES|OB|OBI|RI|WL|SA|CUW|LL|LR|CCJ|CLJ|CCB|CL|DEEJ|DEE|DEB|RFJ|RF|RMJ|RM|RB|REM|MH|MHF)\b/i
    };
    
    let currentSection: Partial<ParsedSection> | null = null;
    let defectLines: string[] = [];
    let itemCounter = 1;
    
    // First pass: Look for table-like structures
    const tableData = extractTableData(lines);
    
    if (tableData.length > 0) {
      console.log(`📊 Found ${tableData.length} table rows`);
      return tableData;
    }
    
    // Second pass: Line-by-line parsing
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      
      // Check for section header
      const headerMatch = line.match(sectionPatterns.header);
      
      if (headerMatch) {
        // Save previous section if exists
        if (currentSection && currentSection.itemNo) {
          // Store raw observations array (let versioned derivations handle processing)
          currentSection.rawObservations = defectLines.length > 0 ? defectLines : [];
          sections.push(currentSection as ParsedSection);
          defectLines = [];
        }
        
        // Start new section
        const itemNo = parseInt(headerMatch[1].replace(/[a-z]/g, ''));
        currentSection = {
          itemNo: itemNo || itemCounter++,
          startMH: '',
          finishMH: '',
          pipeSize: '150',
          pipeMaterial: 'VC',
          totalLength: '0',
          lengthSurveyed: '0',
          rawObservations: [],
          inspectionDate: new Date().toISOString().split('T')[0],
          inspectionTime: '00:00:00'
        };
        
        console.log(`📝 Found section header: Item ${currentSection.itemNo}`);
      }
      
      if (currentSection) {
        // Extract manhole information (try both patterns)
        let manholeMatch = line.match(sectionPatterns.manhole);
        if (!manholeMatch) {
          manholeMatch = line.match(sectionPatterns.manholeAlt);
        }
        if (manholeMatch && (!currentSection.startMH || !currentSection.finishMH)) {
          currentSection.startMH = manholeMatch[1] || currentSection.startMH;
          currentSection.finishMH = manholeMatch[2] || currentSection.finishMH;
          console.log(`📍 Found manholes: ${currentSection.startMH} → ${currentSection.finishMH}`);
        }
        
        // Extract pipe size
        const sizeMatch = line.match(sectionPatterns.pipeSize);
        if (sizeMatch && currentSection.pipeSize === '150') {
          currentSection.pipeSize = sizeMatch[1];
          console.log(`📏 Found pipe size: ${currentSection.pipeSize}mm`);
        }
        
        // Extract pipe material
        const materialMatch = line.match(sectionPatterns.material);
        if (materialMatch && currentSection.pipeMaterial === 'VC') {
          currentSection.pipeMaterial = materialMatch[1];
          console.log(`🔧 Found material: ${currentSection.pipeMaterial}`);
        }
        
        // Extract length
        const lengthMatch = line.match(sectionPatterns.length);
        if (lengthMatch && currentSection.totalLength === '0') {
          const length = parseFloat(lengthMatch[1]);
          currentSection.totalLength = length.toString();
          currentSection.lengthSurveyed = length.toString();
          console.log(`📐 Found length: ${length}m`);
        }
        
        // Note: Severity grade is now calculated by versioned derivations pipeline
        // We no longer extract it during parsing
        
        // Collect defect information - parse into DB3 format
        if (sectionPatterns.defectCodes.test(line)) {
          const parsedObservation = parsePDFObservation(line);
          if (parsedObservation) {
            defectLines.push(parsedObservation);
            console.log(`🔍 Parsed observation: ${parsedObservation}`);
          } else {
            // Fallback: keep original line if parsing fails
            defectLines.push(line);
            console.log(`⚠️ Could not parse observation, using raw line: ${line.substring(0, 60)}...`);
          }
        }
      }
    }
    
    // Save last section
    if (currentSection && currentSection.itemNo) {
      // Store raw observations array (let versioned derivations handle processing)
      currentSection.rawObservations = defectLines.length > 0 ? defectLines : [];
      sections.push(currentSection as ParsedSection);
    }
    
    // If no sections found, create minimal fallback
    if (sections.length === 0) {
      console.log('⚠️ No structured sections found, creating fallback section');
      
      // Collect all defect-related lines and parse them into DB3 format
      const allDefectLines: string[] = [];
      for (const line of lines) {
        if (sectionPatterns.defectCodes.test(line)) {
          const parsedObservation = parsePDFObservation(line);
          if (parsedObservation) {
            allDefectLines.push(parsedObservation);
          } else {
            allDefectLines.push(line);
          }
        }
      }
      
      sections.push({
        itemNo: 1,
        startMH: 'MH1',
        finishMH: 'MH2',
        pipeSize: '150',
        pipeMaterial: 'VC',
        totalLength: '10',
        lengthSurveyed: '10',
        rawObservations: allDefectLines.length > 0 ? allDefectLines : [],
        inspectionDate: new Date().toISOString().split('T')[0],
        inspectionTime: '00:00:00'
      });
    }
    
    console.log(`✅ Parsed ${sections.length} sections from PDF`);
    
  } catch (error) {
    console.error('❌ Error parsing PDF text:', error);
  }
  
  return sections;
}

function extractTableData(lines: string[]): ParsedSection[] {
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
        inspectionTime: '00:00:00'
      });
    }
  }
  
  return sections;
}

async function storePDFSections(sections: ParsedSection[], fileUploadId: number) {
  try {
    console.log(`💾 Storing ${sections.length} PDF sections in database`);
    
    const sectionsToInsert = sections.map(section => {
      // CRITICAL: Join rawObservations into defects string for versioned derivations pipeline
      // Pipeline's applySplittingLogic requires non-empty defects string to process
      const defectsText = section.rawObservations.length > 0 
        ? section.rawObservations.join('. ')
        : '';
      
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
        
        // CRITICAL: Populate defects field from rawObservations for pipeline processing
        // Empty for no-defect sections (will get Grade 0 green status)
        defects: defectsText,
        defectType: 'service', // Default - will be overridden by pipeline
        recommendations: '', // Empty - will be processed by pipeline
        severityGrade: '0', // Default - will be calculated by pipeline
        adoptable: 'Unknown', // Default - will be determined by pipeline
        
        // Optional fields
        deformationPct: null,
        inspectionDirection: null,
        cost: null,
        
        // RAW DATA - Store observations array for pipeline processing
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
