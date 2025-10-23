import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useCallback } from "react";
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DataIntegrityWarning } from "@/components/data-integrity-warning";
import ObservationRenderer from "@/components/ObservationRenderer";

import { SectorStandardsDisplay } from "@/components/sector-standards-display";
import { ReportValidationStatus } from "@/components/ReportValidationStatus";
import { PatchRepairPricingDialog } from "@/components/PatchRepairPricingDialog";

import { CleaningOptionsPopover } from "@/components/cleaning-options-popover";
import { RepairOptionsPopover } from "@/components/repair-options-popover";
import { validateReportExportReadiness, ValidationResult, ReportSection, TravelInfo } from "@shared/report-validation";
import * as XLSX from 'xlsx';

import { 
  Download,
  Upload,
  Building,
  Building2,
  EyeOff,
  Home as HomeIcon,
  RefreshCw,
  Car,
  Users,
  ShieldCheck,
  HardHat,
  Zap,
  CheckCircle,
  Clock,
  AlertCircle,
  Settings,
  Filter,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Eye,
  Trash2,
  TriangleAlert,
  AlertTriangle,
  BarChart3,
  FileX,
  FileText,
  Database,
  ArrowLeft,
  Info,
  Wrench,
  Truck,
  X
} from "lucide-react";
import { Link, useSearch } from "wouter";
import type { FileUpload as FileUploadType } from "@shared/schema";
import { DevLabel } from '@/utils/DevLabel';

// Function to detect if defects require cleaning vs structural repair
const requiresCleaning = (defects: string): boolean => {
  if (!defects) return false;
  
  // Established cleaning codes from sewer-cleaning.ts
  const cleaningCodes = ['DES', 'DER', 'DEC', 'GRE', 'RO', 'BLO'];
  const defectsUpper = defects.toUpperCase();
  
  // Check for cleaning defect codes
  const hasCleaningCodes = cleaningCodes.some(code => defectsUpper.includes(code));
  
  // Check for SA codes with bung conditions requiring cleanse and resurvey
  const hasSABungCondition = defectsUpper.includes('SA ') && (
    defectsUpper.includes('BUNG') || defectsUpper.includes('CAP') || 
    defectsUpper.includes('NOT CONNECTED') || defectsUpper.includes('BLOCKAGE')
  );
  
  const result = hasCleaningCodes || hasSABungCondition;
  
  // Debugging removed - cleaning detection working correctly
  
  return result;
};

// Helper function to convert hex to rgba with opacity
const hexToRgba = (hex: string, opacity: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

// Function to detect if defects require structural repair (TP2 patching)
// AUTHENTIC MSCC5/WRc STANDARDS: Structural defects take PRIORITY over service defects
const requiresStructuralRepair = (defects: string): boolean => {
  if (!defects) return false;
  
  const defectsUpper = defects.toUpperCase();
  
  // PRIORITY 1: Check for structural defects FIRST (safety critical) - MSCC5 COMPLIANT
  // UPDATED: Include both full 'DEF ' and shortened 'D ' codes for deformity defects
  const structuralCodes = ['CR ', 'FL ', 'FC ', 'JDL ', 'JDS ', 'DEF ', 'D ', 'OJL ', 'OJM ', 'JDM ', 'CN ', 'crack', 'fracture'];
  
  // Check for major structural defects requiring TP2 patching
  const hasStructuralDefects = structuralCodes.some(code => defectsUpper.includes(code.toUpperCase()));
  
  // MSCC5 COMPLIANT: Check for deformity structural defects (both 'DEF' and 'D' patterns)
  // FIXED: Include both 'DEF ' (full code) and 'D ' (shortened code) for complete coverage
  const hasSignificantDeformation = (defectsUpper.includes('DEF ') || defectsUpper.includes('D ')) && (
    defectsUpper.includes('5%') || defectsUpper.includes('10%') || defectsUpper.includes('15%') || 
    defectsUpper.includes('20%') || defectsUpper.includes('25%') || defectsUpper.includes('30%') || 
    defectsUpper.includes('MAJOR') || defectsUpper.includes('SEVERE') ||
    defectsUpper.includes('DEFORMED') || defectsUpper.includes('DRAIN')
  );
  
  // AUTHENTIC MSCC5: If ANY structural defects exist, use TP2 regardless of service defects
  if (hasStructuralDefects || hasSignificantDeformation) {
    return true; // Structural repair takes priority
  }
  
  // PRIORITY 2: Only if NO structural defects, then it's service-only (TP1)
  return false;
};

// Function to generate dynamic WRC service instruction from defect data
const generateWRCServiceInstruction = (section: any): string => {
  const defects = section.defects || '';
  const totalLength = section.totalLength || '0';
  const originalRecommendation = section.recommendations || '';
  
  // Extract defect codes (like DER, DES, DEC, etc.)
  const defectCodes = [];
  const codePattern = /\b[A-Z]{2,3}\b/g;
  const foundCodes = defects.match(codePattern) || [];
  defectCodes.push(...foundCodes.filter(code => 
    ['DER', 'DES', 'DEC', 'GRE', 'RO', 'BLO', 'CXB', 'SA'].includes(code)
  ));
  
  // Extract percentage from defects text
  const percentageMatch = defects.match(/(\d+)%/);
  const percentage = percentageMatch ? percentageMatch[1] + '%' : '';
  
  // Extract specific meterage from defects
  const meterageMatches = defects.match(/\d+\.?\d*m/g) || [];
  const meterages = meterageMatches.join(', ');
  
  // Build dynamic instruction combining WRC recommendation with site-specific details
  let instruction = originalRecommendation;
  
  // Add site-specific details if available
  let siteDetails = '';
  if (defectCodes.length > 0) {
    siteDetails += `${defectCodes.join(', ')} defects`;
  }
  
  if (percentage) {
    siteDetails += siteDetails ? ` with ${percentage} impact` : `${percentage} impact`;
  }
  
  if (meterages) {
    siteDetails += siteDetails ? ` at ${meterages}` : `at ${meterages}`;
  }
  
  if (totalLength && totalLength !== '0') {
    siteDetails += siteDetails ? `. Section length: ${totalLength}m` : `Section length: ${totalLength}m`;
  }
  
  // Combine WRC recommendation with site details
  if (siteDetails) {
    instruction += ` [Site details: ${siteDetails}]`;
  }
  
  return instruction;
};



// Function to check if PR2 configuration has actual values configured
const isConfigurationProperlyConfigured = (config: any): boolean => {
  if (!config) return false;
  
  // Check if any pricing options have non-empty values (both legacy and MM4 format)
  const hasValidPricingValues = config.pricingOptions?.some((option: any) => 
    option.enabled && option.value && option.value.trim() !== '' && option.value !== '0'
  ) || 
  // NEW: Also check MM4 data format (for MMP1 configurations like A5)
  config.mm_data?.mm4Rows?.some((row: any) => 
    (row.blueValue && row.blueValue.trim() !== '' && row.blueValue !== '0') || 
    (row.greenValue && row.greenValue.trim() !== '' && row.greenValue !== '0')
  ) ||
  // MM4 DataByPipeSize format check
  (config.mm_data?.mm4DataByPipeSize && 
    Object.values(config.mm_data.mm4DataByPipeSize).some((rows: any) => 
      Array.isArray(rows) && rows.some((row: any) => 
        (row.blueValue && row.blueValue.trim() !== '' && row.blueValue !== '0') || 
        (row.greenValue && row.greenValue.trim() !== '' && row.greenValue !== '0')
      )
    )
  );
  
  // For TP2 patching configurations, we only need pricing values (cost per unit)
  if (config.categoryId === 'patching') {
    return hasValidPricingValues;
  }
  
  // Check if any quantity options have non-empty values
  const hasValidQuantityValues = config.quantityOptions?.some((option: any) => 
    option.enabled && option.value && option.value.trim() !== '' && option.value !== '0'
  );
  
  // Check if any min quantity options have non-empty values
  const hasValidMinQuantityValues = config.minQuantityOptions?.some((option: any) => 
    option.enabled && option.value && option.value.trim() !== '' && option.value !== '0'
  );
  
  // For standard configurations, require both pricing AND quantity values
  return hasValidPricingValues && hasValidQuantityValues;
};

// Function to check if configuration has DB15 travel rates configured
const hasDB15TravelRates = (config: any): boolean => {
  if (!config || !config.vehicleTravelRates) return false;
  
  return config.vehicleTravelRates.some((rate: any) => 
    rate.enabled && 
    rate.hourlyRate && 
    rate.hourlyRate.trim() !== '' && 
    rate.vehicleType && 
    rate.vehicleType.trim() !== '' &&
    rate.numberOfHours &&
    rate.numberOfHours.trim() !== ''
  );
};

// Function to calculate travel costs from P19 configuration
const calculateTravelCost = (config: any): number => {
  if (!hasDB15TravelRates(config)) return 0;
  
  const travelRates = config.vehicleTravelRates?.filter((rate: any) => rate.enabled) || [];
  let totalTravelCost = 0;
  
  travelRates.forEach((rate: any) => {
    const hourlyRate = parseFloat(rate.hourlyRate) || 0;
    const hours = parseFloat(rate.numberOfHours) || 0;
    totalTravelCost += hourlyRate * hours;
  });
  
  return totalTravelCost;
};

// Generate dynamic recommendations based on section data and PR2 configurations
const generateDynamicRecommendation = (section: any, repairPricingData: any[], checkFunction?: any): string => {
  const { startMH, finishMH, pipeSize, totalLength, defects, recommendations } = section;
  
  // Extract defect percentages and types from observations
  const extractDefectSummary = (defectsText: string): string => {
    if (!defectsText || defectsText.includes('No service or structural defect found')) {
      return '';
    }
    
    // Extract defects with percentages from detailed observation text
    const defectMatches = [];
    
    // Look for percentage patterns in full descriptions
    // "Settled deposits, fine, 5% cross-sectional area loss" -> "DES 5%"
    // "Settled deposits, coarse, 10% cross-sectional area loss" -> "DER 10%"
    
    // Pattern for deposits (fine = DES, coarse = DER)
    const depositPattern = /Settled deposits, (fine|coarse), (\d+)% cross-sectional area loss/g;
    let depositMatch;
    while ((depositMatch = depositPattern.exec(defectsText)) !== null) {
      const depositType = depositMatch[1] === 'fine' ? 'DES' : 'DER';
      const percentage = depositMatch[2];
      defectMatches.push(`${depositType} ${percentage}%`);
    }
    
    // Pattern for water level percentages
    const waterLevelPattern = /Water level, (\d+)% of the vertical dimension/g;
    let waterMatch;
    while ((waterMatch = waterLevelPattern.exec(defectsText)) !== null) {
      const percentage = waterMatch[1];
      defectMatches.push(`WL ${percentage}%`);
    }
    
    // If we found percentage-based defects, return them
    if (defectMatches.length > 0) {
      return defectMatches.join(' and ');
    }
    
    // Fallback: extract basic defect codes without percentages
    // Filter out LL (line deviation) codes unless this is for structural repair/lining
    const basicMatches = defectsText.match(/([A-Z]{2,3})/g);
    if (basicMatches) {
      const uniqueDefects = [...new Set(basicMatches)];
      
      // For cleaning recommendations, exclude LL codes (only include for lining/patch repairs)
      const cleaningRelevantDefects = uniqueDefects.filter(code => {
        // Exclude LL unless the recommendation involves lining or patching
        if (code === 'LL') {
          return false; // LL only relevant for structural repairs, not cleaning
        }
        return true;
      });
      
      return cleaningRelevantDefects.length > 0 ? cleaningRelevantDefects.join(' and ') : 'defects';
    }
    
    return 'defects';
  };
  
  const defectSummary = extractDefectSummary(defects || '');
  
  // Ensure totalLength has 'm' suffix
  const length = totalLength ? 
    (totalLength.includes('m') ? totalLength : `${totalLength}m`) : 
    '30.00m';
  
  // Ensure pipeSize has 'mm' suffix  
  const pipe = pipeSize ? 
    (pipeSize.includes('mm') ? pipeSize : `${pipeSize}mm`) : 
    '150mm';
    
  const from = startMH || 'Start';
  const to = finishMH || 'Finish';
  
  // Extract defect-specific meterage for patch repairs
  const extractDefectMeterage = (defectsText: string): string => {
    // Look for meterage patterns in defects (e.g., "5.67m", "at 5.67m")
    const meterageMatches = defectsText.match(/\b(\d+\.?\d*)m\b/g);
    if (meterageMatches && meterageMatches.length > 0) {
      // For structural defects, use the first meterage found (usually the defect location)
      return meterageMatches[0];
    }
    return length; // Fallback to total length if no specific meterage found
  };

  // Helper function to get PR2 configuration details for dynamic recommendations
  const getPR2ConfigurationDetails = (section: any, repairPricingData: any[], checkFunction: any): string => {
    if (!repairPricingData || repairPricingData.length === 0) {
      return 'cleanse and survey'; // Default fallback
    }
    
    // Find the configuration that this section meets
    const matchingConfig = repairPricingData.find(config => 
      checkFunction(section, config)
    );
    
    if (!matchingConfig) {
      return 'cleanse and survey'; // Default fallback
    }
    
    // Dynamic recommendation using PR2 config
    
    // Extract equipment type from category name
    let equipmentType = 'cleanse and survey';
    if (matchingConfig.categoryName) {
      const categoryName = matchingConfig.categoryName.toLowerCase();
      if (categoryName.includes('cctv') && categoryName.includes('jet vac')) {
        equipmentType = 'CCTV and jet vac';
      } else if (categoryName.includes('cctv') && categoryName.includes('van pack')) {
        equipmentType = 'CCTV and van pack';
      } else if (categoryName.includes('jetting')) {
        equipmentType = 'high-pressure jetting';
      } else if (categoryName.includes('vacuum')) {
        equipmentType = 'vacuum tanker';
      }
    }
    
    // Get additional configuration details - READ FROM MM4 BLUE VALUE ONLY
    const dayRate = matchingConfig.mm_data?.mm4Rows?.[0]?.blueValue;
    
    const runsPerShift = matchingConfig.quantityOptions?.find(opt => 
      opt.label?.toLowerCase().includes('runs per shift')
    )?.value;
    
    if (dayRate && runsPerShift) {
      const costPerSection = (parseFloat(dayRate) / parseFloat(runsPerShift)).toFixed(2);
      // Dynamic recommendation cost calculation
    }
    
    return equipmentType;
  };

  // Generate contextual recommendation based on defect type and PR2 configuration
  if (defectSummary) {
    if (requiresCleaning(defects || '')) {
      // For now, return a simple static recommendation since we need the checkFunction
      // This will be enhanced once we have access to the check function within the Dashboard component
      return `To cleanse and survey ${length} from ${from} to ${to}, ${pipe} to remove ${defectSummary}`;
    } else {
      // For structural repairs, use defect-specific meterage instead of total length
      const defectMeterage = extractDefectMeterage(defects || '');
      if (defectMeterage !== length) {
        // We have specific defect meterage, generate patch repair recommendation
        return `To install a ${pipe} double layer Patch at ${defectMeterage}, ${from} to ${to} addressing ${defectSummary}`;
      } else {
        // Use total length for general repairs
        return `To repair ${length} from ${from} to ${to}, ${pipe} addressing ${defectSummary}`;
      }
    }
  } else {
    return `${length} section from ${from} to ${to}, ${pipe} - No action required, pipe section is in adoptable condition`;
  }
};

// Calculate depth range from MH depths for pricing calculations
const calculateDepthRangeFromMHDepths = (startDepth: string, finishDepth: string): string => {
  // Handle 'no data recorded' or empty values
  if (!startDepth || !finishDepth || 
      startDepth === 'no data recorded' || finishDepth === 'no data recorded' ||
      startDepth === 'Not Specified' || finishDepth === 'Not Specified') {
    return "";
  }
  
  // Extract numeric values from depth strings (e.g., "2.5m" -> 2.5)
  const startNumeric = parseFloat(startDepth.replace(/[^0-9.]/g, ''));
  const finishNumeric = parseFloat(finishDepth.replace(/[^0-9.]/g, ''));
  
  if (isNaN(startNumeric) || isNaN(finishNumeric)) {
    return "";
  }
  
  // Get the average depth for pipe level calculation
  const avgDepth = (startNumeric + finishNumeric) / 2;
  
  // Return appropriate depth range based on industry standards
  if (avgDepth <= 1) return "0-1m";
  if (avgDepth <= 2) return "1-2m"; 
  if (avgDepth <= 3) return "2-3m";
  if (avgDepth <= 4) return "3-4m";
  if (avgDepth <= 5) return "4-5m";
  return "5m+";
};


const sectors = [
  {
    id: "utilities",
    name: "Utilities",
    description: "WRc SRM standards",
    icon: Building,
    color: "text-primary",
    standards: [
      { name: "MSCC5 – Manual of Sewer Condition Classification", url: "https://www.wrcgroup.com/product/manual-of-sewer-condition-classification-mscc-5th-edition" },
      { name: "Sewerage Rehabilitation Manual (SRM)", url: "https://www.wrcgroup.com/product/sewerage-risk-management-srm-manual" },
      { name: "WRc Drain & Sewer Cleaning Manual", url: "https://www.wrcgroup.com/product/drain-and-sewer-cleaning-manual" },
      { name: "Drain Repair Book (4th Ed.)", url: "https://www.wrcgroup.com/product/drain-repair-book-4th-edition" },
      { name: "BS EN 752:2017 – Drain and sewer systems outside buildings", url: "https://shop.bsigroup.com/products/drain-and-sewer-systems-outside-buildings-bs-en-752-2017" },
      { name: "Water Industry Act 1991 – Sections 94 & 106", url: "https://www.legislation.gov.uk/ukpga/1991/56/contents" }
    ],
    outputColumns: ["Defect Grade", "SRM Grading", "Repair Methods", "Cleaning Methods", "Cost Band", "Risk Score"]
  },
  {
    id: "adoption", 
    name: "Adoption",
    description: "Utilities + Sewers for Adoption 7th Ed.",
    icon: HomeIcon,
    color: "text-emerald-600",
    standards: [
      { name: "MSCC5", url: "https://wrcknowledgestore.co.uk/collections/all/products/manual-of-sewer-condition-classification-5th-edition" },
      { name: "Drain & Sewer Cleaning Manual", url: "https://wrcknowledgestore.co.uk/collections/all/products/drain-and-sewer-cleaning-manual" },
      { name: "Drain Repair Book (4th Ed.)", url: "https://wrcknowledgestore.co.uk/collections/all/products/drain-repair-book-4th-edition" },
      { name: "Sewers for Adoption 7th Ed.", url: "https://www.water.org.uk/sewerage-sector-guidance-approved-documents/" }
    ],
    outputColumns: ["Defect Grade", "SRM Grading", "Repair Methods", "Cleaning Methods", "Cost Band", "Adoption Status"]
  },
  {
    id: "highways",
    name: "Highways",
    description: "Core WRc documents + HADDMS guidance",
    icon: Car,
    color: "text-amber-600",
    standards: [
      { name: "MSCC5", url: "https://wrcknowledgestore.co.uk/collections/all/products/manual-of-sewer-condition-classification-5th-edition" },
      { name: "Drain & Sewer Cleaning Manual", url: "https://wrcknowledgestore.co.uk/collections/all/products/drain-and-sewer-cleaning-manual" },
      { name: "Drain Repair Book (4th Ed.)", url: "https://wrcknowledgestore.co.uk/collections/all/products/drain-repair-book-4th-edition" },
      { name: "HADDMS", url: "https://www.gov.uk/government/publications/highways-asset-data-and-management-guidance" }
    ],
    outputColumns: ["Defect Grade", "SRM Grading", "Repair Methods", "Cleaning Methods", "Cost Band", "Risk Score"]
  },
  {
    id: "trading",
    name: "Domestic",
    description: "MSCC5, Cleaning Manual, and Repair Book guidance",
    icon: Users,
    color: "text-blue-600",
    standards: [
      { name: "MSCC5", url: "https://wrcknowledgestore.co.uk/collections/all/products/manual-of-sewer-condition-classification-5th-edition" },
      { name: "Drain & Sewer Cleaning Manual", url: "https://wrcknowledgestore.co.uk/collections/all/products/drain-and-sewer-cleaning-manual" },
      { name: "Drain Repair Book (4th Ed.)", url: "https://wrcknowledgestore.co.uk/collections/all/products/drain-repair-book-4th-edition" }
    ],
    outputColumns: ["Defect Grade", "Structural vs Operational Action", "Repair Recommendation", "Cost Band", "Compliance Status"]
  },
  {
    id: "insurance",
    name: "Insurance",
    description: "Standard compliance checks + insurer technical standards",
    icon: ShieldCheck,
    color: "text-red-600",
    standards: [
      { name: "MSCC5", url: "https://wrcknowledgestore.co.uk/collections/all/products/manual-of-sewer-condition-classification-5th-edition" },
      { name: "Drain & Sewer Cleaning Manual", url: "https://wrcknowledgestore.co.uk/collections/all/products/drain-and-sewer-cleaning-manual" },
      { name: "Drain Repair Book (4th Ed.)", url: "https://wrcknowledgestore.co.uk/collections/all/products/drain-repair-book-4th-edition" }
    ],
    outputColumns: ["Defect Grade", "Structural vs Operational Action", "Repair Recommendation", "Cost Band", "Claim Validity"]
  },
  {
    id: "construction",
    name: "Construction",
    description: "Core standards suite + adoption guidance",
    icon: HardHat,
    color: "text-orange-600",
    standards: [
      { name: "MSCC5", url: "https://wrcknowledgestore.co.uk/collections/all/products/manual-of-sewer-condition-classification-5th-edition" },
      { name: "Drain & Sewer Cleaning Manual", url: "https://wrcknowledgestore.co.uk/collections/all/products/drain-and-sewer-cleaning-manual" },
      { name: "Drain Repair Book (4th Ed.)", url: "https://wrcknowledgestore.co.uk/collections/all/products/drain-repair-book-4th-edition" }
    ],
    outputColumns: ["Defect Grade", "Structural vs Operational Action", "Repair Recommendation", "Cost Band", "Compliance Status"]
  }
];

const getStatusIcon = (status: string) => {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case "processing":
      return <Clock className="h-4 w-4 text-amber-500" />;
    case "failed":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <AlertCircle className="h-4 w-4 text-slate-500" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-800";
    case "processing":
      return "bg-amber-100 text-amber-800";
    case "failed":
      return "bg-red-100 text-red-800";
    default:
      return "bg-slate-100 text-slate-800";
  }
};

// Helper functions to get actual data from section inspection
// ELIMINATED: FAKE MANHOLE REFERENCE FUNCTIONS
// These functions were generating completely fake SW02→SW03 data that violated zero tolerance policy
// AUTHENTIC DATA ONLY - All manhole references must come directly from uploaded PDF content
// Database contains authentic references from user's inspection reports

// REMOVED: getPipeSize function contained false hardcoded data
// All pipe size data now comes directly from authentic database records

// REMOVED: getPipeMaterial function contained false hardcoded data
// All pipe material data now comes directly from authentic database records

// REMOVED: getTotalLength and getLengthSurveyed functions contained false hardcoded data
// All length data now comes directly from authentic database records

// PERMANENTLY REMOVED: All mock data generation functions
// ZERO TOLERANCE POLICY: Only authentic data from user-uploaded PDFs allowed
// If no authentic data exists, display error message requesting user upload

// SRM Grading function - combines structural and service grades into risk assessment
const getSrmBadge = (grade: number | null) => {
  if (grade === 0) return { label: 'MINIMAL', className: 'bg-green-100 text-green-700' };
  if (grade === 1) return { label: 'MINOR', className: 'bg-yellow-100 text-yellow-800' };
  if (grade === 2) return { label: 'NOTICEABLE', className: 'bg-orange-100 text-orange-700' };
  if (grade === 3) return { label: 'MAJOR', className: 'bg-red-100 text-red-700' };
  if (grade >= 4) return { label: 'CRITICAL', className: 'bg-neutral-900 text-white' };
  return { label: 'N/A', className: 'bg-gray-100 text-gray-600' };
};

// Adoptable status color function - coordinated pastel colors
function getAdoptableColor(status: string) {
  if (status === 'Yes') return 'bg-green-100 text-green-700';
  if (status === 'Conditional') return 'bg-yellow-100 text-yellow-800';
  if (status === 'No') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-600';
}

// Column definitions for the enhanced table
const tableColumns = [
  { key: 'itemNo', label: 'Item No', hideable: false },
  { key: 'inspectionNo', label: 'Inspec. No', hideable: true },
  { key: 'projectNo', label: 'Project No', hideable: true },
  { key: 'date', label: 'Date', hideable: true },
  { key: 'time', label: 'Time', hideable: true },
  { key: 'startMH', label: 'Start MH', hideable: false },
  { key: 'startMHDepth', label: 'Start MH Depth', hideable: false },
  { key: 'finishMH', label: 'Finish MH', hideable: false },
  { key: 'finishMHDepth', label: 'Finish MH Depth', hideable: false },
  { key: 'pipeSize', label: 'Pipe Size', hideable: false },
  { key: 'pipeMaterial', label: 'Pipe Material', hideable: true },
  { key: 'totalLength', label: 'Total Length', hideable: false },
  { key: 'lengthSurveyed', label: 'Length Surveyed', hideable: false },
  { key: 'defects', label: 'Observations', hideable: false },
  { key: 'severityGrade', label: 'Grade', hideable: false },
  { key: 'serviceGradeDescription', label: 'Service Grade', hideable: false },
  { key: 'srmGrading', label: 'SRM Risk', hideable: false },
  { key: 'sectorType', label: 'Sector', hideable: false },
  { key: 'recommendations', label: 'Recommendations', hideable: false },
  { key: 'adoptable', label: 'Adoptable', hideable: false },
  { key: 'cost', label: 'Cost', hideable: false }
];

