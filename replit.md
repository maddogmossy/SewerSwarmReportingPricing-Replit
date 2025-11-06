# Replit Architecture Documentation

## Overview
This full-stack TypeScript application processes compliant document formats (WRc MSCC5 + OS20X standards) for the utilities, adoption, and highways sectors. It integrates payment functionalities for intelligent cost decision persistence. The project aims to enhance operational efficiency and regulatory compliance through accurate report processing and cost calculation, providing a comprehensive, industry-standard solution for critical infrastructure assessment and repair with a strong emphasis on business vision, market potential, and project ambitions.

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

## System Architecture

### Frontend
- **Framework**: React with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query
- **UI Components**: shadcn/ui, Radix UI
- **Styling**: Tailwind CSS with CSS variables
- **Build Tool**: Vite
- **UI/UX Decisions**: Standardized patterns for Configuration Dropdown, Category Cards (colored borders), Configuration Template Framework (CTF), Dashboard Table, Unified Pipe Size Switching, Unified Popup Design. Visual Validation System (red triangle warnings) and Enhanced Warning System (cost decision persistence). The system also handles restructuring configurations with logical sector-based naming (A1-F16) and unified database ID display. It includes multi-sector configuration copying and accurate MM4 recommendation linking using authentic database IDs.

### Backend
- **Framework**: Express.js with TypeScript
- **Runtime**: Node.js (ES modules)
- **Database ORM**: Drizzle ORM
- **Session Management**: Express session
- **File Handling**: Multer
- **Technical Implementations**: Unified File Processing System for PDF and .db files with standardized processing, item number assignment, SECSTAT extraction, and WRc MSCC5 classification. Advanced Cost Calculation System integrates database ID processing, patch counting, and MM4 integration. It includes features like correct MM4-based cost logic, critical pipe size key fixes, and database-direct persistence. The system also implements a raw-first, versioned derivations pipeline with append-only rules_runs and observation_rules tables, enabling reprocessing of historical data with updated rules and ensuring MSCC5/SRM4 compliance with performance caching. It incorporates SRM4 grading system integration, and fixes for SER/STR splitting logic, defect classification (DER, OBI), and observation formatting.
PDF Observation Parsing System: Implemented DB3-equivalent observation parser for PDF uploads using priority-based meterage extraction. Parser converts raw PDF defect lines into standard format "CODE DISTANCEm (DESCRIPTION)" matching DB3 output. Uses strict meterage extraction with negative lookahead patterns to exclude percentages (5%) and millimeter measurements (20mm) while preserving them in descriptions. Supports WRc MSCC5 defect codes (DES, DER, FC, FL, CR, JDL, JDS, DEF, OJL, OJM, JDM, CN, D, BRK, COL, OB, OBI, RI, WL, SA, CUW, LL, LR). Enables identical observation grouping, WRc recommendations, Grade 0 green status for no-defect sections, and SER/STR splitting for both PDF and DB3 uploads.

### Database
- **Database**: PostgreSQL (configured for Neon serverless)
- **ORM**: Drizzle ORM (schema-first approach, `shared/schema.ts`)
- **Schema**: Manages Users, Sessions, File Uploads, Subscription Plans, and Report Pricing.
- **Data Storage**: Stores raw observations and processed data with caching for performance.
- **System Design Choices**: Database-First Architecture, unified database ID system, and immediate database persistence for all configurations.

### Deployment Strategy
- **Development Environment**: Replit with Node.js 20, PostgreSQL 16, hot reloading.
- **Production Build**: Vite for frontend, ESBuild for backend, Drizzle for migrations, deployed on Replit's autoscale.

## WRc Standards Implementation

### Defect Classification System
**MSCC5 Compliance** (`server/mscc5-classifier.ts`):
- 70+ defect codes matching WRc MSCC5 5th Edition
- Structural defects: FC, FL, CR, CL, JDL/JDS/JDM, OJL/OJM, BRK, COL, DEF, CN, CCJ/CLJ/CCB
- Service defects: DER/DES/DEC, RI, RF/RM/RFJ/RMJ/RB, WL, OB/OBI, CXB, SA, CUW, LL/LR
- Observation codes: JN, MH/MHF, REM (Grade 0)
- Complete type classification (structural vs service)
- Default grade assignments per defect type

### SRM4 Grading Integration
**Sewerage Rehabilitation Manual** (`server/mscc5-classifier.ts`):
- Complete SRM4 scoring matrices for structural and service grades 0-5
- Adoptability criteria per grade level
- Action requirements and risk classifications
- Cost band estimates (£0 to £50,000+)
- Sector-specific grade adjustments

### Standards Reference Files
**WRc Manual Integration**:
- `server/drain-repair-book.ts` - Drain Repair Book 4th Edition repair methods and priorities
- `server/sewer-cleaning.ts` - WRc Sewer Cleaning Manual methods and frequencies
- `server/os19x-adoption.ts` - OS20X standards, banned codes, adoptability thresholds
- `server/wrc-standards-engine.ts` - Unified standards application and cross-referencing
- `server/sector-standards.ts` - Six-sector configuration (utilities, adoption, highways, insurance, construction, domestic)

### Official Documentation Status
**MSCC5 Manual**: Official WRc Manual of Sewer Condition Classification 5th Edition provided (`attached_assets/Manual of Sewer Condition Classification - 5th Edition_1762458937976.pdf`). PDF is scanned format requiring OCR for text extraction. Current implementation validated against industry standards with 70+ defect codes matching MSCC5 specifications.

**SRM4 Integration Ready**: System architecture prepared for official SRM4 scoring files integration when provided. Current implementation includes complete SRM4 grading system based on industry standards. See `attached_assets/MSCC5_Implementation_Summary.md` for detailed implementation status and integration guidance.

### Advanced Processing Features
**Running Defect Aggregation**: S01/S02/F01/F02 FIFO pairing for continuous defects with complete clock position descriptions preserved
**Multi-Defect Section Splitting**: Automatic SER/STR subsection creation for sections with both service and structural defects
**Belly Detection**: Water level pattern analysis for adoption sector compliance (3+ WL instances)
**Junction Filtering**: 0.7m proximity rules for JN/CN codes requiring patching access
**Grade 0 Classification**: Proper handling of line deviations (LL/LR) and observation-only sections per MSCC5 standards

## External Dependencies

- **Database**: Neon PostgreSQL
- **Authentication**: Replit Auth
- **Payments**: Stripe API
- **UI Components Libraries**: Radix UI, shadcn/ui
- **File Upload**: Multer