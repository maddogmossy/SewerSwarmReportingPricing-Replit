/**
 * Shared observation filtering logic for both DB3 and PDF processing
 * Applies WRc MSCC5 standards for filtering observations
 */

import { MSCC5_DEFECTS } from './mscc5-classifier.js';

export interface FilteredObservation {
  code: string;
  meterage: number | null;
  meterageEnd: number | null; // For running defects "from X to Y"
  description: string;
  fullText: string;
  isStructural: boolean;
  isService: boolean;
}

/**
 * Parse observation string into components
 * Handles multiple formats:
 * - "CODE METERAGEm (DESCRIPTION)" - standard format
 * - "CODE (DESCRIPTION)" - no meterage
 * - "CODE DESCRIPTION at METERAGEm" - alternate format
 * - "CODE DESCRIPTION from X to Y" - running defect format
 */
export function parseObservation(obs: string): FilteredObservation | null {
  // Try standard format first: CODE METERAGEm (DESCRIPTION)
  const withMeterageMatch = obs.match(/^([A-Z]+)\s+(\d+\.?\d*)m?\s*\((.+?)\)$/);
  if (withMeterageMatch) {
    const code = withMeterageMatch[1];
    const meterage = parseFloat(withMeterageMatch[2]);
    const description = withMeterageMatch[3];
    
    return {
      code,
      meterage,
      meterageEnd: null,
      description,
      fullText: obs,
      isStructural: isStructuralDefectCode(code),
      isService: isServiceDefectCode(code)
    };
  }
  
  // Try format: CODE (DESCRIPTION)
  const withoutMeterageMatch = obs.match(/^([A-Z]+)\s+\((.+?)\)$/);
  if (withoutMeterageMatch) {
    const code = withoutMeterageMatch[1];
    const description = withoutMeterageMatch[2];
    
    return {
      code,
      meterage: null,
      meterageEnd: null,
      description,
      fullText: obs,
      isStructural: isStructuralDefectCode(code),
      isService: isServiceDefectCode(code)
    };
  }
  
  // Try running defect format: CODE DESCRIPTION from X to Y (with optional metre units)
  const runningDefectMatch = obs.match(/^([A-Z]+)\s+(.+?)\s+from\s+(\d+\.?\d*)m?\s+to\s+(\d+\.?\d*)m?/i);
  if (runningDefectMatch) {
    const code = runningDefectMatch[1];
    const description = runningDefectMatch[2];
    const meterageStart = parseFloat(runningDefectMatch[3]);
    const meterageEnd = parseFloat(runningDefectMatch[4]);
    
    return {
      code,
      meterage: meterageStart,
      meterageEnd: meterageEnd,
      description,
      fullText: obs,
      isStructural: isStructuralDefectCode(code),
      isService: isServiceDefectCode(code)
    };
  }
  
  // Try single point format: CODE DESCRIPTION at X (with optional metre unit)
  const atMatch = obs.match(/^([A-Z]+)\s+(.+?)\s+at\s+(\d+\.?\d*)m?/i);
  if (atMatch) {
    const code = atMatch[1];
    const description = atMatch[2];
    const meterage = parseFloat(atMatch[3]);
    
    return {
      code,
      meterage,
      meterageEnd: null,
      description,
      fullText: obs,
      isStructural: isStructuralDefectCode(code),
      isService: isServiceDefectCode(code)
    };
  }
  
  // Try alternate format: CODE DESCRIPTION at METERAGEm
  const alternateMatch = obs.match(/^([A-Z]+)\s+(.+?)\s+at\s+(\d+\.?\d*)m?$/i);
  if (alternateMatch) {
    const code = alternateMatch[1];
    const description = alternateMatch[2];
    const meterage = parseFloat(alternateMatch[3]);
    
    return {
      code,
      meterage,
      meterageEnd: null,
      description,
      fullText: obs,
      isStructural: isStructuralDefectCode(code),
      isService: isServiceDefectCode(code)
    };
  }
  
  // If no pattern matches, try to at least extract the code
  const codeOnlyMatch = obs.match(/^([A-Z]{2,4})\s+/);
  if (codeOnlyMatch) {
    const code = codeOnlyMatch[1];
    const description = obs.substring(code.length).trim();
    
    return {
      code,
      meterage: null,
      meterageEnd: null,
      description,
      fullText: obs,
      isStructural: isStructuralDefectCode(code),
      isService: isServiceDefectCode(code)
    };
  }
  
  return null;
}

/**
 * Check if defect code is structural per MSCC5 standards
 * NOTE: JN and CN are NOT included here - they are junctions that need proximity filtering
 */
