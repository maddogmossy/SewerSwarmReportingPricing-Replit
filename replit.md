# Replit Architecture Documentation

## Overview
This full-stack TypeScript application processes compliant document formats (WRc MSCC5 + OS20X standards) for the utilities, adoption, and highways sectors. It integrates payment functionalities for intelligent cost decision persistence. The project aims to enhance operational efficiency and regulatory compliance through accurate report processing and cost calculation, providing a comprehensive, industry-standard solution for critical infrastructure assessment and repair.

## User Preferences
Stability Priority: User prioritizes app stability over advanced features - avoid breaking working functionality
Screen Flashing Issue: Complex helper functions cause screen flashing - prefer simple implementations
Performance Focus: Remove complex useCallback functions that recreate on every render
Validation Preferences: Use visual red triangle warnings in browser interface instead of browser alert popups
Dashboard Button Policy: Dashboard button should handle save functionality with validation - never add separate save buttons without explicit user request
Category Card Design: Use colored borders instead of background fills - colors should appear as borders, not full card backgrounds
UI Design:
- TP1 (cleanse/survey) and TP2 (repair) popups should have identical styling and layout
- Use category card icons instead of generic icons (Edit for patching, PaintBucket for lining, Pickaxe for excavation)
- Make entire UI containers clickable rather not separate buttons
- CCTV/Jet Vac should be first option with "Primary" badge
Zero Synthetic Data Policy: NEVER create, suggest, or use mock, placeholder, fallback, or synthetic data.
Database-First Architecture: System uses pure database-first approach without buffer layers. All UI values reflect authentic database state with immediate persistence.
Mandatory User Approval Rule: MUST ask/check with user before making any changes.
Uniform Recommendation System: Use only the triangle warning system for ALL recommendations (service and structural), following WRc MSCC5 + OS20X standards from Drain Repair Book (4th Ed.).
WRc Classification Standards: All defect types including line deviations (LL/LR) must be properly recognized and classified according to WRc MSCC5 standards for accurate severity grading and recommendations.
Critical CXB Classification Fix: CXB (Connection defective, connecting pipe is blocked) is definitively classified as SERVICE defect (Grade 4) per MSCC5 standards, NOT structural.
Unified Processing Standards: All database uploads processed with identical logic using priority-based item numbering and automatic schema detection for consistent results across all report formats.
F606 MM4-150 Auto-Population Fix: Implement automatic population of purple length range fields in F606 configurations based on detected maximum total lengths from dashboard sections, with 10% safety buffer for proper cost calculation linking.
Navigation Defaults: System must always default to Utilities sector first. Dashboard entry should preserve report sector context.
Multi-Sector Price Copying: Sector cards support Ctrl+Click for selecting multiple sectors for price copying functionality across highlighted sectors.
Single Source Day Rate System: Eliminated dual storage confusion by migrating all day rates from `pricing_options` to MM4 blue values only. System now reads day rates exclusively from `mm_data.mm4Rows[0].blueValue`.
F606→F690 Configuration Migration: Completed full migration from deleted F606 configurations to F690. All hardcoded references updated (UI components, routing, equipment priority defaults, status codes, and navigation). Added automatic redirect from deleted F606 URLs to F690 configurations.
A1-F16 Sector Card System: Restructured PR2 configurations with logical sector-based naming (Utilities=A1-A16, Adoption=B1-A16, Highways=C1-A16, Insurance=D1-A16, Construction=E1-E16, Domestic=F1-F16). Each sector gets identical equipment types.
Unified Database ID System: DevLabels display actual database IDs (756, 757, 790, etc.) instead of hardcoded F-numbers. All 96 category cards (6 sectors × 16 categories) have complete database records with proper A1-F16 naming and unified ID display.
Multi-Sector Configuration Copying: Implemented MMP1 ID7-12 sector copying system. Users configure rates in one sector (e.g., id7/Utilities), then select additional sector IDs (id8-12) to automatically copy pricing and calculations.
MM4 Recommendation Linking Fix: Eliminated all hardcoded legacy routing (id=615) from MM4 structural recommendations. System now uses authentic A1-F16 database ID routing (763=A8-Utilities, 772=B8-Adoption, 806=C8-Highways, etc.) for proper sector-specific patching configuration linking. Removed all legacy patching-mm4-225 patterns and replaced with dynamic categoryId=patching routing for complete database-first consistency.
DevLabel Database-First Restoration: Fixed critical DevLabel display system to show authentic database IDs (759, 760, 763, etc.) instead of category names or A-series labels. Restored database-first architecture where A1-F16 system applies to sectors only, while category cards maintain authentic database ID references essential for existing code dependencies. Updated ID 760 category_name from "CCTV/Jet Vac" to "A5 - CCTV/Jet Vac" for naming consistency.
MM4 Purple Field Correction: Fixed critical mislabeling of MM4 purple fields from "Debris %"/"Length" to correct "Min Quantity"/"Min Patches" with proper numeric placeholders (3, 4) instead of range placeholders (0-15, 0-35). Purple fields now correctly represent minimum patch quantity requirements for cost calculation logic.
Dashboard Cost Calculation Fix: Implemented correct MM4-based cost logic using green values (cost per 1mts patch) × defect count with minimum quantity validation. Day rate (£1650) now only applies when defect count falls below purple minimum quantities. Red cost display properly triggers when day rate applied due to minimum thresholds not being met.
Critical Pipe Size Key Fix: Corrected dashboard MM4 data access using proper pipe size key format (225-2251) instead of malformed keys (225-22551). System now properly accesses MM4 green values and purple minimum quantities for accurate cost calculations.
Purple Field Repurposing Complete: Successfully repurposed existing purple database fields (purpleDebris/purpleLength) to store minimum patch quantities while maintaining field name compatibility. UI displays correct "Min Quantity"/"Min Patches" with test values (3, 4) working properly.
Database-Direct Persistence Implementation: Eliminated buffer contamination system across all MMP1Template configurations (ID763, etc.). Removed localStorage interference and debounce delays, implementing immediate database persistence following proven ID759/760 pattern. Fixed critical data reappearance issue and ensures single source of truth from database.
Item 13a Pricing Resolution: Fixed 'D' defect pattern recognition in structural defect matching regex to include 'D' (Deformed sewer/drain) for Item 13a compatibility. Corrected MSCC5 structural codes pattern: /\b(FC|FL|CR|JDL|JDS|DEF|OJL|OJM|JDM|CN|D)\b/ ensures proper routing to ID763 patching configuration.
MM4 Input Blocking Elimination: Removed triggerAutoSave conflicts from updateMM4Row function that caused input freezing during data entry. Implemented conflict-free database-direct updates allowing users to complete typing without interference.
F615 Legacy System Complete Removal: Eliminated all remaining F615 structural patching references, replacing with modern MM4-based patching calculations. Updated method names and status codes from 'F615 Structural Patching'/'f615_calculated' to 'MM4 Structural Patching'/'mm4_calculated' for consistency.
Complete localStorage Contamination Purge: Verified and confirmed elimination of all localStorage.setItem/getItem calls from MMP1Template. System now operates on pure database-first architecture without buffer layer contamination.
Standardized Observation Display Format: Implemented unified format for all SER and STR observations with bold quoted MSCC5 codes, consistent bullet points, and proper meterage placement. Format: `• <b>"CODE"</b> - Description` for service defects with meterage in description, and `• <b>"CODE"</b> - Description at XXXm` for structural defects with meterage at end. Uses HTML bold tags for proper rendering.
Conditional SC Code Extraction: SC (pipe size changes) codes are only extracted and displayed when structural defects are present in the same section, following WRc MSCC5 standards where SC codes are only operationally significant when combined with structural issues requiring repair. Service-only and no-defect sections completely ignore SC codes.
Raw Data Architecture Implementation: Successfully implemented clean separation between data extraction and processing logic. Raw observations stored in `rawObservations` array field, SECSTAT grades in `secstatGrades` JSON field, processing applied on-demand using current MSCC5 rules. Architecture eliminates mixed concerns and enables immediate application of rule changes to all historical data.
Complete MSCC5 Validation System: Observation-only sections (line deviations, OBI codes) correctly classified as Grade 0 per WRc MSCC5 standards. System properly distinguishes between observation data and actual defects requiring grading.
Critical Deformity Classification Fix: Resolved structural defect misclassification where deformity defects were incorrectly labeled as service instead of structural. Implemented structural priority override that forces all deformity defects to structural classification with minimum Grade 2, preventing SECSTAT or classification overrides.
Performance Optimization Implementation: Implemented critical performance enhancement by adding processed data caching fields (processedDefectType, processedSeverityGrade, processedSeverityGrades, processedRecommendations, processedAdoptable, processedSrmGrading, processedAt) to sectionInspections table. System now stores processed results in database after initial processing, enabling sub-second dashboard loads instead of reprocessing. Maintains uniform raw data architecture while eliminating redundant computation through intelligent result caching.
Complete SRM4 Integration: Successfully integrated full SRM4 grading system from attached files with complete database storage in processedSrmGrading field. All header information (project details, inspection metadata, technical specifications) already extracted during initial processing. System now provides comprehensive MSCC5+SRM4 compliant analysis with authentic data extraction from WinCan db3 files and optimal performance through intelligent caching architecture.
MMP1 Grid System Architecture Complete Fix: Restored original approved ID7-ID12 six-sector system for cross-sector price copying functionality. Fixed corruption where equipment cards replaced sector cards, breaking multi-sector configuration copying. System now correctly displays utilities (ID7), adoption (ID8), highways (ID9), insurance (ID10), construction (ID11), domestic (ID12) sector cards with proper ID7-ID12 devId labels. Fixed click on/off functionality by simplifying selection state logic. Restored auto-selection to target 'utilities' sector for structural recommendations from dashboard navigation. Maintains A1-F16 equipment categories within each sector.
MM4 Double Layer Patch Row Access Fix: Implemented intelligent row selection logic for MM4 cost calculations. Double layer patches now correctly access row 2 (matchingMM4Data[1]) while other patch types use row 1 (matchingMM4Data[0]). Applied to both calculateID763StructuralPatching and general cost calculation functions for consistent behavior.
Versioned Derivations Pipeline Implementation: Successfully implemented complete raw-first, versioned derivations system with append-only rules_runs and observation_rules tables. New pipeline creates versioned MSCC5/WRc outputs per upload run, enabling reprocessing of historical data with updated rules while maintaining backward compatibility. Feature flag USE_LATEST_RULES_RUN controls pipeline activation. Architecture supports pure raw-first approach with no mutation of canonical sectionInspections processed* fields during transition period.
SER/STR Splitting Logic Fix: Fixed critical splitting logic issues in versioned derivations pipeline. Corrected suffix assignment where service defects get original item numbers (no suffix) and structural defects get "a" suffix (e.g., Item 13, Item 13a).
Double-Suffix Application Fix: Eliminated "aa" suffix generation bug by preventing double-processing. Fixed applySplittingLogic() to use pre-processed itemNo from MSCC5Classifier instead of re-applying suffix transformations. Implemented proper numeric sorting in API response to ensure systematic 1→24 section ordering. Service sections maintain original numbers (13) while structural sections get single "a" suffix (13a) as per WRc MSCC5 standards.
Critical DER Defect Classification Fix: Fixed misclassification of DER (Settled deposits) from structural to service defect type in MSCC5Classifier. Added explicit serviceDefects array including DER, DES, OB, OBI, RI, WL, SA, CUW codes. Enhanced error handling and comprehensive logging throughout versioned derivations pipeline for better debugging and monitoring. Fixed observation_rules population with complete metadata including itemNo, originalItemNo, and splitCount.
PIN 7461 Observation Formatting Standardization: Fixed critical double-formatting conflict between HTML-based formatStandardizedObservation() and React-based ObservationRenderer. Replaced HTML tag generation with clean text preprocessing that removes HTML artifacts and formats observations consistently. All dashboard observations now display with proper bullet points (•), bold defect codes using React ** elements, and standardized "CODE" - Description format. Eliminated raw HTML display issues (**"DES"**) and missing defect codes. Enhanced ObservationRenderer pattern matching for MSCC5 codes including D, COL, BRK variants.
Structural Recommendation Routing Fix: Fixed critical routing issue where clicking on structural recommendation boxes routed to generic "Id patching" page instead of specific ID 763 configuration. Updated RepairOptionsPopover to route directly to `/pr2-config-clean?editId=763` ensuring users access the authentic A8-Utilities Patching configuration. This eliminates confusion between generic patching pages and the actual database-driven ID 763 configuration used by the cost calculation system.
Generic Page Creation Prevention: Fixed critical routing issues in both CleaningOptionsPopover and PR2ConfigClean that created generic "Id [category]" pages instead of routing to specific database configurations. Updated CleaningOptionsPopover to route directly to ID 760 (CCTV/Jet Vac) and ID 759 (CCTV/Van Pack). Enhanced PR2ConfigClean with category mapping to prevent fallback to generic page creation mode. This ensures all equipment selections route to authentic database configurations.
Item 13a Double Suffix Display Fix: Fixed frontend display bug in getItemNumberWithSuffix() causing "aa" suffix generation (13aa instead of 13a). Added duplicate suffix detection preventing double concatenation when MSCC5Classifier already includes suffix in itemNo field. Implemented safe concatenation logic with explicit suffix duplication check. Frontend now correctly displays single "a" suffixes (13a, 21a) per WRc MSCC5 standards without display-layer-corruption.
MSCC5 Defect Classification System Complete Audit: Fixed critical OBI defect misclassification from structural to service type, correcting constants/logic inconsistency. Enhanced pattern matching coverage adding JDM, OJM, OJL, CN, SA, CUW recognition for descriptive text parsing. Implemented comprehensive Open Joint detection fix for Item 22 splitting logic gap where "Open joint - major" text was missed due to missing OJM pattern matching. Added complete MSCC5 defect code coverage in parseAllDefectsFromText with all 19 authentic WRc defect codes. System now properly processes mixed service/structural sections with accurate SER/STR defect splitting per MSCC5 standards.
Critical Splitting Logic Defect Code Preservation Fix: Fixed critical bug in splitMultiDefectSection() where split subsections (13a, 21a, 22a) lost original defect codes during processing. Changed splitting logic from using d.description to d.code + d.description format, ensuring defect codes (DEF, DER, OJM, etc.) are preserved in split subsections. This enables ObservationRenderer to properly detect and bold defect codes in both parent sections and split subsections, maintaining WRc MSCC5 compliance display standards across all dashboard observations.
Dashboard API Endpoint Migration to Versioned Derivations: Fixed critical STR items pricing/recommendations missing issue by migrating dashboard from legacy `/api/uploads/:uploadId/sections` to `/api/versioned-sections?uploadId=X` endpoint. This restores complete MSCC5/WRc analysis data including MM4-based cost calculations, structured recommendations, and estimated costs for all structural defect items. Implementing fallback mechanism to legacy endpoint for backward compatibility during transition period.
ID 763 Pricing System Validation Complete: Conducted comprehensive senior code writer investigation confirming ID 763 dashboard pricing display operates correctly through versioned derivations pipeline. System properly fetches MM4 cost data (£350-£510 per patch based on pipe size) from authentic database configuration. Investigation verified complete elimination of legacy f-series patterns (f615/f606/f690) and confirmed no legacy id1-6 contamination. Architecture validated as database-first with clean MM4 integration through rules-runner-simple.ts calculateStructuralCosts() function.

