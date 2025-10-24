import fs from 'fs';
import pdfParse from 'pdf-parse';

async function diagnosticPDF2() {
  try {
    const dataBuffer = fs.readFileSync('uploads/c75a3e30a0939265f9e67dc3306d976d');
    
    // Try different extraction methods
    const data = await pdfParse(dataBuffer, {
      // Request maximum verbosity
      max: 0, // Extract all pages
    });
    
    console.log('=== PDF METADATA ===');
    console.log('Pages:', data.numpages);
    console.log('Text length:', data.text.length);
    console.log('Info:', JSON.stringify(data.info, null, 2));
    
    const lines = data.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    console.log('Total non-empty lines:', lines.length);
    
    console.log('\n=== SEARCHING FOR "Section Inspection" HEADERS ===');
    const sectionInspectionLines = lines.filter((l, i) => /Section\s+Inspection/i.test(l));
    console.log(`Found ${sectionInspectionLines.length} "Section Inspection" headers`);
    sectionInspectionLines.slice(0, 5).forEach((line, idx) => {
      console.log(`  ${idx + 1}. ${line.substring(0, 80)}`);
    });
    
    console.log('\n=== SEARCHING FOR OBSERVATION TABLE PATTERNS ===');
    
    // Look for lines that might indicate observation data
    const scaleLines = lines.map((l, i) => ({ i, l })).filter(({l}) => /Scale[:\s]*\d+[:\s]*\d+/i.test(l));
    console.log(`\nFound ${scaleLines.length} lines with "Scale" pattern:`);
    scaleLines.slice(0, 3).forEach(({i, l}) => {
      console.log(`  Line ${i}: ${l.substring(0, 100)}`);
    });
    
    const positionLines = lines.map((l, i) => ({ i, l })).filter(({l}) => /Position\s*\[m\]/i.test(l));
    console.log(`\nFound ${positionLines.length} lines with "Position [m]" pattern:`);
    positionLines.slice(0, 3).forEach(({i, l}) => {
      console.log(`  Line ${i}: ${l.substring(0, 100)}`);
    });
    
    // Look for defect codes in observation format
    console.log('\n=== SEARCHING FOR DEFECT CODES WITH METERAGES ===');
    const defectPattern = /\b(FC|FL|CCJ|CLJ|MH|MHF|WL|LL)\b.*?(\d+\.\d+)/i;
    const defectLines = lines.map((l, i) => ({ i, l })).filter(({l}) => defectPattern.test(l));
    console.log(`Found ${defectLines.length} lines with defect codes and meterages:`);
    defectLines.slice(0, 10).forEach(({i, l}) => {
      console.log(`  Line ${i}: ${l.substring(0, 100)}`);
    });
    
    // Check if "RWP2X" or "S4X" appear (from section headers in screenshots)
    console.log('\n=== SEARCHING FOR SECTION IDENTIFIERS ===');
    const rwp2xLines = lines.map((l, i) => ({ i, l })).filter(({l}) => /RWP2X|S4X|S8\s/i.test(l));
    console.log(`Found ${rwp2xLines.length} lines with RWP2X/S4X/S8:`);
    rwp2xLines.slice(0, 5).forEach(({i, l}) => {
      console.log(`  Line ${i}: ${l.substring(0, 100)}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

diagnosticPDF2();
