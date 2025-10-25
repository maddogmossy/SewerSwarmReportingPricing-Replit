import React from 'react';

/**
 * Centralized observation renderer following PIN 7461 requirements
 * - Semantic <ul><li> for accessibility
 * - Consistent defect code bolding with <strong>
 * - Single bullet strategy across all observations
 * - No double-formatting (HTML only, no markdown)
 */

interface ObservationRendererProps {
  observations: string[];
  className?: string;
}

/**
 * Parse and format a single observation with defect code bolding
 * Now handles the cleaned format: "CODE Description" instead of HTML
 */
const formatObservationItem = (observation: string): { code: string | null; text: string } => {
  const trimmed = observation.trim();
  
  // Handle cleaned format from cleanObservationForRenderer: "DER Settled deposits..."
  const cleanCodePattern = /^([A-Z]{1,4})\s+(.+)$/;
  const cleanMatch = trimmed.match(cleanCodePattern);
  
  if (cleanMatch) {
    const potentialCode = cleanMatch[1];
    const description = cleanMatch[2];
    
    // Verify it's a valid MSCC5 defect code
    const validCodes = [
      // Service codes
      'DER', 'DES', 'WL', 'SA', 'CUW', 'OBI', 'OB', 'RI',
      // Structural codes  
      'FC', 'FL', 'CR', 'DEF', 'JDL', 'JDS', 'JDM', 'OJM', 'OJL', 'CN', 'COL', 'BRK',
      // Joint-specific codes
      'FLJ', 'CLJ', 'CCJ', 'FCJ',
      // Conditional codes
      'SC'
    ];
    
    if (validCodes.includes(potentialCode)) {
      return { code: potentialCode, text: description };
    }
  }
  
  // Handle legacy format with HTML tags (in case any slip through)
  const htmlCodePattern = /<b>"?([A-Z]{1,4})"?<\/b>\s*[-–—]\s*(.+)/;
  const htmlMatch = trimmed.match(htmlCodePattern);
  
  if (htmlMatch) {
    return { code: htmlMatch[1], text: htmlMatch[2].trim() };
  }
  
  // Handle quoted format: "DER" - Description
  const quotedCodePattern = /^"([A-Z]{1,4})"\s*[-–—]\s*(.+)$/;
  const quotedMatch = trimmed.match(quotedCodePattern);
  
  if (quotedMatch) {
    return { code: quotedMatch[1], text: quotedMatch[2].trim() };
  }
  
  // If no code pattern matches, return as plain text
  return { code: null, text: trimmed };
};

const ObservationRenderer: React.FC<ObservationRendererProps> = ({ 
  observations, 
  className = "observation-list" 
}) => {
  if (!observations || observations.length === 0) {
    return (
      <div className={`text-sm text-gray-500 ${className}`}>
        No observations recorded
      </div>
    );
  }

  return (
    <ul className={`observation-list list-none space-y-1 text-sm ${className}`}>
      {observations.map((observation, index) => {
        const { code, text } = formatObservationItem(observation);
        
        return (
          <li key={index} className="observation-item flex items-start">
            <span className="observation-bullet mr-2 text-gray-600 flex-shrink-0">•</span>
            <span className="observation-content break-words">
              {code ? (
                <>
                  <strong className="observation-code font-semibold">"{code}"</strong>
                  <span className="observation-text"> - {text}</span>
                </>
              ) : (
                <span className="observation-text">{text}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

export default ObservationRenderer;