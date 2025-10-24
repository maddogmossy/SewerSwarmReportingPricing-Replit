import fs from 'fs';
import pdfParse from 'pdf-parse';

async function diagnosticPDF3() {
  try {
    const dataBuffer = fs.readFileSync('uploads/c75a3e30a0939265f9e67dc3306d976d');
    const data = await pdfParse(dataBuffer);
    const lines = data.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    console.log('=== SECTION 1 DETAILED OBSERVATION AREA (around line 251) ===\n');
    
    // Show lines 230-290 (around the first Scale line at 251)
    for (let i = 230; i < Math.min(295, lines.length); i++) {
      const line = lines[i];
      const hasDefect = /\b(FC|FL|LL|MH|MHF|WL|FCJ)\b/i.test(line);
      const hasScale = /Scale[:\s]/i.test(line);
      const hasSectionInspection = /Section\s+Inspection/i.test(line);
      
      let marker = '';
      if (hasSectionInspection) marker += ' <-- SECTION HEADER';
      if (hasScale) marker += ' <-- SCALE/TABLE';
      if (hasDefect) marker += ' <-- DEFECT';
      
      console.log(`${String(i).padStart(4)}: ${line.substring(0, 110)}${marker}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

diagnosticPDF3();