export function isStructuralDefectCode(code: string): boolean {
  const structuralDefects = [
    'CR', 'FC', 'FL', 'DEF', 'JDL', 'JDS', 'JDM', 'OJM', 'OJL',
    'CCJ', 'CLJ', 'CCB', 'CL', 'BRK', 'COL', 'D', 'CXB'
  ];
  return structuralDefects.includes(code);
}

/**
 * Check if defect code is service per MSCC5 standards
 */
export function isServiceDefectCode(code: string): boolean {
  const serviceDefects = [
    'DER', 'DES', 'OB', 'OBI', 'RI', 'WL', 'SA', 'CUW',
    'DEEJ', 'DEE', 'DEB', 'RFJ', 'RF', 'RMJ', 'RM', 'RB',
    'REM', 'DEC'
  ];
  return serviceDefects.includes(code);
}

/**
 * Check if observation code should be excluded (MH, MHF)
 * Per WRc standards, manhole markers are metadata, not defects
 */
export function shouldExcludeObservation(code: string): boolean {
  const excludedCodes = ['MH', 'MHF'];
  return excludedCodes.includes(code);
}

/**
 * Check if code is a junction that needs proximity filtering
 */
export function isJunctionCode(code: string): boolean {
  return code === 'JN' || code === 'CN';
}

/**
 * Filter observations according to WRc MSCC5 standards
 * - Excludes MH/MHF (manhole markers)
 * - Filters JN/CN to only show if structural defect within 0.7m
 * - Separates structural from service observations
 */
export function filterObservations(observations: string[]): {
  filtered: string[];
  hasStructural: boolean;
  hasService: boolean;
  structuralPositions: number[];
  servicePositions: number[];
} {
  const parsed: FilteredObservation[] = [];
  const structuralPositions: number[] = [];
  const servicePositions: number[] = [];
  
  // Parse all observations
  // We'll track structural defects as either points or ranges
  const structuralRanges: Array<{start: number, end: number}> = [];
  const structuralPoints: number[] = [];
  
  for (const obs of observations) {
    const parsedObs = parseObservation(obs);
    if (parsedObs) {
      parsed.push(parsedObs);
      
      // Track structural defects (points or ranges)
      if (parsedObs.isStructural) {
        if (parsedObs.meterage !== null && parsedObs.meterageEnd !== null) {
          // Running defect - track as range
          structuralRanges.push({
            start: parsedObs.meterage,
            end: parsedObs.meterageEnd
          });
        } else if (parsedObs.meterage !== null) {
          // Point defect
          structuralPoints.push(parsedObs.meterage);
          structuralPositions.push(parsedObs.meterage);
        }
      }
      
      // Track service defects
      if (parsedObs.isService && parsedObs.meterage !== null) {
        servicePositions.push(parsedObs.meterage);
        if (parsedObs.meterageEnd !== null) {
          servicePositions.push(parsedObs.meterageEnd);
        }
      }
    }
  }
  
  // Filter observations
  const filtered: string[] = [];
  let hasStructural = false;
  let hasService = false;
  
  for (const obs of parsed) {
    // Exclude MH/MHF
    if (shouldExcludeObservation(obs.code)) {
      console.log(`🚫 Excluding manhole marker: ${obs.code}`);
      continue;
    }
    
    // Filter junctions - only include if structural defect within 0.7m or within a range
    if (isJunctionCode(obs.code) && obs.meterage !== null) {
      const junctionPos = obs.meterage;
      
      // Check if junction is within 0.7m of any point defect
      const nearPointDefect = structuralPoints.some(
        defectPos => Math.abs(defectPos - junctionPos) <= 0.7
      );
      
      // Check if junction is within any structural range (with 0.7m tolerance)
      const withinRange = structuralRanges.some(range => {
        // Junction is within range if it's between start-0.7 and end+0.7
        return junctionPos >= (range.start - 0.7) && junctionPos <= (range.end + 0.7);
      });
      
      const hasNearbyStructural = nearPointDefect || withinRange;
      
      if (!hasNearbyStructural) {
        console.log(`🚫 Excluding junction ${obs.code} at ${junctionPos}m - no structural defect within 0.7m`);
        continue;
      } else {
        console.log(`✅ Including junction ${obs.code} at ${junctionPos}m - structural defect nearby`);
      }
    }
    
    // Track if we have structural or service defects
    if (obs.isStructural) {
      hasStructural = true;
    }
    if (obs.isService) {
      hasService = true;
    }
    
    filtered.push(obs.fullText);
  }
  
  return {
    filtered,
    hasStructural,
    hasService,
    structuralPositions,
    servicePositions
  };
}

/**
 * Determine defect type priority
 * Per MSCC5: Structural defects take priority over service defects
 */
export function determineDefectType(hasStructural: boolean, hasService: boolean): 'structural' | 'service' | 'observation' {
  if (hasStructural) {
    return 'structural';
  } else if (hasService) {
    return 'service';
  } else {
    return 'observation';
  }
}
