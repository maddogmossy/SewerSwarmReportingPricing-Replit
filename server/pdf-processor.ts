import { db } from './db';
import { sectionInspections } from '@shared/schema';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { SimpleRulesRunner } from './rules-runner-simple';

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
      // Remove global flag to avoid lastIndex mutation issues
      defectCodes: /\b(FC|FL|CR|JDL|JDS|DEF|DER|OJL|OJM|JDM|CN|D|BRK|COL|DES|OB|OBI|RI|WL|SA|CUW|LL|LR)\b/i
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
        
        // Collect defect information
        if (sectionPatterns.defectCodes.test(line)) {
          defectLines.push(line);
          console.log(`🔍 Found defect line: ${line.substring(0, 60)}...`);
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
      
      // Collect all defect-related lines
      const allDefectLines: string[] = [];
      for (const line of lines) {
        if (sectionPatterns.defectCodes.test(line)) {
          allDefectLines.push(line);
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