## System Architecture

### Frontend
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query
- **UI Components**: shadcn/ui, Radix UI
- **Styling**: Tailwind CSS with CSS variables
- **Build Tool**: Vite
- **UI/UX Decisions**: Standardized patterns for Configuration Dropdown, Category Cards (colored borders), Configuration Template Framework (CTF), Dashboard Table, Unified Pipe Size Switching, Unified Popup Design. Visual Validation System (red triangle warnings) and Enhanced Warning System (cost decision persistence).

### Backend
- **Framework**: Express.js with TypeScript
- **Runtime**: Node.js (ES modules)
- **Database ORM**: Drizzle ORM
- **Session Management**: Express session
- **File Handling**: Multer
- **Technical Implementations**: Unified File Processing System for PDF and .db files with standardized processing, item number assignment, SECSTAT extraction, and WRc MSCC5 classification. Advanced Cost Calculation System integrates database ID processing, patch counting, and MM4 integration.
- **Data Processing**: Implements a raw-first, versioned derivations pipeline with caching for performance, supporting reprocessing of historical data with updated rules and ensuring MSCC5/SRM4 compliance.

### Database
- **Database**: PostgreSQL (configured for Neon serverless)
- **ORM**: Drizzle ORM (schema-first approach, `shared/schema.ts`)
- **Schema**: Manages Users, Sessions, File Uploads, Subscription Plans, and Report Pricing.
- **Data Storage**: Stores raw observations and processed data with caching for performance.

### Deployment Strategy
- **Development Environment**: Replit with Node.js 20, PostgreSQL 16, hot reloading.
- **Production Build**: Vite for frontend, ESBuild for backend, Drizzle for migrations, deployed on Replit's autoscale.

## External Dependencies

- **Database**: Neon PostgreSQL
- **Authentication**: Replit Auth
- **Payments**: Stripe API
- **UI Components Libraries**: Radix UI, shadcn/ui
- **File Upload**: Multer