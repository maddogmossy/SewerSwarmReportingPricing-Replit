import { processPDF } from './pdf-processor';

async function testPDFParse() {
  try {
    console.log('🧪 Testing PDF parsing for upload 106...\n');
    
    // Process the PDF file (it will reprocess and insert new sections)
    const sections = await processPDF('uploads/c75a3e30a0939265f9e67dc3306d976d', 999, 'utilities');
    
    console.log(`\n✅ Parsed ${sections.length} sections\n`);
    
    // Show first 3 sections with details
    sections.slice(0, 3).forEach((section, idx) => {
      console.log(`\n=== SECTION ${idx + 1} ===`);
      console.log(`Item No: ${section.itemNo}`);
      console.log(`Manholes: ${section.startMH} → ${section.finishMH}`);
      console.log(`Pipe: ${section.pipeSize}mm ${section.pipeMaterial}`);
      console.log(`Length: ${section.totalLength}m`);
      console.log(`Observations (${section.rawObservations.length}):`);
      section.rawObservations.slice(0, 5).forEach(obs => {
        console.log(`  - ${obs}`);
      });
      if (section.rawObservations.length > 5) {
        console.log(`  ... and ${section.rawObservations.length - 5} more`);
      }
    });
    
    // Show section 39
    const section39 = sections.find(s => s.itemNo === 39);
    if (section39) {
      console.log(`\n=== SECTION 39 (from screenshot) ===`);
      console.log(`Item No: ${section39.itemNo}`);
      console.log(`Manholes: ${section39.startMH} → ${section39.finishMH}`);
      console.log(`Pipe: ${section39.pipeSize}mm ${section39.pipeMaterial}`);
      console.log(`Length: ${section39.totalLength}m`);
      console.log(`Observations (${section39.rawObservations.length}):`);
      section39.rawObservations.forEach(obs => {
        console.log(`  - ${obs}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

testPDFParse();