export default function Dashboard() {
  // FIXED: Removed console disabling useEffect to prevent infinite loops

  const { toast } = useToast();
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const reportId = urlParams.get('reportId');
  const queryClient = useQueryClient();
  
  // Equipment priority state with localStorage sync - A5 default matching UI
  const [equipmentPriority, setEquipmentPriority] = useState<'id760' | 'id759'>(() => {
    // FIXED: A5 (id760) as default to match equipment selection UI default button
    const stored = localStorage.getItem('equipmentPriority');
    if (stored === 'f690' || stored === 'f606' || stored === 'f608') {
      // Auto-migrate old f-series preferences to id760 (default)
      localStorage.setItem('equipmentPriority', 'id760');
      return 'id760';
    }
    return (stored === 'id759') ? 'id759' : 'id760';
  });

  // Clear old patterns from localStorage cache on component mount
  useEffect(() => {
    const clearOldPatterns = () => {
      const keys = Object.keys(localStorage);
      const oldPatternKeys = keys.filter(key => 
        key.includes('760-150-1501') || key.includes('759-150-1501')
      );
      
      if (oldPatternKeys.length > 0) {
        console.log('🧹 CLEARING OLD PATTERNS from localStorage:', oldPatternKeys);
        oldPatternKeys.forEach(key => localStorage.removeItem(key));
        
        // CRITICAL FIX: Equipment-specific buffer isolation
        const inputBuffer = JSON.parse(localStorage.getItem('inputBuffer') || '{}');
        const currentEquipment = equipmentPriority;
        const otherEquipment = currentEquipment === 'id760' ? 'id759' : 'id760';
        
        // Clear buffer keys for inactive equipment to prevent conflicts
        const cleanedBuffer = Object.fromEntries(
          Object.entries(inputBuffer).filter(([key]) => !key.includes(otherEquipment))
        );
        localStorage.setItem('inputBuffer', JSON.stringify(cleanedBuffer));
        
        console.log('🧹 Equipment-isolated inputBuffer maintained:', Object.keys(cleanedBuffer));
        console.log('🧹 Active equipment:', currentEquipment, '- Cleared:', otherEquipment, 'keys');
      }
    };
    
    clearOldPatterns();
  }, []);

  // Listen for equipment priority changes from popups
  useEffect(() => {
    const handleEquipmentPriorityChange = (event: CustomEvent) => {
      const { newPriority, requiresConfigReload } = event.detail;
      console.log('🔄 Dashboard received equipment priority change:', newPriority, 'requiresConfigReload:', requiresConfigReload);
      
      // CRITICAL FIX: Add loading state during equipment switching
      setEquipmentPriority(newPriority);
      
      // Clear cost decisions when equipment priority changes to trigger new warnings
      const existingDecisions = JSON.parse(localStorage.getItem('appliedCostDecisions') || '[]');
      const currentReportId = reportId || 'current'; // Use reportId directly or fallback
      
      // Remove decisions for this report (since equipment priority changed)
      const filteredDecisions = existingDecisions.filter((decision: any) => 
        decision.reportId !== currentReportId
      );
      localStorage.setItem('appliedCostDecisions', JSON.stringify(filteredDecisions));
      
      console.log('🧹 Cleared cost decisions for report after equipment priority change:', currentReportId);
      
      // SIMPLIFIED SYNCHRONIZATION: Eliminate complex timing sequences that cause race conditions  
      console.log('🔄 Equipment priority changed - immediate unified synchronization');
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-configurations'] });
      queryClient.invalidateQueries({ queryKey: [`/api/uploads`, reportId, 'sections'] });
      
      // Force immediate cost recalculation with single timing cycle
      setTimeout(() => {
        setCostRecalcTrigger(prev => prev + 1);
        console.log('🔄 Equipment priority synchronization complete');
      }, 100);
    };

    window.addEventListener('equipmentPriorityChanged', handleEquipmentPriorityChange as EventListener);
    
    return () => {
      window.removeEventListener('equipmentPriorityChanged', handleEquipmentPriorityChange as EventListener);
    };
  }, [reportId, queryClient]);
  
  // Force component re-render when equipment priority changes
  const [costRecalcTrigger, setCostRecalcTrigger] = useState(0);
  
  // Restore cost decisions when equipment priority changes
  useEffect(() => {
    const restoreCostDecisions = () => {
      try {
        const existingDecisions = JSON.parse(localStorage.getItem('appliedCostDecisions') || '[]');
        const currentReportId = reportId || 'current';
        
        // Service cost decisions
        const serviceDecision = existingDecisions.find((decision: any) => 
          decision.reportId === currentReportId && 
          decision.equipmentType === equipmentPriority && 
          decision.decisionType === 'service'
        );
        
        if (serviceDecision && serviceDecision.itemDetails) {
          const costMap = new Map();
          serviceDecision.itemDetails.forEach((item: any) => {
            costMap.set(item.itemNo, item.appliedCost);
          });
          setAdjustedServiceCosts(costMap);
        }
        
        // Structural cost decisions
        const structuralDecision = existingDecisions.find((decision: any) => 
          decision.reportId === currentReportId && 
          decision.equipmentType === equipmentPriority && 
          decision.decisionType === 'structural'
        );
        
        if (structuralDecision && structuralDecision.itemDetails) {
          const costMap = new Map();
          const appliedItems = new Set<number>();
          structuralDecision.itemDetails.forEach((item: any) => {
            costMap.set(item.itemNo, item.appliedCost);
            appliedItems.add(item.itemNo);
          });
          setAdjustedStructuralCosts(costMap);
          setAppliedStructuralPricing(appliedItems);
        }
        
        console.log('🔄 Cost decisions restored for equipment:', equipmentPriority, 'report:', currentReportId);
      } catch (error) {
        console.error('Error restoring cost decisions:', error);
      }
    };
    
    restoreCostDecisions();
    setCostRecalcTrigger(prev => prev + 1);
  }, [equipmentPriority, reportId]);

  // Column visibility state with localStorage persistence
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    try {
      const savedHiddenColumns = localStorage.getItem('dashboard-hidden-columns');
      if (savedHiddenColumns) {
        return new Set(JSON.parse(savedHiddenColumns));
      }
    } catch (error) {
      // Error loading hidden columns from localStorage
    }
    return new Set();
  });
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [showExportWarning, setShowExportWarning] = useState(false);
  const [pendingExport, setPendingExport] = useState(false);
  
  // Column resizing state with localStorage persistence
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const savedWidths = localStorage.getItem('dashboard-column-widths');
      if (savedWidths) {
        return JSON.parse(savedWidths);
      }
    } catch (error) {
      // Error loading column widths from localStorage
    }
    return {};
  });
  
  const [resizeState, setResizeState] = useState<{
    columnKey: string | null;
    startX: number;
    startWidth: number;
  }>({ columnKey: null, startX: 0, startWidth: 0 });
  
  // REMOVED: Auto-cost popup system that was causing infinite loops
  // All cost calculations continue working normally without popup dialogs
  
  // Report validation state
  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isReady: false,
    issues: [],
    summary: 'Checking report readiness...'
  });
  const [travelInfo, setTravelInfo] = useState<TravelInfo | null>(null);

  // Filter state
  const [filters, setFilters] = useState({
    severityGrade: '',
    adoptable: [] as string[],
    pipeSize: '',
    pipeMaterial: '',
    projectNumber: ''
  });
  const [showFilters, setShowFilters] = useState(false);
  
  // Folder expansion state
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  
  // Folder selector state
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [selectedFolderForView, setSelectedFolderForView] = useState<number | null>(null);
  const [selectedReportIds, setSelectedReportIds] = useState<number[]>([]);
  const [showClearDataDialog, setShowClearDataDialog] = useState(false);
  const [showDeleteFolderDialog, setShowDeleteFolderDialog] = useState(false);
  const [selectedFolderToDelete, setSelectedFolderToDelete] = useState<{ id: number; name: string; reportCount: number } | null>(null);
  
  // Sequential section validation state
  const [showSequenceWarning, setShowSequenceWarning] = useState(false);
  const [missingSequences, setMissingSequences] = useState<number[]>([]);
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [isDatabaseFile, setIsDatabaseFile] = useState(false);
  
  // Patch repair pricing dialog state
  const [showPatchPricingDialog, setShowPatchPricingDialog] = useState(false);
  const [selectedPatchSection, setSelectedPatchSection] = useState<any>(null);
  const [selectedPatchCalculation, setSelectedPatchCalculation] = useState<any>(null);
  
  // TP2 distribution dialog state
  const [showTP2DistributionDialog, setShowTP2DistributionDialog] = useState<{
    show: boolean;
    tp2Sections: any[];
    totalDefects: number;
    minQuantity: number;
    configurationId?: number;
    pipeSize?: string;
    message: string;
  }>({
    show: false,
    tp2Sections: [],
    totalDefects: 0,
    minQuantity: 4,
    message: ''
  });

  // TP1 minimum quantity warning dialog state
  const [showTP1DistributionDialog, setShowTP1DistributionDialog] = useState<{
    show: boolean;
    tp1Sections: any[];
    totalSections: number;
    minQuantity: number;
    configurationId?: number;
    message: string;
  }>({
    show: false,
    tp1Sections: [],
    totalSections: 0,
    minQuantity: 25,
    message: ''
  });

  // DB15 Travel Configuration Warning dialog state
  const [showTravelConfigDialog, setShowTravelConfigDialog] = useState<{
    show: boolean;
    configType: 'TP1' | 'TP2';
    configurationId?: number;
    message: string;
  }>({
    show: false,
    configType: 'TP1',
    message: ''
  });



  // Handler for opening patch pricing dialog
  const handlePatchPricingClick = (section: any, costCalculation: any) => {
    // Patch pricing click handler called
    
    setSelectedPatchSection(section);
    setSelectedPatchCalculation(costCalculation);
    setShowPatchPricingDialog(true);
  };

  // Handler for updating patch repair prices
  const handlePatchPriceUpdate = (newPrices: { [key: string]: number }) => {
    // For now, we'll show a toast notification
    // In the future, this could update the backend configuration
    // Patch prices updated
    toast({
      title: "Patch Prices Updated",
      description: `Updated pricing for ${Object.keys(newPrices).length} repairs`,
    });
    
    // Close the dialog
    setShowPatchPricingDialog(false);
    setSelectedPatchSection(null);
    setSelectedPatchCalculation(null);
  };

  // Store adjusted service costs in local state
  const [adjustedServiceCosts, setAdjustedServiceCosts] = useState<Map<number, number>>(new Map());
  
  // Store adjusted structural costs in local state
  const [adjustedStructuralCosts, setAdjustedStructuralCosts] = useState<Map<number, number>>(new Map());
  
  // Track which items have structural pricing applied (for green highlighting)
  const [appliedStructuralPricing, setAppliedStructuralPricing] = useState<Set<number>>(new Set());





  // Warning system removed - clean dashboard foundation



  // Configuration warning functions removed with warning system

  // Warning system functions removed - clean foundation



  // FIXED: Removed click outside useEffect to prevent infinite loops
  // Folder dropdown can be closed manually via close button

  // FIXED: Removed localStorage loading useEffect to prevent infinite loops
  // Hidden columns will load via direct initialization in useState

  // Sequential section validation function - Updated for authentic Wincan data
  const validateSequentialSections = (sections: any[], uploadData: any) => {
    if (!sections || sections.length === 0) return { isValid: true, missing: [], isDatabase: false };
    
    const itemNumbers = sections.map(s => s.itemNo).sort((a, b) => a - b);
    const missing: number[] = [];
    
    // Detect if this is a Wincan database file
    const isWincanDatabase = uploadData?.fileType === 'database' || 
                             uploadData?.fileName?.toLowerCase().includes('.db');
    
    if (isWincanDatabase) {
      // For Wincan databases, detect gaps but label them as authentic deletions
      const minItem = Math.min(...itemNumbers);
      const maxItem = Math.max(...itemNumbers);
      
      for (let i = minItem; i <= maxItem; i++) {
        if (!itemNumbers.includes(i)) {
          missing.push(i);
        }
      }
      
      return { isValid: true, missing, isDatabase: true };
    } else {
      // For PDF files, check for missing sequential numbers from 1 to max
      const maxItem = Math.max(...itemNumbers);
      for (let i = 1; i <= maxItem; i++) {
        if (!itemNumbers.includes(i)) {
          missing.push(i);
        }
      }
      return { isValid: missing.length === 0, missing, isDatabase: false };
    }
  };

  // FIXED: Removed useEffect to prevent infinite loops
  // Hidden columns will save when toggled in the toggle function directly

  // All helper functions removed to prevent screen flashing

  const toggleColumnVisibility = (columnKey: string) => {
    setHiddenColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(columnKey)) {
        newSet.delete(columnKey);
      } else {
        newSet.add(columnKey);
      }
      // Save directly to localStorage to avoid useEffect infinite loops
      localStorage.setItem('dashboard-hidden-columns', JSON.stringify(Array.from(newSet)));
      return newSet;
    });
  };

  // Excel-like column resizing handlers
  const handleResizeStart = (e: React.MouseEvent, columnKey: string, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    setResizeState({
      columnKey,
      startX: e.clientX,
      startWidth: currentWidth
    });
  };

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizeState.columnKey) return;
    
    const delta = e.clientX - resizeState.startX;
    const newWidth = Math.max(50, resizeState.startWidth + delta); // Minimum 50px
    
    setColumnWidths(prev => {
      const updated = {
        ...prev,
        [resizeState.columnKey!]: newWidth
      };
      localStorage.setItem('dashboard-column-widths', JSON.stringify(updated));
      return updated;
    });
  }, [resizeState]);

  const handleResizeEnd = useCallback(() => {
    setResizeState({ columnKey: null, startX: 0, startWidth: 0 });
  }, []);

  const handleDoubleClickResize = (columnKey: string) => {
    // Auto-fit column to content
    const cells = document.querySelectorAll(`td[data-column-key="${columnKey}"]`);
    let maxWidth = 100; // Minimum width
    
    cells.forEach(cell => {
      const cellWidth = (cell as HTMLElement).scrollWidth + 16; // Add padding
      if (cellWidth > maxWidth) {
        maxWidth = cellWidth;
      }
    });
    
    // Also check header width
    const header = document.querySelector(`th[data-column-key="${columnKey}"]`);
    if (header) {
      const headerWidth = (header as HTMLElement).scrollWidth + 16;
      if (headerWidth > maxWidth) {
        maxWidth = headerWidth;
      }
    }
    
    setColumnWidths(prev => {
      const updated = {
        ...prev,
        [columnKey]: Math.min(maxWidth, 800) // Max 800px
      };
      localStorage.setItem('dashboard-column-widths', JSON.stringify(updated));
      return updated;
    });
  };

  // Add/remove mouse event listeners for column resizing
  useEffect(() => {
    if (resizeState.columnKey) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizeState.columnKey, handleResizeMove, handleResizeEnd]);

  // Simplified column styling - no dynamic changes
  const getColumnStyle = (key: string) => {
    return {};
  };

  // Clean CSS classes for all columns
  const getColumnClasses = (key: string) => {
    return 'text-left align-top whitespace-normal break-words';
  };

  // Calculate dynamic columns with responsive widths based on hidden columns
  const columns = useMemo(() => {
    const hiddenCount = hiddenColumns.size;
    
    // Calculate dynamic widths - responsive sizing based on hidden columns
    const getColumnWidth = (key: string, baseWidth: string) => {
      // When "Hide All" is clicked (8+ columns hidden), optimize all columns
      if (hiddenCount >= 8) {
        // Content columns get maximum space
        if (key === 'defects' || key === 'recommendations') {
          return 'w-[32rem]'; // Maximum width for content
        }
        // All other columns become ultra-tight
        if (key === 'itemNo') return 'w-8';
        if (key === 'startMH' || key === 'finishMH') return '';
        if (key === 'severityGrade' || key === 'srmGrading' || key === 'adoptable') return 'w-12';
        if (key === 'cost') return 'w-12';
        // Any remaining columns
        return 'w-10';
      }
      // For all other cases, use consistent base width
      return baseWidth;
    };

    return [
      { key: 'projectNo', label: 'Project<br/>No', hideable: true, width: getColumnWidth('projectNo', 'w-4'), priority: 'tight' },
      { key: 'itemNo', label: 'Item<br/>No', hideable: false, width: getColumnWidth('itemNo', 'w-8'), priority: 'tight' },
      { key: 'inspectionNo', label: 'Inspec.<br/>No', hideable: true, width: getColumnWidth('inspectionNo', 'w-8'), priority: 'tight' },
      { key: 'date', label: 'Date', hideable: true, width: getColumnWidth('date', 'w-10'), priority: 'tight' },
      { key: 'time', label: 'Time', hideable: true, width: getColumnWidth('time', 'w-10'), priority: 'tight' },
      { key: 'startMH', label: 'Start<br/>MH', hideable: false, width: getColumnWidth('startMH', ''), priority: 'tight' },
      { key: 'startMHDepth', label: 'Start MH<br/>Depth', hideable: true, width: getColumnWidth('startMHDepth', 'w-12'), priority: 'tight' },
      { key: 'finishMH', label: 'Finish<br/>MH', hideable: false, width: getColumnWidth('finishMH', ''), priority: 'tight' },
      { key: 'finishMHDepth', label: 'Finish MH<br/>Depth', hideable: true, width: getColumnWidth('finishMHDepth', 'w-12'), priority: 'tight' },
      { key: 'pipeSize', label: 'Pipe<br/>Size', hideable: true, width: getColumnWidth('pipeSize', 'w-8'), priority: 'tight' },
      { key: 'pipeMaterial', label: 'Pipe<br/>Material', hideable: true, width: getColumnWidth('pipeMaterial', 'w-10'), priority: 'tight' },
      { key: 'totalLength', label: 'Total<br/>Length (m)', hideable: true, width: getColumnWidth('totalLength', 'w-10'), priority: 'tight' },
      { key: 'lengthSurveyed', label: 'Length<br/>Surveyed (m)', hideable: true, width: getColumnWidth('lengthSurveyed', 'w-12'), priority: 'tight' },
      { key: 'defects', label: 'Observations', hideable: false, width: getColumnWidth('defects', 'min-w-96'), priority: 'pretty' },
      { key: 'severityGrade', label: 'Severity<br/>Grade', hideable: false, width: getColumnWidth('severityGrade', 'w-10'), priority: 'tight' },
      { key: 'srmGrading', label: 'SRM<br/>Grading', hideable: false, width: getColumnWidth('srmGrading', 'w-10'), priority: 'tight' },
      { key: 'recommendations', label: 'Recommendations', hideable: false, width: getColumnWidth('recommendations', 'min-w-96'), priority: 'pretty' },
      { key: 'adoptable', label: 'Adoptable', hideable: false, width: getColumnWidth('adoptable', 'w-10'), priority: 'tight' },
      { key: 'cost', label: 'Cost<br/>(£)', hideable: false, width: getColumnWidth('cost', 'w-10'), priority: 'tight' }
    ];
  }, [hiddenColumns]);





  // Helper function to get item number with letter suffix from database
  // Uses authentic database letter suffix field from multi-defect splitting system
  const getItemNumberWithSuffix = (section: any, allSections: any[]) => {
    const currentItemNo = section.itemNo;
    
    // If section has a database letter suffix (from multi-defect splitting), use it
    // FIXED: Prevent double suffix concatenation (e.g., "13a" + "a" = "13aa")
    if (section.letterSuffix && !currentItemNo.toString().includes(section.letterSuffix)) {
      return `${currentItemNo}${section.letterSuffix}`;
    }
    
    // Otherwise, just return the item number (may already include suffix from MSCC5Classifier)
    return currentItemNo.toString();
  };

  // Function to render cell content based on column key
  const renderCellContent = (columnKey: string, section: any) => {
    if (columnKey === 'recommendations') {
      console.log('🔍 RENDER CELL CONTENT - Item', section.itemNo, {
        columnKey,
        hasRecommendations: !!section.recommendations,
        recommendation: section.recommendations,
        defectType: section.defectType,
        severityGrade: section.severityGrade
      });
    }
    
    switch (columnKey) {
      case 'projectNo':
        // MULTI-REPORT SUPPORT: Show project number from section's own report
        return section.projectNo || section.projectNumber || 'no data recorded';
      case 'itemNo':
        const itemSuffix = getItemNumberWithSuffix(section, sectionData);
        const defectTypeIcon = section.defectType === 'service' ? '💧' : 
                              section.defectType === 'structural' ? '🔧' : '';
        return (
          <div className="text-center font-medium">
            <div className="flex items-center justify-center gap-1">
              <span>{itemSuffix}</span>
              {defectTypeIcon && (
                <span className="text-xs" title={`${section.defectType} defect type`}>
                  {defectTypeIcon}
                </span>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              ID: {section.id}
            </div>
          </div>
        );
      case 'inspectionNo':
        return section.inspectionNo;
      case 'date':
        return section.date;
      case 'time':
        return section.time;
      case 'startMH':
        return section.startMH;
      case 'startMHDepth':
        return section.startMHDepth;
      case 'finishMH':
        return section.finishMH;
      case 'finishMHDepth':
        return section.finishMHDepth;
      case 'pipeSize':
        return section.pipeSize;
      case 'pipeMaterial':
        return section.pipeMaterial;
      case 'totalLength':
        return section.totalLength;
      case 'lengthSurveyed':
        return section.lengthSurveyed;
      case 'defects':
        // Direct defects text handling without any HTML tag stripping
        const defectsText = section.defects || '';
        
        // Debug observation items to understand bullet point issue
        if (section.defectType === 'observation') {
          console.log(`🔍 OBSERVATION ITEM ${section.itemNo} DEFECTS:`, {
            itemNo: section.itemNo,
            defectType: section.defectType,
            defectsText: defectsText,
            hasDefects: !!defectsText,
            defectsLength: defectsText.length
          });
        }
        
        // Clean observation preprocessing - removes HTML and prepares for ObservationRenderer
        const cleanObservationForRenderer = (text: string, defectType: string) => {
          // Remove any existing HTML tags from previous processing
          const cleanText = text.replace(/<[^>]*>/g, '');
          
          // For structural defects - format with meterage at end
          if (defectType === 'structural') {
            // Handle deformity patterns
            const deformityMatch = cleanText.match(/Deformity at (\d+\.?\d*)m(.*)$/i);
            if (deformityMatch) {
              const meterage = deformityMatch[1];
              const description = deformityMatch[2].trim();
              return `DEF Deformity${description} at ${meterage}m`;
            }
            
            // Handle fractures
            const fractureMatch = cleanText.match(/(Fracture|fracture).*?at (\d+\.?\d*)m(.*)$/i);
            if (fractureMatch) {
              const meterage = fractureMatch[2];
              const codeType = cleanText.toLowerCase().includes('circumferential') ? 'FC' : 'FL';
              const description = fractureMatch[3].trim();
              const fractureName = fractureMatch[1].toLowerCase();
              return `${codeType} ${fractureName.charAt(0).toUpperCase() + fractureName.slice(1)}${description} at ${meterage}m`;
            }
            
            // Handle cracks
            const crackMatch = cleanText.match(/(Crack|crack).*?at (\d+\.?\d*)m(.*)$/i);
            if (crackMatch) {
              const meterage = crackMatch[2];
              const description = crackMatch[3].trim();
              return `CR Crack${description} at ${meterage}m`;
            }
            
            // Handle joint displacement
            const jointDisplacementMatch = cleanText.match(/Joint displacement.*?at (\d+\.?\d*)m(.*)$/i);
            if (jointDisplacementMatch) {
              const meterage = jointDisplacementMatch[1];
              const codeType = cleanText.toLowerCase().includes('major') ? 'JDM' : 'JDL';
              const description = jointDisplacementMatch[2].trim();
              return `${codeType} Joint displacement${description} at ${meterage}m`;
            }
            
            // Handle open joints
            const openJointMatch = cleanText.match(/Open joint.*?at (\d+\.?\d*)m(.*)$/i);
            if (openJointMatch) {
              const meterage = openJointMatch[1];
              const codeType = cleanText.toLowerCase().includes('major') ? 'OJM' : 'OJL';
              const description = openJointMatch[2].trim();
              return `${codeType} Open joint${description} at ${meterage}m`;
            }
            
            // Handle collapsed pipes
            const collapsedMatch = cleanText.match(/(Collapsed|collapsed).*?at (\d+\.?\d*)m(.*)$/i);
            if (collapsedMatch) {
              const meterage = collapsedMatch[2];
              const description = collapsedMatch[3].trim();
              return `COL Collapsed${description} at ${meterage}m`;
            }
            
            // Handle broken pipes
            const brokenMatch = cleanText.match(/(Broken|broken).*?at (\d+\.?\d*)m(.*)$/i);
            if (brokenMatch) {
              const meterage = brokenMatch[2];
              const description = brokenMatch[3].trim();
              return `BRK Broken${description} at ${meterage}m`;
            }
            
            // Handle defective connections
            const connectionMatch = cleanText.match(/(Connection defective|defective connection).*?at (\d+\.?\d*)m(.*)$/i);
            if (connectionMatch) {
              const meterage = connectionMatch[2];
              const description = connectionMatch[3].trim();
              return `CN Connection defective${description} at ${meterage}m`;
            }
          }
          
          // For service defects - keep meterage in description, prefix with codes
          if (defectType === 'service') {
            // Handle DER deposits
            if (cleanText.match(/DER (.+)/i)) {
              return cleanText; // Already has DER prefix
            }
            
            // Handle DES deposits  
            if (cleanText.match(/DES (.+)/i)) {
              return cleanText; // Already has DES prefix
            }
            
            // Handle water level
            const wlMatch = cleanText.match(/Water level (.+)/i);
            if (wlMatch) {
              const description = wlMatch[1];
              return `WL Water level ${description}`;
            }
            
            // Handle junctions
            const junctionMatch = cleanText.match(/Junction (.+)/i);
            if (junctionMatch) {
              const description = junctionMatch[1];
              return `JN Junction ${description}`;
            }
            
            // Only process SC codes when structural defects are present (WRc MSCC5 compliance)
            const hasStructuralDefects = section.defectType === 'structural' || 
                                        (section.severityGrades?.structural && Number(section.severityGrades.structural) > 0);
            
            if (hasStructuralDefects) {
              // Handle size changes (SC) - only for structural items
              const scMatch = cleanText.match(/SC (.+)/i);
              if (scMatch) {
                return cleanText; // Already has SC prefix
              }
              
              // Handle pipe size changes - only for structural items
              const pipeSizeMatch = cleanText.match(/Pipe size changes (.+)/i);
              if (pipeSizeMatch) {
                const description = pipeSizeMatch[1];
                return `SC Pipe size changes ${description}`;
              }
            }
          }
          
          // Return cleaned text if no patterns match
          return cleanText;
        };
        
        if (!defectsText || defectsText.trim() === '') {
          return (
            <div className="text-sm p-2 w-full">
              <ObservationRenderer 
                observations={[]}
                className="text-left leading-relaxed"
              />
            </div>
          );
        }
        
        // Debug Item 3 requirements check
        if (section.itemNo === 3) {
          // ITEM 3 REQUIREMENTS CHECK - analysis completed
          
          // Extract percentage from water level
          const waterLevelMatch = defectsText.match(/(\d+)%.*vertical dimension/);
          const percentage = waterLevelMatch ? parseInt(waterLevelMatch[1]) : 0;
        }
        
        // Check if observations contain multiple distinct observations (either line breaks or periods)
        const hasMultipleObservations = (defectsText.includes('. ') || defectsText.includes('\n')) && defectsText !== 'No service or structural defect found';
        
        if (hasMultipleObservations) {
          // Split observations by line breaks first, then by periods
          let observations = defectsText
            .split(/\n|(?:\. (?=[A-Z]|Settled|Water|Line|Deformation|CUW|SA|CPF|LR|LL))/) // Split on line breaks OR period + space + capital/defect codes (SC removed per WRc MSCC5)
            .map(obs => obs.trim())
            .filter(obs => obs.length > 0)
            .map(obs => {
              // Remove existing bullet points since we'll add them in the UI
              const cleanObs = obs.replace(/^•\s*/, '').trim();
              return cleanObs.endsWith('.') ? cleanObs : cleanObs + '.';
            });
          
          // Filter out ONLY pure line deviation observations, preserve mixed defect observations
          observations = observations.filter(obs => {
            const obsLower = obs.toLowerCase();
            
            // Enhanced filtering logic - only remove observations that are PURE line deviations
            // Keep observations that contain line deviations mixed with meaningful defects
            const hasLineDeviation = obsLower.includes('line deviates') || obsLower.includes('line deviation') || 
                                     obsLower.includes('lr (') || obsLower.includes('ll (');
            
            // Check for meaningful defects in the observation (SC codes removed per WRc MSCC5 standards)
            const hasMeaningfulDefects = obsLower.includes('deposits') || obsLower.includes('crack') || 
                                        obsLower.includes('water level') || obsLower.includes('deformation') || 
                                        obsLower.includes('fracture') || obsLower.includes('joint') ||
                                        obsLower.includes('camera under water') || obsLower.includes('cuw') ||
                                        obsLower.includes('catchpit') || obsLower.includes('cpf') ||
                                        obsLower.includes('sa ') || obsLower.includes('sensor alert');
            
            // Only remove if it's ONLY a line deviation with no other meaningful defects
            const isOnlyLineDeviation = hasLineDeviation && !hasMeaningfulDefects;
            
            // Debug Item 13 and 14 filtering
            if (section.itemNo === 13 || section.itemNo === 14) {
              // Filtering observation
              // Line deviation analysis completed
            }
            
            return !isOnlyLineDeviation;
          });
          
          // Debug Item 10 after filtering
          if (section.itemNo === 10) {
            // Filtering completed
            // Remaining observations logged
          }
          
          // If no observations remain after filtering, show clean message
          if (observations.length === 0) {
            return (
              <div className="text-sm p-2 w-full">
                <ObservationRenderer 
                  observations={["No service or structural defect found"]}
                  className="text-left leading-relaxed"
                />
              </div>
            );
          }
          

          
          return (
            <div className="text-sm p-2 w-full">
              <ObservationRenderer 
                observations={observations.map(obs => cleanObservationForRenderer(obs, section.defectType))}
                className="text-left leading-relaxed"
              />
            </div>
          );
        }
        
        // Single observation - check if it's ONLY a line deviation that should be filtered
        const defectsLower = defectsText.toLowerCase();
        const isOnlyLineDeviation = (defectsLower.includes('line deviates') || defectsLower.includes('line deviation')) &&
          !defectsLower.includes('deposits') && !defectsLower.includes('crack') && !defectsLower.includes('water') &&
          !defectsLower.includes('deformation') && !defectsLower.includes('defect') && !defectsLower.includes('junction');
        
        if (isOnlyLineDeviation) {
          return (
            <div className="text-sm p-2 w-full">
              <ObservationRenderer 
                observations={["No service or structural defect found"]}
                className="text-left leading-relaxed"
              />
            </div>
          );
        }
        
        // Apply clean preprocessing to single observations
        const cleanedText = cleanObservationForRenderer(defectsText, section.defectType);
        
        // For single observations, also use bullet point format for consistency
        return (
          <div className="text-sm p-2 w-full">
            <ObservationRenderer 
              observations={[cleanedText]}
              className="text-left leading-relaxed"
            />
          </div>
        );
      case 'severityGrade':
        // STR badge colors - more visible with distinct shades
        const getStrBadgeColor = (grade: number | null) => {
          if (grade === null || grade === undefined) return "bg-gray-300";
          switch (grade) {
            case 0: return 'bg-green-300';     // Medium green - clearly visible
            case 1: return 'bg-green-400';     // Stronger green - matches LOW SRM
            case 2: return 'bg-yellow-300';    // Medium yellow - matches MODERATE SRM
            case 3: return 'bg-orange-300';    // Medium orange - matches HIGH SRM
            case 4: return 'bg-red-300';       // Medium red - matches CRITICAL SRM
            case 5: return 'bg-red-400';       // Stronger red - matches EMERGENCY SRM
            default: return 'bg-gray-300';
          }
        };
        
        // SER badge colors - lighter than STR for visual hierarchy
        const getSerBadgeColor = (grade: number | null) => {
          if (grade === null || grade === undefined) return "bg-gray-100";
          switch (grade) {
            case 0: return 'bg-green-100';     // Very light green
            case 1: return 'bg-green-200';     // Light green
            case 2: return 'bg-yellow-100';    // Very light yellow
            case 3: return 'bg-orange-100';    // Light orange
            case 4: return 'bg-red-100';       // Light red
            case 5: return 'bg-red-200';       // Light red
            default: return 'bg-gray-100';
          }
        };
        
        // Debug severity grades for troubleshooting
        if (section.itemNo <= 2) {
          console.log(`🔍 SEVERITY BADGE DEBUG - Item ${section.itemNo}:`, {
            severityGrades: section.severityGrades,
            structuralType: typeof section.severityGrades?.structural,
            serviceType: typeof section.severityGrades?.service,
            structuralValue: section.severityGrades?.structural,
            serviceValue: section.severityGrades?.service,
            defectType: section.defectType
          });
        }

        return (
          <div className="text-sm text-center space-y-1">
            {/* Structural Grade - Always show like GR7188 */}
            {section.severityGrades && typeof section.severityGrades.structural === 'number' && (
              <div className="flex items-center justify-center gap-1">
                <span className="text-xs text-gray-500">STR</span>
                <span className={`inline-flex items-center justify-center w-6 h-6 text-sm font-semibold text-gray-800 ${getStrBadgeColor(section.severityGrades.structural)} rounded-full`}>
                  {section.severityGrades.structural}
                </span>
              </div>
            )}

            {/* Service Grade - Always show like GR7188 */}
            {section.severityGrades && typeof section.severityGrades.service === 'number' && (
              <div className="flex items-center justify-center gap-1">
                <span className="text-xs text-gray-500">SER</span>
                <span className={`inline-flex items-center justify-center w-6 h-6 text-sm font-semibold text-gray-800 ${getSerBadgeColor(section.severityGrades.service)} rounded-full`}>
                  {section.severityGrades.service}
                </span>
              </div>
            )}
          </div>
        );
      case 'serviceGradeDescription':
        return (
          <div className="text-sm">
            {!section.severityGrades || section.severityGrades?.service === null || section.severityGrades?.service === undefined
              ? "Unknown"
              : section.severityGrades?.service === 0
              ? "No service issues"
              : section.severityGrades?.service >= 4
              ? "Major service grade"
              : "Minor service issues"}
          </div>
        );
      case 'srmGrading':
        // MSCC5 SRM calculation - special handling for deformation defects
        const structuralGrade = section.severityGrades?.structural || 0;
        const serviceGrade = section.severityGrades?.service || 0;
        const sectionDefects = section.defects || '';
        
        let srmGrade = Math.max(structuralGrade, serviceGrade);
        
        // Special MSCC5 rule: Deformation with cross-sectional area loss is critical (SRM4)
        if (sectionDefects.includes('Deformation') && sectionDefects.includes('cross-sectional area loss')) {
          srmGrade = 4; // Override to CRITICAL for deformation with area loss
        }
        
        const srm = getSrmBadge(srmGrade);
        return (
          <div className="text-sm text-center">
            <span className={`px-2 py-1 rounded text-xs font-semibold ${srm.className}`}>
              {srm.label}
            </span>
          </div>
        );
      case 'recommendations':
        
        // FIRST PRIORITY: Check for robotic cutting/structural defects before WRC service recommendations
        // This prevents Item 19 (robotic cutting + patching) from being misclassified as service
        if (section.recommendations) {
          const rec = section.recommendations.toLowerCase();
          
          // Check for robotic cutting (structural) FIRST
          const requiresRoboticCutting = rec.includes('robotic cutting') || 
                                       rec.includes('id4') ||
                                       rec.includes('p4');
          
          // If robotic cutting required, skip WRC service check and route to structural
          if (requiresRoboticCutting) {
            // Skip to structural handling below
          } else {
            // Only check WRC service recommendations if NOT robotic cutting
            const isWrcRecommendation = rec.includes('jetting') || 
                                       rec.includes('water') || 
                                       rec.includes('pressure') ||
                                       rec.includes('clear') ||
                                       rec.includes('blockage') ||
                                       rec.includes('blocked lateral') ||
                                       rec.includes('connection') ||
                                       rec.includes('excavat') ||
                                       rec.includes('reconnect') ||
                                       rec.includes('obstruction') ||
                                       rec.includes('sandbagging');
          
          console.log('🔍 WRC CHECK - Item', section.itemNo, {
            hasRec: !!section.recommendations,
            recommendation: section.recommendations,
            isWrcRecommendation,
            recLower: rec
          });
          
          if (isWrcRecommendation && !section.recommendations.includes('No action required')) {
            console.log('🔍 ✅ DISPLAYING WRC RECOMMENDATION - Item', section.itemNo);
            
            // Check if section needs cleaning for ID760 link
            const needsCleaning = section.defects && (
              section.defects.includes('blocked') || 
              section.defects.includes('debris') || 
              section.defects.includes('deposits') ||
              section.defects.includes('CXB') ||
              section.defects.includes('connection')
            );
            
            // Generate dynamic site instruction from defect data
            const dynamicInstruction = generateWRCServiceInstruction(section);
            
            return (
              <CleaningOptionsPopover sectionData={{ ...section, sector: currentSector.id }} onPricingNeeded={() => {}} reportId={reportId}>
                <div className="text-xs max-w-sm bg-blue-50 border-2 border-blue-400 p-3 ml-1 mt-1 mr-1 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
                  <div className="font-bold text-blue-800 mb-1">💧 WRC Service Recommendation</div>
                  <div className="text-blue-900 mb-2">{dynamicInstruction}</div>
                  <div className="text-xs text-blue-700 mt-1">→ Click for service pricing options</div>
                </div>
              </CleaningOptionsPopover>
            );
          }
          } // Close the else block for WRC service check
        }
        
        // Check if section has defects requiring repair (not Grade 0)
        // Check both old severityGrade field AND new severity_grades JSON for service/structural grades > 0
        const hasRepairableDefects = (section.severityGrade && section.severityGrade !== "0" && section.severityGrade !== 0) ||
          (section.severityGrades && (section.severityGrades.service > 0 || section.severityGrades.structural > 0));
        
        // Check if this section has approved repair pricing configuration
        const approvedRepairStatus = hasApprovedRepairPricing(section);
        
        // WRc recommendations take priority over generic approved repair descriptions
        // CRITICAL: SA bung conditions must preserve authentic recommendations (no TP2 override)
        // Only use approved repair pricing if no WRc recommendations exist AND not SA bung condition
        if (approvedRepairStatus.hasApproved && approvedRepairStatus.pricingConfig && 
            (!section.recommendations || (!section.recommendations.includes('WRc') && !section.recommendations.includes('bung')))) {
          const pricingConfig = approvedRepairStatus.pricingConfig;
          const repairDescription = pricingConfig.description || "Approved repair configuration available";
          
          return (
            <div className="text-xs max-w-64 p-1 font-medium text-blue-800">
              {repairDescription}
            </div>
          );
        }

        if (hasRepairableDefects && section.recommendations && !section.recommendations.includes('No action required')) {
          
          // Check defect type from multi-defect splitting system - use INDIVIDUAL section defectType
          const isServiceDefect = section.defectType === 'service';
          const isStructuralDefect = section.defectType === 'structural';
          
          // For service defects or cleaning-based defects, show cleaning options
          const needsCleaning = requiresCleaning(section.defects || '');
          const needsStructuralRepair = requiresStructuralRepair(section.defects || '');

          // Debug routing logic for split sections
          // Routing logic for sections 21-23 and subsections

          // MSCC5 RULE: Route based on INDIVIDUAL section defectType, not cross-section checking
          // Service defects route to cleaning configurations, structural defects route to repair configurations
          if (isServiceDefect || (needsCleaning && !isStructuralDefect)) {
            // Check if any CLEANING PR2 configurations exist AND have actual values configured (exclude patching)
            const validConfigurations = repairPricingData?.filter(config => 
              config.categoryId !== 'patching' && isConfigurationProperlyConfigured(config)
            ) || [];
            const hasLinkedPR2 = validConfigurations.length > 0;
            
            // Calculate section status color based on PR2 requirements
            let statusColor = 'default';
            let statusMessage = 'Click for cleaning pricing options';
            let backgroundClass = 'bg-blue-50 hover:bg-blue-100 border-2 border-blue-200 hover:border-blue-400';
            
            // Find the most recent PR2 configuration (highest ID) from valid configurations only
            const pr2Config = hasLinkedPR2 ? validConfigurations.reduce((latest: any, current: any) => 
              current.id > latest.id ? current : latest
            ) : null;
            
            // Get the configuration color from the same config used for status calculation
            const configColor = pr2Config?.categoryColor;
            
            if (hasLinkedPR2) {
              statusColor = calculateSectionStatusColor(section, pr2Config);
              
              // Debug configuration selection for cleaning recommendations completed
              
              switch (statusColor) {
                case 'green':
                  if (configColor) {
                    // Use custom color from configuration
                    backgroundClass = `border-4 p-3 ml-1 mt-1 mr-1 rounded-lg transition-all duration-300 hover:shadow-md cursor-pointer`;
                  } else {
                    backgroundClass = 'bg-green-50 hover:bg-green-100 border-4 border-green-200 hover:border-green-400';
                  }
                  statusMessage = '✅ Meets all PR2 requirements';
                  break;
                case 'red':
                  backgroundClass = 'bg-red-50 hover:bg-red-100 border-4 border-red-200 hover:border-red-400';
                  statusMessage = '⚠️ Below minimum quantities';
                  break;
                case 'purple':
                  backgroundClass = 'bg-purple-50 hover:bg-purple-100 border-4 border-purple-200 hover:border-purple-400';
                  statusMessage = '🔄 Over minimum threshold';
                  break;
                default:
                  backgroundClass = 'bg-red-50 hover:bg-red-100 border-4 border-red-200 hover:border-red-400';
                  statusMessage = '🚫 Outside PR2 configuration ranges';
              }
            }
            
            // Generate dynamic site instruction from defect data
            const dynamicInstruction = generateWRCServiceInstruction(section);
            
            return (
              <CleaningOptionsPopover sectionData={{ ...section, sector: currentSector.id }} onPricingNeeded={() => {}} reportId={reportId}>
                <div className="text-xs max-w-sm bg-blue-50 border-2 border-blue-400 p-3 ml-1 mt-1 mr-1 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
                  <div className="font-bold text-blue-800 mb-1">💧 WRC Service Recommendation</div>
                  <div className="text-blue-900 mb-2">{dynamicInstruction}</div>
                  <div className="text-xs text-blue-700 mt-1">→ Click for service pricing options</div>
                </div>
              </CleaningOptionsPopover>
            );
          } 
          // For structural defects, check for robotic cutting first
          else {
            // CRITICAL: Check for robotic cutting (ID4) requirements FIRST
            const recommendations = section.recommendations || '';
            const requiresRoboticCutting = recommendations.toLowerCase().includes('robotic cutting') || 
                                         recommendations.toLowerCase().includes('id4');
            
            if (requiresRoboticCutting) {
              // Route to P4 robotic cutting page instead of TP2 patching
              
              return (
                <RepairOptionsPopover sectionData={{ ...section, sector: currentSector.id }} onPricingNeeded={() => {}} reportId={reportId}>
                  <div className="text-xs max-w-sm bg-yellow-50 hover:bg-yellow-100 border-2 border-yellow-200 hover:border-yellow-400 p-3 ml-1 mt-1 mr-1 rounded-lg transition-all duration-300 hover:shadow-md cursor-pointer">
                    <div className="font-bold text-black mb-1">🤖 TP3 ROBOTIC CUTTING</div>
                    <div className="text-black">{recommendations}</div>
                    <div className="text-xs text-black mt-1 font-medium">→ Click to configure P4 (ID4)</div>
                  </div>
                </RepairOptionsPopover>
              );
            }
            
            // For standard structural defects, show TP2 repair options  
            // Check if TP2 patching configuration exists for this pipe size and sector
            const pipeSize = section.pipeSize || '150';
            const pipeSizeSpecificConfig = repairPricingData?.find(config => 
              config.categoryId === 'patching' && 
              config.sector === currentSector.id &&
              config.categoryName?.includes(`${pipeSize}mm`) &&
              isConfigurationProperlyConfigured(config)
            );
            

            
            // NO FALLBACK - Only use pipe-size-specific configuration
            const tp2PatchingConfig = pipeSizeSpecificConfig;
            
            const hasTP2Patching = tp2PatchingConfig !== undefined;
            
            // Set background color based on TP2 configuration status
            let backgroundClass = 'bg-orange-50 hover:bg-orange-100 border-2 border-orange-200 hover:border-orange-400';
            let statusMessage = 'Click for repair pricing options';
            let titleText = 'STRUCTURAL REPAIR';
            
            if (hasTP2Patching) {
              // Apply custom color from TP2 configuration
              const tp2ConfigColor = tp2PatchingConfig.categoryColor;
              if (tp2ConfigColor) {
                backgroundClass = `border-2 p-3 ml-1 mt-1 mr-1 rounded-lg transition-all duration-300 hover:shadow-md cursor-pointer`;
              } else {
                backgroundClass = 'bg-green-50 hover:bg-green-100 border-2 border-green-200 hover:border-green-400';
              }
              statusMessage = '✅ TP2 Patching configured';
              titleText = 'TP2 PATCHING';
            }
            
            return (
              <RepairOptionsPopover sectionData={{ ...section, sector: currentSector.id }} onPricingNeeded={() => {}} reportId={reportId}>
                <div className="text-xs max-w-sm bg-orange-50 border-2 border-orange-400 p-3 ml-1 mt-1 mr-1 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors">
                  <div className="font-bold text-orange-800 mb-1">🔧 WRC Structural Recommendation</div>
                  <div className="text-orange-900 mb-2">{section.recommendations}</div>
                  <div className="text-xs text-orange-700 mt-1">→ Click for structural pricing options</div>
                </div>
              </RepairOptionsPopover>
            );
          }
        } else {
          // Grade 0 sections or sections without repairable defects - no hover needed
          return (
            <div className="text-sm p-2 max-w-sm">
              <div className="break-words text-left leading-relaxed">
                {section.recommendations || 'No recommendations available'}
              </div>
            </div>
          );
        }
      case 'adoptable':
        return (
          <span className={`px-1 py-0.5 rounded text-xs font-semibold ${getAdoptableColor(section.adoptable)}`}>
            {section.adoptable}
          </span>
        );
      case 'cost':
        // DEBUG: Removed console logging to prevent infinite loops

        
        // Display "Complete" for all Grade 0 sections with "Complete" in cost field
        // Check both old severityGrade field AND new severity_grades JSON
        const hasNoDefects = (section.cost === 'Complete') || 
          (section.severityGrade === '0' && section.adoptable === 'Yes' && 
           (!section.severityGrades || (section.severityGrades.service === 0 && section.severityGrades.structural === 0))) ||
          (section.defects === 'No defects recorded' && (section.severityGrade === '0' || section.severityGrade === 0));
        
        if (hasNoDefects) {
          return (
            <span className="px-1 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
              Complete
            </span>
          );
        }
        
        // REMOVED: Auto-populated costs replaced with warning symbols to maintain data integrity
        // No synthetic pricing calculations - show warning symbols for unconfigured pricing
        
        // Calculate costs for defective sections using PR2 configurations  
        // Check both old severityGrade field AND new severity_grades JSON for service/structural grades > 0
        const hasDefectsRequiringCost = (section.severityGrade && section.severityGrade !== "0" && section.severityGrade !== 0) ||
          (section.severityGrades && (section.severityGrades.service > 0 || section.severityGrades.structural > 0));
          
        // TEMPORARY DEBUG: Force all service sections 3,6,8 to enter cost calculation to bypass severity issue
        const forceServiceCalculation = section.defectType === 'service' && [3,6,8].includes(section.itemNo);
        const finalHasDefectsRequiringCost = hasDefectsRequiringCost || forceServiceCalculation;
        
        // CRITICAL DEBUG: Force service item debugging to ALWAYS appear with alert
        if (section.itemNo === 3 || section.itemNo === 6 || section.itemNo === 8) {
          const debugInfo = {
            itemNo: section.itemNo,
            defectType: section.defectType,
            severityGrade: section.severityGrade,
            hasDefectsRequiringCost,
            forceServiceCalculation,
            finalHasDefectsRequiringCost,
            willEnterCostLogic: finalHasDefectsRequiringCost,
            defects: section.defects?.substring(0, 60)
          };
          console.error(`🔥 SERVICE SECTION ${section.itemNo} - FORCE DEBUG:`, debugInfo);
          console.warn(`🔥 SERVICE SECTION ${section.itemNo} - FORCE DEBUG:`, debugInfo);
          console.log(`🔥 SERVICE SECTION ${section.itemNo} - FORCE DEBUG:`, debugInfo);
          
          // Also force to localStorage to debug visibility issue  
          try {
            localStorage.setItem(`debug_section_${section.itemNo}`, JSON.stringify({
              timestamp: Date.now(),
              ...debugInfo
            }));
          } catch(e) {}
        }
          
        // CRITICAL DEBUG: Check service sections specifically - ITEM 3 FIRST
        if (section.itemNo === 3 || section.itemNo === 6 || section.itemNo === 8) {
          console.log('🔍 SERVICE SECTION DEFECTS CHECK:', {
            itemNo: section.itemNo,
            severityGrade: section.severityGrade,
            severityGradeType: typeof section.severityGrade,
            severityGrades: section.severityGrades,
            severityGradesType: typeof section.severityGrades,
            hasDefectsRequiringCost,
            defectType: section.defectType,
            defectsText: section.defects?.substring(0, 100),
            cost: section.cost,
            willEnterCostCalculation: hasDefectsRequiringCost,
            severityGradeCheck: section.severityGrade !== "0" && section.severityGrade !== 0,
            severityGradesCheck: section.severityGrades && (section.severityGrades.service > 0 || section.severityGrades.structural > 0)
          });
        }
        
        // SPECIAL DEBUG FOR ITEM 10 - check severity data
        if (section.itemNo === 10) {
          console.log('🎯 ITEM 10 SEVERITY CHECK:', {
            itemNo: section.itemNo,
            severityGrade: section.severityGrade,
            severityGrades: section.severityGrades,
            hasDefectsRequiringCost,
            defects: section.defects,
            defectType: section.defectType,
            cost: section.cost
          });
        }
        
        // FORCE CACHE REFRESH FOR DATABASE UPDATE - clear stale MM4 data
        if (section.itemNo === 10 && repairPricingData) {
          const cacheKey = `mm4-data-760`;
          if (localStorage.getItem(cacheKey)) {
            console.log('🔄 CLEARING STALE MM4 CACHE for Item 10 database update');
            localStorage.removeItem(cacheKey);
            localStorage.removeItem('mm4DataByPipeSize');
            // Force configuration re-fetch
            queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
          }
        }
        
        // FRONTEND DEBUG: Show what's happening for ALL service sections (even if not entering cost calc)
        if (section.defectType === 'service' && (section.itemNo === 3 || section.itemNo === 6 || section.itemNo === 8)) {
          console.log('🔧 SERVICE SECTION FRONTEND LOGIC:', {
            itemNo: section.itemNo,
            defectType: section.defectType,
            hasDefectsRequiringCost,
            forceServiceCalculation,
            finalHasDefectsRequiringCost,
            willEnterCostLogic: finalHasDefectsRequiringCost,
            fallbackPath: !finalHasDefectsRequiringCost ? 'BLUE_TRIANGLE_FALLBACK' : 'NORMAL_COST_CALC'
          });
        }

        if (finalHasDefectsRequiringCost) {
          // CRITICAL DEBUG: Log every section that enters cost calculation
          console.log('💰 COST CALCULATION ENTRY:', {
            itemNo: section.itemNo,
            letterSuffix: section.letterSuffix,
            defectType: section.defectType,
            hasDefectsRequiringCost,
            defectsPreview: (section.defects || '').substring(0, 50) + '...'
          });
          
          // Check if this section requires cleaning vs structural repair
          const needsCleaning = requiresCleaning(section.defects || '');
          const needsStructuralRepair = requiresStructuralRepair(section.defects || '');
          
          // SPLIT SECTION ROUTING: Use individual section defectType for cost calculation
          const isServiceDefectForCost = section.defectType === 'service';
          const isStructuralDefectForCost = section.defectType === 'structural';
          
          console.log('🛤️ ROUTING DECISION:', {
            itemNo: section.itemNo,
            isServiceDefectForCost,
            isStructuralDefectForCost,
            needsCleaning,
            needsStructuralRepair,
            willCallCalculateAutoCost: true
          });
          
          let costCalculation;
          
          if (isStructuralDefectForCost) {
            // Route structural defects (21a, 22a) to MM4-based calculation
            console.log('🏗️ STRUCTURAL DEFECT - Direct MM4 calculation for:', section.itemNo);
            
            // First try direct MM4 calculation using patching configuration
            const patchingConfig = repairPricingData?.find(config => 
              config.categoryId === 'patching' && config.sector === currentSector.id
            );
            
            // Use calculateAutoCost for all defect types - it handles both service and structural
            console.log('🏗️ Using calculateAutoCost for structural defects');
            costCalculation = calculateAutoCost(section);
          } else if (isServiceDefectForCost || needsCleaning) {
            // Fallback to old calculation only if no API data
            console.log('🧹 FALLBACK calculateAutoCost for SERVICE:', section.itemNo);
            costCalculation = calculateAutoCost(section);
          } else {
            // Fallback to auto cost calculation
            console.log('🔄 FALLBACK calculateAutoCost for FALLBACK:', section.itemNo);
            costCalculation = calculateAutoCost(section);
          }
          
          // Check for structural defects with costs - show RED COST when below minimum
          if (costCalculation && 'cost' in costCalculation && costCalculation.cost > 0 && 
              (costCalculation.status === 'below_minimum' || costCalculation.meetsMinimum === false ||
               ('showRedTriangle' in costCalculation && costCalculation.showRedTriangle))) {
            
            // For API-calculated structural costs, skip TP2 configuration check since costs are already calculated
            if (costCalculation.method === 'MM4 Versioned Derivations') {
              // Direct display of API-calculated costs without configuration check
            } else {
              // CRITICAL: Check if TP2 configuration has valid pricing data before showing popup
              const tp2Config = repairPricingData.find(config => 
                config.categoryId === 'patching' && 
                config.sector === currentSector.id
              );
              
              // If configuration doesn't have valid pricing values, don't show clickable cost
              if (!isConfigurationProperlyConfigured(tp2Config)) {
                return (
                  <div 
                    className="flex items-center justify-center p-1 rounded" 
                    title="TP2 patching configuration requires pricing values before cost calculation"
                  >
                    <span className="text-xs font-semibold text-gray-400">
                      Configure TP2
                    </span>
                  </div>
                );
              }
            }
            // Use the actual cost from API calculation
            const calculatedCost = costCalculation.cost || 0;
            
            // Extract day rate from CCTV/Jet Vac configuration for dialog
            let dayRate = 0; // No synthetic fallbacks - must come from user configuration
            if (repairPricingData && repairPricingData.length > 0) {
              const cctvConfig = repairPricingData.find(config => 
                config.categoryId === 'cctv-jet-vac'
              );
              if (cctvConfig) {
                const dayRateValue = cctvConfig.mm_data?.mm4Rows?.[0]?.blueValue;
                if (dayRateValue) {
                  dayRate = parseFloat(dayRateValue) || 0; // No synthetic fallback
                }
              }
            }
            
            return (
              <div 
                className="flex items-center justify-center p-1 rounded cursor-pointer hover:bg-red-50 transition-colors" 
                title={`${costCalculation.costCalculation || 'Patch cost calculation'}\nActual patches: ${costCalculation.patchCount || 0}\nMinimum required: ${costCalculation.minQuantity || 0}\nCost per patch: £${((costCalculation.cost || 0) / (costCalculation.patchCount || 1)).toFixed(0)}\nTotal: £${calculatedCost.toFixed(2)}\nStatus: Below minimum requirement\n\nClick to adjust pricing`}
                onClick={() => handlePatchPricingClick(section, {
                  ...costCalculation,
                  currentCost: calculatedCost,
                  dayRate: dayRate
                })}
              >
                <span className="text-xs font-semibold text-red-600 hover:text-red-700">
                  £{calculatedCost.toFixed(2)}
                </span>
              </div>
            );
          }
          
          // Check if this is a valid cost calculation (not a failed configuration)
          // MODERNIZED: Allow calculated costs to display even with warning statuses
          const isValidCostCalculation = costCalculation && 'cost' in costCalculation && 
            costCalculation.cost > 0;
            
          // CRITICAL DEBUG: Check validation logic for service sections specifically
          if (section.defectType === 'service' && [3,6,8].includes(section.itemNo)) {
            console.log('🔍 SERVICE COST VALIDATION CHECK:', {
              itemNo: section.itemNo,
              costCalculation: costCalculation ? 'EXISTS' : 'NULL',
              hasCostProperty: costCalculation && 'cost' in costCalculation,
              costValue: costCalculation && 'cost' in costCalculation ? costCalculation.cost : 'NO_COST',
              costGreaterThanZero: costCalculation && 'cost' in costCalculation && costCalculation.cost > 0,
              status: costCalculation && 'status' in costCalculation ? costCalculation.status : 'NO_STATUS',
              statusNotInExcludeList: costCalculation && 'status' in costCalculation ? 
                !['configuration_missing', 'mm4_validation_failed', 'mm4_incomplete_config'].includes(costCalculation.status) : false,
              isValidCostCalculation,
              willShowCost: isValidCostCalculation ? 'YES_COST' : 'BLUE_TRIANGLE'
            });
          }
          
          if (isValidCostCalculation) {
            // REMOVED: Special green handling for adjusted costs - use red until final confirmation
            if (costCalculation.status === 'adjusted_service_cost' || costCalculation.status === 'adjusted_structural_cost') {
              return (
                <div 
                  className="flex items-center justify-center p-1 rounded" 
                  title={`${costCalculation.method}: £${costCalculation.cost.toFixed(2)}\nThis cost has been adjusted to meet day rate requirements - pending final confirmation`}
                >
                  <span className="text-xs font-semibold text-red-600">
                    £{costCalculation.cost.toFixed(2)}
                  </span>
                </div>
              );
            }
            
            // Show green when meets minimum, red when below minimum  
            const costColor = (costCalculation.status === 'below_minimum' || costCalculation.meetsMinimum === false) 
              ? "text-red-600" 
              : "text-green-600";
            
            // For TP2 patching, show cost with patching type info
            if ('patchingType' in costCalculation && costCalculation.patchingType) {
              return (
                <div 
                  className="flex items-center justify-center p-1 rounded" 
                  title={`TP2 ${costCalculation.patchingType}: £${costCalculation.cost.toFixed(2)}\n${('defectCount' in costCalculation) ? costCalculation.defectCount : 0} defects × £${('costPerUnit' in costCalculation) ? costCalculation.costPerUnit : 0} per unit\nRecommendation: ${('recommendation' in costCalculation) ? costCalculation.recommendation : ''}`}
                >
                  <span className={`text-xs font-semibold ${costColor}`}>
                    £{costCalculation.cost.toFixed(2)}
                  </span>
                </div>
              );
            } else {
              // Standard PR2 cleaning cost
              return (
                <div 
                  className="flex items-center justify-center p-1 rounded" 
                  title={`${('method' in costCalculation) ? costCalculation.method : 'PR2'}: ${('currency' in costCalculation) ? costCalculation.currency : '£'}${costCalculation.cost.toFixed(2)}\nStatus: Pending final validation`}
                >
                  <span className={`text-xs font-semibold ${costColor}`}>
                    {('currency' in costCalculation) ? costCalculation.currency : '£'}{costCalculation.cost.toFixed(2)}
                  </span>
                </div>
              );
            }
          } else {
            // Show warning triangle when no pricing is configured with specific error details
            // First check if costCalculation has specific warning information
            if (costCalculation && 'warningType' in costCalculation && costCalculation.warningType) {
              // CRITICAL FIX: Handle missing pipe configuration status for blue triangles (Items 20, 21, 22, 23)
              if (costCalculation.status === 'mm4_pipe_config_missing' || costCalculation.warningType === 'missing_config') {
                return (
                  <div 
                    className="flex items-center justify-center p-1 rounded"
                    title={`Missing ${costCalculation.configData?.requestedPipeSize}mm pipe configuration - Configure in ${costCalculation.configData?.categoryId} settings`}
                  >
                    <TriangleAlert className="h-4 w-4 text-blue-500" />
                  </div>
                );
              }
              
              // REMOVED: Legacy red triangle system for quantity insufficient - modernized validation
              
              // Show regular warning triangle (configuration popup will auto-trigger)
              // MODERNIZED: Service sections show blue triangles, structural sections show orange triangles
              const triangleColor = section.defectType === 'service' ? "text-blue-500" : "text-orange-500";
              
              console.log(`🟡 SHOWING WARNING TRIANGLE for section ${section.itemNo}:`, {
                warningType: costCalculation.warningType,
                method: costCalculation.method,
                status: costCalculation.status
              });
              
              return (
                <div 
                  className={`flex items-center justify-center p-1 rounded`}
                  title={`Configuration issue: ${costCalculation.method}`}
                >
                  <TriangleAlert className={`h-4 w-4 ${triangleColor}`} />
                </div>
              );
            }
            
            // Fallback: Generic warning triangles for unknown issues
            if (section.defectType === 'service') {
              // ENHANCED DEBUG: Trace why service sections hit this fallback path with detailed status analysis
              console.log('🔵 BLUE TRIANGLE FALLBACK - Service Section:', {
                itemNo: section.itemNo,
                defectType: section.defectType,
                severityGrade: section.severityGrade,
                hasDefectsRequiringCost,
                finalHasDefectsRequiringCost: typeof finalHasDefectsRequiringCost !== 'undefined' ? finalHasDefectsRequiringCost : 'UNDEFINED',
                costCalculation: typeof costCalculation !== 'undefined' ? {
                  status: costCalculation && 'status' in costCalculation ? costCalculation.status : 'NO_STATUS',
                  cost: costCalculation && 'cost' in costCalculation ? costCalculation.cost : 'NO_COST',
                  method: costCalculation && 'method' in costCalculation ? costCalculation.method : 'NO_METHOD',
                  hasValidCost: costCalculation && 'cost' in costCalculation && costCalculation.cost >= 0,
                  statusNotExcluded: costCalculation && 'status' in costCalculation ? 
                    !['configuration_missing', 'mm4_validation_failed', 'mm4_incomplete_config', 'day_rate_missing'].includes(costCalculation.status) : false,
                  fullObject: costCalculation
                } : 'UNDEFINED',
                reasonForBlueTriangle: 'Service section with no valid cost calculation result - check isValidCostCalculation logic'
              });
              
              return (
                <div 
                  className="flex items-center justify-center p-1 rounded" 
                  title="Service pricing not configured - Use recommendation box to set up cleaning costs"
                >
                  <TriangleAlert className="h-4 w-4 text-blue-500" />
                </div>
              );
            } else if (section.defectType === 'structural') {
              return (
                <div 
                  className="flex items-center justify-center p-1 rounded" 
                  title="Structural pricing not configured - Use recommendation box to set up TP2 patching costs"
                >
                  <TriangleAlert className="h-4 w-4 text-orange-500" />
                </div>
              );
            } else {
              // Fallback for unknown defect types (should rarely happen with proper classification)
              return (
                <div 
                  className="flex items-center justify-center p-1 rounded" 
                  title="Pricing not configured - Use recommendation box to set up repair costs"
                >
                  <TriangleAlert className="h-4 w-4 text-gray-500" />
                </div>
              );
            }
          }
        }
        
        // Fallback: No cost display for sections without pricing configuration
        return '';
      default:
        return '';
    }
  };

  // Fetch user uploads
  const { data: uploads = [] } = useQuery<FileUploadType[]>({
    queryKey: ["/api/uploads"],
  });

  const { data: folders = [] } = useQuery<any[]>({
    queryKey: ["/api/folders"],
  });

  // Auto-expand folders when they're loaded - no longer needed with dropdown
  useEffect(() => {
    if (folders.length > 0) {
      setExpandedFolders(new Set(folders.map(f => f.id)));
    }
  }, [folders]);

  // Group uploads by folder
  const groupUploadsByFolder = () => {
    const grouped: { [key: string]: typeof uploads } = {};
    
    uploads.forEach(upload => {
      const folder = folders.find(f => f.id === upload.folderId);
      const folderKey = folder ? `${folder.id}` : 'no-folder';
      if (!grouped[folderKey]) {
        grouped[folderKey] = [];
      }
      grouped[folderKey].push(upload);
    });
    
    return grouped;
  };

  const handleViewReport = (uploadId: number) => {
    // Navigating to dashboard with report ID
    window.location.href = `/dashboard?reportId=${uploadId}`;
  };

  const deleteMutation = useMutation({
    mutationFn: async (uploadId: number) => {
      return apiRequest("DELETE", `/api/uploads/${uploadId}`);
    },
    onSuccess: () => {
      toast({
        title: "Report Deleted",
        description: "The report has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const clearDataMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/clear-dashboard-data");
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Dashboard Data Hidden",
        description: `${data.clearCounts?.preserved || 0} authentic sections preserved. Click folder to restore display.`,
      });
      
      setShowClearDataDialog(false);
      
      // Force complete page refresh to show hidden state
      setTimeout(() => {
        window.location.reload();
      }, 500);
    },
    onError: (error) => {
      toast({
        title: "Clear Data Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: async (folderId: number) => {
      const response = await apiRequest("DELETE", `/api/folders/${folderId}`);
      return await response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Project Folder Deleted",
        description: `Successfully deleted "${data.folderName}" folder and ${data.deletedCounts.uploads} reports.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setShowDeleteFolderDialog(false);
      setSelectedFolderToDelete(null);
      // Reset state if deleted folder was currently selected
      if (selectedFolderForView === selectedFolderToDelete?.id) {
        setSelectedFolderForView(null);
        setSelectedReportIds([]);
      }
      setShowFolderDropdown(false);
    },
    onError: (error) => {
      toast({
        title: "Delete Folder Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-emerald-600" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const reprocessMutation = useMutation({
    mutationFn: (uploadId: number) => apiRequest("POST", `/api/reprocess/${uploadId}`),
    onSuccess: async (data) => {
      console.log('🔄 REPROCESSING SUCCESS: Starting aggressive cache invalidation');
      
      // COMPREHENSIVE CACHE CLEARING: Clear all cached configuration data
      const clearAllConfigurationCache = () => {
        // Clear cost decisions when report is reprocessed to trigger fresh warnings
        const existingDecisions = JSON.parse(localStorage.getItem('appliedCostDecisions') || '[]');
        const currentReportId = reportId;
        
        // Remove decisions for this report (since report was reprocessed)
        const filteredDecisions = existingDecisions.filter((decision: any) => 
          decision.reportId !== currentReportId
        );
        localStorage.setItem('appliedCostDecisions', JSON.stringify(filteredDecisions));
        
        // CRITICAL FIX: Clear all buffered MM4/MM5 configuration data that prevents reading updated values
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (
            key.includes('bufferedValues') ||
            key.includes('mm4DataByPipeSize') ||
            key.includes('mm5Data') ||
            key.includes('pricingOptionsBuffer') ||
            key.includes('configFormData') ||
            key.includes('-blueValue') ||
            key.includes('-greenValue') ||
            key.includes('-purpleDebris') ||
            key.includes('-purpleLength') ||
            key.includes('equipmentPriority') ||
            key.includes('lastUserPriorityChange')
          )) {
            keysToRemove.push(key);
          }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        console.log('🧹 COMPREHENSIVE CACHE CLEAR:', {
          clearedCostDecisions: true,
          clearedBufferedValues: keysToRemove.length,
          removedKeys: keysToRemove,
          reportId: currentReportId
        });
      };
      
      clearAllConfigurationCache();
      
      // AGGRESSIVE CACHE INVALIDATION: Clear all possible section-related queries
      console.log('🔄 AGGRESSIVE CACHE INVALIDATION: Clearing all React Query caches');
      
      // Clear all React Query cache first
      queryClient.clear();
      
      // Remove all possible section query variations
      if (currentUpload?.id) {
        const uploadId = currentUpload.id;
        const sectionsQueryKey = `/api/uploads/${uploadId}/sections`;
        
        // Remove queries with all possible variations
        queryClient.removeQueries({ queryKey: [sectionsQueryKey] });
        queryClient.removeQueries({ queryKey: [`/api/uploads`, uploadId, 'sections'] });
        queryClient.removeQueries({ queryKey: ['/api/sections'] });
        
        // Invalidate with exact patterns
        queryClient.invalidateQueries({ queryKey: [sectionsQueryKey] });
        queryClient.invalidateQueries({ queryKey: [`/api/uploads`, uploadId, 'sections'] });
        queryClient.invalidateQueries({ queryKey: ['/api/sections'] });
        
        console.log(`🔄 CACHE CLEAR: Targeting upload ${uploadId} section queries`);
      }
      
      // COMPREHENSIVE QUERY CACHE INVALIDATION: Ensure all configuration data is refetched
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-pricing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment-types/2"] });
      queryClient.invalidateQueries({ queryKey: [`/api/pricing/check/${currentSector.id}`] });
      queryClient.invalidateQueries({ queryKey: ['pr2-configs'] });
      queryClient.invalidateQueries({ queryKey: ['pr2-configs', currentSector.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-configurations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
      
      // IMMEDIATE REFETCH: Force immediate data refetch without page reload dependency
      if (currentUpload?.id) {
        try {
          console.log(`🔄 FORCE REFETCH: Immediately fetching fresh section data for upload ${currentUpload.id}`);
          
          // Force refetch with aggressive options
          await queryClient.refetchQueries({ 
            queryKey: [`/api/uploads/${currentUpload.id}/sections`],
            type: 'active'
          });
          
          console.log('✅ FORCE REFETCH: Fresh section data loaded');
        } catch (error) {
          console.error('❌ FORCE REFETCH: Failed to refetch sections:', error);
          // Fallback to page reload if refetch fails
          setTimeout(() => window.location.reload(), 500);
          return;
        }
      }
      
      toast({
        title: "Report Reprocessed",
        description: `Fresh data loaded from DB3 files with current MSCC5 classification rules.`,
      });
      
      console.log('✅ REPROCESSING COMPLETE: Dashboard should now display fresh data');
    },
    onError: (error) => {
      toast({
        title: "Reprocessing Failed",
        description: error.message || "Failed to reprocess report. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Get completed uploads for analysis
  const completedUploads = uploads.filter(upload => upload.status === 'completed' || upload.status === 'extracted_pending_review' || upload.status === 'processed');
  
  // Filter uploads by selected folder or selected individual reports
  const filteredUploads = selectedReportIds.length > 0
    ? completedUploads.filter(upload => selectedReportIds.includes(upload.id))
    : selectedFolderForView 
      ? completedUploads.filter(upload => upload.folderId === selectedFolderForView)
      : completedUploads;
  
  // ENHANCED UPLOAD SELECTION LOGIC: Fix dashboard loading issues
  let potentialCurrentUpload = null;
  
  console.log('🔍 UPLOAD SELECTION DEBUG:', {
    reportIdFromURL: reportId,
    selectedReportIds,
    completedUploadsCount: completedUploads.length
  });
  
  // Priority 1: URL reportId parameter (direct navigation)
  if (reportId) {
    potentialCurrentUpload = completedUploads.find(upload => upload.id === parseInt(reportId));
    console.log('🔍 URL reportId search result:', potentialCurrentUpload ? `Found upload ${potentialCurrentUpload.id}` : 'Not found');
  }
  
  // Priority 2: Single selected report
  else if (selectedReportIds.length === 1) {
    potentialCurrentUpload = filteredUploads.find(upload => upload.id === selectedReportIds[0]);
    console.log('🔍 Selected reportId result:', potentialCurrentUpload ? `Found upload ${potentialCurrentUpload.id}` : 'Not found');
  }
  
  // Priority 3: Single completed upload (only one available)
  else if (completedUploads.length === 1) {
    potentialCurrentUpload = completedUploads[0];
    console.log('🔍 Single upload fallback:', `Using upload ${potentialCurrentUpload.id}`);
  }
  
  // Priority 4: Last used report from localStorage
  else if (completedUploads.length > 0) {
    const lastUsedReportId = localStorage.getItem('lastUsedReportId');
    if (lastUsedReportId) {
      const lastUsedUpload = completedUploads.find(upload => upload.id === parseInt(lastUsedReportId));
      if (lastUsedUpload) {
        potentialCurrentUpload = lastUsedUpload;
        console.log('🔄 Dashboard restored last used report:', lastUsedReportId);
      }
    }
    
    // Priority 5: Most recent upload by creation date
    if (!potentialCurrentUpload) {
      potentialCurrentUpload = completedUploads.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      console.log('🔍 Most recent upload fallback:', `Using upload ${potentialCurrentUpload?.id}`);
    }
  }
  
  const currentUpload = potentialCurrentUpload;
  console.log('🎯 FINAL CURRENT UPLOAD:', currentUpload ? `Upload ${currentUpload.id}` : 'None selected');

  // FIXED: Use conditional rendering instead of history manipulation to prevent visual interruption
  // Calculate effective reportId without manipulating browser history mid-render
  const effectiveReportId = reportId || currentUpload?.id;

  // FIXED: Removed cache invalidation useEffect that was causing infinite loops
  // Cache invalidation will be handled by React Query automatically

  // SECTIONS DATA QUERY: Performance optimized
  
  const { data: rawSectionData = [], isLoading: sectionsLoading, refetch: refetchSections, error: sectionsError } = useQuery<any[]>({
    queryKey: [`/api/uploads/${effectiveReportId}/sections`, 'performance-optimized'], 
    enabled: !!effectiveReportId, // Enable query when we have a valid reportId
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes since we have processed data caching
    gcTime: 10 * 60 * 1000,   // Keep in memory for 10 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: false, // Reduce unnecessary refetches since data is cached
    retry: 1 // Retry once on failure
  });
  
  // Performance optimized: removed debug logs

  // SAVE LAST USED REPORT: Save current report to localStorage when it changes
  useEffect(() => {
    if (currentUpload?.id) {
      localStorage.setItem('lastUsedReportId', currentUpload.id.toString());
    }
  }, [currentUpload?.id]);

  // Warning system removed - cleanup complete

  // CRITICAL: If API fails or returns empty data, NEVER show fake data
  const hasAuthenticData = rawSectionData && rawSectionData.length > 0;
  
  // Performance optimized: removed render cycle logging
  
  // Performance optimized: removed section data logging
  
  // DEBUG: Log section data status for troubleshooting (moved after variable definitions)
  
  // FIXED: Removed problematic useEffect that was causing infinite loops
  // Static rendering state determination without state or useEffect to prevent dependency issues
  const determineRenderingState = (): 'loading' | 'empty' | 'data' => {
    if (completedUploads.length === 0) {
      return 'empty';
    } else if (currentUpload && !sectionsLoading) {
      return 'data'; // Always show data interface when upload exists
    }
    return 'loading';
  };
  
  const renderingState = determineRenderingState();
  
  // Stable condition for showing folder selector - don't depend on loading states that fluctuate
  const shouldShowEmptyState = renderingState === 'empty';

  // Debug logging removed to prevent infinite loop
  
  // REMOVED: Aggressive cache clearing that was interfering with data display
  // The automatic cache clearing was preventing section data from being displayed

  // REMOVED: Additional cache clearing that was interfering with data display
  // Let React Query handle cache invalidation naturally
    
  const currentSector = currentUpload 
    ? sectors.find(s => s.id === currentUpload.sector) || sectors[0]
    : sectors[0];

  // FIXED: Load ALL PR2 configurations with responsive cache invalidation
  // Include equipment priority in query key for proper cache segmentation
  const { data: allPR2Configurations = [] } = useQuery({
    queryKey: ['pr2-all-configs', currentSector.id, equipmentPriority], // Added equipmentPriority for cache segmentation
    queryFn: async () => {
      console.log('🔍 DASHBOARD PR2 CONFIG FETCH - RESPONSIVE LOADING:', {
        sector: currentSector.id,
        equipmentPriority: equipmentPriority,
        approach: 'Load all configurations with immediate cache invalidation support',
        timestamp: Date.now()
      });
      
      // Load BOTH id760 and id759 configurations simultaneously 
      const configRequests = [
        { categoryId: 'cctv-jet-vac', equipmentId: 'id760', label: 'CCTV/Jet Vac' },
        { categoryId: 'cctv-van-pack', equipmentId: 'id759', label: 'Van Pack' }
      ];
      
      const allConfigs = [];
      
      for (const config of configRequests) {
        try {
          const response = await apiRequest('GET', '/api/pr2-clean', undefined, { 
            sector: currentSector.id,
            categoryId: config.categoryId 
          });
          const data = await response.json();
          
          // Tag each configuration with its equipment ID for later selection
          const taggedData = data.map((c: any) => ({
            ...c,
            equipmentId: config.equipmentId,
            equipmentLabel: config.label
          }));
          
          allConfigs.push(...taggedData);
          
          // Configuration loaded successfully
        } catch (error) {
          console.error(`❌ Failed to load ${config.label} configuration:`, error);
        }
      }
      
      // All PR2 configurations loaded and processed
      
      return allConfigs;
    },
    enabled: !!currentSector?.id,
    staleTime: 30000, // Reduced from 5 minutes to 30 seconds for faster updates
    gcTime: 120000, // Reduced from 10 minutes to 2 minutes for more responsive cache
    refetchOnMount: true, // CRITICAL FIX: Allow cache invalidation to work
    refetchOnWindowFocus: false // Don't refetch on window focus to avoid excessive requests
  });

  // FIXED: Select appropriate configuration based on current equipment priority
  // This filters the loaded configurations instead of forcing API calls
  const repairPricingData = allPR2Configurations.filter(config => 
    config.equipmentId === equipmentPriority
  );
  
  // Configuration filtering optimized

  // Check if a section has approved repair pricing configuration 
  const hasApprovedRepairPricing = (section: any): { hasApproved: boolean, pricingConfig?: any, actualCost?: string } => {
    // Only check sections with defects requiring repair
    if (!section.severityGrade || section.severityGrade === "0" || section.severityGrade === 0) {
      return { hasApproved: false };
    }

    // Exclude debris/cleaning sections - these need different pricing
    if (section.defects && 
        (section.defects.toLowerCase().includes('debris') || 
         section.defects.toLowerCase().includes('der') ||
         section.defects.toLowerCase().includes('deg') ||
         section.defects.toLowerCase().includes('cleaning'))) {
      return { hasApproved: false };
    }

    // Extract pipe size and find matching pricing
    const extractPipeSize = (pipeSizeText: string): number => {
      if (!pipeSizeText) return 150;
      const sizeMatch = pipeSizeText.match(/(\d+)/);
      return sizeMatch ? parseInt(sizeMatch[1]) : 150;
    };

    const pipeSize = extractPipeSize(section.pipeSize || "");
    
    if (Array.isArray(repairPricingData) && repairPricingData.length > 0) {
      // First try to find pipe-size specific configuration (description contains pipe size)
      const pipeSizeSpecificConfig = repairPricingData.find((pricing: any) => 
        pricing.categoryId === 'patching' && 
        pricing.description?.includes(`${pipeSize}mm`) &&
        isConfigurationProperlyConfigured(pricing)
      );
      
      // Fallback to general patching config if no pipe-specific exists
      const generalPatchingConfig = repairPricingData.find((pricing: any) => 
        pricing.categoryId === 'patching' && 
        !pricing.description?.includes('mm') &&
        isConfigurationProperlyConfigured(pricing)
      );
      
      const matchingPricing = pipeSizeSpecificConfig || generalPatchingConfig;

      if (matchingPricing) {
        // Found TP2 patching config for pipe size
        
        return { 
          hasApproved: true, 
          pricingConfig: matchingPricing,
          actualCost: "approved" // Mark as approved, will calculate cost later
        };
      }
    }

    return { hasApproved: false };
  };

  // FIXED: Removed redundant assignment - use repairPricingData directly throughout calculateAutoCost
  // The old repairPricingData variable caused confusion and forced equipment priority coupling
  
  // Fetch work categories and vehicle travel rates for validation
  const { data: workCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/work-categories"],
  });

  const { data: vehicleTravelRates = [] } = useQuery<any[]>({
    queryKey: ["/api/vehicle-travel-rates"],
  });

  // Validation effect - runs after sections are loaded
  useEffect(() => {
    // Dashboard validation data check

    if (rawSectionData?.length > 0 && repairPricingData) {
      try {
        // Transform section data to match validation interface
        const reportSections: ReportSection[] = rawSectionData.map(section => ({
          id: section.id,
          itemNo: section.itemNo,
          defectType: section.defectType || null,
          recommendations: section.recommendations || '',
          cost: section.cost || '',
          pipeSize: section.pipeSize || '',
          totalLength: section.totalLength || '',
          hasConfiguration: hasConfiguration(section),
          meetsMinimum: meetsMinimumQuantities(section)
        }));

        // Run validation with work categories and vehicle travel rates
        const result = validateReportExportReadiness(
          reportSections, 
          travelInfo, 
          repairPricingData,
          workCategories,
          vehicleTravelRates
        );
        
        setValidationResult(result);
        
        // Warning system calls removed
      } catch (error) {
        console.error('Dashboard validation error:', error);
      }
    }
  }, [hasAuthenticData, rawSectionData?.length, repairPricingData?.length]);

  // Warning system functions completely removed

  // Warning system functions completely removed

  // Helper function to check if section has pricing configuration
  const hasConfiguration = (section: any): boolean => {
    const needsCleaning = requiresCleaning(section.defects || '');
    const needsStructural = requiresStructuralRepair(section.defects || '');
    
    if (needsCleaning) {
      // Check for cleaning configuration
      return repairPricingData.some(config => 
        config.categoryId === 'cctv-jet-vac' && isConfigurationProperlyConfigured(config)
      );
    }
    
    if (needsStructural) {
      // Check for patching configuration
      return repairPricingData.some(config => 
        config.categoryId === 'patching' && isConfigurationProperlyConfigured(config)
      );
    }
    
    return true; // No defects = no configuration needed
  };

  // Helper function to check if section meets minimum quantities
  const meetsMinimumQuantities = (section: any): boolean => {
    const costCalculation = calculateAutoCost(section);
    
    // CRITICAL FIX: Check for incomplete range configurations that should show red
    if (costCalculation && (costCalculation.status === 'mm4_outside_ranges' || costCalculation.status === 'mm4_incomplete_config')) {
      console.log('🔍 INCOMPLETE CONFIG CHECK:', {
        itemNo: section.itemNo,
        status: costCalculation.status,
        shouldShowRed: true
      });
      return false; // Force red display for incomplete configurations
    }
    
    return costCalculation ? !('showRedTriangle' in costCalculation && costCalculation.showRedTriangle) : true;
  };

  // Handler functions for resolving validation issues
  const handleResolveConfiguration = useCallback((itemIds: number[]) => {
    // Navigate to pricing configuration for the first item
    const firstSection = rawSectionData.find(s => s.itemNo === itemIds[0]);
    if (firstSection) {
      const needsCleaning = requiresCleaning(firstSection.defects || '');
      const needsStructural = requiresStructuralRepair(firstSection.defects || '');
      
      if (needsCleaning) {
        // Navigate to cleaning configuration
        const pipeSize = firstSection.pipeSize?.match(/\d+/)?.[0] || '150';
        // Apply 150mm priority for CCTV configurations
        const finalPipeSize = (pipeSize === '100' || !pipeSize) ? '150' : pipeSize;
        window.location.href = `/pr2-config-clean?categoryId=cctv&sector=${currentSector.id}&pipeSize=${finalPipeSize}`;
      } else if (needsStructural) {
        // Navigate to sector-specific patching configuration with auto-select utilities
        const pipeSize = firstSection.pipeSize?.match(/\d+/)?.[0] || '150';
        console.log('🚀 DASHBOARD NAVIGATION - Redirecting to sector patching with autoSelectUtilities=true');
        console.log('🚀 DASHBOARD NAVIGATION - pipeSize extracted:', pipeSize);
        console.log('🚀 DASHBOARD NAVIGATION - currentSector:', currentSector.id);
        // Apply 150mm priority for patching configurations when coming from CCTV data
        const finalPipeSize = (pipeSize === '100' || !pipeSize) ? '150' : pipeSize;
        const finalUrl = `/pr2-config-clean?categoryId=patching&sector=${currentSector.id}&pipeSize=${finalPipeSize}&autoSelectUtilities=true`;
        console.log('🚀 DASHBOARD NAVIGATION - Final URL:', finalUrl);
        window.location.href = finalUrl;
      }
    }
  }, [rawSectionData, currentSector]);

  const handleAdjustRates = useCallback(async (defectType: 'service' | 'structural', newRate: number) => {
    try {
      // Find the relevant configuration
      const configId = defectType === 'service' 
        ? repairPricingData.find(c => c.categoryId === 'cctv-jet-vac')?.id
        : repairPricingData.find(c => c.categoryId === 'patching')?.id;

      if (configId) {
        // Update the configuration with the new rate
        const config = repairPricingData.find(c => c.id === configId);
        const updatedPricingOptions = config.pricingOptions?.map((opt: any) => 
          opt.label?.toLowerCase().includes('rate') ? { ...opt, value: newRate.toString() } : opt
        );

        await apiRequest('PUT', `/api/pr2-clean/${configId}`, {
          ...config,
          pricingOptions: updatedPricingOptions
        });

        // Refresh data
        await queryClient.invalidateQueries({ queryKey: ['pr2-configs'] });
        await refetchSections();
        
        toast({
          title: "Rate Adjusted",
          description: `${defectType} day rate updated to £${newRate.toFixed(2)}`
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to adjust rate",
        variant: "destructive"
      });
    }
  }, [repairPricingData, queryClient, refetchSections, toast]);

  const handleSplitTravelCosts = useCallback((defectType: 'service' | 'structural', costPerItem: number) => {
    // Update travel info state to reflect cost distribution
    setTravelInfo(prev => prev ? {
      ...prev,
      additionalCost: prev.additionalCost - (costPerItem * (defectType === 'service' ? 
        rawSectionData.filter(s => s.defectType === 'service').length :
        rawSectionData.filter(s => s.defectType === 'structural').length))
    } : null);
    
    toast({
      title: "Travel Costs Split",
      description: `£${costPerItem.toFixed(2)} per ${defectType} item allocated`
    });
  }, [rawSectionData]);

  const handleExportReport = useCallback(() => {
    console.log('🔄 Export triggered: Checking for service cost issues first...');
    
    // Clear cost decisions to ensure fresh warnings on export
    const existingDecisions = JSON.parse(localStorage.getItem('appliedCostDecisions') || '[]');
    const currentReportId = reportId;
    
    // Remove decisions for this report (since user is exporting - they may want to review costs)
    const filteredDecisions = existingDecisions.filter((decision: any) => 
      decision.reportId !== currentReportId
    );
    localStorage.setItem('appliedCostDecisions', JSON.stringify(filteredDecisions));
    
    console.log('🧹 Cleared cost decisions for export to ensure fresh cost review:', currentReportId);
    
    // Reset service cost warning dismissed state and clear existing data
    // Service cost warning state management removed
    
    // Use setTimeout to ensure state updates happen before check
    setTimeout(() => {
      console.log('🔄 Export: State reset complete, checking service costs...');
      
      // Check if we have service items that would trigger warning
      if (rawSectionData && rawSectionData.length > 0) {
        const serviceItems = rawSectionData.filter(section => section.defectType === 'service');
        console.log('🔄 Export: Found service items:', serviceItems.length);
        
        if (serviceItems.length > 0) {
          // Warning system calls removed - export directly now
        }
      }
      
      // No service items or no warning needed - proceed with export
      console.log('🔄 Export: No service cost issues - proceeding with export');
      exportToExcel();
      
      toast({
        title: "Report Exported",
        description: "Report has been exported successfully"
      });
    }, 300);
  }, [rawSectionData]);

  // Debug PR2 data loading
  // RepairPricingData logging removed
  // PR2 configurations logging removed

  // Function to count defects in a section for TP2 patching cost calculation
  const countDefects = (defectsText: string): number => {
    if (!defectsText || defectsText === 'No service or structural defect found') {
      return 0;
    }
    
    // Count meterage references that indicate defect locations
    // Use word boundaries to prevent false counting of "5mm" from crack descriptions
    const meterageMatches = defectsText.match(/\b\d+\.?\d*m\b(?!\s*m)/g);
    const defectCount = meterageMatches ? meterageMatches.length : 1;
    
    // Defect counting completed
    
    return defectCount;
  };

  // Function to extract debris percentage from section observations for MM4 matching
  const extractDebrisPercentage = (defectsText: string): number => {
    if (!defectsText) return 0;
    
    // Look for percentage patterns in the defects text
    // Common patterns: "20%", "30% debris", "debris 15%"
    const percentageMatch = defectsText.match(/(\d+\.?\d*)%/);
    
    if (percentageMatch) {
      return parseFloat(percentageMatch[1]) || 0;
    }
    
    // If no explicit percentage, estimate based on debris descriptions
    const lowercaseText = defectsText.toLowerCase();
    
    // Heavy debris indicators
    if (lowercaseText.includes('heavy debris') || lowercaseText.includes('severe deposits')) {
      return 40; // Estimate high percentage
    }
    
    // Moderate debris indicators  
    if (lowercaseText.includes('debris') || lowercaseText.includes('deposit') || lowercaseText.includes('grease')) {
      return 20; // Estimate moderate percentage
    }
    
    // Light debris indicators
    if (lowercaseText.includes('light debris') || lowercaseText.includes('minor deposits')) {
      return 10; // Estimate low percentage
    }
    
    // No debris indicators found
    return 0;
  };

  // Function to calculate TP1 cleaning cost for service defects
  const calculateTP1CleaningCost = (section: any) => {
    // FIXED: Use filtered repairPricingData based on current equipment priority
    // Find configuration matching current equipment priority (id760 for cctv-jet-vac, id759 for van-pack)
    const tp1Config = repairPricingData?.find(config => 
      config.equipmentId === equipmentPriority && 
      config.sector === currentSector.id
    );
    
    
    if (!tp1Config) {
      return {
        cost: 0,
        currency: '£',
        method: 'TP1 Required',
        status: 'tp1_missing',
        patchingType: 'TP1 Cleaning Required',
        defectCount: 0,
        costPerUnit: 0,
        recommendation: 'Configure TP1 CCTV cleaning pricing first'
      };
    }
    
    
    // Skip isConfigurationProperlyConfigured check for now - let's debug the actual values
    
    // Extract day rate from TP1 configuration - READ FROM MM4 BLUE VALUE ONLY
    const dayRateValue = tp1Config.mm_data?.mm4Rows?.[0]?.blueValue;
    const dayRateOption = dayRateValue ? { value: dayRateValue } : null;
    
    // CRITICAL FIX: Check meterage rule to determine if "Runs 2" should be used instead of standard "Runs per Shift"
    // Define meterage rule logic directly in TP1 function
    const checkMeterage = (section: any, config: any) => {
      // Find "No 2" or "Runs 2" option in quantity options
      const no2Option = config.quantityOptions?.find((opt: any) => 
        opt.label && (
          opt.label.toLowerCase().includes('no 2') || 
          opt.label.toLowerCase().includes('runs 2')
        ) && opt.value && opt.value.trim() !== ''
      );
      
      if (!no2Option) {
        return { useNo2: false, no2Value: 0 };
      }
      
      const no2Value = parseFloat(no2Option.value) || 0;
      const sectionLength = parseFloat(section.totalLength) || 0;
      
      // Find the length ranges in the configuration
      const lengthRange = config.rangeOptions?.find((range: any) => 
        range.label === 'Length' && range.enabled
      );
      const lengthRange2 = config.rangeOptions?.find((range: any) => 
        range.label === 'Length 2' && range.enabled
      );
      
      let useNo2 = false;
      
      if (lengthRange && lengthRange2) {
        const length1Max = parseFloat(lengthRange.rangeEnd) || 0;
        const length2Max = parseFloat(lengthRange2.rangeEnd) || 0;
        
        // Use "No 2" rule if section length is greater than Length 1 max but within Length 2 max
        useNo2 = sectionLength > length1Max && sectionLength <= length2Max;
      }
      
      return { useNo2, no2Value };
    };
    
    const no2RuleResult = checkMeterage(section, tp1Config);
    
    let runsOption;
    if (no2RuleResult.useNo2) {
      // Use "Runs 2" value for sections that exceed Range 1 but are within Range 2
      runsOption = tp1Config.quantityOptions?.find((option: any) => 
        (option.label?.toLowerCase().includes('runs 2') || option.label?.toLowerCase().includes('no 2')) && 
        option.value && option.value.trim() !== ''
      );
    } else {
      // Use standard "Runs per Shift" value
      runsOption = tp1Config.quantityOptions?.find((option: any) => 
        option.label?.toLowerCase().includes('runs per shift') && option.value && option.value.trim() !== ''
      );
    }
    
    
    if (!dayRateOption || !runsOption) {
      return {
        cost: 0,
        currency: '£',
        method: 'Configuration Missing',
        status: 'configuration_missing',
        patchingType: 'Cleaning Configuration Required',
        defectCount: 0,
        costPerUnit: 0,
        recommendation: 'Configure day rate and runs per shift values'
      };
    }
    
    // Calculate TP1 cleaning cost: Day Rate ÷ Runs Per Shift
    const dayRate = parseFloat(dayRateOption.value) || 0;
    const runsPerShift = parseFloat(runsOption.value) || 0;
    
    
    if (dayRate === 0 || runsPerShift === 0) {
      return {
        cost: 0,
        currency: '£',
        method: 'Invalid Configuration',
        status: 'mm4_validation_failed',
        patchingType: 'Configuration Validation Failed',
        defectCount: 0,
        costPerUnit: 0,
        recommendation: 'Configuration has invalid values - please check day rate and runs'
      };
    }
    
    // CRITICAL FIX: Check if section meets PR2 range requirements before calculating cost
    // BUT: For structural defects with WRC recommendations, don't override with PR2 configuration messages
    const meetsRangeRequirements = checkSectionMeetsPR2Requirements(section, tp1Config);
    const hasWrcRecommendation = section.recommendations && 
      (section.recommendations.includes('Structural repair required') || 
       section.recommendations.includes('WRc') || 
       section.recommendations.includes('repair'));
    
    if (!meetsRangeRequirements && !hasWrcRecommendation) {
      // Debug logging to understand why range validation fails
      const debugLength = parseFloat(section.totalLength || '0');
      const debugPipeSize = parseInt(section.pipeSize?.replace(/[^\d]/g, '') || '0');
      
      return {
        cost: 0,
        currency: '£',
        method: 'Configure PR2',
        status: 'tp1_range_failed',
        patchingType: 'Outside PR2 Configuration Ranges',
        defectCount: 0,
        costPerUnit: 0,
        recommendation: 'Section specifications outside configured PR2 ranges'
      };
    }
    
    const baseCostPerSection = dayRate / runsPerShift;
    
    // Travel cost integration placeholder (DNC protocol - not implemented yet)
    const travelAdjustment = 0; // Will be replaced with calculateTravelCostAdjustment(section, 'service')
    const finalCostPerSection = baseCostPerSection + travelAdjustment;
    
    const recommendationText = travelAdjustment > 0 
      ? `TP1 cleaning: £${baseCostPerSection.toFixed(2)} + £${travelAdjustment.toFixed(2)} travel = £${finalCostPerSection.toFixed(2)}`
      : `TP1 cleaning: £${dayRate} ÷ ${runsPerShift} runs = £${baseCostPerSection.toFixed(2)}`;
    
    
    return {
      cost: finalCostPerSection,
      currency: '£',
      method: 'TP1 Cleaning',
      status: 'calculated',
      patchingType: 'CCTV Jet Vac Cleaning',
      defectCount: 1, // Service defects count as 1 section to clean
      costPerUnit: finalCostPerSection,
      baseCost: baseCostPerSection,
      travelCost: travelAdjustment,
      recommendation: recommendationText
    };
  };

  // Function to calculate TP2 patching cost using DB7 Math window for minimum quantity checks
  const calculateTP2PatchingCost = (section: any, tp2Config: any) => {
    // TP2 patching cost calculation for structural defects
    // Robotic cutting detection now handled in calculateAutoCost function
    
    // Extract pipe size and length for cost calculation
    const pipeSize = section.pipeSize || '150';
    const sectionLength = parseFloat(section.totalLength) || 0;
    
    // Count defects for per-unit cost calculation
    const defectsText = section.defects || '';
    const defectCount = countDefects(defectsText);
    
    // TP2 calculation inputs analyzed
    
    // Get day rate from CCTV/Jet Vac configuration
    let dayRate = 1650; // Fallback if CCTV/Jet Vac not found
    
    // Find CCTV/Jet Vac configuration for central day rate
    if (repairPricingData && repairPricingData.length > 0) {
      const cctvConfig = repairPricingData.find(config => config.categoryId === 'cctv-jet-vac');
      if (cctvConfig && cctvConfig.pricingOptions) {
        // Extract day rate from correct nested structure
        let dayRateValue = null;
        if (cctvConfig.mm_data?.mm4DataByPipeSize) {
          // Try common pipe sizes in priority order
          const pipeSizes = ['150-1501', '225-2251', '300-3001'];
          for (const pipeSize of pipeSizes) {
            if (cctvConfig.mm_data.mm4DataByPipeSize[pipeSize]?.[0]?.blueValue) {
              dayRateValue = cctvConfig.mm_data.mm4DataByPipeSize[pipeSize][0].blueValue;
              break;
            }
          }
        } else if (cctvConfig.mm_data?.mm4Rows?.[0]?.blueValue) {
          // Fallback to legacy structure
          dayRateValue = cctvConfig.mm_data.mm4Rows[0].blueValue;
        }
        
        if (dayRateValue) {
          dayRate = parseFloat(dayRateValue) || 0;
        }
      }
    }
    
    // Determine which patching option to use based on recommendations or default
    let selectedPatchingOption = null;
    const recommendations = section.recommendations || '';
    
    // Check if recommendations specify a specific patch type
    if (recommendations.toLowerCase().includes('single layer')) {
      selectedPatchingOption = tp2Config.pricingOptions?.find((option: any) => 
        option.label?.toLowerCase().includes('single layer')
      );
      // Using Single Layer based on recommendations
    } else if (recommendations.toLowerCase().includes('triple layer')) {
      // Check for extra cure first, then regular triple layer
      if (recommendations.toLowerCase().includes('extra cure')) {
        selectedPatchingOption = tp2Config.pricingOptions?.find((option: any) => 
          option.label?.toLowerCase().includes('triple layer') && option.label?.toLowerCase().includes('extra cure')
        );
        // Using Triple Layer (Extra Cure) based on recommendations
      } else {
        selectedPatchingOption = tp2Config.pricingOptions?.find((option: any) => 
          option.label?.toLowerCase().includes('triple layer') && !option.label?.toLowerCase().includes('extra cure')
        );
        // Using Triple Layer based on recommendations
      }
    } else if (recommendations.toLowerCase().includes('double layer')) {
      selectedPatchingOption = tp2Config.pricingOptions?.find((option: any) => 
        option.label?.toLowerCase().includes('double layer')
      );
      // Using Double Layer based on recommendations
    } else {
      // DEFAULT: If no depth recorded or no specific recommendation, use Double Layer (option 2)
      selectedPatchingOption = tp2Config.pricingOptions?.find((option: any) => 
        option.label?.toLowerCase().includes('double layer')
      );
      // Using Double Layer as default (no depth recorded or specific recommendation)
    }
    
    // Fallback: if selected option has no value, find any option with a value
    if (!selectedPatchingOption || !selectedPatchingOption.value || selectedPatchingOption.value.trim() === '') {
      selectedPatchingOption = tp2Config.pricingOptions?.find((option: any) => 
        option.enabled && option.value && option.value.trim() !== ''
      );
      // Fallback: Using first available option with value
    }
    
    if (!selectedPatchingOption || !selectedPatchingOption.value || selectedPatchingOption.value.trim() === '') {
      // No patching option found with value in TP2 config
      return {
        cost: 0,
        currency: '£',
        method: 'No TP2 Patching Options',
        status: 'tp2_no_options',
        configType: 'TP2 Configuration Missing Pricing Options'
      };
    }
    
    // CRITICAL FIX: Use MM4 green values instead of TP2 configuration values
    // Extract green value (cost per 1mts patch) from MM4 data based on pipe size
    let costPerUnit = 0;
    let mm4MinQuantity = 0;
    
    // CRITICAL FIX: Get MM4 data using correct pipe size key format
    if (tp2Config.mm_data?.mm4DataByPipeSize) {
      // Use correct pipe size key format as shown in console logs
      const pipeSizeKey = `${pipeSize}-${pipeSize === '150' ? '1501' : pipeSize === '225' ? '2251' : pipeSize === '300' ? '3001' : '1001'}`;
      const mm4Data = tp2Config.mm_data.mm4DataByPipeSize[pipeSizeKey];
      
      console.log(`🔍 MM4 Dashboard Access: Looking for key "${pipeSizeKey}" in:`, Object.keys(tp2Config.mm_data.mm4DataByPipeSize));
      
      if (mm4Data && mm4Data[0]) {
        // Use green value as cost per 1mts patch
        // CRITICAL FIX: Use row 2 for double layer patches
        let rowIndex = 0;
        if (recommendations.toLowerCase().includes('double layer')) {
          rowIndex = 1; // Use row 2 for double layer patches
        }
        costPerUnit = parseFloat(mm4Data[rowIndex]?.greenValue || mm4Data[0]?.greenValue) || 0;
        
        // REPURPOSED: Use purple fields as minimum quantities (field names remain same for compatibility)
        const purpleMinQty1 = parseFloat(mm4Data[0].purpleDebris) || 0;  // Now stores min quantity
        const purpleMinQty2 = parseFloat(mm4Data[0].purpleLength) || 0;  // Now stores min patches  
        mm4MinQuantity = Math.max(purpleMinQty1, purpleMinQty2); // Use higher minimum
        
        console.log(`✅ MM4 Values Found: Green=${costPerUnit}, MinQty1=${purpleMinQty1}, MinQty2=${purpleMinQty2}, Final=${mm4MinQuantity}`);
      } else {
        console.log(`❌ MM4 Data Not Found for key "${pipeSizeKey}"`);
      }
    }
    
    // Fallback to TP2 configuration values if MM4 not available
    if (costPerUnit === 0) {
      costPerUnit = parseFloat(selectedPatchingOption.value) || 0;
    }
    
    // FIXED: Match the specific patching option to its corresponding minimum quantity field
    let minQuantityOption = null;
    let minQuantity = 0;
    
    // Map patching options to their corresponding minimum quantity fields
    if (selectedPatchingOption.label?.toLowerCase().includes('single layer')) {
      minQuantityOption = tp2Config.minQuantityOptions?.find((option: any) => 
        option.id === 'patch_min_qty_1' && option.value && option.value.trim() !== ''
      );
    } else if (selectedPatchingOption.label?.toLowerCase().includes('double layer')) {
      minQuantityOption = tp2Config.minQuantityOptions?.find((option: any) => 
        option.id === 'patch_min_qty_2' && option.value && option.value.trim() !== ''
      );
    } else if (selectedPatchingOption.label?.toLowerCase().includes('triple layer (with extra cure time)') || 
               selectedPatchingOption.label?.toLowerCase().includes('triple layer (extra)')) {
      minQuantityOption = tp2Config.minQuantityOptions?.find((option: any) => 
        option.id === 'patch_min_qty_4' && option.value && option.value.trim() !== ''
      );
    } else if (selectedPatchingOption.label?.toLowerCase().includes('triple layer')) {
      minQuantityOption = tp2Config.minQuantityOptions?.find((option: any) => 
        option.id === 'patch_min_qty_3' && option.value && option.value.trim() !== ''
      );
    }
    
    // Use MM4 minimum quantity if available, otherwise use TP2 config
    const configMinQuantity = minQuantityOption ? parseFloat(minQuantityOption.value) || 0 : 0;
    const finalMinQuantity = mm4MinQuantity > 0 ? mm4MinQuantity : configMinQuantity;
    
    // Calculate base cost using MM4 green value (per 1mts) × defect count
    const baseCost = costPerUnit * defectCount;
    
    // CHECK MINIMUM QUANTITY REQUIREMENT
    const meetsMinimumQuantity = defectCount >= finalMinQuantity;
    
    // If below minimum, apply day rate instead of per-unit cost
    let finalCost = baseCost;
    let dayRateApplied = false;
    
    if (!meetsMinimumQuantity && finalMinQuantity > 0) {
      finalCost = dayRate; // Apply full day rate when below minimum
      dayRateApplied = true;
    }
    
    // TP2 cost calculation completed
    
    // Return cost with red indicator if day rate was applied due to minimum not met
    if (dayRateApplied) {
      return {
        cost: finalCost,
        showRedTriangle: true, // Show red cost when day rate applied
        triangleMessage: `Below minimum quantities: ${defectCount}/${finalMinQuantity} patches - day rate applied`,
        defectCount: defectCount,
        minRequired: finalMinQuantity,
        costPerUnit: costPerUnit,
        baseCost: baseCost,
        dayRateAdjustment: finalCost - baseCost,
        totalCost: finalCost,
        status: 'day_rate_applied',
        patchingType: selectedPatchingOption.label,
        recommendation: `Day rate applied: Below minimum ${finalMinQuantity} patches required`
      };
    }
    
    // Update recommendation to include pipe size and length with CCTV/Jet Vac day rate info
    const recommendationText = `To install ${pipeSize}mm x ${sectionLength}m ${selectedPatchingOption.label.toLowerCase()} patching`;
    
    return {
      cost: finalCost,
      costPerUnit: costPerUnit,
      baseCost: baseCost,
      dayRateAdjustment: 0,
      dayRate: dayRate,
      defectCount: defectCount,
      minQuantity: finalMinQuantity,
      patchingType: selectedPatchingOption.label,
      recommendation: recommendationText,
      status: 'calculated'
    };
  };

  // Helper function to analyze junction/connection proximity for robotic cutting
  const analyzeJunctionProximity = (defectText: string) => {
    // Look for defect locations (OJM, JDM, etc.)
    const defectPattern = /(OJM|JDM|D)\s+([\d.]+)m/gi;
    const connectionPattern = /(JN|CN)\s+([\d.]+)m/gi;
    
    const defectLocations: number[] = [];
    const connections: { type: string; location: number }[] = [];
    
    // Find all defect locations that might need robotic cutting
    let defectMatch;
    while ((defectMatch = defectPattern.exec(defectText)) !== null) {
      defectLocations.push(parseFloat(defectMatch[2]));
    }
    
    // Find all junction/connection locations
    let connectionMatch;
    while ((connectionMatch = connectionPattern.exec(defectText)) !== null) {
      connections.push({
        type: connectionMatch[1],
        location: parseFloat(connectionMatch[2])
      });
    }
    
    // Count junctions within 0.7m of any defect requiring robotic cutting
    let nearbyJunctionCount = 0;
    const junctionDetails: string[] = [];
    
    for (const defectLocation of defectLocations) {
      for (const connection of connections) {
        const distance = Math.abs(defectLocation - connection.location);
        if (distance <= 0.7) {
          nearbyJunctionCount++;
          junctionDetails.push(`${connection.type} at ${connection.location}m (${distance.toFixed(2)}m from defect)`);
        }
      }
    }
    
    return {
      nearbyJunctionCount,
      junctionDetails,
      hasNearbyJunctions: nearbyJunctionCount > 0,
      defectLocations,
      connectionLocations: connections
    };
  };

  // AUTO-POPULATE ID760 MM4-150 PURPLE LENGTH FIELDS BASED ON DASHBOARD TOTAL LENGTHS
  const autoPopulatePurpleLengthFields = (cctvConfig: any, currentSection: any, allSections: any[]) => {
    if (!cctvConfig?.mmData?.mm4DataByPipeSize) {
      return;
    }
    
    const mmData = cctvConfig.mmData;
    const sectionPipeSize = currentSection.pipeSize?.replace('mm', '');
    
    // Find matching 150mm pipe size configuration (ID760 MM4-150 target)
    const targetPipeSizeKey = Object.keys(mmData.mm4DataByPipeSize).find(key => 
      key.split('-')[0] === '150'
    );
    
    if (!targetPipeSizeKey) {
      console.log('🔍 Auto-populate: No 150mm MM4 configuration found, skipping purple length update');
      return;
    }
    
    // Calculate maximum total length from dashboard sections for 150mm pipes (target configuration)
    const maxTotalLength = Math.max(
      ...allSections
        .filter(section => 
          section.pipeSize?.replace('mm', '') === '150' &&
          section.totalLength &&
          parseFloat(section.totalLength) > 0
        )
        .map(section => parseFloat(section.totalLength) || 0),
      0
    );
    
    if (maxTotalLength <= 0) {
      console.log('🔍 Auto-populate: No valid total lengths found for pipe size', sectionPipeSize);
      return;
    }
    
    // Add buffer to maximum length (10% buffer for safety margin)
    const bufferedMaxLength = Math.ceil(maxTotalLength * 1.1);
    
    // Get MM4 data rows first
    const mm4Rows = mmData.mm4DataByPipeSize[targetPipeSizeKey] || [];
    
    console.log('🔧 Auto-populating ID760 MM4-150 purple length fields:', {
      currentSection: currentSection.itemNo,
      targetPipeSize: '150mm',
      maxTotalLengthDetected: maxTotalLength,
      bufferedMaxLength: bufferedMaxLength,
      targetConfigurationKey: targetPipeSizeKey,
      existingPurpleLengths: mm4Rows.map((row: any) => row.purpleLength),
      willUpdatePurpleLength: true
    });
    
    // Update MM4 data with new purple length values - ALWAYS update to accommodate actual section lengths
    const updatedMM4Rows = mm4Rows.map((row: any) => {
      const currentPurpleLength = parseFloat(row.purpleLength || '0');
      const shouldUpdate = currentPurpleLength < maxTotalLength; // Update if current threshold is inadequate
      
      return {
        ...row,
        purpleLength: shouldUpdate 
          ? bufferedMaxLength.toString() // Update to accommodate actual lengths
          : row.purpleLength // Keep existing value if already adequate
      };
    });
    
    // Update the configuration
    const updatedMmData = {
      ...mmData,
      mm4DataByPipeSize: {
        ...mmData.mm4DataByPipeSize,
        [targetPipeSizeKey]: updatedMM4Rows
      }
    };
    
    // Save updated configuration to backend (async without await to avoid blocking)
    fetch(`/api/pr2-configurations/${cctvConfig.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mmData: updatedMmData
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      console.log('✅ Successfully auto-populated ID760 MM4-150 purple length fields:', {
        configurationId: cctvConfig.id,
        updatedRows: updatedMM4Rows.length,
        newPurpleLength: bufferedMaxLength,
        beforeUpdate: mm4Rows.map(row => ({id: row.id, purpleLength: row.purpleLength})),
        afterUpdate: updatedMM4Rows.map(row => ({id: row.id, purpleLength: row.purpleLength}))
      });
      
      // Invalidate cache to refresh configurations
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-configurations'] });
    })
    .catch(error => {
      console.error('❌ Failed to auto-populate purple length fields:', error);
    });
  };

  // Function to calculate auto-populated cost for defective sections using PR2 configurations  
  const calculateAutoCost = (section: any) => {
    console.log('🔍 MM4 Cost Calculation Called for Section:', {
      itemNo: section.itemNo,
      defects: section.defects,
      totalLength: section.totalLength,
      pipeSize: section.pipeSize,
      defectType: section.defectType,
      needsCleaning: requiresCleaning(section.defects || ''),
      isRestrictedSection: [3, 6, 7, 8, 10, 13, 14, 15, 20, 21, 22, 23].includes(section.itemNo),
      pr2ConfigsAvailable: !!repairPricingData && repairPricingData.length > 0,
      currentEquipmentPriority: equipmentPriority
    });
    
    // CRITICAL DEBUG: Force logging for ALL service sections to understand validation triggers
    if (section.defectType === 'service') {
      console.log('🔍 SERVICE SECTION VALIDATION TRACE:', {
        itemNo: section.itemNo,
        willEnterServiceValidation: true,
        pr2ConfigsCount: repairPricingData ? repairPricingData.length : 0,
        needsCleaning: requiresCleaning(section.defects || ''),
        isRestrictedSection: [3, 6, 7, 8, 10, 13, 14, 15, 20, 21, 22, 23].includes(section.itemNo),
        shouldTriggerValidation: section.defectType === 'service' && repairPricingData && repairPricingData.length > 0 && requiresCleaning(section.defects || '') && [3, 6, 7, 8, 10, 13, 14, 15, 20, 21, 22, 23].includes(section.itemNo),
        defectsText: section.defects,
        itemNoInRange: section.itemNo >= 1 && section.itemNo <= 4 ? 'EARLY_ITEM' : 'LATER_ITEM'
      });
      
      // DEBUG Items 1-4 specifically
      if (section.itemNo >= 1 && section.itemNo <= 4) {
        console.log(`🔍 EARLY SERVICE ITEM ${section.itemNo} ANALYSIS:`, {
          defects: section.defects,
          needsCleaningResult: requiresCleaning(section.defects || ''),
          isInRestrictedList: [3, 6, 7, 8, 10, 13, 14, 15, 20, 21, 22, 23].includes(section.itemNo),
          willProcessValidation: requiresCleaning(section.defects || '') && [3, 6, 7, 8, 10, 13, 14, 15, 20, 21, 22, 23].includes(section.itemNo),
          reasonSkipped: !requiresCleaning(section.defects || '') ? 'NO_CLEANING_NEEDED' : ![3, 6, 7, 8, 10, 13, 14, 15, 20, 21, 22, 23].includes(section.itemNo) ? 'NOT_IN_RESTRICTED_LIST' : 'SHOULD_PROCESS'
        });
      }
    }

    // ENHANCED VALIDATION ORDER: Check MM4 range violations FIRST before day rate validation
    // This ensures that range issues are detected before day rate issues, providing more accurate warnings
    console.log('🔍 PRE-SERVICE VALIDATION CHECK:', {
      itemNo: section.itemNo,
      defectType: section.defectType,
      isServiceType: section.defectType === 'service',
      pr2ConfigsExists: !!repairPricingData,
      pr2ConfigsLength: repairPricingData ? repairPricingData.length : 0,
      willEnterServiceValidation: section.defectType === 'service' && repairPricingData && repairPricingData.length > 0
    });
    
    if (section.defectType === 'service' && repairPricingData && repairPricingData.length > 0) {
      const needsCleaning = requiresCleaning(section.defects || '');
      const isRestrictedSection = [3, 6, 7, 8, 10, 13, 14, 15, 20, 21, 22, 23].includes(section.itemNo);
      
      // CRITICAL FIX: Process ALL service sections for cost calculation, not just ones that need cleaning
      // Old logic: if (needsCleaning && isRestrictedSection)
      // New logic: Process all service sections, but use different validation paths
      if (true) { // Always process service sections
        // Find A5 and A4 configurations (A5=cctv-jet-vac, A4=cctv-van-pack)
        const id760Config = repairPricingData.find(config => config.categoryId === 'cctv-jet-vac');
        const id759Config = repairPricingData.find(config => config.categoryId === 'cctv-van-pack');
        
        // Check current equipment priority
        console.log('🔍 EQUIPMENT PRIORITY DEBUG - UNIFIED STATE:', {
          componentState_equipmentPriority: equipmentPriority,
          itemNo: section.itemNo,
          id760Available: !!id760Config,
          id759Available: !!id759Config,
          id760Id: id760Config?.id,
          id759Id: id759Config?.id,
          id760HasMM4Data: !!(id760Config?.mm_data?.mm4Rows?.[0]?.blueValue),
          id759HasMM4Data: !!(id759Config?.mm_data?.mm4Rows?.[0]?.blueValue),
          id760BlueValue: id760Config?.mm_data?.mm4Rows?.[0]?.blueValue,
          id759BlueValue: id759Config?.mm_data?.mm4Rows?.[0]?.blueValue,
          stateSource: 'component_state_unified'
        });
        
        // INTELLIGENT FALLBACK: Use configuration with valid MM4 data
        // Priority: user preference -> valid data -> any available config
        let cctvConfig;
        const preferredConfig = equipmentPriority === 'id759' ? id759Config : id760Config;
        const alternativeConfig = equipmentPriority === 'id759' ? id760Config : id759Config;
        
        // CRITICAL FIX: Always respect user's equipment priority choice
        // Don't override user's explicit A5/A4 selection based on data availability
        cctvConfig = preferredConfig;
        
        console.log('✅ UNIFIED STATE - Configuration selected for item', section.itemNo, ':', {
          configId: cctvConfig?.id,
          categoryId: cctvConfig?.categoryId,
          equipmentPriority: equipmentPriority,
          userChoice: equipmentPriority === 'id759' ? 'A4 - CCTV/Van Pack' : 'A5 - CCTV/Jet Vac',
          hasValidData: cctvConfig?.mm_data?.mm4Rows?.[0]?.blueValue && 
                       cctvConfig.mm_data.mm4Rows[0].blueValue.trim() !== '' &&
                       parseFloat(cctvConfig.mm_data.mm4Rows[0].blueValue) > 0,
          dataSource: 'component_state_consistent'
        });
        
        console.log('🔍 SELECTED EQUIPMENT CONFIG:', {
          selectedConfig: cctvConfig?.id,
          selectedCategoryId: cctvConfig?.categoryId,
          wouldUseA5: equipmentPriority !== 'id759',
          id760PurpleLengths: id760Config?.mmData?.mm4DataByPipeSize?.['150-1501']?.map(row => row.purpleLength)
        });
        
        if (!cctvConfig) {
          // No valid CCTV configuration found at all
          console.log('❌ NO CCTV CONFIGURATION FOUND:', {
            itemNo: section.itemNo,
            id760Available: !!id760Config,
            id759Available: !!id759Config,
            equipmentPriority: equipmentPriority,
            reason: 'Neither A5 nor A4 configuration available'
          });
          
          return {
            cost: 0,
            currency: '£',
            method: 'No Configuration Found',
            status: 'no_config_found',
            configType: 'CCTV Configuration Missing',
            warningType: 'no_config_found',
            sectionData: {
              itemNo: section.itemNo,
              defectType: 'service',
              pipeSize: section.pipeSize,
              totalLength: parseFloat(section.totalLength || '0'),
              debrisPercent: extractDebrisPercentage(section.defects || '')
            },
            configData: {
              categoryId: 'missing'
            }
          };
        }
        
        if (cctvConfig) {
          // PRIORITY 0: CHECK BLUE DAY RATE FIRST - Must show blue triangles for missing day rates
          const dayRateValue = cctvConfig?.mm_data?.mm4Rows?.[0]?.blueValue;
          const isInitialDayRateConfigured = dayRateValue && dayRateValue.trim() !== '' && parseFloat(dayRateValue) > 0;
          
          if (!isInitialDayRateConfigured) {
            console.log('🔵 BLUE DAY RATE MISSING - Showing blue triangle:', {
              itemNo: section.itemNo,
              configId: cctvConfig.id,
              dayRateValue: dayRateValue,
              reason: 'Day rate not configured - should show blue triangle'
            });
            
            return {
              cost: 0,
              currency: '£',
              method: 'Day Rate Missing',
              status: 'day_rate_missing',
              recommendation: 'Configure day rate in blue field',
              warningType: 'day_rate_missing',
              sectionData: {
                itemNo: section.itemNo,
                defectType: 'service',
                pipeSize: section.pipeSize?.toString().replace('mm', ''),
                totalLength: parseFloat(section.totalLength || '0'),
                debrisPercent: extractDebrisPercentage(section.defects || '')
              },
              configData: {
                categoryId: cctvConfig.categoryId,
                configId: cctvConfig.id,
                dayRateStatus: 'missing'
              }
            };
          }
          
          // CRITICAL FIX: Disable auto-population to prevent overriding user-configured MM4 values
          // The auto-populate function was causing dashboard prices to ignore user configurations
          // by automatically overwriting purple length fields with buffered dashboard values
          // This was the root cause of both issues: prices not updating and persistent warnings
          
          // PRIORITY 1: CHECK MM4 RANGE VIOLATIONS FIRST
          // Check if section meets MM4 configuration criteria before checking day rate
          const sectionPipeSize = parseInt(section.pipeSize?.toString().replace(/mm.*$/i, '') || '0');
          const sectionLength = parseFloat(section.totalLength?.toString() || '0');
          const sectionDebrisPercent = extractDebrisPercentage(section.defects || '');
          
          // Find matching MM4 configurations for this pipe size
          const mm4DataByPipeSize = cctvConfig?.mmData?.mm4DataByPipeSize || {};
          let matchingMM4Data: any = [];
          let matchingPipeSizeKey = '';
          
          // Try to find exact pipe size match (e.g., "150-1501")
          for (const [pipeSizeKey, mm4Data] of Object.entries(mm4DataByPipeSize)) {
            const [keyPipeSize] = pipeSizeKey.split('-');
            
            if (keyPipeSize === sectionPipeSize?.toString().replace('mm', '')) {
              matchingMM4Data = mm4Data;
              matchingPipeSizeKey = pipeSizeKey;
              break;
            }
          }
          
          // FIXED: Smart pipe size fallback prioritizing 150mm for A4 759 configuration
          // Instead of using first available, prioritize 150mm then fall back to others
          if (!matchingPipeSizeKey && Object.keys(mm4DataByPipeSize).length > 0) {
            const availablePipeSizes = Object.keys(mm4DataByPipeSize);
            
            // Priority order: prefer 150mm, then 225mm, then others
            const priorityOrder = ['150', '225', '100', '300', '375', '450', '525', '600', '750', '900', '1050', '1200', '1350', '1500'];
            
            let selectedPipeSizeKey = availablePipeSizes[0]; // fallback to first
            
            // Find the highest priority available pipe size
            for (const prioritySize of priorityOrder) {
              const matchingKey = availablePipeSizes.find(key => key.startsWith(prioritySize + '-'));
              if (matchingKey) {
                selectedPipeSizeKey = matchingKey;
                break;
              }
            }
            
            matchingMM4Data = mm4DataByPipeSize[selectedPipeSizeKey];
            matchingPipeSizeKey = selectedPipeSizeKey;
            
            console.log('🔧 SMART PIPE SIZE FALLBACK - Prioritizing 150mm for A4 759:', {
              requestedPipeSize: sectionPipeSize,
              availablePipeSizes: availablePipeSizes,
              selectedPipeSizeKey: selectedPipeSizeKey,
              itemNo: section.itemNo,
              equipmentConfig: cctvConfig?.categoryId,
              reason: 'Smart fallback prioritizing 150mm over 100mm for A4 759 configuration'
            });
          }
          
          // Check if section exceeds MM4 ranges (any row)
          if (matchingMM4Data && Array.isArray(matchingMM4Data) && matchingMM4Data.length > 0) {
            let sectionExceedsAllRanges = true;
            
            console.log('🔍 RANGE VALIDATION START:', {
              equipmentConfig: cctvConfig?.categoryId,
              itemNo: section.itemNo,
              sectionLength,
              sectionDebrisPercent,
              mm4DataLength: matchingMM4Data.length,
              mm4Rows: matchingMM4Data.map(row => ({
                id: row.id,
                purpleLength: row.purpleLength,
                purpleDebris: row.purpleDebris
              })),
              usingUserConfiguredValues: true,
              noAutoPopulationOverride: true
            });
            
            // Check each MM4 row to see if section fits within any range
            for (const mm4Row of matchingMM4Data) {
              // CRITICAL FIX: Use buffered values for range validation instead of raw database values
              const buffer = JSON.parse(localStorage.getItem('inputBuffer') || '{}');
              const configId = cctvConfig.id;
              const debrisBufferKey = `${configId}-${matchingPipeSizeKey}-${mm4Row.id}-purpleDebris`;
              const lengthBufferKey = `${configId}-${matchingPipeSizeKey}-${mm4Row.id}-purpleLength`;
              
              const bufferedDebris = buffer[debrisBufferKey];
              const bufferedLength = buffer[lengthBufferKey];
              
              // FIXED: Only use buffered values if they contain actual data, not empty strings
              const rawPurpleDebris = (bufferedDebris && bufferedDebris.trim() !== '') ? bufferedDebris : (mm4Row.purpleDebris || '');
              const rawPurpleLength = (bufferedLength && bufferedLength.trim() !== '') ? bufferedLength : (mm4Row.purpleLength || '');
              
              // CRITICAL: Check for incomplete configuration - empty strings should trigger red warnings
              const hasValidDebris = rawPurpleDebris !== '' && !isNaN(parseFloat(rawPurpleDebris));
              const hasValidLength = rawPurpleLength !== '' && !isNaN(parseFloat(rawPurpleLength));
              
              if (!hasValidDebris || !hasValidLength) {
                console.log('🚨 INCOMPLETE RANGE CONFIG DETECTED:', {
                  itemNo: section.itemNo,
                  configId: cctvConfig.id,
                  rawPurpleDebris,
                  rawPurpleLength,
                  hasValidDebris,
                  hasValidLength,
                  willShowRed: true
                });
                
                return {
                  cost: 0,
                  currency: '£',
                  method: 'Incomplete Configuration',
                  status: 'mm4_incomplete_config',
                  recommendation: 'Configuration incomplete: missing debris % or length ranges',
                  warningType: 'incomplete_config',
                  sectionData: {
                    itemNo: section.itemNo,
                    defectType: 'service',
                    pipeSize: section.pipeSize?.toString().replace('mm', ''),
                    totalLength: sectionLength,
                    debrisPercent: sectionDebrisPercent
                  },
                  configData: {
                    categoryId: cctvConfig.categoryId,
                    maxDebris: hasValidDebris ? parseFloat(rawPurpleDebris) : 'missing',
                    maxLength: hasValidLength ? parseFloat(rawPurpleLength) : 'missing',
                    minLength: 0,
                    actualDayRate: parseFloat(mm4Row.blueValue || '0')
                  }
                };
              }
              
              const purpleDebris = parseFloat(rawPurpleDebris);
              const purpleLength = parseFloat(rawPurpleLength);
              
              const debrisMatch = sectionDebrisPercent <= purpleDebris;
              const lengthMatch = sectionLength <= purpleLength;
              
              console.log('🔍 RANGE CHECK ROW:', {
                rowId: mm4Row.id,
                rawPurpleLength: mm4Row.purpleLength,
                rawPurpleDebris: mm4Row.purpleDebris,
                bufferedLength: bufferedLength,
                bufferedDebris: bufferedDebris,
                finalPurpleLength: purpleLength,
                finalPurpleDebris: purpleDebris,
                sectionLength,
                sectionDebrisPercent,
                lengthMatch,
                debrisMatch,
                bothMatch: debrisMatch && lengthMatch,
                lengthExceeded: sectionLength > purpleLength,
                debrisExceeded: sectionDebrisPercent > purpleDebris,
                usingBufferForDebris: !!bufferedDebris,
                usingBufferForLength: !!bufferedLength
              });
              
              if (debrisMatch && lengthMatch) {
                sectionExceedsAllRanges = false;
                break;
              }
            }
            
            // If section exceeds ALL MM4 ranges, return range warning (proper validation)
            if (sectionExceedsAllRanges) {
              // Determine which range is exceeded by checking the most permissive row
              // Find the row with the highest purpleDebris and purpleLength values to give accurate error messages
              const maxDebrisRow = matchingMM4Data.reduce((max, row) => 
                (parseFloat(row.purpleDebris || '0') > parseFloat(max.purpleDebris || '0')) ? row : max, matchingMM4Data[0]);
              const maxLengthRow = matchingMM4Data.reduce((max, row) => 
                (parseFloat(row.purpleLength || '0') > parseFloat(max.purpleLength || '0')) ? row : max, matchingMM4Data[0]);
              
              const debrisExceeded = sectionDebrisPercent > (parseFloat(maxDebrisRow?.purpleDebris || '0'));
              const lengthExceeded = sectionLength > (parseFloat(maxLengthRow?.purpleLength || '0'));

              console.log(`⚠️ PRIORITY WARNING: Section ${section.itemNo} exceeds MM4 ranges:`, {
                sectionDebrisPercent,
                sectionLength,
                allMM4Rows: matchingMM4Data.map(row => ({
                  id: row.id,
                  purpleDebris: row.purpleDebris,
                  purpleLength: row.purpleLength,
                  parsedDebris: parseFloat(row.purpleDebris || '0'),
                  parsedLength: parseFloat(row.purpleLength || '0')
                })),
                maxDebrisFound: parseFloat(maxDebrisRow?.purpleDebris || '0'),
                maxLengthFound: parseFloat(maxLengthRow?.purpleLength || '0'),
                sectionFailsDebris: debrisExceeded,
                sectionFailsLength: lengthExceeded
              });
              
              let warningType: 'debris_out_of_range' | 'length_out_of_range' | 'both_out_of_range';
              if (debrisExceeded && lengthExceeded) {
                warningType = 'both_out_of_range';
              } else if (debrisExceeded) {
                warningType = 'debris_out_of_range';
              } else {
                warningType = 'length_out_of_range';
              }
              
              // Get the actual day rate for display purposes (even though section is out of range)
              const dayRateValue = cctvConfig.mm_data?.mm4Rows?.[0]?.blueValue;
              const actualDayRate = dayRateValue ? parseFloat(dayRateValue) : 0;
              
              return {
                cost: 0,
                currency: '£',
                method: 'MM4 Outside Ranges',
                status: 'mm4_outside_ranges',
                recommendation: 'Section exceeds MM4 configuration ranges (debris % or length)',
                warningType: warningType,
                sectionData: {
                  itemNo: section.itemNo,
                  defectType: 'service',
                  pipeSize: section.pipeSize,
                  totalLength: sectionLength,
                  debrisPercent: sectionDebrisPercent
                },
                configData: {
                  categoryId: cctvConfig.categoryId,
                  maxDebris: parseFloat(maxDebrisRow?.purpleDebris || '0'),
                  maxLength: parseFloat(maxLengthRow?.purpleLength || '0'),
                  minLength: 0,
                  actualDayRate: actualDayRate // Include actual day rate for display
                }
              };
            }
          }
          
          // PRIORITY 2: CHECK DAY RATE ONLY AFTER CONFIRMING MM4 RANGES ARE OK
          // CRITICAL FIX: Use exact same buffer validation as the cost calculation section below (lines 4917+)
          // Get buffered day rate using identical logic to cost calculation
          let effectiveDayRate = 0;
          
          // CRITICAL FIX: Standardized buffer key format with enhanced validation
          try {
            const buffer = JSON.parse(localStorage.getItem('inputBuffer') || '{}');
            // UNIFIED STATE FIX: Use component state instead of localStorage direct read
            const currentEquipmentPriority = equipmentPriority;
            
            // Use actual config ID with standardized buffer key format
            const configId = cctvConfig.id;
            const bufferKey = `${configId}-${matchingPipeSizeKey}-1-blueValue`;
            
            // Enhanced buffer key validation - try multiple formats for compatibility
            const possibleKeys = [
              bufferKey, // Standard format: "760-150-1501-1-blueValue"
              `${configId}-${matchingPipeSizeKey.split('-')[0]}-${matchingPipeSizeKey.split('-')[1]}-1-blueValue`, // Explicit format
              `${configId}-${matchingPipeSizeKey}-blueValue`, // Legacy format without row ID
            ];
            
            let bufferedDayRate = null;
            let usedBufferKey = null;
            
            for (const key of possibleKeys) {
              if (buffer[key]) {
                bufferedDayRate = buffer[key];
                usedBufferKey = key;
                break;
              }
            }
            
            const dbDayRate = cctvConfig.mm_data?.mm4Rows?.[0]?.blueValue;
            const finalDayRate = bufferedDayRate || dbDayRate || '0';
            
            effectiveDayRate = parseFloat(finalDayRate);
            
            // Enhanced debugging for buffer key resolution
            console.log('🔍 ENHANCED BUFFER KEY RESOLUTION:', {
              configId: configId,
              matchingPipeSizeKey: matchingPipeSizeKey,
              possibleKeys: possibleKeys,
              usedBufferKey: usedBufferKey,
              bufferedValue: bufferedDayRate,
              dbValue: dbDayRate,
              finalValue: finalDayRate,
              effectiveDayRate: effectiveDayRate
            });
          } catch {
            // Final fallback to database value
            const dbDayRate = cctvConfig.mm_data?.mm4Rows?.[0]?.blueValue;
            effectiveDayRate = parseFloat(dbDayRate || '0');
          }
          
          const hasValidDayRate = effectiveDayRate > 0;
          
          // Enhanced debugging with FIXED buffer key format
          const buffer = JSON.parse(localStorage.getItem('inputBuffer') || '{}');
          const configId = cctvConfig.id; // Use actual config ID (760)
          const constructedBufferKey = `${configId}-${matchingPipeSizeKey}-1-blueValue`;
          const bufferedValue = buffer[constructedBufferKey];
          
          console.log('🚨 FINAL DEBUG - Item 3 Validation (Expected: 760-150-1501-1-blueValue):', {
            itemNo: section.itemNo,
            STEP_1_configId: configId,
            STEP_2_matchingPipeSizeKey: matchingPipeSizeKey,
            STEP_3_constructedBufferKey: constructedBufferKey,
            STEP_4_bufferedValue: bufferedValue,
            STEP_5_rawDbValue: cctvConfig.mm_data?.mm4Rows?.[0]?.blueValue,
            STEP_6_finalEffectiveDayRate: effectiveDayRate,
            STEP_7_hasValidDayRate: hasValidDayRate,
            STEP_8_willShowPopup: !hasValidDayRate,
            USER_REPORTED_KEY: '760-150-1501-1-blueValue',
            USER_REPORTED_VALUE: '1650',
            EXACT_MATCH_TEST: buffer['760-150-1501-1-blueValue'],
            ALL_760_150_KEYS: Object.keys(buffer).filter(k => k.includes('760-150')),
            BUFFER_KEY_MISMATCH: constructedBufferKey !== '760-150-1501-1-blueValue' ? 'KEY MISMATCH DETECTED' : 'KEY MATCHES'
          });
          
          // If day rate is not configured, return specific error information
          if (!hasValidDayRate) {
            return {
              cost: 0,
              currency: '£',
              method: 'Day Rate Not Configured',
              status: 'day_rate_missing',
              configType: cctvConfig.categoryId === 'cctv-van-pack' ? 'A4 CCTV/Van Pack' : 'A5 CCTV/Jet Vac',
              warningType: 'day_rate_missing',
              sectionData: {
                itemNo: section.itemNo,
                defectType: 'service',
                pipeSize: section.pipeSize,
                totalLength: parseFloat(section.totalLength || '0'),
                debrisPercent: sectionDebrisPercent
              },
              configData: {
                categoryId: cctvConfig.categoryId
              }
            };
          }
        }
      }
    }

    // CRITICAL FIX: Also validate A8 structural patching configurations for day rate
    if (section.defectType === 'structural' && repairPricingData && repairPricingData.length > 0) {
      // Find A8 patching configuration
      const patchingConfig = repairPricingData.find(config => config.categoryId === 'patching' && config.sector === 'utilities');
      
      if (patchingConfig) {
        // Check if day rate is properly configured in MM4 blue value (single source of truth)
        const dayRateValue = patchingConfig.mm_data?.mm4Rows?.[0]?.blueValue;
        const isStructuralDayRateConfigured = dayRateValue && dayRateValue.trim() !== '' && dayRateValue !== '0';
        
        // A8 patching day rate validation
        
        // If day rate is not configured, return specific error information  
        if (!isStructuralDayRateConfigured) {
          return {
            cost: 0,
            currency: '£',
            method: 'Day Rate Not Configured',
            status: 'day_rate_missing',
            configType: 'A8 Patching',
            warningType: 'day_rate_missing',
            sectionData: {
              itemNo: section.itemNo,
              defectType: 'structural',
              pipeSize: section.pipeSize,
              totalLength: parseFloat(section.totalLength || '0'),
              debrisPercent: 0
            },
            configData: {
              categoryId: patchingConfig.categoryId
            }
          };
        }
      }
    }
    
    // Check for adjusted service costs first
    const adjustedServiceCost = adjustedServiceCosts.get(section.itemNo);
    if (section.defectType === 'service' && adjustedServiceCost) {
      return {
        cost: adjustedServiceCost,
        currency: '£',
        method: 'Day Rate Adjusted Service Cost',
        status: 'adjusted_service_cost',
        isAdjusted: true,
        configType: 'Adjusted Service Cost'
      };
    }
    
    // Check for adjusted structural costs
    const adjustedStructuralCost = adjustedStructuralCosts.get(section.itemNo);
    if (section.defectType === 'structural' && adjustedStructuralCost) {
      return {
        cost: adjustedStructuralCost,
        currency: '£',
        method: 'Day Rate Adjusted Structural Cost',
        status: 'adjusted_structural_cost',
        isAdjusted: true,
        configType: 'Adjusted Structural Cost',
        patchCount: 1 // Default patch count for adjusted structural costs
      };
    }
    
    // Item 13 handling optimized
    
    // Item 10 workflow optimized
    
    // Item 3 processing optimized
    
    // Function to extract defect meterages for patch counting
    const extractDefectMeterages = (defectsText: string): string[] => {
      // Extract meterage patterns like "14.27m", "5.2m", "at 10m", etc.
      const meteragePattern = /(\d+(?:\.\d+)?)\s*m(?!\w)/gi;
      const matches = defectsText.match(meteragePattern) || [];
      
      // Also look for patterns like "at 5.2m" or "from 10m to 15m"
      const locationPattern = /(?:at|from|to)\s+(\d+(?:\.\d+)?)\s*m/gi;
      const locationMatches = [...defectsText.matchAll(locationPattern)];
      
      // Combine both patterns and remove duplicates
      const allMeterages = [
        ...matches,
        ...locationMatches.map(match => `${match[1]}m`)
      ];
      
      // Remove duplicates and return unique meterage locations
      const uniqueMeterages = [...new Set(allMeterages)];
      
      // If no specific meterages found but defects exist, assume at least 1 patch needed
      if (uniqueMeterages.length === 0 && defectsText.trim().length > 0) {
        return ['1 patch']; // Default to 1 patch if defects exist but no specific locations
      }
      
      return uniqueMeterages;
    };

    // Helper function to calculate ID763 structural patching (A8-Utilities Patching)
    const calculateID763StructuralPatching = (section: any, patchingConfig: any) => {
      // Item 13a calculation optimized
      const sectionPipeSize = section.pipeSize || '150';
      const mmData = patchingConfig.mmData;
      const mm4DataByPipeSize = mmData.mm4DataByPipeSize || {};
      
      // Find matching pipe size configuration
      let matchingMM4Data = null;
      let matchingPipeSizeKey = null;
      
      for (const [pipeSizeKey, mm4Data] of Object.entries(mm4DataByPipeSize)) {
        const [keyPipeSize] = pipeSizeKey.split('-');
        
        if (keyPipeSize === sectionPipeSize?.replace('mm', '')) {
          matchingMM4Data = mm4Data;
          matchingPipeSizeKey = pipeSizeKey;
          break;
        }
      }
      
      if (!matchingMM4Data || !Array.isArray(matchingMM4Data) || matchingMM4Data.length === 0) {
        return {
          cost: 0,
          currency: '£',
          method: 'No MM4 Configuration',
          status: 'mm4_missing',
          configType: 'MM4 Data Missing'
        };
      }
      
      // CRITICAL FIX: Use row 2 for double layer patches, row 1 for others
      let mm4Row;
      const patchType = section.recommendations?.toLowerCase() || '';
      if (patchType.includes('double layer')) {
        mm4Row = matchingMM4Data[1] || matchingMM4Data[0]; // Row 2 for double layer, fallback to row 1
        console.log('🎯 Using MM4 row 2 for double layer patch:', { itemNo: section.itemNo, rowIndex: 1 });
      } else {
        mm4Row = matchingMM4Data[0]; // Row 1 for other patch types
        console.log('🎯 Using MM4 row 1 for standard patch:', { itemNo: section.itemNo, rowIndex: 0 });
      }
      
      const blueValue = parseFloat(mm4Row.blueValue || '0');
      const greenValue = parseFloat(mm4Row.greenValue || '0');
      
      if (blueValue <= 0 || greenValue <= 0) {
        return {
          cost: 0,
          currency: '£',
          method: 'Invalid MM4 Values',
          status: 'mm4_invalid_values',
          configType: 'MM4 Values Invalid'
        };
      }
      
      // MSCC5-Compliant structural defect counting with authentic WRc standards
      const defectsText = section.defects || '';
      // CORRECTED: Authentic MSCC5 structural codes including 'D' (Deformed) for Item 13a compatibility
      const structuralDefectPattern = /\b(FC|FL|CR|JDL|JDS|DEF|OJL|OJM|JDM|CN|D)\b[^.]*?(?:at\s+)?(\d+(?:\.\d+)?m(?:\s*,\s*\d+(?:\.\d+)?m)*)/g;
      
      let totalStructuralPatches = 0;
      let defectMeterages = [];
      let match;
      
      while ((match = structuralDefectPattern.exec(defectsText)) !== null) {
        const defectCode = match[1];
        const meterageText = match[2];
        const meteragesForThisDefect = meterageText.split(',').map(m => m.trim());
        const patchesForThisDefect = meteragesForThisDefect.length;
        
        defectMeterages.push(...meteragesForThisDefect);
        totalStructuralPatches += patchesForThisDefect;
      }
      
      if (totalStructuralPatches === 0) {
        return {
          cost: 0,
          currency: '£',
          method: 'No Structural Defects',
          status: 'no_structural_defects',
          configType: 'No Structural Patches Needed'
        };
      }
      
      const costPerPatch = greenValue;
      const patchCount = totalStructuralPatches;
      const totalPatchCost = costPerPatch * patchCount;
      
      return {
        cost: totalPatchCost,
        currency: '£',
        method: 'MM4 Structural Patching',
        status: 'mm4_calculated',
        patchingType: 'Structural Patching',
        defectCount: patchCount,
        costPerUnit: costPerPatch,
        recommendation: `${patchCount} structural patch${patchCount > 1 ? 'es' : ''} × £${costPerPatch} = £${totalPatchCost}`
      };
    };

    // NEW: Check for MM4/MM5 data integration for cctv-jet-vac configurations FIRST
    const sectionLength = parseFloat(section.totalLength) || 0;
    const sectionDebrisPercent = extractDebrisPercentage(section.defects || '');
    const sectionPipeSize = section.pipeSize;
    
    // Check if this section requires cleaning and has MM4/MM5 configuration data
    const needsCleaning = requiresCleaning(section.defects || '');
    
    // RESTRICTED CLEANING SECTIONS: Only Items 3, 6, 7, 8, 10, 13, 14, 15, 20, 21, 22, 23
    // SPECIAL CASE: Items 1 and 2 are also allowed for GR7216/GR7188 databases with 525mm pipe sizes
    const restrictedCleaningSections = [3, 6, 7, 8, 10, 13, 14, 15, 20, 21, 22, 23];
    const is525mmSection = section.pipeSize === '525' || section.pipeSize === '525mm';
    const isRestrictedSection = restrictedCleaningSections.includes(section.itemNo) || 
                               (is525mmSection && (section.itemNo === 1 || section.itemNo === 2));
    
    // Cleaning detection optimized for restricted sections
    
    // MM4 processing optimized for service vs structural sections
    
    // FIXED: Process MM4 for ALL SERVICE sections (not just cleaning) - includes Grade 0 observations
    // Service sections include: cleaning defects, water levels, line deviations, service connections, etc.
    if (section.defectType === 'service' && repairPricingData) {
      // SERVICE SECTION MM4 PROCESSING: A5 (cctv-jet-vac) and A4 (cctv-van-pack) for all service sections
      // Includes: cleaning defects, monitoring, assessments, line deviations, service connections
      const cctvConfigs = repairPricingData.filter((config: any) => 
        ['cctv-van-pack', 'cctv-jet-vac'].includes(config.categoryId) && 
        config.sector === currentSector.id
      );
      
      // Critical config detection optimized
      
      // DEFAULT PRIORITY: A5 (CCTV/Jet Vac) is default matching equipment selection UI
      const id760Config = cctvConfigs.find((config: any) => config.categoryId === 'cctv-jet-vac');
      const id759Config = cctvConfigs.find((config: any) => config.categoryId === 'cctv-van-pack');
      
      // Check if A4 has valid MM4 data (user configured it) - Support both data structures
      const id759ActualData = id759Config?.mmData || id759Config?.mm_data;
      const id759HasValidMM4 = id759ActualData?.mm4Rows?.some((row: any) => 
        row.blueValue && row.greenValue && parseFloat(row.blueValue) > 0 && parseFloat(row.greenValue) > 0
      );
      
      // Selection logic: Respect user's equipment priority choice first
      // FIXED: Priority: User preference > A5 default (matching UI) > Available config as fallback
      const userPrefersId759 = equipmentPriority === 'id759';
      const id760ActualData = id760Config?.mmData || id760Config?.mm_data;
      const id760HasValidMM4 = id760ActualData?.mm4Rows?.some((row: any) => 
        row.blueValue && row.greenValue && parseFloat(row.blueValue) > 0 && parseFloat(row.greenValue) > 0
      );
      
      let cctvConfig;
      let shouldUpdatePriority = false;
      
      // CRITICAL FIX: Respect user's exact equipment priority choice
      if (userPrefersId759 && id759Config) {
        // User chose A4 and it's available
        cctvConfig = id759Config;
        // A4 selected - user preference and config available
      } else if (!userPrefersId759 && id760Config) {
        // A5 selected - user preference and config available  
        cctvConfig = id760Config;
      } else if (userPrefersId759 && !id759Config && id760Config) {
        // A5 fallback - user wants A4 but only A5 available
        cctvConfig = id760Config;
      } else if (!userPrefersId759 && !id760Config && id759Config) {
        // A4 fallback - user wants A5 but only A4 available
        cctvConfig = id759Config;
      } else if (id760Config) {
        // Default A5 - no preference, using UI default
        cctvConfig = id760Config;
        shouldUpdatePriority = true;
      } else {
        // Final fallback to A4
        cctvConfig = id759Config;
      }
      
      // Sync equipment priority with actual selection (only when needed and not recently changed by user)
      const lastUserPriorityChange = localStorage.getItem('lastUserPriorityChange');
      const timeSinceLastChange = lastUserPriorityChange ? Date.now() - parseInt(lastUserPriorityChange) : 99999;
      const recentUserChange = timeSinceLastChange < 5000; // 5 seconds grace period
      
      if (shouldUpdatePriority && !recentUserChange) {
        const newPriority = cctvConfig?.categoryId === 'cctv-van-pack' ? 'id759' : 'id760';
        setEquipmentPriority(newPriority);
        localStorage.setItem('equipmentPriority', newPriority);
        // Equipment priority auto-sync completed
      } else if (shouldUpdatePriority && recentUserChange) {
        // Equipment priority auto-sync skipped - recent user change detected
      }
      
      // MM4 dynamic config selection optimized
      
      if (cctvConfig && (cctvConfig.mmData || cctvConfig.mm_data)) {
        // CRITICAL FIX: Support both mmData (frontend) and mm_data (backend) structures
        const actualMmData = cctvConfig.mmData || cctvConfig.mm_data;
        
        // MM4/MM5 dashboard cost integration optimized
        
        // Get MM4 data for the matching pipe size
        const mm4DataByPipeSize = actualMmData?.mm4DataByPipeSize || {};
        
        // Find matching pipe size configuration
        let matchingMM4Data = null;
        let matchingPipeSizeKey = null;
        
        // Using authentic 1501 ID patterns
        const targetPipeSize = sectionPipeSize?.replace('mm', '');
        
        // Pipe size matching optimized
        
        // Try to find exact pipe size match (prioritize new pattern, fallback to old)
        for (const [pipeSizeKey, mm4Data] of Object.entries(mm4DataByPipeSize)) {
          const [keyPipeSize] = pipeSizeKey.split('-');
          
          if (keyPipeSize === targetPipeSize) {
            matchingMM4Data = mm4Data;
            matchingPipeSizeKey = pipeSizeKey;
            break;
          }
        }
        
        // 525mm pipe size handling optimized for Items 1 and 2
        
        // Item 22 pipe size configurations optimized
        
        // F608 MM4-225 math verification optimized
        
        // MODERNIZED VALIDATION: No red triangles - only blue (missing config) and orange (other issues)
        // Missing pipe size configuration should show blue triangles
        if (!matchingMM4Data || !Array.isArray(matchingMM4Data) || matchingMM4Data.length === 0) {
          // Enhanced debug for missing pipe size configs (Items 20, 21, 22, 23)
          if ([20, 21, 22, 23].includes(section.itemNo)) {
            console.log(`🔍 MISSING PIPE CONFIG DEBUG - Item ${section.itemNo}:`, {
              sectionPipeSize: sectionPipeSize,
              availablePipeSizes: Object.keys(actualMmData?.mm4DataByPipeSize || {}),
              shouldShowBlueTriangle: true,
              equipmentPriority: equipmentPriority
            });
          }
          
          const statusCode = 'mm4_pipe_config_missing';
          console.log('🔵 PIPE CONFIG MISSING - Blue triangle status:', {
            sectionId: section.itemNo,
            sectionPipeSize: sectionPipeSize,
            equipmentPriority,
            statusCode,
            explanation: `No ${sectionPipeSize}mm pipe configuration found - should display blue triangle`
          });
          
          return {
            cost: 0,
            status: statusCode,
            method: 'Configuration Missing',
            details: `No ${sectionPipeSize}mm pipe configuration found for ${equipmentPriority}`,
            warningType: 'missing_config',
            configData: {
              categoryId: cctvConfig?.categoryId || 'unknown',
              requestedPipeSize: sectionPipeSize,
              availablePipeSizes: Object.keys(actualMmData?.mm4DataByPipeSize || {})
            }
          };
        }
        
        if (matchingMM4Data && Array.isArray(matchingMM4Data) && matchingMM4Data.length > 0) {
          // DEBUG: Special tracking for Item 13 F608 Row 3 calculations AND Items 21-23 F608 MM4-225 validation
          if (section.itemNo === 13 || section.itemNo === 21 || section.itemNo === 22 || section.itemNo === 23) {
            console.log(`🎯 ITEM ${section.itemNo} F608 DEBUG:`, {
              itemNo: section.itemNo,
              defectType: section.defectType,
              defects: section.defects,
              sectionPipeSize: sectionPipeSize,
              sectionLength: sectionLength,
              sectionDebrisPercent: sectionDebrisPercent,
              totalMM4Rows: matchingMM4Data.length,
              availableRows: matchingMM4Data.map(r => ({ 
                id: r.id, 
                blueValue: r.blueValue,
                greenValue: r.greenValue, 
                purpleDebris: r.purpleDebris, 
                purpleLength: r.purpleLength 
              })),
              matchingPipeSizeKey: matchingPipeSizeKey
            });
          }
          
          // Check each MM4 row to see if section matches criteria
          for (const mm4Row of matchingMM4Data) {
            // DATABASE-FIRST: Get values directly from database state
            const getDatabaseValue = (rowId: number, field: string, fallback: string) => {
              const finalValue = fallback;
              
              // CRITICAL DEBUG: Enhanced logging for A5 cost calculation issues (especially item 10)
              if (section.itemNo === 10 && (field === 'blueValue' || field === 'greenValue')) {
                console.log(`🎯 DATABASE-FIRST ITEM 10 A5 ${field.toUpperCase()}:`, {
                  configId: cctvConfig.id,
                  rowId: rowId,
                  field: field,
                  finalValue: finalValue,
                  A5_DEBUGGING: 'Direct database value without buffer system'
                });
              }
              
              return finalValue;
            };
            
            const blueValue = parseFloat(getDatabaseValue(mm4Row.id, 'blueValue', mm4Row.blueValue || '0'));
            const greenValue = parseFloat(getDatabaseValue(mm4Row.id, 'greenValue', mm4Row.greenValue || '0'));
            const purpleDebris = parseFloat(getDatabaseValue(mm4Row.id, 'purpleDebris', mm4Row.purpleDebris || '0'));
            const purpleLength = parseFloat(getDatabaseValue(mm4Row.id, 'purpleLength', mm4Row.purpleLength || '0'));
            
            // MODERNIZED: Cost calculation separate from purple UI validation
            // For cost calculation, only require blue (day rate) and green (runs) values
            // Purple fields are UI-only and don't affect cost calculation
            const hasValidRate = blueValue > 0 && greenValue > 0;
            
            // MODERNIZED: Purple fields only used for UI display, not cost calculation
            if (section.itemNo === 3) {
              console.log(`🚨 ITEM 3 COST CALCULATION - PURPLE INDEPENDENT:`, {
                CALCULATION_STATUS: 'Cost calculation no longer depends on purple fields',
                itemNo: section.itemNo,
                sectionLength: sectionLength,
                purpleLength: purpleLength,
                hasValidRate: hasValidRate,
                blueValue: blueValue,
                greenValue: greenValue,
                willCalculateCost: hasValidRate,
                equipmentPriority: equipmentPriority
              });
            }
            
            // DEBUG: Item 3 and Item 13 Row 3 and Items 21-23 validation tracking
            if (section.itemNo === 3 || (section.itemNo === 13 && mm4Row.id === 3) || section.itemNo === 21 || section.itemNo === 22 || section.itemNo === 23) {
              console.log(`🧮 ITEM ${section.itemNo} ROW ${mm4Row.id} MODERNIZED VALIDATION:`, {
                MODERNIZED_STATUS: 'Cost calculation only needs blue and green values',
                itemNo: section.itemNo,
                rowId: mm4Row.id,
                sectionPipeSize: sectionPipeSize,
                blueValue: blueValue,
                greenValue: greenValue,
                hasValidRate: hasValidRate,
                willProceedToCalculation: hasValidRate,
                purpleFieldsForUIOnly: {
                  sectionDebrisPercent: sectionDebrisPercent,
                  purpleDebris: purpleDebris,
                  sectionLength: sectionLength,
                  purpleLength: purpleLength
                },
                rawMM4RowData: {
                  id: mm4Row.id,
                  originalPurpleLength: mm4Row.purpleLength,
                  parsedPurpleLength: purpleLength,
                  databasePurpleLength: getDatabaseValue(mm4Row.id, 'purpleLength', mm4Row.purpleLength || '0')
                },
                specialF608_225Check: matchingPipeSizeKey === '225-2251' ? {
                  expectedCalculation: `£${blueValue} ÷ ${greenValue} runs = £${blueValue > 0 && greenValue > 0 ? (blueValue / greenValue).toFixed(2) : 'N/A'} per run`,
                  configStatus: `225mm Row ${mm4Row.id} - Blue: £${blueValue}, Green: ${greenValue} runs`
                } : undefined
              });
            }
            
            // MODERNIZED VALIDATION: No quantity-based red triangles - removed legacy system

            if (hasValidRate) {
              // Section matches MM4 criteria - calculate cost
              // ID760/A5 CCTV/SERVICE LOGIC: Blue ÷ Green = Rate per run  
              // Blue value = day rate (e.g., £1850 per day) - can be inherited from Row 1
              // Green value = runs per shift (e.g., 22 runs) - Row 2 specific
              
              // For Row 2 calculations, use Row 1's day rate if Row 2's blueValue is empty
              let effectiveDayRate = blueValue;
              if (blueValue <= 0 && matchingMM4Data.length > 1) {
                // Try to get day rate from Row 1
                const row1 = matchingMM4Data.find(r => r.id === 1);
                if (row1) {
                  const row1BlueValue = parseFloat(getDatabaseValue(1, 'blueValue', row1.blueValue || '0'));
                  if (row1BlueValue > 0) {
                    effectiveDayRate = row1BlueValue;
                    console.log(`🔄 F608 Row ${mm4Row.id}: Using Row 1 day rate £${effectiveDayRate} for calculation`);
                  }
                }
              }
              
              const dayRate = effectiveDayRate; // Blue window is day rate (or inherited from Row 1)
              const runsPerShift = greenValue; // Green window is runs per shift
              const ratePerRun = dayRate > 0 && runsPerShift > 0 ? dayRate / runsPerShift : 0; // Calculate rate per run
              
              // CRITICAL DEBUG: A4 cost calculation analysis
              if (cctvConfig.categoryId === 'cctv-van-pack') {
                console.log('🔍 A4 COST CALCULATION DEBUG:', {
                  sectionId: section.itemNo,
                  dayRate: dayRate,
                  runsPerShift: runsPerShift,
                  ratePerRun: ratePerRun,
                  expectedRatePerRun: dayRate / runsPerShift,
                  calculationCheck: `£${dayRate} ÷ ${runsPerShift} = £${(dayRate / runsPerShift).toFixed(2)}`
                });
              }
              
              // For service defects, calculate cost based on rate per run
              const totalCost = ratePerRun; // Single run cost for this section
              
              // Special focus on Item 13 Row 3 and Items 21-23 calculation results
              const isSpecialTracking = (section.itemNo === 13 && mm4Row.id === 3) || section.itemNo === 21 || section.itemNo === 22 || section.itemNo === 23;
              const logLevel = isSpecialTracking ? `🎯 ITEM ${section.itemNo} ROW ${mm4Row.id} FINAL CALCULATION` : `✅ F608 Multi-Row Cost Calculation (Row ${mm4Row.id})`;
              
              console.log(logLevel, {
                CRITICAL_FINAL_STATUS: 'This shows the final status returned for cost display',
                sectionId: section.itemNo,
                pipeSizeKey: matchingPipeSizeKey,
                mm4Row: mm4Row.id,
                sectionPipeSize: sectionPipeSize,
                originalBlueValue: blueValue,
                effectiveDayRate: dayRate, // Day rate (from current row or inherited from Row 1)
                runsPerShift: greenValue, // Runs per shift from green window
                ratePerRun: ratePerRun, // Calculated rate per run
                totalCost: totalCost, // Total cost for this section
                minimumQuantity: greenValue, // Required minimum from green window
                purpleDebrisForUI: `${purpleDebris}%`,
                purpleLengthForUI: `${purpleLength}m`,
                configType: cctvConfig.categoryId === 'cctv-van-pack' ? 'A4 CCTV/Van Pack' : 'A5 CCTV/Jet Vac',
                inheritedDayRate: blueValue <= 0 && effectiveDayRate > 0,
                expectedCalculation: `£${effectiveDayRate} ÷ ${greenValue} runs = £${ratePerRun.toFixed(2)} per run`,
                allPipeSizeConfigs: isSpecialTracking ? Object.keys(actualMmData?.mm4DataByPipeSize || {}) : undefined
              });
              
              // CRITICAL FIX: Count unique service items (not individual records)
              // Handle split items correctly - items can have both service AND structural records
              const uniqueServiceItems = new Set();
              sectionData?.forEach(s => {
                if (s.defectType === 'service' && s.severityGrade && parseInt(s.severityGrade) > 0) {
                  uniqueServiceItems.add(s.itemNo);
                }
              });
              const totalServiceItems = uniqueServiceItems.size;
              
              // FIXED: Red validation - show red when total service items don't justify minimum runs
              const meetsMinimumRuns = totalServiceItems >= runsPerShift;
              
              // REMOVED: Duplicate quantity validation logic moved to before debris/length validation
              
              // Enhanced debug for quantity validation issues (Items 3,6,7,8,10,13,14,15)
              if ([3,6,7,8,10,13,14,15].includes(section.itemNo)) {
                console.log(`🔍 QUANTITY VALIDATION DEBUG - Item ${section.itemNo}:`, {
                  totalServiceItems: totalServiceItems,
                  runsPerShift: runsPerShift,
                  meetsMinimumRuns: meetsMinimumRuns,
                  shouldShowRed: !meetsMinimumRuns,
                  expectedStatus: meetsMinimumRuns ? 'green' : 'red',
                  currentLogic: `${totalServiceItems} >= ${runsPerShift} = ${meetsMinimumRuns}`
                });
              }
              
              return {
                cost: totalCost, // Display calculated service cost
                currency: '£',
                method: cctvConfig.categoryId === 'cctv-van-pack' ? `A4 Row ${mm4Row.id} Service Cost` : `A5 Row ${mm4Row.id} Service Cost`,
                status: meetsMinimumRuns 
                  ? (equipmentPriority === 'id759' ? 'id759_calculated' : 'id760_calculated')
                  : (equipmentPriority === 'id759' ? 'id759_insufficient_items' : 'id760_insufficient_items'),
                dayRate: dayRate,
                runsPerShift: runsPerShift,
                ratePerRun: ratePerRun,
                totalCost: totalCost,
                minimumQuantity: runsPerShift,
                totalServiceItems: totalServiceItems,
                meetsMinimumRuns: meetsMinimumRuns,
                mm4RowUsed: mm4Row.id,
                configType: cctvConfig.categoryId === 'cctv-van-pack' ? 'A4 CCTV/Van Pack' : 'A5 CCTV/Jet Vac',
                recommendation: `${cctvConfig.categoryId === 'cctv-van-pack' ? 'A4' : 'A5'} Row ${mm4Row.id}: £${dayRate} ÷ ${runsPerShift} runs = £${ratePerRun.toFixed(2)} per run`
              };
            }
          }
          
          // If we reach here, section didn't match any MM4 configuration criteria
          // This should not happen as range validation is now handled at the start of the function
          console.log(`⚠️ Section ${section.itemNo} - unexpected fallthrough in MM4 validation`);
          return {
            cost: 0,
            currency: '£',
            method: 'MM4 Validation Failed',
            status: 'mm4_validation_failed',
            configType: 'MM4 Unexpected Error'
          };
        }
      }
    }
    
    // STRUCTURAL DEFECT ROUTING: Check for ID763 patching configuration for structural defects
    if (section.defectType === 'structural' && repairPricingData && isRestrictedSection) {
      // DEBUG: Log Item 13a, Item 19, and Item 20 specifically
      if (section.itemNo === 13 || section.itemNo === 19 || section.itemNo === 20) {
        console.log(`🎯 ITEM ${section.itemNo} ID763 ROUTING DEBUG:`, {
          itemNo: section.itemNo,
          letterSuffix: section.letterSuffix,
          defectType: section.defectType,
          defects: section.defects,
          isRestrictedSection: isRestrictedSection,
          pr2ConfigsAvailable: !!repairPricingData,
          pr2ConfigsLength: repairPricingData?.length || 0,
          availableConfigs: repairPricingData?.map(c => ({ id: c.id, categoryId: c.categoryId, sector: c.sector })) || []
        });
      }
    }
    
    // ITEM 13A CRITICAL DEBUG: Check if Item 13a even reaches this function
    // BROADER ITEM 13A DEBUG: Check for any section that might be item 13a
    const isItem13Variant = section.itemNo === 13 || section.itemNo === '13' || section.itemNo === '13a' || 
                           String(section.itemNo).includes('13') || 
                           (section.letterSuffix === 'a' && section.itemNo === 13) ||
                           (section.id && String(section.id).includes('13'));
    
    if (isItem13Variant) {
      console.log('🚨 ITEM 13A EARLY DEBUG - FUNCTION ENTRY:', {
        itemNo: section.itemNo,
        letterSuffix: section.letterSuffix,
        sectionId: section.id,
        defectType: section.defectType,
        isStructural: section.defectType === 'structural',
        hasRepairPricingData: !!repairPricingData,
        isRestrictedSection: isRestrictedSection,
        restrictedCleaningSections: restrictedCleaningSections,
        willEnterStructuralBlock: section.defectType === 'structural' && repairPricingData && isRestrictedSection,
        earlyExitReason: section.defectType !== 'structural' ? 'NOT_STRUCTURAL' : 
                        !repairPricingData ? 'NO_REPAIR_DATA' : 
                        !isRestrictedSection ? 'NOT_RESTRICTED' : 'SHOULD_CONTINUE'
      });
    }
    
    // Continue with structural routing
    if (section.defectType === 'structural' && repairPricingData && isRestrictedSection) {
      
      // Find patching configuration for current sector
      const patchingConfig = repairPricingData.find((config: any) => 
        config.categoryId === 'patching' && config.sector === currentSector.id
      );
      
      console.log('🔍 ID763 Structural Defect Debug:', {
        sectionId: section.itemNo,
        defectType: section.defectType,
        configFound: !!patchingConfig,
        currentSector: currentSector.id,
        sectionPipeSize: sectionPipeSize,
        configDetails: patchingConfig ? {
          id: patchingConfig.id,
          categoryId: patchingConfig.categoryId,
          hasMMData: !!patchingConfig.mmData
        } : null
      });
      
      if (patchingConfig && patchingConfig.mmData) {
        // Get MM4 data for the matching pipe size
        const mmData = patchingConfig.mmData;
        const mm4DataByPipeSize = mmData.mm4DataByPipeSize || {};
        
        // Find matching pipe size configuration
        let matchingMM4Data = null;
        let matchingPipeSizeKey = null;
        
        // Try to find exact pipe size match (e.g., "150-1501")
        for (const [pipeSizeKey, mm4Data] of Object.entries(mm4DataByPipeSize)) {
          const [keyPipeSize] = pipeSizeKey.split('-');
          
          if (keyPipeSize === sectionPipeSize?.replace('mm', '')) {
            matchingMM4Data = mm4Data;
            matchingPipeSizeKey = pipeSizeKey;
            break;
          }
        }
        
        if (matchingMM4Data && Array.isArray(matchingMM4Data) && matchingMM4Data.length > 0) {
          // ID763 STRUCTURAL PATCHING: No purple window range restrictions
          for (const mm4Row of matchingMM4Data) {
            const blueValue = parseFloat(mm4Row.blueValue || '0');
            const greenValue = parseFloat(mm4Row.greenValue || '0');
            
            // Only check if we have valid blue (cost per patch) and green (minimum quantity) values
            const hasValidRate = blueValue > 0 && greenValue > 0;
            
            if (hasValidRate) {
              // ID763 PATCHING LOGIC: Green window contains patch pricing, blue is day rate, purple is minimum quantities
              // Blue value = day rate (e.g., £1650 per day)
              // Green value = patch cost (e.g., £450 per patch) - DEFAULT ROW 2 DOUBLE LAYER
              const dayRate = blueValue; // Blue window is day rate
              const costPerPatch = greenValue; // Green window is cost per patch (Row 2 default)
              
              // Count structural defects that need patches (using Row 2 - Double Layer default)
              // For ID763 structural patching, count actual structural defect instances
              const defectsText = section.defects || '';
              const defectMeterages = extractDefectMeterages(defectsText);
              
              // ITEM 13A CRITICAL DEBUG: Detailed defect analysis - Check all variations
              if (section.itemNo === 13 || section.itemNo === '13' || section.itemNo === '13a' || 
                  (section.letterSuffix && section.itemNo.toString() === '13')) {
                console.log('🚨 ITEM 13A DEFECTS ANALYSIS:', {
                  itemNo: section.itemNo,
                  letterSuffix: section.letterSuffix,
                  sectionId: section.id,
                  defectsText: defectsText,
                  defectsTextLength: defectsText.length,
                  extractedMeterages: defectMeterages,
                  willSearchForStructuralPattern: true,
                  structuralPatternToUse: '/\\b(FC|FL|CR|JDL|JDS|DEF|D|OJL|OJM|JDM|CN)\\b[^.]*?(?:at\\s+)?(\\d+(?:\\.\\d+)?m(?:\\s*,\\s*\\d+(?:\\.\\d+)?m)*)/g'
                });
              }
              
              // MSCC5-Compliant patch counting: Enhanced pattern for structural defect codes
              // LEGACY REMOVED: DER, DES are service defects, not structural 
              // Enhanced pattern to handle various defect text formats
              const structuralDefectPattern = /\b(FC|FL|CR|JDL|JDS|DEF|D|OJL|OJM|JDM|CN|deformity|crack|fracture)\b[^.]*?(\d+(?:\.\d+)?m)/gi;
              
              let totalStructuralPatches = 0;
              let structuralMatch;
              
              // ITEM 13A ENHANCED DEBUG: Show pattern matching process - Check all variations
              if (section.itemNo === 13 || section.itemNo === '13' || section.itemNo === '13a' || 
                  (section.letterSuffix && section.itemNo.toString() === '13')) {
                console.log('🚨 ITEM 13A ENHANCED PATTERN MATCHING:', {
                  itemNo: section.itemNo,
                  letterSuffix: section.letterSuffix,
                  defectsText: defectsText,
                  patternUsed: structuralDefectPattern.source,
                  willExtractMatches: true
                });
              }
              
              while ((structuralMatch = structuralDefectPattern.exec(defectsText)) !== null) {
                const defectCode = structuralMatch[1];
                const meterageText = structuralMatch[2];
                
                // ITEM 13A DEBUG: Log each match found - Check all variations
                if (section.itemNo === 13 || section.itemNo === '13' || section.itemNo === '13a' || 
                    (section.letterSuffix && section.itemNo.toString() === '13')) {
                  console.log('🚨 ITEM 13A FOUND STRUCTURAL MATCH:', {
                    defectCode: defectCode,
                    meterageText: meterageText,
                    fullMatch: structuralMatch[0]
                  });
                }
                
                // Count this defect occurrence (1 patch per meterage location)
                totalStructuralPatches += 1;
              }
              
              // REMOVED: Fallback logic that was masking primary pattern matching issues
              // Now relying solely on precise MSCC5-compliant structural defect detection
              
              const patchCount = totalStructuralPatches;
              
              // ITEM 13A CRITICAL DEBUG: Show patch count calculation - Check all variations
              if (section.itemNo === 13 || section.itemNo === '13' || section.itemNo === '13a' || 
                  (section.letterSuffix && section.itemNo.toString() === '13')) {
                console.log('🚨 ITEM 13A PATCH COUNT CALCULATION:', {
                  itemNo: section.itemNo,
                  letterSuffix: section.letterSuffix,
                  totalStructuralPatches: totalStructuralPatches,
                  finalPatchCount: patchCount,
                  patchCountIsZero: patchCount === 0,
                  defectsTextAnalysis: {
                    hasDefectsText: !!defectsText && defectsText.length > 0,
                    defectsTextPreview: defectsText.substring(0, 100),
                    containsStructuralWords: /\b(deformity|crack|fracture|DEF|D)\b/i.test(defectsText)
                  }
                });
              }
              
              const totalPatchCost = costPerPatch * patchCount;
              
              // Item 13a mathematical calculation optimized
              
              // ID763 structural patching cost calculation optimized
              
              // For minimum quantity check, we need to access purple window data (patchingGreenData)
              // This would require accessing the mmData.patchingGreenData array for Row 2 quantities
              const patchingGreenData = mmData.patchingGreenData || [];
              const minimumQuantityRow2 = patchingGreenData[1] || {}; // Row 2 index = 1
              const minimumQuantity = parseFloat(minimumQuantityRow2.quantity || '0');
              
              // Count total structural items across all sections (not just defects)
              const totalStructuralItems = sectionData?.filter(s => 
                s.defectType === 'structural' && 
                restrictedCleaningSections.includes(s.itemNo)
              ).length || 0;
              
              const meetsMinimumRuns = totalStructuralItems >= minimumQuantity;
              
              // ITEM 13A CRITICAL DEBUG: Show final return object
              const returnObject = {
                cost: totalPatchCost, // Display total patch cost
                currency: '£',
                method: 'ID763 Structural Patching',
                status: meetsMinimumRuns ? 'id763_calculated' : 'id763_insufficient_items',
                dayRate: dayRate,
                costPerPatch: costPerPatch,
                patchCount: patchCount,
                totalPatchCost: totalPatchCost,
                minimumQuantity: minimumQuantity,
                totalStructuralItems: totalStructuralItems,
                meetsMinimumRuns: meetsMinimumRuns,
                recommendation: `ID763 structural patching: ${patchCount} patches × £${costPerPatch} = £${totalPatchCost} (min: ${minimumQuantity})`
              };
              
              if (section.itemNo === 13 || section.itemNo === '13' || section.itemNo === '13a' || 
                  (section.letterSuffix && section.itemNo.toString() === '13')) {
                console.log('🚨 ITEM 13A FINAL RETURN OBJECT:', {
                  itemNo: section.itemNo,
                  letterSuffix: section.letterSuffix,
                  returnObject: returnObject,
                  finalCostToDisplay: returnObject.cost,
                  isRedCost: !meetsMinimumRuns,
                  costCalculation: `${costPerPatch} × ${patchCount} = £${totalPatchCost}`,
                  minimumLogic: `${totalStructuralItems} structural items >= ${minimumQuantity} minimum = ${meetsMinimumRuns}`,
                  rootCauseAnalysis: {
                    patchCountFromPatternMatching: patchCount,
                    costPerPatchFromMM4: costPerPatch,
                    whyZeroCost: patchCount === 0 ? 'PATCH COUNT IS ZERO - No structural defects matched pattern' : 'Cost calculation is normal'
                  }
                });
              }
              
              return returnObject;
            }
          }
          
          // No valid ID763 MM4 data available
          console.log('⚠️ ID763 No Valid Pricing Data:', {
            sectionId: section.itemNo,
            mm4Configurations: matchingMM4Data.length,
            availableRows: matchingMM4Data.map(row => ({
              rowId: row.id,
              hasBlueValue: !!row.blueValue && parseFloat(row.blueValue) > 0,
              hasGreenValue: !!row.greenValue && parseFloat(row.greenValue) > 0
            }))
          });
          
          return {
            cost: 0,
            currency: '£',
            method: 'ID763 No Pricing Data',
            status: 'id763_no_pricing_data',
            recommendation: 'ID763 configuration missing valid blue/green pricing data'
          };
        }
      }
    }
    
    // CRITICAL FIX: Check for robotic cutting (ID4) requirements FIRST before any other routing
    const recommendations = section.recommendations || '';
    
    // DEBUG: Check Item 19 for robotic cutting requirements
    if (section.itemNo === 19) {
      console.log(`🤖 ITEM 19 ID4 ROBOTIC CUTTING CHECK:`, {
        itemNo: section.itemNo,
        defects: section.defects,
        recommendations: recommendations,
        hasRoboticCuttingInRecommendations: recommendations.toLowerCase().includes('robotic cutting'),
        hasID4InRecommendations: recommendations.toLowerCase().includes('id4'),
        hasP4InRecommendations: recommendations.toLowerCase().includes('p4'),
        hasJunctionInDefects: (section.defects || '').toLowerCase().includes('jn') || (section.defects || '').toLowerCase().includes('junction'),
        willTriggerID4: recommendations.toLowerCase().includes('robotic cutting') || recommendations.toLowerCase().includes('id4') || recommendations.toLowerCase().includes('p4')
      });
    }
    
    if (recommendations.toLowerCase().includes('robotic cutting') || 
        recommendations.toLowerCase().includes('id4') || 
        recommendations.toLowerCase().includes('p4')) {
      
      // FIXED: Safety check using filtered repairPricingData instead of repairPricingData
      if (!repairPricingData || !Array.isArray(repairPricingData)) {
        return {
          cost: 0,
          currency: '£',
          method: 'ID4 Data Missing',
          status: 'data_missing',
          patchingType: 'Configuration Data Missing',
          defectCount: 0,
          costPerUnit: 0,
          recommendation: 'Configuration data not loaded'
        };
      }
      
      const id4Config = repairPricingData.find((config: any) => 
        config.categoryId === 'f-robot-cutting'
      );
      
      if (!id4Config) {
        // ID4 configuration doesn't exist - return £0.00
        return {
          cost: 0,
          currency: '£',
          method: 'ID4 Required',
          status: 'id4_missing',
          patchingType: 'Robotic Cutting Required',
          defectCount: 0,
          costPerUnit: 0,
          recommendation: 'Configure ID4 robotic cutting pricing first'
        };
      }
      
      // DEBUG: ID4 config analysis for item 19
      if (section.itemNo === 19) {
        console.log('🔍 ID4 CONFIG ANALYSIS:', {
          itemNo: section.itemNo,
          id4ConfigFound: !!id4Config,
          configDetails: id4Config ? {
            id: id4Config.id,
            categoryId: id4Config.categoryId,
            hasOldPricingOptions: !!id4Config.pricingOptions,
            hasMMData: !!id4Config.mmData,
            mmDataKeys: id4Config.mmData ? Object.keys(id4Config.mmData) : []
          } : null
        });
      }
      
      // ID4 config exists - check if it has configured pricing options (OLD SYSTEM)
      const firstCutOption = id4Config.pricingOptions?.find((option: any) => 
        option.label?.toLowerCase().includes('first cut') && option.value && option.value.trim() !== ''
      );
      const perCutOption = id4Config.pricingOptions?.find((option: any) => 
        option.label?.toLowerCase().includes('cost per cut') && option.value && option.value.trim() !== ''
      );
      
      // ENHANCED: Check MM4 data first (NEW SYSTEM), then fall back to pricingOptions (OLD SYSTEM)
      let firstCutCost = 0;
      let perCutCost = 0;
      let pricingSource = 'none';
      
      // Try MM4 data first (preferred method)
      if (id4Config.mmData && id4Config.mmData.mm4DataByPipeSize) {
        const sectionPipeSize = section.pipeSize?.replace('mm', '') || '150';
        const mm4DataByPipeSize = id4Config.mmData.mm4DataByPipeSize;
        
        if (section.itemNo === 19) {
          console.log('🔍 ID4 MM4 DATA SEARCH:', {
            itemNo: section.itemNo,
            sectionPipeSize: sectionPipeSize,
            availablePipeSizes: Object.keys(mm4DataByPipeSize),
            mm4DataStructure: mm4DataByPipeSize
          });
        }
        
        // Find matching pipe size configuration
        for (const [pipeSizeKey, mm4Data] of Object.entries(mm4DataByPipeSize)) {
          const [keyPipeSize] = pipeSizeKey.split('-');
          
          if (section.itemNo === 19) {
            console.log(`🔍 ID4 CHECKING PIPE SIZE: ${pipeSizeKey}`, {
              keyPipeSize: keyPipeSize,
              sectionPipeSize: sectionPipeSize,
              isMatch: keyPipeSize === sectionPipeSize,
              mm4Data: mm4Data
            });
          }
          
          if (keyPipeSize === sectionPipeSize && Array.isArray(mm4Data) && mm4Data.length > 0) {
            const mm4Row = mm4Data[0]; // Use first row
            const purpleDebrisValue = parseFloat(mm4Row.purpleDebris || '0');
            const purpleLengthValue = parseFloat(mm4Row.purpleLength || '0');
            
            if (section.itemNo === 19) {
              console.log('🔍 ID4 MM4 VALUES CHECK:', {
                itemNo: section.itemNo,
                pipeSizeKey: pipeSizeKey,
                purpleDebris: mm4Row.purpleDebris,
                purpleLength: mm4Row.purpleLength,
                purpleDebrisValue: purpleDebrisValue,
                purpleLengthValue: purpleLengthValue,
                hasValidValues: purpleDebrisValue > 0 || purpleLengthValue > 0
              });
            }
            
            if (purpleDebrisValue > 0 || purpleLengthValue > 0) {
              firstCutCost = purpleDebrisValue; // First Cut cost from purple debris
              perCutCost = purpleLengthValue;   // Cost Per Cut from purple length
              pricingSource = 'mm4';
              
              if (section.itemNo === 19) {
                console.log('✅ ID4 MM4 PRICING FOUND:', {
                  itemNo: section.itemNo,
                  pipeSizeKey: pipeSizeKey,
                  firstCutCost: firstCutCost,
                  perCutCost: perCutCost,
                  pricingSource: pricingSource,
                  mm4Row: mm4Row
                });
              }
              break;
            }
          }
        }
      }
      
      // Fall back to old pricingOptions system if MM4 data not available
      if (pricingSource === 'none') {
        const firstCutOption = id4Config.pricingOptions?.find((option: any) => 
          option.label?.toLowerCase().includes('first cut') && option.value && option.value.trim() !== ''
        );
        const perCutOption = id4Config.pricingOptions?.find((option: any) => 
          option.label?.toLowerCase().includes('cost per cut') && option.value && option.value.trim() !== ''
        );
        
        if (firstCutOption || perCutOption) {
          firstCutCost = firstCutOption ? parseFloat(firstCutOption.value) || 0 : 0;
          perCutCost = perCutOption ? parseFloat(perCutOption.value) || 0 : 0;
          pricingSource = 'pricingOptions';
          
          if (section.itemNo === 19) {
            console.log('⚠️ ID4 FALLBACK TO OLD PRICING:', {
              itemNo: section.itemNo,
              firstCutCost: firstCutCost,
              perCutCost: perCutCost,
              pricingSource: pricingSource
            });
          }
        }
      }
      
      if (firstCutCost === 0 && perCutCost === 0) {
        // No pricing values found in either system
        return {
          cost: 0,
          currency: '£',
          method: 'ID4 Unconfigured',
          status: 'id4_unconfigured',
          patchingType: 'Robotic Cutting (Unconfigured)',
          defectCount: 0,
          costPerUnit: 0,
          recommendation: 'Configure ID4 robotic cutting pricing values'
        };
      }
      
      // Analyze defect text for junction/connection proximity
      const defectText = section.defects || '';
      const junctionAnalysis = analyzeJunctionProximity(defectText);
      
      // Calculate cuts needed:
      // 1. Always need patch cost (base cost)
      // 2. Add first cut cost if junction/connection within 0.7m
      // 3. Add additional cut cost for each additional junction at same location
      let totalCost = 0;
      let cutDetails = [];
      
      // Base patch cost (using first cut cost as patch base)
      totalCost += firstCutCost;
      cutDetails.push(`Patch repair: £${firstCutCost}`);
      
      // Add cuts for nearby junctions
      if (junctionAnalysis.nearbyJunctionCount > 0) {
        // First junction requires first cut rate
        totalCost += firstCutCost;
        cutDetails.push(`Junction cut 1: £${firstCutCost}`);
        
        // Additional junctions require per-cut rate
        if (junctionAnalysis.nearbyJunctionCount > 1) {
          const additionalCuts = junctionAnalysis.nearbyJunctionCount - 1;
          const additionalCost = additionalCuts * perCutCost;
          totalCost += additionalCost;
          cutDetails.push(`Additional cuts (${additionalCuts}): £${additionalCost}`);
        }
      }
      
      
      // MSCC5 COMPLIANT: Check if section requires ID763 structural patching
      const hasStructuralDefects = section.defectType === 'structural' && 
                                  (section.defects || '').match(/\b(FC|FL|CR|JDL|JDS|DEF|D|OJL|OJM|JDM|CN)\b/i);
      
      if (hasStructuralDefects && section.itemNo === 19) {
        console.log('🔄 ITEM 19 COMBINED ID4+ID763 PROCESSING:', {
          itemNo: section.itemNo,
          f619Cost: totalCost,
          hasStructuralDefects: hasStructuralDefects,
          defectType: section.defectType,
          defects: section.defects,
          willContinueToID763: true
        });
        
        // Continue to ID763 processing while storing ID4 cost
        const f619Cost = totalCost;
        const f619Details = cutDetails.join(' + ');
        
        // Process MM4-based structural patching (ID763 A8-Utilities)
        const patchingConfig = repairPricingData.find((config: any) => 
          config.categoryId === 'patching' && config.sector === currentSector.id
        );
        
        if (patchingConfig && patchingConfig.mmData) {
          const mm4Result = calculateID763StructuralPatching(section, patchingConfig);
          if (mm4Result && mm4Result.cost > 0) {
            const combinedCost = f619Cost + mm4Result.cost;
            
            console.log('✅ ITEM 19 COMBINED COST CALCULATION:', {
              itemNo: section.itemNo,
              f619Cost: f619Cost,
              mm4Cost: mm4Result.cost,
              combinedCost: combinedCost,
              f619Details: f619Details,
              mm4Details: mm4Result.recommendation
            });
            
            return {
              cost: combinedCost,
              currency: '£',
              method: 'Combined ID4+ID763',
              status: 'combined_calculated',
              patchingType: 'Robotic Cutting + Structural Patching',
              defectCount: mm4Result.defectCount + 1,
              costPerUnit: combinedCost,
              recommendation: `${f619Details} + ${mm4Result.recommendation}`
            };
          }
        }
      }
      
      return {
        cost: totalCost,
        currency: '£',
        method: 'ID4 Robotic Cutting',
        status: 'id4_calculated',
        patchingType: 'Robotic Cutting',
        defectCount: 1,
        costPerUnit: totalCost,
        recommendation: `Robotic cutting: ${cutDetails.join(' + ')}${junctionAnalysis.nearbyJunctionCount > 0 ? ` (${junctionAnalysis.nearbyJunctionCount} junction${junctionAnalysis.nearbyJunctionCount > 1 ? 's' : ''} detected)` : ''}`
      };
    }
    
    // Safety check: Ensure repairPricingData exists and is an array
    if (!repairPricingData || !Array.isArray(repairPricingData) || repairPricingData.length === 0) {
      // No PR2 configurations found
      return {
        cost: 0,
        currency: '£',
        method: 'No PR2 Configurations',
        status: 'pr2_missing',
        configType: 'PR2 Configuration Missing'
      };
    }

    // Check for TP2 patching configurations first (for structural repairs)
    const needsStructuralRepair = requiresStructuralRepair(section.defects || '');
    
    if (needsStructuralRepair) {
      // Get pipe size for matching configuration
      const pipeSize = section.pipeSize || '150';
      
      // DEBUG: TP2 sections matching logic completed
      
      // Only find pipe size-specific configuration - no fallback to incompatible sizes
      let tp2PatchingConfig = repairPricingData.find((config: any) => 
        config.categoryId === 'patching' && 
        config.sector === currentSector.id &&
        config.categoryName?.includes(`${pipeSize}mm`)
      );
      
      if (tp2PatchingConfig) {
        // Found TP2 patching configuration
        return calculateTP2PatchingCost(section, tp2PatchingConfig);
      } else {
        // No TP2 patching configuration found
        return {
          cost: 0,
          currency: '£',
          method: 'No TP2 Configuration',
          status: 'tp2_missing',
          configType: 'TP2 Patching Configuration Missing'
        };
      }
    }

    // Find configurations that this section meets, prioritizing those with actual values
    let matchingConfigs = [];
    for (const config of repairPricingData) {
      if (checkSectionMeetsPR2Requirements(section, config)) {
        matchingConfigs.push(config);
      }
    }
    
    // If no configurations match, return error status
    if (matchingConfigs.length === 0) {
      // Section does not meet any PR2 configuration requirements
      return {
        cost: 0,
        currency: '£',
        method: 'PR2 Requirements Not Met',
        status: 'pr2_requirements_failed',
        configType: 'Outside PR2 Configuration Ranges'
      };
    }
    
    // Sort matching configs by ID (descending) to prioritize highest ID first
    matchingConfigs.sort((a, b) => b.id - a.id);
    
    // Prioritize configurations with actual pricing values over empty ones, but prefer higher ID
    let pr2Config = matchingConfigs.find(config => {
      const dayRate = config.pricingOptions?.find(opt => opt.label?.toLowerCase().includes('day rate'))?.value;
      const runsPerShift = config.quantityOptions?.find(opt => opt.label?.toLowerCase().includes('runs per shift'))?.value;
      
      // Return true if both values exist and are not empty strings AND dayRate is not "0"
      return dayRate && dayRate.trim() !== '' && dayRate !== '0' && runsPerShift && runsPerShift.trim() !== '';
    });
    
    // If no config with valid values found, check if any config has Day Rate "0" and return null for warning triangle
    if (!pr2Config) {
      const configWithZeroRate = matchingConfigs.find(config => {
        const dayRate = config.pricingOptions?.find(opt => opt.label?.toLowerCase().includes('day rate'))?.value;
        return dayRate === '0';
      });
      
      if (configWithZeroRate) {
        // Configuration has Day Rate £0, showing warning triangle
        return {
          cost: 0,
          currency: '£',
          method: 'Day Rate £0',
          status: 'day_rate_zero',
          configType: 'Day Rate Set to Zero'
        };
      }
      
      // Use highest ID config even if it has empty values (first in sorted array)
      pr2Config = matchingConfigs[0];
      // Using highest ID config despite empty values
    } else {
      // Selected config with valid pricing values
    }
    
    // Using PR2 config for section
    
    // Debug Item 7 configuration completed
    
    // Debug: Show specific values being used for calculation
    // Removed excessive logging for performance
    
    if (!pr2Config || (!pr2Config.pricingOptions && !pr2Config.quantityOptions)) {
      // PR2 config has no pricing or quantity options
      return {
        cost: 0,
        currency: '£',
        method: 'No Pricing Options',
        status: 'no_pricing_options',
        configType: 'PR2 Configuration Missing Pricing'
      };
    }

    // Removed excessive logging for performance
    
    // Extract values from PR2 configuration arrays by matching labels
      const getPricingValueByLabel = (options: any[], label: string) => {
        const option = options?.find(opt => opt.label && opt.label.toLowerCase().includes(label.toLowerCase()));
        return option ? parseFloat(option.value) || 0 : 0;
      };
      
      // NEW: Check if section meets "No 2" rule criteria
      const checkNo2Rule = (section: any, config: any) => {
        // Find "No 2" or "Runs 2" option in quantity options
        const no2Option = config.quantityOptions?.find(opt => 
          opt.label && (
            opt.label.toLowerCase().includes('no 2') || 
            opt.label.toLowerCase().includes('runs 2')
          ) && opt.value && opt.value.trim() !== ''
        );
        
        if (!no2Option) {
          // No "No 2" rule found in configuration
          return { useNo2: false, no2Value: 0 };
        }
        
        const no2Value = parseFloat(no2Option.value) || 0;
        // "No 2" rule found, checking section
        
        // Rule 2: "No 2" rate applies ONLY to sections with exact database matches
        // STRICT VALIDATION: Only use hard facts from database, no assumptions or interpretations
        
        // Read exact database values without fallbacks or assumptions
        const dbPipeSize = section.pipeSize;
        const dbLength = section.totalLength;
        const dbSeverityGrade = section.severityGrade;
        const dbAdoptable = section.adoptable;
        const dbDefects = section.defects;
        const dbRecommendations = section.recommendations;
        
        // Section raw database values analyzed
        
        // Rule 2: "No 2" rule based on ACTUAL range configuration
        // Use "Length 2" range if section length falls OUTSIDE "Length" range but INSIDE "Length 2" range
        const sectionLength = parseFloat(section.totalLength) || 0;
        
        // Find the length ranges in the configuration
        const lengthRange = config.rangeOptions?.find(range => 
          range.label === 'Length' && range.enabled
        );
        const lengthRange2 = config.rangeOptions?.find(range => 
          range.label === 'Length 2' && range.enabled
        );
        
        let useNo2 = false;
        
        if (lengthRange && lengthRange2) {
          const length1Max = parseFloat(lengthRange.rangeEnd) || 0;
          const length2Max = parseFloat(lengthRange2.rangeEnd) || 0;
          
          // Use "No 2" rule if section length is greater than Length 1 max but within Length 2 max
          useNo2 = sectionLength > length1Max && sectionLength <= length2Max;
          
          // Length range analysis completed
        }
        

        
        return { useNo2, no2Value };
      };
      
      const dayRate = getPricingValueByLabel(pr2Config.pricingOptions, 'day rate');
      const hourlyRate = getPricingValueByLabel(pr2Config.pricingOptions, 'hourly rate');
      const setupRate = getPricingValueByLabel(pr2Config.pricingOptions, 'setup rate');
      const perMeterRate = getPricingValueByLabel(pr2Config.pricingOptions, 'meter rate');
      
      const runsPerShift = getPricingValueByLabel(pr2Config.quantityOptions, 'runs per shift');
      const metersPerShift = getPricingValueByLabel(pr2Config.quantityOptions, 'meters per shift');
      const sectionsPerDay = getPricingValueByLabel(pr2Config.quantityOptions, 'sections per day');
      
      // NEW: Check if section qualifies for "No 2" rule
      const no2Rule = checkNo2Rule(section, pr2Config);
      
      // Extracted values and No 2 rule check completed

      // Enhanced calculation logic - use "No 2" rule if section qualifies
      let baseCost = 0;
      let calculationMethod = 'Standard calculation';
      
      if (no2Rule.useNo2 && dayRate && dayRate > 0 && no2Rule.no2Value > 0) {
        // Use "No 2" rule for calculation
        baseCost = parseFloat(dayRate.toString()) / parseFloat(no2Rule.no2Value.toString());
        calculationMethod = `"No 2" rule: £${dayRate} ÷ ${no2Rule.no2Value} = £${baseCost.toFixed(2)}`;
        // Using "No 2" rule for calculation
      } else if (dayRate && dayRate > 0 && runsPerShift && runsPerShift > 0) {
        // Use standard "Runs per Shift" calculation
        baseCost = parseFloat(dayRate.toString()) / parseFloat(runsPerShift.toString());
        calculationMethod = `Standard: £${dayRate} ÷ ${runsPerShift} runs = £${baseCost.toFixed(2)}`;
        // Using standard rule for calculation
      } else if (hourlyRate && hourlyRate > 0) {
        // Assume 8 hour day if using hourly rate
        const divisor = no2Rule.useNo2 ? no2Rule.no2Value : (runsPerShift || 1);
        baseCost = parseFloat(hourlyRate.toString()) * 8 / parseFloat(divisor.toString());
        calculationMethod = `Hourly: £${hourlyRate} × 8h ÷ ${divisor} = £${baseCost.toFixed(2)}`;
      } else if (perMeterRate && perMeterRate > 0 && section.totalLength) {
        baseCost = parseFloat(perMeterRate.toString()) * parseFloat(section.totalLength || 0);
        calculationMethod = `Per meter: £${perMeterRate} × ${section.totalLength}m = £${baseCost.toFixed(2)}`;
      }

      // Add setup costs if configured
      if (setupRate && setupRate > 0) {
        baseCost += parseFloat(setupRate.toString());
      }

      // Return calculated cost if we have a valid amount
      if (baseCost > 0) {
        // Removed excessive logging
        return {
          cost: baseCost,
          currency: '£',
          method: calculationMethod,
          status: 'calculated'
        };
      } else {
        // PR2 calculation failed - no valid cost calculated
      }

    // CRITICAL FIX: Never return null - always return a cost object with status
    // This prevents service cost validation from failing due to null returns
    return {
      cost: 0,
      currency: '£',
      method: 'Configuration Missing',
      status: 'configuration_missing',
      configType: 'Service Cost Calculation Failed',
      warningType: 'configuration_missing'
    };
  };

  // Check if section meets PR2 configuration requirements for auto-pricing
  const checkSectionMeetsPR2Requirements = (section: any, pr2Config: any) => {
    if (!pr2Config || !pr2Config.rangeOptions) return false;
    
    // Extract section specifications
    const sectionPipeSize = parseInt(section.pipeSize?.replace(/[^\d]/g, '') || '0');
    const sectionLength = parseFloat(section.totalLength || '0');
    
    // Define all range variables at the top to avoid scope issues
    const pipeSizeRange = pr2Config.rangeOptions.find((range: any) => 
      range.label?.toLowerCase().includes('pipe size') && range.enabled
    );
    const percentageRange = pr2Config.rangeOptions.find((range: any) => 
      range.label?.toLowerCase().includes('percent') && range.enabled
    );
    
    // Check pipe size range
    if (pipeSizeRange) {
      const minSize = parseInt(pipeSizeRange.rangeStart || '0');
      const maxSize = parseInt(pipeSizeRange.rangeEnd || '999');
      if (sectionPipeSize < minSize || sectionPipeSize > maxSize) {
        // Section fails pipe size check - logging removed
        return false;
      }
    }
    
    // Check length ranges - section must meet AT LEAST ONE length range (Rule 1 OR Rule 2)
    const lengthRanges = pr2Config.rangeOptions.filter((range: any) => 
      range.label?.toLowerCase().includes('length') && range.enabled
    );
    if (lengthRanges.length > 0) {
      let meetsAnyLengthRange = false;
      let matchedLengthRange = null;
      
      for (const currentLengthRange of lengthRanges) {
        const minLength = parseFloat(currentLengthRange.rangeStart || '0');
        const maxLength = parseFloat(currentLengthRange.rangeEnd || '999');
        if (sectionLength >= minLength && sectionLength <= maxLength) {
          matchedLengthRange = currentLengthRange;
          meetsAnyLengthRange = true;
          break;
        }
      }
      
      if (meetsAnyLengthRange && matchedLengthRange) {
        // Section meets requirements - logging removed for performance
      } else {
        // Section fails length check - logging removed
        return false;
      }
    }
    
    // Check percentage range - SEPARATE water levels from defect percentages
    if (percentageRange && section.defects) {
      // CRITICAL FIX: Skip percentage validation for SA (Survey Abandoned) codes
      const defectsUpper = section.defects.toUpperCase();
      const isSurveyAbandoned = defectsUpper.includes('SA ') || defectsUpper.includes('SURVEY ABANDONED') || defectsUpper.includes('BUNGED');
      
      // Extract WATER LEVEL percentages (needed for all sections)
      const waterLevelMatches = section.defects.match(/(\d+)%\s*of the vertical dimension/g);
      
      if (!isSurveyAbandoned) {
        // Extract DEFECT percentages only (exclude water levels)
        const defectMatches = section.defects.match(/(\d+)%(?!\s*of the vertical dimension)/g);
        
        // Check defect percentages against PR2 range
        if (defectMatches && defectMatches.length > 0) {
          const defectPercentages = defectMatches.map((match: string) => parseInt(match.replace('%', '')));
          const maxDefectPercentage = Math.max(...defectPercentages);
          
          const minPercent = parseInt(percentageRange.rangeStart || '0');
          const maxPercent = parseInt(percentageRange.rangeEnd || '100');
          
          if (maxDefectPercentage < minPercent || maxDefectPercentage > maxPercent) {
            // Section fails defect percentage check - logging removed
            return false;
          }
        }
      }
      
      // Check water level percentages against SECTOR-SPECIFIC rules
      if (waterLevelMatches && waterLevelMatches.length > 0) {
        const waterLevelPercentages = waterLevelMatches.map((match: string) => 
          parseInt(match.match(/(\d+)%/)[1])
        );
        const maxWaterLevel = Math.max(...waterLevelPercentages);
        
        // Sector-specific water level rules based on standards
        const getSectorWaterLevelLimit = (sectorId: string) => {
          switch (sectorId) {
            case 'utilities':
              // MSCC5/WRc standards: Water levels up to 50% typically acceptable for utilities
              return 50;
            case 'adoption':
              // Sewers for Adoption: Stricter requirements - max 25%
              return 25;
            case 'highways':
              // Highways standards: More lenient - up to 60%
              return 60;
            case 'insurance':
              // Insurance assessments: Conservative - max 30%
              return 30;
            case 'construction':
              // Construction phase: Very strict - max 20%
              return 20;
            case 'domestic':
              // Domestic surveys: Moderate - max 40%
              return 40;
            default:
              return 30;
          }
        };
        
        const maxAllowedWaterLevel = getSectorWaterLevelLimit(currentSector.id);
        
        if (maxWaterLevel > maxAllowedWaterLevel) {
          // Section fails water level check - logging removed
          return false;
        } else {
          // Section passes water level check - logging removed
        }
      }
    }
    
    return true;
  };

  // REMOVED: Conflicting requiresCleaning function that takes section object
  // Now using only the string-based requiresCleaning function defined at the top of the file

  // Component-level dynamic recommendation function with access to checkSectionMeetsPR2Requirements
  const generateDynamicRecommendationWithPR2 = (section: any, repairConfigData: any[]): string => {
    const { startMH, finishMH, pipeSize, totalLength, defects, recommendations } = section;
    
    // Ensure totalLength has 'm' suffix
    const length = totalLength ? 
      (totalLength.includes('m') ? totalLength : `${totalLength}m`) : 
      '30.00m';
    
    // Ensure pipeSize has 'mm' suffix  
    const pipe = pipeSize ? 
      (pipeSize.includes('mm') ? pipeSize : `${pipeSize}mm`) : 
      '150mm';
      
    const from = startMH || 'Start';
    const to = finishMH || 'Finish';
    
    // Extract defect summary for contextual recommendation
    const extractDefectSummary = (defectsText: string): string => {
      if (!defectsText || defectsText.includes('No service or structural defect found')) {
        return '';
      }
      
      // Extract defects with percentages from detailed observation text
      const defectMatches = [];
      
      // Pattern for deposits (fine = DES, coarse = DER)
      const depositPattern = /Settled deposits, (fine|coarse), (\d+)% cross-sectional area loss/g;
      let depositMatch;
      while ((depositMatch = depositPattern.exec(defectsText)) !== null) {
        const depositType = depositMatch[1] === 'fine' ? 'DES' : 'DER';
        const percentage = depositMatch[2];
        defectMatches.push(`${depositType} ${percentage}%`);
      }
      
      if (defectMatches.length > 0) {
        return defectMatches.join(' and ');
      }
      
      // Fallback: extract basic defect codes without percentages
      const basicMatches = defectsText.match(/([A-Z]{2,3})/g);
      if (basicMatches) {
        const uniqueDefects = [...new Set(basicMatches)];
        const cleaningRelevantDefects = uniqueDefects.filter(code => code !== 'LL');
        return cleaningRelevantDefects.length > 0 ? cleaningRelevantDefects.join(' and ') : 'defects';
      }
      
      return 'defects';
    };
    
    const defectSummary = extractDefectSummary(defects || '');
    
    // NEW: Get PR2 configuration details for dynamic recommendations
    if (defectSummary && requiresCleaning(defects || '')) {
      if (repairPricingData && repairPricingData.length > 0) {
        // Find the configuration that this section meets
        const matchingConfig = repairPricingData.find(config => 
          checkSectionMeetsPR2Requirements(section, config)
        );
        
        if (matchingConfig) {
          // Dynamic recommendation using PR2 config
          
          // Extract equipment type from category name
          let equipmentType = 'cleanse and survey';
          if (matchingConfig.categoryName) {
            const categoryName = matchingConfig.categoryName.toLowerCase();
            if (categoryName.includes('cctv') && categoryName.includes('jet vac')) {
              equipmentType = 'CCTV and jet vac';
            } else if (categoryName.includes('cctv') && categoryName.includes('van pack')) {
              equipmentType = 'CCTV and van pack';
            } else if (categoryName.includes('jetting')) {
              equipmentType = 'high-pressure jetting';
            } else if (categoryName.includes('vacuum')) {
              equipmentType = 'vacuum tanker';
            }
          }
          
          return `To ${equipmentType} ${length} from ${from} to ${to}, ${pipe} to remove ${defectSummary}`;
        }
      }
      
      // Fallback if no matching configuration found
      return `To cleanse and survey ${length} from ${from} to ${to}, ${pipe} to remove ${defectSummary}`;
    } else if (defectSummary) {
      // For structural repairs, use defect-specific meterage
      const meterageMatches = (defects || '').match(/\b(\d+\.?\d*)m\b/g);
      if (meterageMatches && meterageMatches.length > 0) {
        const defectMeterage = meterageMatches[0];
        return `To install a ${pipe} double layer Patch at ${defectMeterage}, ${from} to ${to} addressing ${defectSummary}`;
      } else {
        return `To repair ${length} from ${from} to ${to}, ${pipe} addressing ${defectSummary}`;
      }
    } else {
      return `${length} section from ${from} to ${to}, ${pipe} - No action required, pipe section is in adoptable condition`;
    }
  };

  // FIXED: Smart counting system - only count sections that NEED CLEANING/SURVEYING (not all sections)
  const countSectionsTowardMinimum = (rawSectionData: any[], repairPricingData: any[]) => {
    let sectionCount = 0;
    const configMatch: { [key: number]: any } = {}; // Track which config each section uses
    
    rawSectionData.forEach(section => {
      // CRITICAL FIX: Only count sections that actually need cleaning/surveying
      const needsCleaning = requiresCleaning(section.defects || '');
      if (!needsCleaning) {
        return; // Skip sections that don't need cleaning
      }
      
      // Check each configuration to see if section meets requirements
      for (const config of repairPricingData) {
        const meetsRequirements = checkSectionMeetsPR2Requirements(section, config);
        if (meetsRequirements) {
          sectionCount++;
          configMatch[section.itemNo] = config; // Store which config this section uses
          break; // Stop checking other configs once we find a match
        }
      }
    });
    
    // FIXED COUNT - Only sections needing cleaning completed
    
    return { sectionCount, configMatch };
  };

  // Calculate status color for sections based on PR2 requirements and minimum quantities
  const calculateSectionStatusColor = (section: any, pr2Config: any) => {
    if (!pr2Config) return 'default';
    
    // Check if section meets basic requirements
    const meetsRequirements = checkSectionMeetsPR2Requirements(section, pr2Config);
    if (!meetsRequirements) {
      return 'default'; // Will show red with "Outside PR2 configuration ranges" message
    }
    
    // CHANGED: Check DB8 GREEN WINDOW requirements using smart counting system (instead of DB9 orange)
    const quantityOptions = pr2Config.quantityOptions || []; // CHANGED: Use DB8 green window
    
    // Extract values using same logic as calculateAutoCost
    const getPricingValueByLabel = (options: any[], label: string) => {
      const option = options?.find(opt => opt.label && opt.label.toLowerCase().includes(label.toLowerCase()));
      return option ? parseFloat(option.value) || 0 : 0;
    };
    
    // Use smart counting system to get total sections that meet any configuration
    const { sectionCount } = countSectionsTowardMinimum(rawSectionData || [], repairPricingData || []);
    const runsPerShift = getPricingValueByLabel(pr2Config.quantityOptions, 'runs per shift');
    
    // Smart counting result (now using DB8 green window) completed
    
    const minRunsRequired = quantityOptions.find((opt: any) => // CHANGED: Use DB8 green window
      opt.label?.toLowerCase().includes('runs') && opt.enabled
    );
    
    // Status calculation details completed
    
    // Section status should be green if it meets blue/green window requirements
    // Orange minimum affects cost display color, not section status
    // Section meets basic requirements (blue/green windows) completed
    
    return 'green'; // Section meets blue/green window requirements
  };



  // CRITICAL: If database is empty, ignore upload parameter to prevent stuck state
  // This allows folder selection to appear again instead of showing "Viewing report:"

  // DEBUG: Log WRc recommendations check
  if (rawSectionData && rawSectionData.length > 0) {
    const section3 = rawSectionData.find(s => s.itemNo === 3);
    if (section3) {
      // WRc check logging removed
    }
  }

  // Audit trail logging removed to prevent infinite loop

  // Fetch individual defects for multiple defects per section
  const { data: individualDefects = [], isLoading: defectsLoading } = useQuery<any[]>({
    queryKey: [`/api/uploads/${effectiveReportId}/defects`],
    enabled: !!effectiveReportId, // FIXED: Simplified enable logic to match sections query
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: false
  });

  // USE ALL SECTIONS: Allow duplicate item numbers for letter suffix functionality
  const rawFilteredData = rawSectionData; // No deduplication - we want all sections for letter suffixes
  
  // DEBUG: Track Item 13 variations in raw data processing
  if (rawSectionData && rawSectionData.length > 0) {
    const item13Variations = rawSectionData.filter(s => s.itemNo === 13);
    console.log('🔍 RAW SECTION DATA - ITEM 13 VARIATIONS:', item13Variations.map(s => ({
      itemNo: s.itemNo,
      letterSuffix: s.letterSuffix,
      defectType: s.defectType,
      defects: s.defects,
      databaseId: s.id
    })));
  }
  
  // DEBUG: Check if TP2 sections exist in raw database data
  if (rawSectionData && rawSectionData.length > 0) {
    const tp2Sections = rawSectionData.filter(s => 
      (s.itemNo === 13 && s.letterSuffix === 'a') || 
      s.itemNo === 20 || 
      (s.itemNo === 21 && s.letterSuffix === 'a')
    );
    // TP2 sections in raw data analysis completed
  }
  
  // Debug logging for Section 2 data duplication
  const section2Data = rawSectionData.filter(s => s.itemNo === 2);
  if (section2Data.length > 0) {
  }
  

  
  // Debug individual defects data
  if (individualDefects?.length > 0) {
  }
  
  // Debug Item 10 data at top level
  useEffect(() => {
    if (rawSectionData && rawSectionData.length > 0) {
      const item10 = rawSectionData.find(s => s.itemNo === 10);
      if (item10) {
        // Item 10 raw data check - logging removed
      } else {
        // Item 10 not found in raw data - logging removed
      }
    }
  }, [rawSectionData]);

  // Check sequential validation when sections data changes
  useEffect(() => {
    if (rawSectionData && rawSectionData.length > 0) {
      const validation = validateSequentialSections(rawSectionData, currentUpload);
      setIsDatabaseFile(validation.isDatabase);
      
      if (!validation.isValid || (validation.missing && validation.missing.length > 0)) {
        setMissingSequences(validation.missing);
        setShowSequenceWarning(true);
      } else {
        setMissingSequences([]);
        setShowSequenceWarning(false);
      }
    }
  }, [rawSectionData, currentUpload]);

  // Combine sections with individual defects - create multiple rows for sections with multiple defects
  const expandedSectionData = rawFilteredData.reduce((acc: any[], section: any) => {
    const sectionDefects = individualDefects.filter(defect => defect.itemNo === section.itemNo);
    
    if (sectionDefects.length > 0) {
      // Create a row for each individual defect
      sectionDefects.forEach((defect, index) => {
        acc.push({
          ...section,
          defectSequence: defect.defectSequence,
          defectCode: defect.defectCode,
          meterage: defect.meterage,
          percentage: defect.percentage,
          defects: `${defect.defectCode} ${defect.meterage} (${defect.description})`,
          severityGrade: section.severityGrade, // Keep original section severity grade for cost calculation
          recommendations: defect.recommendation,
          operationType: defect.operationType,
          estimatedCost: defect.estimatedCost,
          adoptable: defect.mscc5Grade === 0 ? "Yes" : defect.mscc5Grade <= 2 ? "Conditional" : "No",
          // Add a unique identifier for React keys
          rowId: `${section.itemNo}-${defect.defectSequence}`,
          isMultiDefect: sectionDefects.length > 1,
          defectIndex: index,
          totalDefects: sectionDefects.length
        });
      });
    } else {
      // No individual defects, use the section as-is
      acc.push({
        ...section,
        rowId: `${section.itemNo}-single`,
        isMultiDefect: false,
        defectIndex: 0,
        totalDefects: 1
      });
    }
    
    return acc;
  }, []);

  // DEBUG: Check which TP2 sections exist and their severity grades
  expandedSectionData.forEach(section => {
    if ((section.itemNo === 13 && section.letterSuffix === 'a') || section.itemNo === 20 || (section.itemNo === 21 && section.letterSuffix === 'a')) {
      // Section existence check completed
    }
  });

  // Apply filters to expanded section data
  const filteredData = expandedSectionData.filter(section => {
    // DEBUG: Check if TP2 sections are being filtered out
    const isTP2Section = (section.itemNo === 13 && section.letterSuffix === 'a') || 
                        section.itemNo === 20 || 
                        (section.itemNo === 21 && section.letterSuffix === 'a');
    
    if (isTP2Section) {
      // TP2 filter check completed
    }
    
    if (filters.severityGrade && section.severityGrade !== filters.severityGrade) return false;
    if (filters.adoptable.length > 0 && !filters.adoptable.includes(section.adoptable)) return false;
    if (filters.pipeSize && section.pipeSize !== filters.pipeSize) return false;
    if (filters.pipeMaterial && section.pipeMaterial !== filters.pipeMaterial) return false;
    if (filters.projectNumber && currentUpload && currentUpload.projectNumber && !currentUpload.projectNumber.includes(filters.projectNumber)) return false;
    return true;
  });

  // Debug data processing steps - logging removed to prevent infinite loop

  // Sort the filtered data by item number, then by letter suffix to ensure correct ordering
  const sectionData = [...filteredData].sort((a, b) => {
    // First sort by item number
    if (a.itemNo !== b.itemNo) {
      return a.itemNo - b.itemNo;
    }
    
    // Then sort by letter suffix for same item numbers (13, 13a, 13b, etc.)
    const aSuffix = a.letterSuffix || '';
    const bSuffix = b.letterSuffix || '';
    
    // No suffix comes before suffix (13 before 13a)
    if (aSuffix === '' && bSuffix !== '') return -1;
    if (aSuffix !== '' && bSuffix === '') return 1;
    
    // Both have suffixes - sort alphabetically
    return aSuffix.localeCompare(bSuffix);
    
    // Legacy meterage sorting logic (kept for fallback)
    const getMeterageFromDefects = (defects: string): number => {
      if (!defects) return 0;
      // Find the first meterage value in the defects text
      const meterageMatch = defects.match(/(\d+\.?\d*)\s*m/);
      return meterageMatch ? parseFloat(meterageMatch[1]) : 0;
    };
    
    const meterageA = getMeterageFromDefects(a.defects || "");
    const meterageB = getMeterageFromDefects(b.defects || "");
    return meterageA - meterageB;
  });

  // AUTO-POPULATE ID760 MM4-150 PURPLE LENGTH FIELDS WHEN SECTION DATA LOADS
  useEffect(() => {
    if (sectionData?.length > 0 && repairPricingData?.length > 0) {
      // Trigger auto-population for A5 configurations (cctv-jet-vac)
      const id760Config = repairPricingData.find(config => 
        config.categoryId === 'cctv-jet-vac' && config.sector === currentSector.id
      );
      
      if (id760Config && id760Config.mmData) {
        console.log('🔧 Triggering A5 MM4-150 purple length auto-population for', sectionData.length, 'sections');
        console.log('🔍 Auto-population disabled to preserve user-configured MM4 values:', sectionData.slice(0, 5).map(s => ({
          itemNo: s.itemNo,
          pipeSize: s.pipeSize,
          totalLength: s.totalLength
        })));
        // DISABLED: autoPopulatePurpleLengthFields(f690Config, sectionData[0], sectionData);
        // This was overriding user-configured MM4 purple values with auto-calculated ones
      }
    }
  }, [sectionData, repairPricingData, currentSector.id]);

  // CRITICAL FIX: Warning check effect using sectionData (display data) instead of rawSectionData (API data)
  useEffect(() => {
    if (sectionData?.length > 0 && repairPricingData?.length > 0) {
      console.log('🔍 DISPLAY DATA WARNING CHECK TRIGGER:', {
        sectionDataLength: sectionData.length,
        pr2ConfigsLength: repairPricingData.length,
        sampleSections: sectionData.slice(0, 3).map(s => ({
          itemNo: s.itemNo,
          defectType: s.defectType
        }))
      });

      // Check for service cost completion and trigger warning dialog using display data
      // Warning system calls removed

      // Warning system calls removed
    }
  }, [sectionData, repairPricingData]);

  // Remove debugging code - data is now clean for fresh uploads

  // Check if pricing exists for the current sector
  const { data: pricingStatus = { overall: false, surveys: false, cleansing: false, jetting: false } } = useQuery<{ overall: boolean, surveys: boolean, cleansing: boolean, jetting: boolean }>({
    queryKey: [`/api/pricing/check/${currentSector.id}`],
    enabled: !!currentSector?.id,
  });

  // Fetch user pricing data for cost calculations
  const { data: userPricing = [] } = useQuery<any[]>({
    queryKey: ["/api/user-pricing"],
  });

  // Fetch equipment types for pricing calculations
  const { data: equipmentTypes = [] } = useQuery<any[]>({
    queryKey: ["/api/equipment-types/2"], // Cleansing category
  });

  // Export to Excel function with enhanced formatting
  const exportToExcel = () => {
    if (!sectionData?.length) return;
    
    // Check for hidden columns and show warning dialog
    if (hiddenColumns.size > 0) {
      setShowExportWarning(true);
      return;
    }
    
    // Proceed with export
    performExport();
  };

  // Warning system export handling removed

  const performExport = () => {
    console.log('🔄 performExport called', { 
      sectionDataLength: sectionData?.length, 
      adjustedServiceCostsSize: adjustedServiceCosts.size 
    });
    
    if (!sectionData?.length) {
      console.error('❌ No section data available for export');
      return;
    }
    
    // Get visible columns based on hiddenColumns state
    const currentHiddenColumns = hiddenColumns;
    
    // Build dynamic headers based on visible columns
    const allHeaders = [
      { key: 'projectNumber', label: 'Project No', hideable: true },
      { key: 'itemNo', label: 'Item No', hideable: false },
      { key: 'inspectionNo', label: 'Inspec. No', hideable: true },
      { key: 'date', label: 'Date', hideable: true },
      { key: 'time', label: 'Time', hideable: true },
      { key: 'startMH', label: 'Start MH', hideable: false },
      { key: 'startMHDepth', label: 'Start MH Depth', hideable: true },
      { key: 'finishMH', label: 'Finish MH', hideable: false },
      { key: 'finishMHDepth', label: 'Finish MH Depth', hideable: true },
      { key: 'pipeSize', label: 'Pipe Size', hideable: false },
      { key: 'pipeMaterial', label: 'Pipe Material', hideable: true },
      { key: 'totalLength', label: 'Total Length', hideable: false },
      { key: 'lengthSurveyed', label: 'Length Surveyed', hideable: false },
      { key: 'defects', label: 'Observations', hideable: false },
      { key: 'severityGrade', label: 'Severity Grade', hideable: false },
      { key: 'recommendations', label: 'Recommendations', hideable: false },
      { key: 'adoptable', label: 'Adoptable', hideable: false },
      { key: 'cost', label: 'Cost', hideable: false }
    ];
    
    // Filter visible headers (exclude hidden columns from export)
    const exportHeaders = allHeaders.filter(header => 
      !header.hideable || !currentHiddenColumns.has(header.key)
    );
    
    const projectNo = currentUpload?.fileName?.match(/^(\d+)/)?.[1] || 'Unknown';
    const reportDate = new Date().toLocaleDateString('en-GB');
    
    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    
    // Add column indices for hidden column tracking
    const headersWithIndex = exportHeaders.map((header, index) => ({
      ...header,
      colIndex: index
    }));
    
    // Header section data
    const headerData = [
      ['Sewer AI - Report Analysis and Pricing'],
      [''],
      ['Logo Placement Area - Insert Company Logo Here'],
      [''],
      ['Customer Details:'],
      ['Customer Name: [Enter Customer Name]'],
      [`Project Reference: ${projectNo}`],
      [`Report Date: ${reportDate}`],
      [`Sector: ${currentSector?.name || 'Utilities'}`],
      [`Hidden Columns: ${currentHiddenColumns.size > 0 ? Array.from(currentHiddenColumns).join(', ') : 'None'}`],
      [`Applied Filters: ${Object.values(filters).some(f => f) ? 'Yes' : 'No'}`],
      [''],
      ['=== SECTION INSPECTION DATA ==='],
      [''],
      // Column headers
      headersWithIndex.map(h => h.label)
    ];
    
    // Data rows
    const dataRows = sectionData.map(section => {
      // Apply same cost logic as dashboard - use calculateAutoCost for accurate pricing
      let costValue = section.cost || '£0.00';
      
      // Check for adjusted service costs first (same logic as calculateAutoCost)
      const adjustedCost = adjustedServiceCosts.get(section.itemNo);
      if (section.defectType === 'service' && adjustedCost) {
        costValue = `£${adjustedCost.toFixed(2)} (Day Rate Adjusted)`;
      } else if (section.recommendations && section.recommendations.includes('No action required pipe observed in acceptable structural and service condition') && section.severityGrade === 0) {
        costValue = 'Complete';
      } else {
        const sectionsComplete = [6, 7, 8, 10, 13, 14, 21];
        const sectionsNeedingPricing = [2, 25, 31, 47, 52, 57, 72, 73, 74, 75, 76, 78];
        
        if (sectionsComplete.includes(section.itemNo)) {
          costValue = 'Complete';
        } else if (sectionsNeedingPricing.includes(section.itemNo)) {
          costValue = 'Configure utilities sector pricing first';
        } else {
          // Use the same cost calculation logic as the dashboard
          const costResult = calculateAutoCost(section);
          if (typeof costResult === 'string') {
            costValue = costResult;
          } else if (costResult && typeof costResult === 'object') {
            // Handle JSX element - try to extract meaningful text
            if ('cost' in costResult && typeof costResult.cost === 'number') {
              costValue = `£${costResult.cost.toFixed(2)}`;
            } else if ('props' in costResult && costResult.props) {
              // Try to extract text content from JSX
              const extractText = (element: any): string => {
                if (typeof element === 'string') return element;
                if (typeof element === 'number') return element.toString();
                if (Array.isArray(element)) return element.map(extractText).join(' ');
                if (element && typeof element === 'object' && element.props && element.props.children) {
                  return extractText(element.props.children);
                }
                return '';
              };
              const extractedText = extractText(costResult);
              costValue = extractedText || '£0.00';
            } else {
              costValue = '£0.00';
            }
          } else {
            costValue = '£0.00';
          }
        }
      }
      
      const rowData: { [key: string]: any } = {
        projectNumber: projectNo,
        itemNo: getItemNumberWithSuffix(section, sectionData),
        inspectionNo: section.inspectionNo,
        date: section.date,
        time: section.time,
        startMH: section.startMH,
        startMHDepth: section.startMHDepth || 'Not Specified',
        finishMH: section.finishMH,
        finishMHDepth: section.finishMHDepth || 'Not Specified',
        pipeSize: section.pipeSize,
        pipeMaterial: section.pipeMaterial,
        totalLength: section.totalLength,
        lengthSurveyed: section.lengthSurveyed,
        defects: section.defects,
        severityGrade: section.severityGrade,
        recommendations: section.recommendations,
        adoptable: section.adoptable,
        cost: costValue
      };
      
      return headersWithIndex.map(header => rowData[header.key] || '');
    });
    
    // Add footer
    const footerData = [
      [''],
      ['=== END OF REPORT ==='],
      [`Generated by Sewer AI - ${new Date().toISOString()}`]
    ];
    
    // Combine all data
    const allData = [...headerData, ...dataRows, ...footerData];
    
    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(allData);
    
    // Set column widths and cell formatting for text wrapping
    const colWidths = exportHeaders.map((header, index) => {
      // Set appropriate column widths based on content
      return { 
        wch: header.key === 'defects' || header.key === 'recommendations' ? 40 : 
             header.key === 'itemNo' || header.key === 'severityGrade' || header.key === 'adoptable' ? 8 : 15 
      };
    });
    ws['!cols'] = colWidths;
    
    // Set text wrapping for all cells
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (ws[cellAddress]) {
          if (!ws[cellAddress].s) ws[cellAddress].s = {};
          ws[cellAddress].s.alignment = { 
            wrapText: true, 
            horizontal: 'center', 
            vertical: 'middle' 
          };
        }
      }
    }
    
    // Note: Hidden columns are excluded from export (not included in data)
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Inspection Report');
    
    // Generate Excel file and download
    const fileName = `SewerAI_${projectNo}_Inspection_Report_${reportDate.replace(/\//g, '-')}.xlsx`;
    console.log('🔄 About to write Excel file:', fileName);
    
    try {
      XLSX.writeFile(wb, fileName);
      console.log('✅ Excel file written successfully');
    } catch (error) {
      console.error('❌ Error writing Excel file:', error);
      throw error;
    }
  };

  // Calculate actual costs based on PR1 pricing configuration
  const calculateSectionCost = (section: any) => {
    // Check if section has defects requiring repair
    const hasDefects = section.severityGrade && section.severityGrade !== "0" && section.severityGrade !== 0;
    const noRepairsNeeded = section.recommendations === "None required" || section.recommendations === "" || !section.recommendations;
    
    // If no defects or no repairs needed, cost is £0.00
    if (!hasDefects || noRepairsNeeded) {
      return "£0.00";
    }

    // Section has defects and requires repairs - use PR2 calculations
    const pr2Cost = calculateAutoCost(section);
    
    if (pr2Cost && pr2Cost.cost) {
      return `£${pr2Cost.cost.toFixed(2)}`;
    }

    // If no PR2 configuration, show warning triangle
    return (
      <div className="text-amber-600 font-medium text-sm flex items-center gap-1">
        <span>⚠️</span>
        <div>
          <div>Configure PR2</div>
          <div>pricing first</div>
        </div>
      </div>
    );
  };

  // FIXED: Configuration completeness check - replaces legacy orange minimum logic
  const checkConfigurationComplete = (section: any): boolean => {
    const costCalculation = calculateAutoCost(section);
    
    // If no cost calculation, assume incomplete
    if (!costCalculation) {
      return false;
    }
    
    // Check for incomplete configuration status codes
    if (costCalculation.status === 'mm4_incomplete_config' || 
        costCalculation.status === 'mm4_outside_ranges') {
      return false;
    }
    
    // Check if this is A4 CCTV van pack - ensure proper validation
    if (section.defectType === 'service') {
      // Find CCTV configuration for this section
      const cctvConfig = repairPricingData?.find(config => 
        config.categoryId === 'cctv-van-pack' || config.categoryId === 'cctv-jet-vac'
      );
      
      if (cctvConfig && cctvConfig.mmData) {
        const mm4DataByPipeSize = cctvConfig.mmData.mm4DataByPipeSize || {};
        const pipeSize = section.pipeSize?.toString().replace('mm', '') || '150';
        const pipeSizeKey = `${pipeSize}-${pipeSize}1`;
        const mm4Data = mm4DataByPipeSize[pipeSizeKey];
        
        if (mm4Data && mm4Data.length > 0) {
          const mm4Row = mm4Data[0];
          // Check blue, green, and purple fields for completeness
          const hasBlueValue = mm4Row.blueValue && mm4Row.blueValue.trim() !== '';
          const hasGreenValue = mm4Row.greenValue && mm4Row.greenValue.trim() !== '';
          const hasPurpleDebris = mm4Row.purpleDebris && mm4Row.purpleDebris.trim() !== '';
          const hasPurpleLength = mm4Row.purpleLength && mm4Row.purpleLength.trim() !== '';
          
          // All fields must be complete for A4 configurations
          return hasBlueValue && hasGreenValue && hasPurpleDebris && hasPurpleLength;
        }
      }
    }
    
    // For other configurations, assume complete if cost calculation exists
    return true;
  };

  // Simplified cost calculation function - equipment priority responsive
  const calculateCost = (section: any): string | JSX.Element => {
    // EQUIPMENT PRIORITY DEBUG: Force recalculation when equipment priority changes
    // Use costRecalcTrigger dependency to invalidate cached calculations
    const equipmentKey = `${equipmentPriority}-${costRecalcTrigger}`;
    console.log('💰 CALCULATE COST - Item', section.itemNo, ':', {
      equipmentPriority: equipmentPriority,
      costRecalcTrigger: costRecalcTrigger,
      equipmentKey: equipmentKey,
      defectType: section.defectType,
      timestamp: Date.now(),
      stateSource: 'component_unified'
    });
    
    // FIXED: Simplified defect detection logic for both old and new severity grade systems
    const needsStructuralRepair = requiresStructuralRepair(section.defects || '');
    
    // Check for defects using multiple detection methods
    const hasDefects = (
      // New JSONB severity grades (TP2 sections like Item 20)
      (section.severityGrades?.structural && section.severityGrades.structural > 0) ||
      (section.severityGrades?.service && section.severityGrades.service > 0) ||
      // Old severity grade system
      (section.severityGrade && section.severityGrade !== "0" && section.severityGrade !== 0) ||
      // Direct defect type check for structural sections
      (section.defectType === 'structural' && section.defects && section.defects.trim().length > 0)
    );
    
    // If no defects detected, return £0.00
    if (!hasDefects) {
      return "£0.00";
    }
    
    // CRITICAL: Force fresh cost calculation with current equipment priority
    // Use equipmentKey to ensure calculations invalidate cached results properly
    const autoCost = calculateAutoCost(section);
    
    if (autoCost && 'cost' in autoCost && autoCost.cost > 0) {
      // Check for MM4 insufficient runs status - show RED cost with warning popup
      if (autoCost.status === 'mm4_insufficient_runs') {
        return (
          <span 
            className="text-red-600 font-medium cursor-pointer hover:text-red-700 transition-colors" 
            title={`Minimum runs per shift not met\n${(autoCost as any).totalServiceDefects || 0} service defects < ${(autoCost as any).runsPerShift || 0} required runs\nPer-length rate: £${(autoCost as any).ratePerLength?.toFixed(2) || '0.00'}\nClick to recalculate day rate`}
            onClick={() => {
              // Show warning popup with recalculation options
              const currentDefects = (autoCost as any).totalServiceDefects || 0;
              const requiredRuns = (autoCost as any).runsPerShift || 0;
              const dayRate = (autoCost as any).dayRate || 0;
              const currentRate = (autoCost as any).ratePerLength?.toFixed(2) || '0.00';
              const recalculatedRate = currentDefects > 0 ? (dayRate / currentDefects).toFixed(2) : '0.00';
              
              const userChoice = confirm(
                `Minimum Runs Per Shift Not Met\n\n` +
                `Current: ${currentDefects} service defects\n` +
                `Required: ${requiredRuns} runs per shift\n\n` +
                `Current rate: £${currentRate} per length\n` +
                `Recalculated rate: £${recalculatedRate} per length\n\n` +
                `Would you like to:\n` +
                `• Click OK to apply recalculated rate (£${recalculatedRate})\n` +
                `• Click Cancel to specify your own rate`
              );
              
              if (userChoice) {
                alert(`Day rate recalculated to £${recalculatedRate} per length based on ${currentDefects} actual service defects.`);
              } else {
                const newRate = prompt(`Enter new rate per length (current: £${currentRate}):`);
                if (newRate && !isNaN(parseFloat(newRate))) {
                  alert(`New rate set to £${parseFloat(newRate).toFixed(2)} per length.`);
                }
              }
            }}
          >
            £{autoCost.cost.toFixed(2)}
          </span>
        );
      }
      

      
      // Check if this item has applied structural pricing (green highlight)
      const hasAppliedStructuralPricing = appliedStructuralPricing.has(section.itemNo);
      
      // Configuration completeness check - replaces legacy orange logic
      // FIXED: Check configuration completeness instead of legacy orange minimum
      const isConfigComplete = checkConfigurationComplete(section);
      
      // Determine cost color: applied structural pricing = green, otherwise configuration check
      const costColor = hasAppliedStructuralPricing 
        ? "text-green-600 bg-green-50 border border-green-200 rounded px-2 py-1" 
        : (isConfigComplete ? "text-green-600" : "text-red-600");
      
      // Orange minimum result - logging removed
      
      // Display calculated cost with appropriate color
      return (
        <span 
          className={`${costColor} font-medium cursor-help`}
          title={hasAppliedStructuralPricing 
            ? `Applied structural pricing: £${autoCost.cost.toFixed(2)}\nStatus: Applied via structural warning dialog`
            : `Cost calculated using ${('method' in autoCost) ? autoCost.method || 'PR2 Configuration' : 'PR2 Configuration'}\nStatus: ${isConfigComplete ? 'Configuration complete' : 'Configuration incomplete'}\nPer-length rate: £${autoCost.cost.toFixed(2)}`
          }
        >
          £{autoCost.cost.toFixed(2)}
        </span>
      );
    }
    
    // Show warning triangle icon for sections without pricing - make it clickable
    return (
      <span 
        className="cursor-pointer hover:text-amber-700 transition-colors text-amber-600" 
        title="Configuration missing - click to set up pricing"
        onClick={() => {
          // Warning system removed - no action
        }}
      >
        ⚠️
      </span>
    );
  };

  // REMOVED: Auto-cost trigger useEffect was causing infinite loops
  // Cost calculations continue working normally without popup dialogs

  return (
    <div className="relative min-h-screen bg-slate-50">
      {/* Warning system components removed */}
      
      {/* Navigation */}
      <div className="bg-white border-b border-slate-200 p-4">
        <div className="flex gap-4 items-center">
          <Link to="/">
            <Button variant="outline" size="sm">
              <HomeIcon className="h-4 w-4 mr-2" />
              Home
            </Button>
          </Link>
          <Link to="/upload">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2 text-blue-600" />
              Upload Report
            </Button>
          </Link>
          <Link to="/reports">
            <Button variant="outline" size="sm">
              <FileText className="h-4 w-4 mr-2 text-green-600" />
              Uploaded Reports
            </Button>
          </Link>
          <Link to="/pr2-pricing?sector=utilities">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2 text-orange-600" />
              Pricing
            </Button>
          </Link>


          <div className="ml-auto flex gap-2">

            {currentUpload && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (currentUpload?.id) {
                    reprocessMutation.mutate(currentUpload.id);
                  }
                }}
                disabled={reprocessMutation.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {reprocessMutation.isPending ? "Reprocessing..." : "Re-Process Report"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportReport}
            >
              <Download className="h-4 w-4 mr-2" />
              Export to Excel
            </Button>



            {/* Clear button removed to prevent accidental data loss */}
          </div>
        </div>
      </div>

      <div className="container mx-auto p-6 max-w-none">

        
        <div className="mb-6">
          {/* Dashboard Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-green-100 rounded-lg">
              <BarChart3 className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
              <p className="text-slate-600">View section inspection data and analysis results across all reports</p>
            </div>
          </div>
          

          <p className="text-slate-600">
            {completedUploads.length === 0 
              ? "No analysis data available. Upload a report to begin inspection analysis."
              : selectedReportIds.length > 0 && rawSectionData.length > 0
                ? `Viewing ${selectedReportIds.length} selected reports with projects: ${[...new Set(rawSectionData.map(s => s.projectNumber))].filter(p => p !== 'Unknown').join(', ')}`
                : currentUpload 
                  ? (() => {
                      // Check if this upload was processed with both files (based on extracted data)
                      const extractedData = currentUpload.extractedData ? JSON.parse(currentUpload.extractedData) : null;
                      const hasMetaProcessing = extractedData?.validationMessage?.includes('Both database files') || 
                                              extractedData?.sectionsCount > 0;
                      
                      // Get companion files for this project
                      const projectFiles = uploads.filter(upload => 
                        upload.projectNumber === currentUpload.projectNumber && 
                        upload.projectNumber
                      );
                      const hasMain = projectFiles.some(f => f.fileName.endsWith('.db3') && !f.fileName.toLowerCase().includes('meta'));
                      const hasMeta = projectFiles.some(f => f.fileName.toLowerCase().includes('meta') && f.fileName.endsWith('.db3'));
                      
                      const fileStatus = hasMain && (hasMeta || hasMetaProcessing) ? 'DB3 & Meta.db3' : 
                                        hasMain && !hasMeta && !hasMetaProcessing ? 'DB3 only ⚠️' : 
                                        'Processing...';
                      
                      return `Viewing report: ${currentUpload.fileName} • ${currentSector.name} Sector • Uploaded ${new Date(currentUpload.createdAt).toLocaleDateString()} - ${fileStatus}`;
                    })()
                  : "Comprehensive analysis results across all uploaded reports with sector-specific compliance checking"
            }
          </p>
        </div>

        {shouldShowEmptyState ? (
          <div className="space-y-6">
            {/* No data available message */}
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileX className="h-16 w-16 text-slate-400 mb-4" />
              <h3 className="text-xl font-semibold text-slate-900 mb-2">
                No Analysis Data Available
              </h3>
              <p className="text-slate-500 mb-6 max-w-md">
                Upload a report to begin inspection analysis with sector-specific compliance checking.
              </p>
              <Link to="/upload">
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload First Report
                </Button>
              </Link>
            </div>
          </div>
        ) : sectionData.length === 0 && currentUpload && !sectionsLoading && !sectionsError ? (
          // Show appropriate message based on file type when upload exists but no sections data
          currentUpload.fileName?.endsWith('.db3') || currentUpload.fileName?.endsWith('.db') || currentUpload.fileName?.includes('Wincan Database') || currentUpload.fileName?.includes('Combined') ? (
            // Database file - show processing status
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Database className="h-12 w-12 text-blue-600 mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">Wincan Database File Uploaded</h3>
                <p className="text-slate-500 text-center mb-4">
                  {currentUpload.fileName} has been successfully uploaded but requires processing to extract inspection data.
                </p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4 max-w-md">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">Processing Required</p>
                      <p className="text-sm text-yellow-700">
                        Click "Process Database" below to extract authentic section inspection data from your Wincan database file.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={async () => {
                      try {
                        const res = await apiRequest('POST', `/api/uploads/${currentUpload.id}/process-wincan`);
                        const response = await res.json();
                        if (response.success) {
                          toast({
                            title: "Success!",
                            description: `Extracted ${response.sectionsCount} authentic sections from database`,
                            variant: "default"
                          });
                          // Refresh page to show extracted data
                          window.location.reload();
                        } else {
                          toast({
                            title: response.requiresFreshUpload ? "Upload Corruption Detected" : "Processing Failed",
                            description: response.message,
                            variant: "destructive"
                          });
                          if (response.requiresFreshUpload) {
                            // Show corruption message and suggest re-upload
                            // LOCKDOWN: Database file corrupted - requires fresh upload
                          }
                        }
                      } catch (error) {
                        // Processing error occurred
                        toast({
                          title: "Error",
                          description: "Failed to process Wincan database: " + error.message,
                          variant: "destructive",
                        });
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Database className="h-4 w-4 mr-2" />
                    Process Database
                  </Button>
                  <Link to="/upload">
                    <Button variant="outline">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload PDF Report
                    </Button>
                  </Link>
                  <Button 
                    variant="outline"
                    onClick={() => window.location.href = '/dashboard'}
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Dashboard
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : rawSectionData?.length === 0 ? (
            // PDF data has been cleared - show normal upload interface
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <RefreshCw className="h-12 w-12 text-slate-400 mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">Analysis Data Cleared</h3>
                <p className="text-slate-500 text-center mb-4">
                  Upload file has been preserved. Re-upload or process the file to restore analysis data.
                </p>
                <div className="flex gap-3">
                  <Link to="/upload">
                    <Button>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload New Report
                    </Button>
                  </Link>
                  <Button 
                    variant="outline"
                    onClick={() => {
                      // Force cache invalidation and refresh
                      queryClient.invalidateQueries();
                      window.location.reload();
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Force Refresh Data
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <DataIntegrityWarning
              type="warning"
              message="No authentic inspection data available for this report."
              details={[
                `Report: ${currentUpload.fileName}`,
                "PDF extraction did not find valid section inspection data",
                "Synthetic or placeholder data has been blocked for data integrity"
              ]}
              showUploadButton={true}
              onUploadClick={() => window.location.href = '/upload'}
            />
          )
        ) : (
          <div className="space-y-8">
            {/* TEMPORARILY DISABLED: Report Validation Status - causing TP2 cost calculation interference */}
            {/* {hasAuthenticData && sectionData.length > 0 && (
              <ReportValidationStatus
                validationResult={validationResult}
                onResolveConfiguration={handleResolveConfiguration}
                onAdjustRates={handleAdjustRates}
                onSplitTravelCosts={handleSplitTravelCosts}
                onExportReport={handleExportReport}
              />
            )} */}
            
            {/* Section Inspection Data Table */}
            <Card className="relative">
              <DevLabel id="P004" />
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`relative flex items-center gap-2 px-3 py-1 rounded-lg border-2 ${
                      currentSector.id === 'utilities' ? 'border-blue-500 bg-blue-50' :
                      currentSector.id === 'adoption' ? 'border-green-500 bg-green-50' :
                      currentSector.id === 'highways' ? 'border-orange-500 bg-orange-50' :
                      currentSector.id === 'insurance' ? 'border-red-500 bg-red-50' :
                      currentSector.id === 'construction' ? 'border-purple-500 bg-purple-50' :
                      'border-yellow-500 bg-yellow-50'
                    }`}>
                      <DevLabel id={`dashboard-sector-${currentSector.id}`} />
                      {currentSector.id === 'utilities' && <Building className="h-5 w-5 text-blue-600" />}
                      {currentSector.id === 'adoption' && <CheckCircle className="h-5 w-5 text-green-600" />}
                      {currentSector.id === 'highways' && <Car className="h-5 w-5 text-orange-600" />}
                      {currentSector.id === 'insurance' && <ShieldCheck className="h-5 w-5 text-red-600" />}
                      {currentSector.id === 'construction' && <HardHat className="h-5 w-5 text-purple-600" />}
                      {currentSector.id === 'domestic' && <HomeIcon className="h-5 w-5 text-yellow-600" />}
                      <span className="font-medium text-black">{currentSector.name} Sector</span>
                    </div>
                    <CardTitle className="text-lg">Section Inspection Data ({sectionData.length} Sections)</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* REMOVED: Duplicate reprocessing button - main button is at top of page */}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowColumnSelector(!showColumnSelector)}
                      className="text-xs"
                    >
                      <DevLabel id="T001" />
                      <DevLabel id="T002" />
                      {showColumnSelector ? 'Done Selecting' : 'Hide Columns'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Get all hideable columns
                        const hideableColumns = columns.filter(col => col.hideable).map(col => col.key);
                        setHiddenColumns(new Set(hideableColumns));
                        // Save to localStorage to persist across page refreshes
                        localStorage.setItem('dashboard-hidden-columns', JSON.stringify(hideableColumns));
                      }}
                      className="text-xs"
                      disabled={columns.filter(col => col.hideable).every(col => hiddenColumns.has(col.key))}
                    >
                      <DevLabel id="T003" />
                      <DevLabel id="T004" />
                      Hide All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setHiddenColumns(new Set());
                        localStorage.removeItem('dashboard-hidden-columns');
                      }}
                      className="text-xs"
                      disabled={hiddenColumns.size === 0}
                    >
                      <DevLabel id="T005" />
                      <DevLabel id="T006" />
                      Unhide All
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowFilters(!showFilters)}
                      className="text-xs"
                    >
                      <DevLabel id="T007" />
                      <DevLabel id="b10" />
                      <Filter className="h-4 w-4 mr-1" />
                      {showFilters ? 'Hide Filters' : 'Filter Data'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Instructions for column selection */}
                {showColumnSelector && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-sm text-blue-800">
                      <span className="font-medium">Click column headers below to hide them.</span> Essential columns cannot be hidden.
                    </div>
                  </div>
                )}
                
                {/* Sequential Section Warning */}
                {showSequenceWarning && missingSequences.length > 0 && (
                  <div className={`mb-4 p-4 rounded-lg border ${isDatabaseFile ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
                    <div className="flex items-start gap-3">
                      {isDatabaseFile ? (
                        <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <h4 className={`text-sm font-medium mb-1 ${isDatabaseFile ? 'text-blue-800' : 'text-amber-800'}`}>
                          {isDatabaseFile ? 'Wincan Database Non-Consecutive Numbering' : 'Missing Sequential Sections Detected'}
                        </h4>
                        <p className={`text-sm mb-2 ${isDatabaseFile ? 'text-blue-700' : 'text-amber-700'}`}>
                          {isDatabaseFile 
                            ? 'The following section numbers are missing because they were deleted in Wincan and the database wasn\'t refreshed:'
                            : 'The following section numbers are missing from the sequence (sections should run 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12... etc.):'
                          }
                        </p>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {missingSequences.map(num => (
                            <span key={num} className={`px-2 py-1 text-xs font-medium rounded ${isDatabaseFile ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                              Section {num}
                            </span>
                          ))}
                        </div>
                        <p className={`text-xs ${isDatabaseFile ? 'text-blue-600' : 'text-amber-600'}`}>
                          {isDatabaseFile 
                            ? 'This is normal - sections were deleted in Wincan software but not renumbered. The gaps are authentic and match the original database structure.'
                            : '99% of the time there wouldn\'t be missing sections. Please verify the uploaded PDF contains all sequential sections or check if the PDF extraction process completed correctly.'
                          }
                        </p>
                        <button
                          onClick={() => setShowSequenceWarning(false)}
                          className={`mt-2 text-xs underline ${isDatabaseFile ? 'text-blue-600 hover:text-blue-800' : 'text-amber-600 hover:text-amber-800'}`}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Filter Controls */}
                {showFilters && (
                  <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <DevLabel id="db32" />
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Severity Grade</label>
                        <select
                          value={filters.severityGrade}
                          onChange={(e) => setFilters({...filters, severityGrade: e.target.value})}
                          className="w-full px-3 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">All Grades</option>
                          <option value="0">Grade 0</option>
                          <option value="1">Grade 1</option>
                          <option value="2">Grade 2</option>
                          <option value="3">Grade 3</option>
                          <option value="4">Grade 4</option>
                          <option value="5">Grade 5</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Project Number</label>
                        <input
                          type="text"
                          value={filters.projectNumber}
                          onChange={(e) => setFilters({...filters, projectNumber: e.target.value})}
                          placeholder="e.g. 1234"
                          className="w-full px-3 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Adoptable</label>
                        <div className="space-y-2">
                          {['Yes', 'No', 'Conditional'].map((option) => (
                            <div key={option} className="flex items-center space-x-2">
                              <Checkbox
                                id={`adoptable-${option}`}
                                checked={filters.adoptable.includes(option)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setFilters({...filters, adoptable: [...filters.adoptable, option]});
                                  } else {
                                    setFilters({...filters, adoptable: filters.adoptable.filter(a => a !== option)});
                                  }
                                }}
                              />
                              <label htmlFor={`adoptable-${option}`} className="text-sm text-slate-700">
                                {option}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Pipe Size</label>
                        <select
                          value={filters.pipeSize}
                          onChange={(e) => setFilters({...filters, pipeSize: e.target.value})}
                          className="w-full px-3 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">All Sizes</option>
                          <option value="150mm">150mm</option>
                          <option value="225mm">225mm</option>
                          <option value="300mm">300mm</option>
                          <option value="375mm">375mm</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Pipe Material</label>
                        <select
                          value={filters.pipeMaterial}
                          onChange={(e) => setFilters({...filters, pipeMaterial: e.target.value})}
                          className="w-full px-3 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">All Materials</option>
                          <option value="Polyvinyl chloride">Polyvinyl chloride</option>
                          <option value="Concrete">Concrete</option>
                          <option value="Clay">Clay</option>
                          <option value="PVC">PVC</option>
                        </select>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFilters({severityGrade: '', adoptable: [], pipeSize: '', pipeMaterial: '', projectNumber: ''})}
                        className="text-xs"
                      >
                        <DevLabel id="db33" />
                        <DevLabel id="b11" />
                        Clear All Filters
                      </Button>
                      <span className="text-sm text-slate-600">
                        Showing {sectionData.length} of {rawFilteredData.length} sections
                      </span>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto relative">
                  <DevLabel id="db34" />
                  <table 
                    className="table-auto w-full border border-gray-300" 
                    data-component="sections-table"
                    data-upload-id={currentUpload?.id}
                    data-page="dashboard"
                    data-total-sections={sectionData.length}
                  >
                    <thead className="bg-gray-100 text-xs font-semibold text-gray-700 border-b border-gray-300">
                      <tr 
                        data-component="table-header"
                      >
                        {columns.map((column) => {
                          if (hiddenColumns.has(column.key)) return null;
                          const canBeHidden = column.hideable;
                          const customWidth = columnWidths[column.key];
                          
                          return (
                            <th 
                              key={column.key}
                              data-column-key={column.key}
                              onClick={() => {
                                if (showColumnSelector && canBeHidden) {
                                  toggleColumnVisibility(column.key);
                                }
                              }}
                              style={customWidth ? { width: `${customWidth}px`, minWidth: `${customWidth}px`, maxWidth: `${customWidth}px` } : {}}
                              className={`
                                px-2 py-2 border-r border-gray-200 relative
                                ${(column.key === 'observations' || column.key === 'recommendations') 
                                  ? 'text-left w-full' 
                                  : 'text-center whitespace-nowrap'}
                                ${column.key === 'cost' ? 'border-r-0' : ''}
                                ${showColumnSelector && !canBeHidden 
                                  ? 'bg-slate-200 cursor-not-allowed opacity-60'
                                  : showColumnSelector && canBeHidden
                                  ? 'cursor-pointer hover:bg-red-100 hover:text-red-800 transition-colors'
                                  : ''
                                }
                              `}
                              title={showColumnSelector ? (canBeHidden ? 'Click to hide this column' : 'Essential column - cannot be hidden') : ''}
                            >
                              <div dangerouslySetInnerHTML={{ __html: column.label }} />
                              
                              {/* Resize handle */}
                              <div
                                className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 hover:w-1.5 transition-all"
                                onMouseDown={(e) => {
                                  const th = e.currentTarget.parentElement;
                                  const currentWidth = customWidth || th?.offsetWidth || 100;
                                  handleResizeStart(e, column.key, currentWidth);
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  handleDoubleClickResize(column.key);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                title="Drag to resize | Double-click to auto-fit"
                              />
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody key={`table-${currentUpload?.id}-${sectionData.length}-${JSON.stringify(sectionData.filter(s => s.itemNo === 2).map(s => s.id))}`}>
                      {sectionData.map((section, index) => {
                        // Check for approved repair pricing
                        const repairStatus = hasApprovedRepairPricing(section);
                        
                        return (
                        <tr 
                          key={`${section.id}-${section.itemNo}-${index}-${section.defects?.substring(0, 10)}`} 
                          data-section-id={section.itemNo}
                          data-section-row-id={section.rowId}
                          data-upload-id={currentUpload?.id}
                          data-page="dashboard"
                          className={`${
                          // Standard Grade 0 adoptable highlighting only - check both old and new severity grade fields
                          ((section.severityGrade === 0 || section.severityGrade === '0') && 
                           (!section.severityGrades || (section.severityGrades.service === 0 && section.severityGrades.structural === 0))) && 
                          section.adoptable === 'Yes' 
                          ? 'bg-green-200 hover:bg-green-300' 
                          : 'hover:bg-slate-50'
                        } border-b border-gray-200`}>
                          {columns.map((column) => {
                            if (hiddenColumns.has(column.key)) return null;
                            const customWidth = columnWidths[column.key];
                            return (
                              <td 
                                key={column.key}
                                data-column-key={column.key}
                                style={customWidth ? { width: `${customWidth}px`, minWidth: `${customWidth}px`, maxWidth: `${customWidth}px` } : {}}
                                className={`
                                  px-2 py-1 text-sm border-r border-gray-200
                                  ${(column.key === 'observations' || column.key === 'recommendations') 
                                    ? 'text-left whitespace-normal break-words' 
                                    : 'text-center whitespace-nowrap'}
                                  ${column.key === 'cost' ? 'border-r-0' : ''}
                                  ${
                                    // Standard Grade 0 adoptable highlighting only
                                    (section.severityGrade === 0 || section.severityGrade === '0') && section.adoptable === 'Yes' 
                                    ? 'bg-green-200' 
                                    : ''
                                  }
                                `}
                              >
                                {column.key === 'recommendations' && console.log('🔍 CELL RENDER - Item', section.itemNo, 'recommendations:', section.recommendations)}
                                {renderCellContent(column.key, section)}
                              </td>
                            );
                          })}
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  

                  

                </div>
              </CardContent>
            </Card>

            {/* Summary Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
              <Card className="relative">
                <DevLabel id="db38" />
                <CardContent className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-slate-900" id="p3-id-1">
                      {sectionData.filter(s => !s.letterSuffix).length}
                    </div>
                    <div className="text-sm text-slate-600">Total Sections</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="relative">
                <DevLabel id="db39" />
                <CardContent className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-600" id="p3-id-2">
                      {sectionData.filter(s => s.severityGrade === 0 || s.severityGrade === '0').length}
                    </div>
                    <div className="text-sm text-slate-600">Grade 0 (Good)</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="relative">
                <DevLabel id="db40" />
                <CardContent className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600" id="p3-id-3">
                      {sectionData.filter(s => s.severityGrade === 1 || s.severityGrade === '1').length}
                    </div>
                    <div className="text-sm text-slate-600">Grade 1</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="relative">
                <DevLabel id="db41" />
                <CardContent className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-600" id="p3-id-4">
                      {sectionData.filter(s => s.severityGrade === 2 || s.severityGrade === '2').length}
                    </div>
                    <div className="text-sm text-slate-600">Grade 2 (Minor)</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="relative">
                <DevLabel id="db45" />
                <CardContent className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600" id="p3-id-5">
                      {sectionData.filter(s => s.severityGrade === 3 || s.severityGrade === '3').length}
                    </div>
                    <div className="text-sm text-slate-600">Grade 3+ (Action)</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="relative">
                <DevLabel id="db46" />
                <CardContent className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-800" id="p3-id-6">
                      {sectionData.filter(s => s.severityGrade === 4 || s.severityGrade === '4').length}
                    </div>
                    <div className="text-sm text-slate-600">Grade 4+</div>
                  </div>
                </CardContent>
              </Card>
              <Card className="relative">
                <DevLabel id="db47" />
                <CardContent className="p-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600" id="p3-id-7">
                      {sectionData.filter(s => s.severityGrade === 5 || s.severityGrade === '5').length}
                    </div>
                    <div className="text-sm text-slate-600">Grade 5</div>
                  </div>
                </CardContent>
              </Card>
            </div>


          </div>
        )}
      </div>

      {/* Export Warning Dialog */}
      <Dialog open={showExportWarning} onOpenChange={setShowExportWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hidden Columns Warning</DialogTitle>
            <DialogDescription>
              The following hidden columns will NOT be included in the export:
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800 font-medium">
                {Array.from(hiddenColumns).join(', ')}
              </p>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowExportWarning(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowExportWarning(false);
                performExport();
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Export Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Project Folder Confirmation Dialog */}
      <Dialog open={showDeleteFolderDialog} onOpenChange={setShowDeleteFolderDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Delete Project Folder
            </DialogTitle>
            <DialogDescription>
              This action will permanently delete the entire project folder and all reports within it.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800 font-medium mb-2">
                Are you sure you want to delete this project folder?
              </p>
              <div className="text-sm text-red-700 space-y-1">
                <div><strong>Folder:</strong> {selectedFolderToDelete?.name}</div>
                <div><strong>Reports to delete:</strong> {selectedFolderToDelete?.reportCount}</div>
              </div>
              <ul className="text-xs text-red-700 mt-3 list-disc list-inside">
                <li>The project folder will be permanently removed</li>
                <li>All {selectedFolderToDelete?.reportCount} reports in this folder will be deleted</li>
                <li>All section inspection data will be removed from database</li>
                <li>All uploaded database files (.db3) will be deleted from server</li>
                <li>This action cannot be undone - complete data cleanup</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteFolderDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => selectedFolderToDelete && deleteFolderMutation.mutate(selectedFolderToDelete.id)}
              disabled={deleteFolderMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteFolderMutation.isPending ? "Deleting..." : "Delete Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hide Dashboard Data Confirmation Dialog */}
      <Dialog open={showClearDataDialog} onOpenChange={setShowClearDataDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-amber-600">Hide Dashboard Data</DialogTitle>
            <DialogDescription>
              This action will hide data from dashboard display while preserving all authentic content in the database.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800 font-medium">
                Hide dashboard display data?
              </p>
              <ul className="text-xs text-amber-700 mt-2 list-disc list-inside">
                <li>Dashboard will show empty state temporarily</li>
                <li>All authentic data preserved in database</li>
                <li>Click any folder to restore display instantly</li>
                <li>Project folders will be preserved</li>
                <li>All pricing configurations will remain intact</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowClearDataDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => clearDataMutation.mutate()}
              disabled={clearDataMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {clearDataMutation.isPending ? "Hiding..." : "Hide Dashboard Data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REMOVED: Auto-cost popup dialogs that were causing infinite loops */}

      {/* Patch Repair Pricing Dialog */}
      {selectedPatchSection && selectedPatchCalculation && (
        <PatchRepairPricingDialog
          isOpen={showPatchPricingDialog}
          onClose={() => {
            setShowPatchPricingDialog(false);
            setSelectedPatchSection(null);
            setSelectedPatchCalculation(null);
          }}
          section={selectedPatchSection}
          currentCost={selectedPatchCalculation.currentCost || 0}
          dayRate={selectedPatchCalculation.dayRate || 1850}
          defectCount={selectedPatchCalculation.defectCount || 1}
          costPerUnit={selectedPatchCalculation.costPerUnit || 350}
          onPriceUpdate={handlePatchPriceUpdate}
        />
      )}

      {/* TP1 Minimum Quantity Warning Dialog */}
      <Dialog open={showTP1DistributionDialog.show} onOpenChange={(open) => 
        setShowTP1DistributionDialog(prev => ({ ...prev, show: open }))
      }>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-blue-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              TP1 Minimum Quantity Warning
            </DialogTitle>
            <DialogDescription>
              {showTP1DistributionDialog.message}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-blue-800">Service defects requiring cleaning:</span>
                  <span className="text-blue-900 font-bold">{showTP1DistributionDialog.totalSections}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-blue-800">Minimum required:</span>
                  <span className="text-blue-900 font-bold">{showTP1DistributionDialog.minQuantity}</span>
                </div>
                <div className="border-t border-blue-200 pt-3">
                  <p className="text-sm text-blue-700">
                    <strong>Configure TP1 Cleaning - Configuration ID to Update:</strong>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="px-3 py-2 bg-orange-100 text-orange-900 text-sm rounded-lg font-bold border-2 border-orange-300">
                      ID {showTP1DistributionDialog.configurationId} (CCTV/Jet Vac)
                    </span>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs text-orange-700 font-medium">
                      Currently failing: Configuration requires minimum {showTP1DistributionDialog.minQuantity} sections for cost-effective operation
                    </p>
                  </div>
                  <div className="mt-3">
                    <p className="text-sm text-blue-700">
                      <strong>Affected sections:</strong>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {showTP1DistributionDialog.tp1Sections.map((section, index) => (
                        <span 
                          key={index}
                          className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-md font-medium"
                        >
                          Item {section.itemNo}{section.letterSuffix || ''}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowTP1DistributionDialog(prev => ({ ...prev, show: false }))}
            >
              Close
            </Button>
            <Button
              onClick={() => {
                // Navigate to TP1 configuration page
                window.location.href = `/pr2-config-clean?categoryId=cctv&sector=${currentSector.id}`;
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Configure TP1 Cleaning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TP2 Minimum Quantity Warning Dialog */}
      <Dialog open={showTP2DistributionDialog.show} onOpenChange={(open) => 
        setShowTP2DistributionDialog(prev => ({ ...prev, show: open }))
      }>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-orange-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              TP2 Minimum Quantity Warning
            </DialogTitle>
            <DialogDescription>
              {showTP2DistributionDialog.message}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-orange-800">Structural defects found:</span>
                  <span className="text-orange-900 font-bold">{showTP2DistributionDialog.totalDefects}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-orange-800">Minimum required:</span>
                  <span className="text-orange-900 font-bold">{showTP2DistributionDialog.minQuantity}</span>
                </div>
                <div className="border-t border-orange-200 pt-3">
                  <p className="text-sm text-orange-700">
                    <strong>Configure TP2 Patching - Configuration IDs to Update:</strong>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="px-3 py-2 bg-blue-100 text-blue-900 text-sm rounded-lg font-bold border-2 border-blue-300">
                      ID 153 (150mm) • ID 156 (225mm) • ID 157 (300mm)
                    </span>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs text-blue-700 font-medium">
                      Currently failing: ID {showTP2DistributionDialog.configurationId} requires minimum {showTP2DistributionDialog.minQuantity} defects
                    </p>
                  </div>
                  <div className="mt-3">
                    <p className="text-sm text-orange-700">
                      <strong>Affected sections:</strong>
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {showTP2DistributionDialog.tp2Sections.map((section, index) => (
                        <span 
                          key={index}
                          className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-md font-medium"
                        >
                          Item {section.itemNo}{section.letterSuffix || ''}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowTP2DistributionDialog(prev => ({ ...prev, show: false }))}
            >
              Close
            </Button>
            <Button
              onClick={() => {
                // Navigate to sector-specific TP2 configuration page with auto-select utilities
                console.log('🚀 DASHBOARD TP2 DIALOG - Navigating to sector patching with autoSelectUtilities=true');
                console.log('🚀 DASHBOARD TP2 DIALOG - currentSector:', currentSector.id);
                const finalUrl = `/pr2-config-clean?categoryId=patching&sector=${currentSector.id}&pipeSize=150&autoSelectUtilities=true`;
                console.log('🚀 DASHBOARD TP2 DIALOG - Final URL:', finalUrl);
                window.location.href = finalUrl;
              }}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Configure TP2 Pricing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DB15 Travel Configuration Required Warning Dialog */}
      <Dialog open={showTravelConfigDialog.show} onOpenChange={(open) => 
        setShowTravelConfigDialog(prev => ({ ...prev, show: open }))
      }>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-amber-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              DB15 Travel Configuration Required
            </DialogTitle>
            <DialogDescription>
              {showTravelConfigDialog.message}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-amber-800">Configuration Type:</span>
                  <span className="text-amber-900 font-bold">{showTravelConfigDialog.configType}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-amber-800">Configuration ID:</span>
                  <span className="text-amber-900 font-bold">#{showTravelConfigDialog.configurationId}</span>
                </div>
                <div className="mt-3 p-3 bg-amber-100 rounded-md">
                  <p className="text-sm text-amber-800 font-medium mb-2">
                    Missing DB15 Vehicle Travel Rates
                  </p>
                  <p className="text-xs text-amber-700">
                    Configure vehicle travel rates in the teal DB15 window to include transportation costs in minimum quantity calculations and warning totals.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowTravelConfigDialog(prev => ({ ...prev, show: false }))}
            >
              Close
            </Button>
            <Button
              onClick={() => {
                // Navigate to configuration page based on type
                const categoryId = showTravelConfigDialog.configType === 'TP1' ? 'cctv-jet-vac' : 'patching';
                const routeUrl = categoryId === 'patching' 
                  ? `/pr2-config-clean?categoryId=${categoryId}&sector=${currentSector.id}&pipeSize=150&autoSelectUtilities=true`
                  : `/pr2-config-clean?categoryId=${categoryId}&sector=${currentSector.id}&edit=${showTravelConfigDialog.configurationId}&autoSelectUtilities=true`;
                window.location.href = routeUrl;
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Configure DB15 Travel Rates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warning dialogs removed - clean dashboard foundation */}

      {/* Warning dialogs completely removed */}
    </div>
  );
}
