import fs from 'fs';
import pdfParse from 'pdf-parse';

async function diagnosticPDF() {
  try {
    const dataBuffer = fs.readFileSync('uploads/c75a3e30a0939265f9e67dc3306d976d');
    const data = await pdfParse(dataBuffer);
    const lines = data.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    console.log('=== SECTION 1 TEXT STRUCTURE ===\n');
    
    // Find section 1
    const section1Index = lines.findIndex(l => /Item\s+(?:No\.?)?\s*[:\-]?\s*1\b/i.test(l) && !/Item\s+(?:No\.?)?\s*[:\-]?\s*1[0-9]/i.test(l));
    const section2Index = lines.findIndex((l, i) => i > section1Index && /Item\s+(?:No\.?)?\s*[:\-]?\s*2\b/i.test(l) && !/Item\s+(?:No\.?)?\s*2[0-9]/i.test(l));
    
    console.log(`Section 1 found at line ${section1Index}`);
    console.log(`Section 2 found at line ${section2Index}`);
    console.log(`Lines between: ${section2Index - section1Index}\n`);
    
    // Show lines between section 1 and 2
    for (let i = section1Index; i < Math.min(section1Index + 150, section2Index); i++) {
      const line = lines[i];
      const hasDefect = /\b(FC|FL|LL|MH|MHF|WL|SA|CCJ|CLJ|DEE|DEEJ|FCJ)\b/i.test(line);
      const hasScale = /Scale[:\s]/i.test(line);
      const hasPosition = /Position\s*\[m\]/i.test(line);
      const hasObservation = /Observation/i.test(line);
      
      let marker = '';
      if (hasDefect) marker += ' <-- DEFECT CODE';
      if (hasScale || hasPosition || hasObservation) marker += ' <-- TABLE HEADER?';
      
      console.log(`${String(i).padStart(5)}: ${line.substring(0, 100)}${marker}`);
    }
    
    console.log('\n\n=== SECTION 39 TEXT STRUCTURE ===\n');
    
    // Find section 39
    const section39Index = lines.findIndex(l => /Item\s+(?:No\.?)?\s*[:\-]?\s*39\b/i.test(l));
    const endIndex = lines.findIndex((l, i) => i > section39Index && /Construction\s+Features|Structural\s+Defects|STR\s+No/i.test(l));
    
    console.log(`Section 39 found at line ${section39Index}`);
    console.log(`End marker found at line ${endIndex}`);
    console.log(`Lines between: ${endIndex - section39Index}\n`);
    
    // Show lines for section 39
    for (let i = section39Index; i < Math.min(section39Index + 150, endIndex); i++) {
      const line = lines[i];
      const hasDefect = /\b(FC|FL|LL|MH|MHF|WL|SA|CCJ|CLJ|DEE|DEEJ|RFJ|REM)\b/i.test(line);
      const hasScale = /Scale[:\s]/i.test(line);
      const hasPosition = /Position\s*\[m\]/i.test(line);
      
      let marker = '';
      if (hasDefect) marker += ' <-- DEFECT CODE';
      if (hasScale || hasPosition) marker += ' <-- TABLE HEADER?';
      
      console.log(`${String(i).padStart(5)}: ${line.substring(0, 100)}${marker}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

diagnosticPDF();
