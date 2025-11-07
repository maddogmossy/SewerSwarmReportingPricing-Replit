import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

import { ChevronLeft, Calculator, Coins, Package, Gauge, Zap, Ruler, ArrowUpDown, Edit2, Trash2, ArrowUp, ArrowDown, BarChart3, Building, Building2, Car, ShieldCheck, HardHat, Users, Settings, ChevronDown, Save, Lock, Unlock, Target, Plus, DollarSign, Hash, TrendingUp, Truck, Banknote, Scissors, AlertTriangle, RotateCcw, X, Wrench, Shield } from 'lucide-react';
import { DevLabel } from '@/utils/DevLabel';
import { MMP1Template } from '@/components/MMP1Template';
import { MMP2Template } from '@/components/MMP2Template';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';

interface PricingOption {
  id: string;
  label: string;
  enabled: boolean;
  value: string;
}

interface RangeOption {
  id: string;
  label: string;
  enabled: boolean;
  rangeStart: string;
  rangeEnd: string;
}

interface VehicleTravelRate {
  id: string;
  vehicleType: string;
  hourlyRate: string;
  numberOfHours: string;
  enabled: boolean;
}

interface CleanFormData {
  categoryName: string;
  description: string;
  categoryColor: string;
  pipeSize: string;
  
  // Blue Window - Pricing Options
  pricingOptions: PricingOption[];
  
  // Green Window - Quantity Options
  quantityOptions: PricingOption[];
  
  // Orange Window - Min Quantity Options
  minQuantityOptions: PricingOption[];
  
  // Purple Window - Range Options
  rangeOptions: RangeOption[];
  
  // Teal Window - Vehicle Travel Rates
  vehicleTravelRates: VehicleTravelRate[];
  
  // Math Operations
  mathOperators: string[];
  
  // Stack Order
  pricingStackOrder: string[];
  quantityStackOrder: string[];
  minQuantityStackOrder: string[];
  rangeStackOrder: string[];
  vehicleTravelRatesStackOrder: string[];
  
  sector: string;
}

// Pipe sizes configuration
const PIPE_SIZES = ['100', '125', '150', '175', '200', '225', '250', '275', '300', '350', '375', '400', '450', '500', '525', '600', '675', '750', '825', '900', '975', '1050', '1200', '1350', '1500'];

// Sector definitions
const SECTORS = [
  { id: 'utilities', name: 'Utilities', label: 'Utilities', devId: 'A1-A16', description: 'Water and utility infrastructure projects', icon: Building, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  { id: 'adoption', name: 'Adoption', label: 'Adoption', devId: 'B1-B16', description: 'New infrastructure adoption and inspection', icon: Building2, color: 'text-teal-600', bgColor: 'bg-teal-50' },
  { id: 'highways', name: 'Highways', label: 'Highways', devId: 'C1-C16', description: 'Road and highway drainage systems', icon: Car, color: 'text-orange-600', bgColor: 'bg-orange-50' },
  { id: 'insurance', name: 'Insurance', label: 'Insurance', devId: 'D1-D16', description: 'Insurance claims and assessment work', icon: ShieldCheck, color: 'text-red-600', bgColor: 'bg-red-50' },
  { id: 'construction', name: 'Construction', label: 'Construction', devId: 'E1-E16', description: 'Construction site and development projects', icon: HardHat, color: 'text-cyan-600', bgColor: 'bg-cyan-50' },
  { id: 'domestic', name: 'Domestic', label: 'Domestic', devId: 'F1-F16', description: 'Residential and domestic drainage work', icon: Users, color: 'text-amber-600', bgColor: 'bg-amber-50' }
];

// MMP1 SECTOR DEFINITIONS - ID7-ID12 System (Cross-Sector Price Copying)
const MMP1_IDS = [
  { id: 'utilities', name: 'Utilities', label: 'ID7', devId: 'ID7', description: 'Water, gas, electricity and telecommunications infrastructure', icon: Building, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  { id: 'adoption', name: 'Adoption', label: 'ID8', devId: 'ID8', description: 'New development infrastructure adoption processes', icon: Building2, color: 'text-teal-600', bgColor: 'bg-teal-50' },
  { id: 'highways', name: 'Highways', label: 'ID9', devId: 'ID9', description: 'Road infrastructure and highway drainage systems', icon: Car, color: 'text-orange-600', bgColor: 'bg-orange-50' },
  { id: 'insurance', name: 'Insurance', label: 'ID10', devId: 'ID10', description: 'Insurance claim assessment and documentation', icon: ShieldCheck, color: 'text-red-600', bgColor: 'bg-red-50' },
  { id: 'construction', name: 'Construction', label: 'ID11', devId: 'ID11', description: 'Construction project infrastructure services', icon: HardHat, color: 'text-cyan-600', bgColor: 'bg-cyan-50' },
  { id: 'domestic', name: 'Domestic', label: 'ID12', devId: 'ID12', description: 'Residential and domestic property services', icon: Users, color: 'text-amber-600', bgColor: 'bg-amber-50' }
];

// Removed P26 Upper Level Data Structure - deprecated
// REMOVED - Now using database queries directly

// Category ID to A1-F16 page ID mapping
const CATEGORY_PAGE_IDS = {
  'cctv': 'A1',
  'van-pack': 'A2', 
  'jet-vac': 'A3',
  'cctv-van-pack': 'A4',
  'cctv-jet-vac': 'A5',
  'directional-water-cutter': 'A6',
  'ambient-lining': 'A9',
  'hot-cure-lining': 'A10',
  'uv-lining': 'A11',
  'ims-cutting': 'A12',
  'excavation': 'A13',
  'patching': 'A8',
  'robot-cutting': 'A14',
  'tankering': 'A15'
};

const SECTOR_CONFIG = {
  utilities: { textColor: 'text-blue-600', bgColor: 'bg-blue-50' },
  adoption: { textColor: 'text-teal-600', bgColor: 'bg-teal-50' },
  highways: { textColor: 'text-orange-600', bgColor: 'bg-orange-50' },
  insurance: { textColor: 'text-red-600', bgColor: 'bg-red-50' },
  construction: { textColor: 'text-cyan-600', bgColor: 'bg-cyan-50' },
  domestic: { textColor: 'text-amber-600', bgColor: 'bg-amber-50' }
};

// Define SECTOR_OPTIONS based on SECTORS array
const SECTOR_OPTIONS = SECTORS;

// Color options for MM4-225 templates
const COLOR_OPTIONS = [
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#10b981' },
  { name: 'Purple', hex: '#8b5cf6' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Gray', hex: '#6b7280' },
  { name: 'Black', hex: '#1f2937' }
];

export default function PR2ConfigClean() {
  const [location, setLocation] = useLocation();

  
  // Get URL parameters safely using window.location.search
  const searchParams = window.location.search;
  const urlParams = new URLSearchParams(searchParams);
  
  const sector = urlParams.get('sector') || 'utilities';
  const categoryId = urlParams.get('categoryId');
  const editId = urlParams.get('edit') || urlParams.get('editId') || urlParams.get('id'); // Support auto-detection ID
  const pipeSize = urlParams.get('pipeSize') || urlParams.get('pipe_size');
  const configName = urlParams.get('configName');
  const sourceItemNo = urlParams.get('itemNo');
  const selectedOptionId = urlParams.get('selectedOption'); // Track which option is selected for editing
  const selectedId = urlParams.get('selectedId'); // Track MMP1 sector selection from dashboard (utilities, adoption, etc.)
  const autoSelectUtilities = urlParams.get('autoSelectUtilities') === 'true'; // Auto-select utilities tab in MM1
  const reportId = urlParams.get('reportId'); // Preserve current upload ID for navigation back to dashboard
  const isEditing = !!editId;
  console.log('🔍 EDIT STATE DEBUG:', { editId, isEditing, hasEditIdInUrl: !!(urlParams.get('edit') || urlParams.get('editId') || urlParams.get('id')) });
  
  // Determine template type based on category - DATABASE-FIRST APPROACH
  const getTemplateType = (categoryId: string): 'MMP1' | 'MMP2' => {
    // All equipment configurations use MMP1 template with database-driven logic
    if (
      // Equipment Configurations (All use MMP1 template with authentic database IDs)
      categoryId === 'cctv-jet-vac' ||           // ID760 - CCTV + Jet Vac
      categoryId === 'cctv-van-pack' ||          // ID759 - CCTV + Van Pack  
      categoryId === 'cctv-cleansing-root-cutting' || // CCTV + Cleansing + Root Cutting
      categoryId === 'cctv' ||                   // CCTV only
      categoryId === 'directional-water-cutter' || // Directional Water Cutter
      categoryId === 'patching' ||               // Patching
      categoryId === 'f-robot-cutting' ||        // Robotic Cutting
      categoryId === 'ambient-lining' ||         // Ambient Lining
      categoryId === 'hot-cure-lining' ||        // Hot Cure Lining
      categoryId === 'uv-lining' ||              // UV Lining
      categoryId === 'excavation' ||             // Excavation
      categoryId === 'tankering' ||              // Tankering
      // Individual Equipment Types
      categoryId === 'van-pack' ||               // Van Pack only
      categoryId === 'jet-vac' ||                // Jet Vac only  
      // Test Configuration
      categoryId === 'test-card' ||              // Test Card
      categoryId === 'day-rate-db11'             // Legacy redirect to MMP1
    ) {
      return 'MMP1'; // All equipment configurations use MMP1 template
    } else {
      // Default to MMP1 for any uncategorized templates
      return 'MMP1';
    }
  };

  // Get all configurations for this category to detect existing pipe sizes (moved here for proper initialization order)
  const { data: allCategoryConfigs } = useQuery({
    queryKey: ['/api/pr2-clean', 'category', categoryId, 'all-sectors'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/pr2-clean?categoryId=${categoryId}`);
      return response.json();
    },
    enabled: !!categoryId,
  });
  
  // Query all configurations for current sector (P26 removed - using DB7 Math window)
  const { data: pr2Configurations } = useQuery({
    queryKey: ['/api/pr2-clean', sector],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/pr2-clean?sector=${sector}`);
      return await response.json();
    },
    enabled: !!sector,
  });

  // P26 system removed - using DB7 Math window for minimum quantity calculations

  // P26 initialization removed - system now uses DB7 Math window

  // Load existing configuration for editing (moved up to avoid initialization error)
  const { data: existingConfig, error: configError, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['/api/pr2-clean', editId],
    queryFn: async () => {
      console.log('🔍 FETCHING CONFIG:', editId);
      try {
        const response = await apiRequest('GET', `/api/pr2-clean/${editId}`);
        const data = await response.json();
        console.log('✅ CONFIG FETCHED SUCCESSFULLY:', { id: editId, hasData: !!data });
        return data;
      } catch (error: any) {
        console.log('❌ CONFIG FETCH ERROR:', error.message);
        // If configuration not found (404), redirect to create mode
        if (error.message && error.message.includes('404')) {
          const newUrl = `/pr2-config-clean?categoryId=${categoryId}&sector=${sector}`;
          console.log('🔄 404 REDIRECT to create mode:', newUrl);
          setLocation(newUrl);
          return null;
        }
        throw error;
      }
    },
    enabled: isEditing && !!editId,
    staleTime: 5000, // Cache data for 5 seconds to prevent rapid refetches
    refetchOnMount: false, // Don't automatically refetch when component mounts
    refetchOnWindowFocus: false, // Don't refetch on window focus
    retry: false, // Don't retry on 404 errors
  });

  // Determine category name based on categoryId and pipe size for dynamic naming
  const getCategoryName = (categoryId: string) => {
    // If we have actual configuration data loaded, use its name
    if (isEditing && existingConfig && existingConfig.categoryName) {
      return existingConfig.categoryName;
    }
    
    // If we have a custom config name from URL (pipe size specific), use it
    if (configName) {
      return decodeURIComponent(configName).replace('TP1 - ', '').replace('', '');
    }
    
    // Only show pipe size if coming from dashboard (has both pipeSize and sourceItemNo)
    if (pipeSize && sourceItemNo) {
      const formattedSize = pipeSize.endsWith('mm') ? pipeSize : `${pipeSize}mm`;
      const categoryMap: { [key: string]: string } = {
        'cctv': `${formattedSize} CCTV Configuration`,
        'van-pack': `${formattedSize} Van Pack Configuration`,
        'jet-vac': `${formattedSize} Jet Vac Configuration`,
        'cctv-van-pack': `${formattedSize} A4 - CCTV Van Pack Configuration`,
        'cctv-jet-vac': `${formattedSize} A5 - CCTV Jet Vac Configuration`,
        'cctv-cleansing-root-cutting': `${formattedSize} CCTV Cleansing Root Cutting Configuration`,
        'directional-water-cutter': `${formattedSize} Directional Water Cutter Configuration`,
        'ambient-lining': `${formattedSize} Ambient Lining Configuration`,
        'hot-cure-lining': `${formattedSize} Hot Cure Lining Configuration`,
        'uv-lining': `${formattedSize} UV Lining Configuration`,
        'excavation': `${formattedSize} Excavation Configuration`,
        'patching': `${formattedSize} Patching Configuration`,
        'f-robot-cutting': `${formattedSize} Robotic Cutting Configuration`,
        'day-rate-db11': `${formattedSize} Legacy Day Rate (Deprecated)`, // Legacy removed
        'tankering': `${formattedSize} Tankering Configuration`
      };
      return categoryMap[categoryId] || `${formattedSize} Configuration`;
    }
    
    // Standard names without pipe size (until set up from dashboard)
    const categoryMap: { [key: string]: string } = {
      'cctv': 'CCTV Configuration',
      'van-pack': 'Van Pack Configuration',
      'jet-vac': 'Jet Vac Configuration',
      'cctv-van-pack': 'A4 - CCTV Van Pack Configuration',
      'cctv-jet-vac': 'A5 - CCTV Jet Vac Configuration',
      'cctv-cleansing-root-cutting': 'CCTV Cleansing Root Cutting Configuration',
      'directional-water-cutter': 'Directional Water Cutter Configuration',
      'ambient-lining': 'Ambient Lining Configuration',
      'hot-cure-lining': 'Hot Cure Lining Configuration',
      'uv-lining': 'UV Lining Configuration',
      'excavation': 'Excavation Configuration',
      'patching': 'Patching Configuration',
      'f-robot-cutting': 'Robotic Cutting Configuration',
      'day-rate-db11': 'Legacy Day Rate (Deprecated)', // Legacy removed
      'tankering': 'Tankering Configuration'
    };
    return categoryMap[categoryId] || 'Configuration';
  };

  // Generate dynamic dropdown title based on pipe size
  const getDropdownTitle = () => {
    if (pipeSize) {
      // Format pipe size - ensure it has 'mm' suffix
      const formattedSize = pipeSize.endsWith('mm') ? pipeSize : `${pipeSize}mm`;
      return `${formattedSize} Pipe Configuration Options`;
    }
    return 'Configuration Options';
  };

  // Helper function to check if option should be highlighted green (selected for editing)
  const isOptionSelected = (optionId: string, optionType: string) => {
    if (!selectedOptionId) return false;
    return selectedOptionId === `${optionType}-${optionId}`;
  };

  // Helper function to check if option should be disabled (not selected when multiple exist)
  const isOptionDisabled = (optionId: string, optionType: string) => {
    if (!selectedOptionId) return false; // No selection = all enabled
    
    // Get relevant options array based on type
    let optionsArray;
    switch (optionType) {
      case 'pricing':
        optionsArray = formData.pricingOptions;
        break;
      case 'quantity':
        optionsArray = formData.quantityOptions;
        break;
      case 'minQuantity':
        optionsArray = formData.minQuantityOptions;
        break;
      case 'range':
        optionsArray = formData.rangeOptions;
        break;
      default:
        return false;
    }
    
    // If multiple options exist in this category, disable non-selected ones
    if (optionsArray.length > 1) {
      return !isOptionSelected(optionId, optionType);
    }
    
    return false;
  };



  // Clean form state with default options initialized - different for TP1 vs TP3
  const getDefaultFormData = () => {
    const templateType = getTemplateType(categoryId || '');
    
    // P26 system removed - all templates use standard TP1 configuration
    {
      // TP1 - Standard Configuration (all windows)
      return {
        categoryName: categoryId ? getCategoryName(categoryId) : '',
        description: '',
        categoryColor: '#ffffff', // Default white color - user must assign color
        pipeSize: pipeSize || '',
        pricingOptions: [
          // Day rate now comes from MM4 blue value only - no dual storage
        ],
        quantityOptions: [
          { id: 'quantity_runs', label: 'No Per Shift', enabled: true, value: '' }
        ],
        minQuantityOptions: [],
        rangeOptions: [],
        vehicleTravelRates: [
          { id: 'vehicle_3_5t', vehicleType: '3.5t', hourlyRate: '', numberOfHours: '2', enabled: true },
          { id: 'vehicle_7_5t', vehicleType: '7.5t', hourlyRate: '', numberOfHours: '2', enabled: true }
        ],
        mathOperators: ['N/A'],
        pricingStackOrder: ['price_dayrate'],
        quantityStackOrder: ['quantity_runs'],
        minQuantityStackOrder: [],
        rangeStackOrder: [],
        vehicleTravelRatesStackOrder: ['vehicle_3_5t', 'vehicle_7_5t'],
        sector
      };
    }
  };



  // Auto-create pipe-size-specific configuration if needed
  const createPipeSizeConfiguration = async (categoryId: string, sector: string, pipeSize: string, configName: string): Promise<number | null> => {
    try {
      const templateType = getTemplateType(categoryId);
      // P26 system completely removed
      
      // Create configuration based on template type
      const newConfig = {
        categoryId,
        categoryName: configName,
        description: `${templateType} template for ${pipeSize} pipes - configure with authentic values`,
        categoryColor: '#ffffff',
        sector,
        
        // Template-specific structure
        pricingOptions: [
          { id: 'price_dayrate', label: 'Day Rate', enabled: true, value: '' }
        ],
        
        quantityOptions: [
          { id: 'quantity_runs', label: 'No Per Shift', enabled: true, value: '' }
        ],
        
        minQuantityOptions: [],
        
        rangeOptions: [],
        
        vehicleTravelRates: [],
        
        mathOperators: ['÷'],
        isActive: true
      };

      const response = await apiRequest('POST', '/api/pr2-clean', newConfig);

      if (response.ok) {
        const result = await response.json();
        return result.id;
      } else {
        console.error('❌ Failed to create pipe-size-specific configuration:', response.statusText);
        return null;
      }
    } catch (error) {
      console.error('❌ Error creating pipe-size-specific configuration:', error);
      return null;
    }
  };

  // P26 system removed - no longer needed for central day rates
  // Day rates now managed per-configuration via CCTV/Jet Vac configs
  const p26Config = null;

  const [formData, setFormData] = useState<CleanFormData>(() => {
    const defaultData = getDefaultFormData();
    // Ensure vehicleTravelRates is initialized if missing
    if (!defaultData.vehicleTravelRates) {
      defaultData.vehicleTravelRates = [
        { id: 'vehicle_3_5t', vehicleType: '3.5t', hourlyRate: '', numberOfHours: '2', enabled: true },
        { id: 'vehicle_7_5t', vehicleType: '7.5t', hourlyRate: '', numberOfHours: '2', enabled: true }
      ];
    }
    if (!defaultData.vehicleTravelRatesStackOrder) {
      defaultData.vehicleTravelRatesStackOrder = ['vehicle_3_5t', 'vehicle_7_5t'];
    }
    return defaultData;
  });
  
  // State for pipe size switching within unified page
  const [currentConfigId, setCurrentConfigId] = useState<number | null>(editId ? parseInt(editId) : null);
  
  // Color sync for patching configurations
  const syncPatchingColors = async () => {
    if (categoryId === 'patching') {
      try {
        // Get all three patching configurations
        const [config153, config156, config157] = await Promise.all([
          apiRequest('GET', '/api/pr2-clean/153').then(r => r.json()),
          apiRequest('GET', '/api/pr2-clean/156').then(r => r.json()),
          apiRequest('GET', '/api/pr2-clean/157').then(r => r.json())
        ]);
        
        // Use the color from config 153 as the master color
        const masterColor = config153.categoryColor || '#f5ec00';
        
        // Update configs 156 and 157 if they have different colors
        const updatePromises = [];
        
        if (config156.categoryColor !== masterColor) {
          updatePromises.push(
            apiRequest('PUT', '/api/pr2-clean/156', { ...config156, categoryColor: masterColor })
          );
        }
        
        if (config157.categoryColor !== masterColor) {
          updatePromises.push(
            apiRequest('PUT', '/api/pr2-clean/157', { ...config157, categoryColor: masterColor })
          );
        }
        
        if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
        }
        
      } catch (error) {
        console.error('❌ Error syncing patching colors:', error);
      }
    }
  };

  // Reset form data when switching between templates
  useEffect(() => {
    if (!isEditing && !editId) {
      setFormData(getDefaultFormData());
    }
  }, [categoryId]);

  // Immediate save function for critical fields like Day Rate (db11)
  const immediateSave = async (optionType: string, optionId: string, value: string) => {
    if (!isEditing || !editId) return;
    
    try {
      // Get current formData and update the specific field
      const currentFormData = { ...formData };
      if (optionType === 'pricingOptions') {
        currentFormData.pricingOptions = formData.pricingOptions.map(opt =>
          opt.id === optionId ? { ...opt, value } : opt
        );
      } else if (optionType === 'minQuantityOptions') {
        currentFormData.minQuantityOptions = formData.minQuantityOptions.map(opt =>
          opt.id === optionId ? { ...opt, value } : opt
        );
      }
      
      const payload = {
        categoryName: currentFormData.categoryName,
        description: currentFormData.description,
        categoryColor: currentFormData.categoryColor,
        sector: sector,
        categoryId: categoryId,
        pricingOptions: currentFormData.pricingOptions,
        quantityOptions: currentFormData.quantityOptions,
        minQuantityOptions: currentFormData.minQuantityOptions,
        rangeOptions: currentFormData.rangeOptions,
        mathOperators: currentFormData.mathOperators,
        pricingStackOrder: currentFormData.pricingStackOrder,
        quantityStackOrder: currentFormData.quantityStackOrder,
        minQuantityStackOrder: currentFormData.minQuantityStackOrder,
        rangeStackOrder: currentFormData.rangeStackOrder
      };

      const response = await fetch(`/api/pr2-clean/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        // Success - no action needed
      } else {
        console.error(`❌ DB11 IMMEDIATE SAVE FAILED: ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Immediate save error:', error);
    }
  };

  // Handle value changes for input fields
  const handleValueChange = (optionType: string, optionId: string, value: string) => {

    // Determine correct dev code based on current category
    const currentDevCode = (() => {
      if (window.location.href.includes('categoryId=patching')) return 'db6';
      if (window.location.href.includes('categoryId=f-robot-cutting')) return 'db2';
      return 'db11'; // TP1 CCTV configurations
    })();
    
    // Mark that user has made changes to prevent automatic form overwrite
    setHasUserChanges(true);
    
    setFormData(prev => {
      const newFormData = { ...prev };
      
      switch (optionType) {
        case 'pricingOptions':
          newFormData.pricingOptions = prev.pricingOptions.map(opt =>
            opt.id === optionId ? { ...opt, value } : opt
          );
          break;
        case 'quantityOptions':
          newFormData.quantityOptions = prev.quantityOptions.map(opt =>
            opt.id === optionId ? { ...opt, value } : opt
          );
          break;
        case 'minQuantityOptions':
          newFormData.minQuantityOptions = prev.minQuantityOptions.map(opt =>
            opt.id === optionId ? { ...opt, value } : opt
          );
          break;
        default:
          break;
      }
      
      return newFormData;
    });
    
    // For critical fields, save immediately to prevent data loss
    const criticalPricingFields = ['price_dayrate', 'double_layer_cost', 'single_layer_cost', 'triple_layer_cost', 'triple_layer_extra_cost'];
    const criticalMinQuantityFields = ['patch_min_qty_1', 'patch_min_qty_2', 'patch_min_qty_3', 'patch_min_qty_4'];
    
    if ((optionType === 'pricingOptions' && criticalPricingFields.includes(optionId)) ||
        (optionType === 'minQuantityOptions' && criticalMinQuantityFields.includes(optionId))) {
      immediateSave(optionType, optionId, value);
    } else {
      // Trigger debounced save for other fields
      debouncedSave();
    }
  }

  // Clear values from second purple row
  const clearSecondRowValues = () => {
    setFormData(prev => ({
      ...prev,
      rangeOptions: prev.rangeOptions.map(opt => {
        if (opt.label === "Percentage 2") {
          return { ...opt, rangeStart: '', rangeEnd: '' };
        }
        if (opt.label === "Length 2") {
          return { ...opt, rangeStart: '', rangeEnd: '' };
        }
        return opt;
      })
    }));

  }

  // Clean up extra green entries while preserving base entries (DB14 orange window removed)
  const removeExtraGreenOrangeEntries = () => {
    setFormData(prev => ({
      ...prev,
      quantityOptions: prev.quantityOptions.filter(opt => 
        opt.id === "quantity_runs" // Keep only "Runs per Shift"
      ),
      quantityStackOrder: ["quantity_runs"],
      minQuantityOptions: [], // DB14 orange window removed from TP1
      minQuantityStackOrder: []
    }));

  }

  // DISABLED: Auto cleanup was interfering with manual add operations
  // User needs to manually control when to clean up extra entries

  // Handle range value changes for purple window
  const handleRangeValueChange = (optionId: string, field: 'rangeStart' | 'rangeEnd', value: string) => {

    
    // Mark that user has made changes to prevent automatic form overwrite
    setHasUserChanges(true);
    
    setFormData(prev => {

      
      const updatedFormData = {
        ...prev,
        rangeOptions: prev.rangeOptions.map(opt => {
          if (opt.id === optionId) {
            // CRITICAL: No processing, just store the exact value
            const updatedOpt = { ...opt, [field]: value };

            return updatedOpt;
          }
          return opt;
        })
      };
      

      return updatedFormData;
    });
    
    // Trigger debounced save after range input change

    debouncedSave();
  };

  // Validate .99 format for length ranges
  const validateLengthFormat = (value: string): boolean => {
    if (!value || value.trim() === '') return true; // Empty is ok
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return false;
    
    // Must end with .99 format for whole numbers
    if (numValue % 1 === 0) {
      // It's a whole number, so it must have .99 format
      return value.endsWith('.99');
    }
    
    // For decimal numbers, allow anything
    return true;
  };

  // Debug logging disabled to prevent infinite loops

  // Route to existing configuration - AUTO-CREATION DISABLED
  useEffect(() => {
    // Only run when we have categoryId and sector but not already editing or editing a specific ID
    if (!isEditing && !editId && categoryId && sector && allCategoryConfigs) {
      console.log('🔍 ROUTING DEBUG - Auto-creation disabled, only finding existing configs');
      
      // For patching category, route to sector-specific configuration - PRESERVE autoSelectUtilities parameter
      if (categoryId === 'patching' && !editId) {
        console.log('🎯 PATCHING CATEGORY - Finding sector-specific configuration');
        const currentParams = new URLSearchParams(window.location.search);
        
        // Find sector-specific patching configuration instead of hardcoded ID
        // CRITICAL FIX: Database uses id1, id2, id3 format for sectors
        const patchingConfig = allCategoryConfigs.find(config => 
          config.categoryId === 'patching' && 
          config.sector === `id${getSectorId(sector)}`
        );
        
        if (patchingConfig) {
          const hasAutoSelect = currentParams.get('autoSelectUtilities') === 'true' || autoSelectUtilities;
          const autoSelectParam = hasAutoSelect ? '&autoSelectUtilities=true' : '';
          const pipeSizeParam = pipeSize ? `&pipeSize=${pipeSize}` : '';
          const newUrl = `/pr2-config-clean?categoryId=${categoryId}&sector=${sector}&edit=${patchingConfig.id}${autoSelectParam}${pipeSizeParam}`;
          console.log('🔄 SECTOR PATCHING REDIRECT - New URL:', newUrl);
          setLocation(newUrl);
          return;
        } else {
          console.log('⚠️ NO PATCHING CONFIG FOUND - Creating mode');
        }
      }
      
      // For other categories, route to specific database IDs to prevent generic page creation
      // Map common categories to their specific database IDs
      const categoryIdMap = {
        'cctv-jet-vac': '760',   // ID 760 - A5 CCTV/Jet Vac (Utilities)
        'cctv-van-pack': '759',  // ID 759 - A4 CCTV/Van Pack (Utilities)
        'cctv': '759',           // Default CCTV to A4 configuration
        'jet-vac': '760',        // Default Jet Vac to A5 configuration
        'van-pack': '759'        // Default Van Pack to A4 configuration
      };
      
      const specificConfigId = categoryIdMap[categoryId as keyof typeof categoryIdMap];
      
      if (specificConfigId) {
        console.log(`🎯 CATEGORY ROUTING: Directing ${categoryId} to ID ${specificConfigId}`);
        setLocation(`/pr2-config-clean?categoryId=${categoryId}&sector=${sector}&editId=${specificConfigId}`);
      } else {
        // For unmapped categories, try to find existing config or stay in create mode
        const existingConfig = allCategoryConfigs.find(config => 
          config.categoryId === categoryId && 
          config.sector === sector &&
          !config.categoryName?.includes('mm') // Exclude pipe-size-specific configs
        );
        
        if (existingConfig) {
          console.log('🔄 EXISTING CONFIG FOUND - Redirecting to edit mode:', existingConfig.id);
          setLocation(`/pr2-config-clean?categoryId=${categoryId}&sector=${sector}&editId=${existingConfig.id}`);
        } else {
          console.log('⚠️ NO EXISTING CONFIG - Staying in create mode (auto-creation disabled)');
        }
      }
    }
  }, [allCategoryConfigs, isEditing, editId, categoryId, sector, pipeSize, setLocation]);

  // DEBOUNCED SAVE: Save input values after user stops typing
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const debouncedSave = () => {
    if (!isEditing || !editId) return;
    
    // All templates now use MMP1 system - removed TP1 check
    
    // Always save when user makes changes - including clearing fields
    
    // Clear previous timeout
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    
    // Set new timeout to save after 500ms of no changes
    const timeoutId = setTimeout(async () => {
      try {
        // For TP1 templates (cctv-jet-vac), don't override range options since TP1 templates manage their own
        const payload = {
          categoryName: formData.categoryName,
          description: formData.description,
          categoryColor: formData.categoryColor,
          sector: sector,
          categoryId: categoryId,
          pricingOptions: formData.pricingOptions,
          quantityOptions: formData.quantityOptions,
          minQuantityOptions: formData.minQuantityOptions,
          rangeOptions: formData.rangeOptions,
          vehicleTravelRates: formData.vehicleTravelRates || [],
          vehicleTravelRatesStackOrder: formData.vehicleTravelRatesStackOrder || [],
          mathOperators: formData.mathOperators,
          pricingStackOrder: formData.pricingStackOrder,
          quantityStackOrder: formData.quantityStackOrder,
          minQuantityStackOrder: formData.minQuantityStackOrder,
          rangeStackOrder: formData.rangeStackOrder
        };

        const response = await fetch(`/api/pr2-clean/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (response.ok) {

          
          // CRITICAL: Sync P26 vehicle data across configurations
          if (categoryId === 'patching' && payload.vehicleTravelRates?.length > 0) {
            
            try {
              // Get all patching configurations for this user
              const allConfigsResponse = await fetch(`/api/pr2-clean?sector=${sector}&categoryId=patching`);
              if (allConfigsResponse.ok) {
                const patchingConfigs = await allConfigsResponse.json();
                
                // Sync vehicle data to all other patching configs
                for (const config of patchingConfigs) {
                  if (config.id !== editId) { // Don't update the current config again
                    const syncPayload = {
                      ...config,
                      vehicleTravelRates: payload.vehicleTravelRates,
                      vehicleTravelRatesStackOrder: payload.vehicleTravelRatesStackOrder
                    };
                    
                    await fetch(`/api/pr2-clean/${config.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(syncPayload)
                    });
                    

                  }
                }
              }
            } catch (syncError) {
              console.error('❌ P26 SYNC ERROR:', syncError);
            }
          }
        }
      } catch (error) {
        console.error('❌ Save failed:', error);
      }
      setSaveTimeout(null);
    }, 500);
    
    setSaveTimeout(timeoutId);
  };

  // Dialog states
  const [addPricingDialogOpen, setAddPricingDialogOpen] = useState(false);
  const [editPricingDialogOpen, setEditPricingDialogOpen] = useState(false);
  const [stackOrderDialogOpen, setStackOrderDialogOpen] = useState(false);
  const [addQuantityDialogOpen, setAddQuantityDialogOpen] = useState(false);
  const [editQuantityDialogOpen, setEditQuantityDialogOpen] = useState(false);
  const [addMinQuantityDialogOpen, setAddMinQuantityDialogOpen] = useState(false);
  const [editMinQuantityDialogOpen, setEditMinQuantityDialogOpen] = useState(false);
  const [addRangeDialogOpen, setAddRangeDialogOpen] = useState(false);
  const [editRangeDialogOpen, setEditRangeDialogOpen] = useState(false);
  const [newPricingLabel, setNewPricingLabel] = useState('');
  const [newQuantityLabel, setNewQuantityLabel] = useState('');
  const [newMinQuantityLabel, setNewMinQuantityLabel] = useState('');
  const [newRangeLabel, setNewRangeLabel] = useState('');
  const [editingPricing, setEditingPricing] = useState<PricingOption | null>(null);
  const [editingQuantity, setEditingQuantity] = useState<PricingOption | null>(null);
  const [editingMinQuantity, setEditingMinQuantity] = useState<PricingOption | null>(null);
  
  // Pipe Size Selection State - Dynamic based on editId
  const [editingRange, setEditingRange] = useState<RangeOption | null>(null);
  
  // Vehicle Travel Rate dialog states
  const [addVehicleDialogOpen, setAddVehicleDialogOpen] = useState(false);
  const [editVehicleDialogOpen, setEditVehicleDialogOpen] = useState(false);
  const [newVehicleType, setNewVehicleType] = useState('');
  const [newHourlyRate, setNewHourlyRate] = useState('');
  const [editingVehicle, setEditingVehicle] = useState<VehicleTravelRate | null>(null);
  
  // Sector selection state
  const [selectedSectors, setSelectedSectors] = useState<string[]>([sector]);
  
  // State for MMP1 ID selections (ID1-ID6 following P002 pattern)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [idsWithConfig, setIdsWithConfig] = useState<string[]>([]);

  // Patching Green Window Independent Data (separate from MM5)
  const [patchingGreenData, setPatchingGreenData] = useState<any[]>([
    { id: 1, quantity: '' },
    { id: 2, quantity: '' },
    { id: 3, quantity: '' },
    { id: 4, quantity: '' }
  ]);

  // Initialize selectedIds from URL parameter when component loads
  useEffect(() => {
    const urlSearchParams = new URLSearchParams(window.location.search);
    const autoSelectParam = urlSearchParams.get('autoSelectUtilities');
    
    console.log('🔍 AUTO-SELECT DEBUG:', {
      autoSelectUtilities,
      autoSelectParam,
      selectedId,
      categoryId,
      templateType: getTemplateType(categoryId || ''),
      shouldTrigger: autoSelectUtilities && getTemplateType(categoryId || '') === 'MMP1',
      currentURL: window.location.href
    });
    
    // Priority 1: Auto-select utilities when autoSelectUtilities is true
    const shouldAutoSelect = (autoSelectUtilities || autoSelectParam === 'true') && getTemplateType(categoryId || '') === 'MMP1';
    
    if (shouldAutoSelect) {
      console.log('🎯 AUTO-SELECTING utilities card due to autoSelectUtilities=true');
      setSelectedIds(['utilities']);
    }
    // Priority 2: Use selectedId from URL parameter
    else if (selectedId && getTemplateType(categoryId || '') === 'MMP1') {
      console.log('🔧 Setting selectedIds from URL parameter:', selectedId);
      setSelectedIds([selectedId]);
    }
    // Priority 3: Default selection for patching category (ID 763 structural recommendations)
    else if (categoryId === 'patching' && editId === '763' && getTemplateType(categoryId || '') === 'MMP1') {
      console.log('🎯 AUTO-SELECTING utilities for ID 763 structural patching');
      setSelectedIds(['utilities']);
    }
  }, [selectedId, categoryId, autoSelectUtilities, editId]);


  const [showCustomColorPicker, setShowCustomColorPicker] = useState(false);
  const [customPipeSizes, setCustomPipeSizes] = useState<string[]>([]);
  const [newPipeSize, setNewPipeSize] = useState('');
  const [appliedSectors, setAppliedSectors] = useState<string[]>([]);
  const [showRemoveWarning, setShowRemoveWarning] = useState(false);
  const [sectorToRemove, setSectorToRemove] = useState<string>('');
  
  // DATABASE-FIRST: Direct value access from database state only
  const getDatabaseValue = (rowId: number, field: string): string => {
    const currentData = getCurrentMM4Data();
    const row = currentData.find(r => r.id === rowId);
    const value = row?.[field] || '';
    console.log(`🎯 DATABASE-FIRST: Getting ${field} for row ${rowId}: "${value}"`);
    return value;
  };



  // Auto-save functionality state
  const [autoSaveTimeout, setAutoSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  


  // MM3 Pipe Size Selection State - Single selection only (default to URL pipeSize or 150mm for F690)
  const [selectedPipeSizeForMM4, setSelectedPipeSizeForMM4] = useState<string>(() => {
    // If pipeSize provided in URL, use it (remove 'mm' suffix if present)
    if (pipeSize) {
      return pipeSize.toString().replace('mm', '');
    }
    // FIXED: Prioritize 150mm for both CCTV configurations (A4 759 Van Pack and A5 760 Jet Vac)
    if (categoryId === 'cctv-jet-vac' || categoryId === 'cctv-van-pack') {
      return '150';
    }
    // Default fallback to 100mm for other categories
    return '100';
  });
  
  // Fixed pipe size IDs - consistent across sessions to prevent data loss
  // RESTORED: 150mm ID returned to original 1501 pattern to match authentic data
  const PIPE_SIZE_IDS: Record<string, number> = {
    '100': 1001,
    '125': 1251,
    '150': 1501, // Authentic 150mm pipe size ID pattern
    '175': 1751,
    '200': 2001,
    '225': 2251,
    '250': 2501,
    '275': 2751,
    '300': 3001,
    '350': 3501,
    '375': 3751,
    '400': 4001,
    '450': 4501,
    '500': 5001,
    '525': 5251,
    '600': 6001,
    '675': 6751,
    '750': 7501,
    '825': 8251,
    '900': 9001,
    '975': 9751,
    '1050': 10501,
    '1200': 12001,
    '1350': 13501,
    '1500': 15001
  };
  
  const [selectedPipeSizeId, setSelectedPipeSizeId] = useState<number>(() => {
    // Initialize with correct pipe size ID based on selectedPipeSizeForMM4
    // CRITICAL FIX: When routing from auto-trigger, use the pipeSize from URL parameter first
    const urlPipeSize = pipeSize?.toString().replace('mm', '');
    // FIXED: Prioritize 150mm for both CCTV configurations (A4 759 Van Pack and A5 760 Jet Vac)
    const initialPipeSize = urlPipeSize || (categoryId === 'cctv-jet-vac' || categoryId === 'cctv-van-pack' ? '150' : '100');
    
    console.log('🔧 PIPE SIZE INITIALIZATION DEBUG:', {
      urlPipeSize: urlPipeSize,
      categoryId: categoryId,
      finalInitialPipeSize: initialPipeSize,
      urlPipeSizeParam: pipeSize
    });
    return PIPE_SIZE_IDS[initialPipeSize] || PIPE_SIZE_IDS['100'];
  });
  const [showRangeWarning, setShowRangeWarning] = useState<boolean>(false);
  const [pendingRangeValue, setPendingRangeValue] = useState<string>('');
  const [pendingRowId, setPendingRowId] = useState<number | null>(null);
  
  // Get consistent ID for pipe size configuration
  const getPipeSizeId = (pipeSize: string) => {
    return PIPE_SIZE_IDS[pipeSize] || parseInt(pipeSize) * 10 + 1;
  };

  // Handle pipe size selection - single selection only (no toggle off)
  const handlePipeSizeSelect = (pipeSize: string) => {
    console.log(`🔄 Switching pipe size from ${selectedPipeSizeForMM4}mm to ${pipeSize}mm`);
    console.log('📊 Current MM4 data before switch:', mm4DataByPipeSize);
    console.log('📊 Current MM5 data before switch (independent):', mm5Data);
    
    // Always select the clicked pipe size (no deselection)
    const consistentId = getPipeSizeId(pipeSize);
    setSelectedPipeSizeForMM4(pipeSize);
    setSelectedPipeSizeId(consistentId);
    
    console.log(`✅ Switched to ${pipeSize}mm with CONSISTENT ID: ${consistentId}`);
    console.log(`🔍 Will now load data for key: ${pipeSize}-${consistentId}`);
  };

  // MM4/MM5 Data Storage - MM4 scoped by pipe size, MM5 independent
  // Initialize empty - force fresh data load from cleaned database only
  const [mm4DataByPipeSize, setMm4DataByPipeSize] = useState<Record<string, any[]>>({});
  
  const [mm5Data, setMm5Data] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem(`mm5-data-${editId || 'new'}`);
      return saved ? JSON.parse(saved) : [{ id: 1, vehicleWeight: '', costPerMile: '' }];
    } catch {
      return [{ id: 1, vehicleWeight: '', costPerMile: '' }];
    }
  });

  // Get current MM4/MM5 data for selected pipe size
  const getCurrentMM4Data = () => {
    const key = `${selectedPipeSizeForMM4}-${selectedPipeSizeId}`;
    const data = mm4DataByPipeSize[key] || [{ id: 1, blueValue: '', greenValue: '', purpleDebris: '', purpleLength: '' }];
    console.log(`🔍 MM4 Data for key "${key}":`, data);
    console.log('📊 All MM4 data by pipe size:', mm4DataByPipeSize);
    
    // CRITICAL FIX: Preserve authentic user data - never force empty purple fields
    // All pipe sizes retain their authentic data to prevent database corruption
    return data;
  };

  const getCurrentMM5Data = () => {
    console.log('🔍 MM5 Data (independent):', mm5Data);
    return mm5Data;
  };

  // Get current data as computed values
  const mm4Rows = getCurrentMM4Data();
  const mm5Rows = getCurrentMM5Data();

  // Auto-select pipe size from URL parameter on component load + buffer cleanup
  useEffect(() => {
    if (pipeSize && getTemplateType(categoryId || '') === 'MMP1') {
      const pipeSizeNumber = pipeSize.replace('mm', '');
      console.log(`🎯 UNIFIED FLOW: Auto-selecting pipe size ${pipeSizeNumber}mm from URL parameter`);
      
      // DATABASE-FIRST: No buffer cleanup needed
      
      handlePipeSizeSelect(pipeSizeNumber);
    }
  }, [pipeSize, categoryId, editId]);

  // DISABLED: No localStorage caching to prevent synthetic data persistence
  // Data will be loaded fresh from database only

  useEffect(() => {
    try {
      localStorage.setItem(`mm5-data-${editId || 'new'}`, JSON.stringify(mm5Data));
      console.log('💾 Saved MM5 data to localStorage:', mm5Data);
    } catch (error) {
      console.error('Failed to save MM5 data to localStorage:', error);
    }
  }, [mm5Data, editId]);

  // Update MM4/MM5 data for specific pipe size
  const updateMM4DataForPipeSize = (newData: any[]) => {
    const key = `${selectedPipeSizeForMM4}-${selectedPipeSizeId}`;
    setMm4DataByPipeSize(prev => ({ ...prev, [key]: newData }));
  };

  const updateMM5Data = (newData: any[]) => {
    setMm5Data(newData);
  };

  // 🔒 MMP1 PROTECTED FUNCTIONS - USER ONLY 🔒  
  // MM4 Row Management Functions - Now scoped to pipe size
  const addMM4Row = () => {
    const currentData = getCurrentMM4Data();
    const newData = [
      ...currentData,
      { 
        id: currentData.length + 1, 
        blueValue: '', 
        greenValue: '', 
        purpleDebris: '', 
        purpleLength: '' 
      }
    ];
    updateMM4DataForPipeSize(newData);
    // Trigger auto-save when adding rows
    setTimeout(() => triggerAutoSave(), 100);
  };

  // Ensure MM4 has at least 4 rows for patching green window
  const ensureMM4Rows = (minRows: number = 4) => {
    const currentData = getCurrentMM4Data();
    if (currentData.length < minRows) {
      const newData = [...currentData];
      for (let i = currentData.length; i < minRows; i++) {
        newData.push({
          id: i + 1,
          blueValue: '',
          greenValue: '',
          purpleDebris: '',
          purpleLength: ''
        });
      }
      updateMM4DataForPipeSize(newData);
    }
  };

  const deleteMM4Row = (rowId: number) => {
    const currentData = getCurrentMM4Data();
    if (currentData.length > 1) { // Keep at least one row
      const newData = currentData.filter(row => row.id !== rowId);
      updateMM4DataForPipeSize(newData);
      // Trigger auto-save when deleting rows
      setTimeout(() => triggerAutoSave(), 100);
    }
  };

  // DATABASE-FIRST: Immediate save with optimistic UI updates
  const updateMM4Row = async (rowId: number, field: 'blueValue' | 'greenValue' | 'purpleDebris' | 'purpleLength', value: string) => {
    console.log(`🎯 DATABASE-FIRST: updateMM4Row called: rowId=${rowId}, field=${field}, value="${value}"`);
    
    // 1. Update UI state immediately (optimistic update)
    const currentData = getCurrentMM4Data();
    const newData = currentData.map(row => 
      row.id === rowId ? { ...row, [field]: value } : row
    );
    
    updateMM4DataForPipeSize(newData);
    console.log(`✅ UI updated optimistically for ${field}=${value}`);
    
    // 2. Save to database immediately (no delays or buffers)
    try {
      await triggerAutoSave();
      console.log(`✅ DATABASE-FIRST: Successfully saved ${field}=${value} to database`);
    } catch (error) {
      console.error(`🚨 DATABASE-FIRST: Save failed for ${field}=${value}:`, error);
      
      // 3. Revert UI state on save failure
      const revertedData = currentData; // Original data before optimistic update
      updateMM4DataForPipeSize(revertedData);
      console.log(`🔄 DATABASE-FIRST: Reverted UI state due to save failure`);
      
      // TODO: Show user error notification
    }
  };

  // Handle range warning dialog responses
  const handleRangeWarningResponse = (addDotNineNine: boolean) => {
    if (pendingRowId === null) return;
    
    const currentData = getCurrentMM4Data();
    const finalValue = addDotNineNine ? `${pendingRangeValue}.99` : pendingRangeValue;
    
    console.log(`🔄 Updating row ${pendingRowId} purpleLength from "${pendingRangeValue}" to "${finalValue}"`);
    
    const newData = currentData.map(row => 
      row.id === pendingRowId ? { ...row, purpleLength: finalValue } : row
    );
    
    // DATABASE-FIRST: Update React state immediately
    updateMM4DataForPipeSize(newData);
    console.log(`✅ DATABASE-FIRST: Updated MM4 data for row ${pendingRowId}`);
    
    // DATABASE-FIRST: No localStorage persistence needed
    
    // Force a component re-render to update input field values and IMMEDIATELY save to backend
    setTimeout(async () => {
      console.log(`✅ Triggering IMMEDIATE backend save for .99 update - row ${pendingRowId}`);
      await triggerAutoSave();
      console.log(`✅ Final state update completed for row ${pendingRowId}`);
    }, 50);
    
    console.log(`✅ Updated MM4 data:`, newData);
    
    // Reset dialog state AFTER state update
    setTimeout(() => {
      setShowRangeWarning(false);
      setPendingRangeValue('');
      setPendingRowId(null);
      
      // Continue with dashboard navigation, preserving reportId if present
      const dashboardUrl = reportId ? `/dashboard?reportId=${reportId}` : '/dashboard';
      setLocation(dashboardUrl);
    }, 100);
  };

  // 🔒 MMP1 PROTECTED FUNCTIONS - USER ONLY 🔒
  // MM5 Row Management Functions - Independent storage
  const addMM5Row = () => {
    const currentData = getCurrentMM5Data();
    const newData = [
      ...currentData,
      { 
        id: currentData.length + 1, 
        vehicleWeight: '', 
        costPerMile: '' 
      }
    ];
    updateMM5Data(newData);
    // Trigger auto-save when adding rows
    setTimeout(() => triggerAutoSave(), 100);
  };

  const deleteMM5Row = (rowId: number) => {
    const currentData = getCurrentMM5Data();
    if (currentData.length > 1) { // Keep at least one row
      const newData = currentData.filter(row => row.id !== rowId);
      updateMM5Data(newData);
      // Trigger auto-save when deleting rows
      setTimeout(() => triggerAutoSave(), 100);
    }
  };

  const updateMM5Row = (rowId: number, field: 'vehicleWeight' | 'costPerMile', value: string) => {
    const currentData = getCurrentMM5Data();
    const newData = currentData.map(row => 
      row.id === rowId ? { ...row, [field]: value } : row
    );
    updateMM5Data(newData);
  };

  // MM4/MM5 Matching Functions for Dashboard Integration
  
  // MM4: Calculate rate per length (blue ÷ green)
  const calculateMM4RatePerLength = (mm4Row: any) => {
    const blueValue = parseFloat(mm4Row.blueValue || '0');
    const greenValue = parseFloat(mm4Row.greenValue || '0');
    
    if (greenValue === 0) return 0;
    
    const rate = blueValue / greenValue;
    console.log(`📊 MM4 Rate Calculation: £${blueValue} ÷ ${greenValue} = £${rate.toFixed(2)} per length`);
    return rate;
  };

  // MM4: Check if dashboard section matches purple window criteria (debris % and length)
  const checkMM4DashboardMatch = (mm4Row: any, dashboardSection: any) => {
    const configDebrisPercent = parseFloat(mm4Row.purpleDebris || '0');
    const configMaxLength = parseFloat(mm4Row.purpleLength || '0');
    
    // Extract section data (assuming standard section structure)
    const sectionLength = dashboardSection.length || 0;
    const sectionDebrisPercent = dashboardSection.debrisPercent || 0;
    
    const debrisMatch = sectionDebrisPercent <= configDebrisPercent;
    const lengthMatch = sectionLength <= configMaxLength;
    
    console.log(`🔍 MM4 Dashboard Match Check for Section ${dashboardSection.itemNo}:`);
    console.log(`  - Section debris: ${sectionDebrisPercent}% vs Config max: ${configDebrisPercent}% = ${debrisMatch ? 'PASS' : 'FAIL'}`);
    console.log(`  - Section length: ${sectionLength}m vs Config max: ${configMaxLength}m = ${lengthMatch ? 'PASS' : 'FAIL'}`);
    
    return {
      matches: debrisMatch && lengthMatch,
      debrisMatch,
      lengthMatch,
      ratePerLength: calculateMM4RatePerLength(mm4Row)
    };
  };

  // MM5: Check travel distance against 2-hour limit
  const checkMM5TravelLimit = (mm5Row: any, travelDistance: number) => {
    const costPerMile = parseFloat(mm5Row.costPerMile || '0');
    const vehicleWeight = mm5Row.vehicleWeight || '';
    
    // Assume average speed based on vehicle type (could be configurable)
    const averageSpeed = vehicleWeight.includes('3.5') ? 30 : 25; // mph
    const maxTravelDistance = 2 * averageSpeed; // 2 hours * speed
    
    const withinLimit = travelDistance <= maxTravelDistance;
    const travelTime = travelDistance / averageSpeed;
    const travelCost = travelDistance * costPerMile;
    
    console.log(`🚚 MM5 Travel Check for ${vehicleWeight} vehicle:`);
    console.log(`  - Travel distance: ${travelDistance} miles`);
    console.log(`  - Travel time: ${travelTime.toFixed(1)} hours (limit: 2 hours)`);
    console.log(`  - Within limit: ${withinLimit ? 'YES' : 'NO'}`);
    console.log(`  - Travel cost: £${travelCost.toFixed(2)}`);
    
    return {
      withinLimit,
      travelTime,
      travelCost,
      maxDistance: maxTravelDistance
    };
  };

  // Combined MM4/MM5 Dashboard Analysis
  const analyzeDashboardWithMM = (dashboardSections: any[], travelDistance: number = 50) => {
    const currentMM4 = getCurrentMM4Data();
    const currentMM5 = getCurrentMM5Data();
    
    console.log('🔍 Starting MM4/MM5 Dashboard Analysis');
    
    const results = {
      mm4Analysis: [] as any[],
      mm5Analysis: [] as any[],
      totalCost: 0,
      sectionsMatched: 0,
      travelApproved: false
    };
    
    // Analyze each MM4 configuration against dashboard sections
    currentMM4.forEach((mm4Row, mm4Index) => {
      const mm4Result = {
        configIndex: mm4Index,
        ratePerLength: calculateMM4RatePerLength(mm4Row),
        matchingSections: [] as any[],
        totalSectionCost: 0
      };
      
      dashboardSections.forEach(section => {
        const match = checkMM4DashboardMatch(mm4Row, section);
        if (match.matches) {
          const sectionCost = match.ratePerLength * (section.length || 0);
          mm4Result.matchingSections.push({
            ...section,
            matchDetails: match,
            cost: sectionCost
          });
          mm4Result.totalSectionCost += sectionCost;
        }
      });
      
      results.mm4Analysis.push(mm4Result);
      results.totalCost += mm4Result.totalSectionCost;
      results.sectionsMatched += mm4Result.matchingSections.length;
    });
    
    // Analyze MM5 travel configurations
    currentMM5.forEach((mm5Row, mm5Index) => {
      const travelCheck = checkMM5TravelLimit(mm5Row, travelDistance);
      if (travelCheck.withinLimit) {
        results.travelApproved = true;
        results.totalCost += travelCheck.travelCost;
      }
      
      results.mm5Analysis.push({
        configIndex: mm5Index,
        vehicleWeight: mm5Row.vehicleWeight,
        ...travelCheck
      });
    });
    
    console.log('✅ MM4/MM5 Analysis Complete:', results);
    return results;
  };

  // Test function to demonstrate MM4/MM5 matching with sample dashboard data
  const testMM4MM5Matching = () => {
    console.log('🧪 Testing MM4/MM5 Dashboard Matching');
    
    // Sample dashboard sections (replace with actual dashboard data)
    const sampleDashboardSections = [
      {
        itemNo: 1,
        length: 25,
        debrisPercent: 20,
        pipeSize: '150mm',
        observations: 'DEG Debris deposits, grease'
      },
      {
        itemNo: 2,
        length: 35,
        debrisPercent: 40,
        pipeSize: '150mm',
        observations: 'DER Debris deposits, roots'
      },
      {
        itemNo: 3,
        length: 15,
        debrisPercent: 10,
        pipeSize: '150mm',
        observations: 'No defects found'
      }
    ];
    
    // Test with 50-mile travel distance
    const analysisResults = analyzeDashboardWithMM(sampleDashboardSections, 50);
    
    console.log('📋 MM4/MM5 Test Results:');
    console.log(`  - Sections analyzed: ${sampleDashboardSections.length}`);
    console.log(`  - Sections matched: ${analysisResults.sectionsMatched}`);
    console.log(`  - Total cost: £${analysisResults.totalCost.toFixed(2)}`);
    console.log(`  - Travel approved: ${analysisResults.travelApproved}`);
    
    return analysisResults;
  };

  // Configuration loading moved above getCategoryName function

  // Pipe Size Selection State - Upper Level Configuration
  const [selectedPipeSize, setSelectedPipeSize] = useState<string>(pipeSize || '150');
  const [availablePipeSizes, setAvailablePipeSizes] = useState<string[]>([
    '100', '150', '225', '300', '375', '450', '525', '600', '675', '750', 
    '825', '900', '975', '1050', '1200', '1350', '1500'
  ]);

  // Admin controls
  const { data: adminData } = useQuery({
    queryKey: ['/api/admin-controls/check-admin'],
    queryFn: async () => {
      const response = await fetch('/api/admin-controls/check-admin');
      return response.json();
    }
  });

  const { data: adminControls } = useQuery({
    queryKey: ['/api/admin-controls', sector, categoryId],
    queryFn: async () => {
      const response = await fetch(`/api/admin-controls?sector=${sector}&categoryId=${categoryId}&controlType=tp2_option_1_lock`);
      return response.json();
    },
    enabled: !!sector && !!categoryId
  });

  // Auto-save functionality for MM sections (declared after all state variables)
  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }
    
    const timeoutId = setTimeout(async () => {
      try {
        // Create pipe-size-specific key for current selection
        const pipeSizeKey = `${selectedPipeSizeForMM4}-${selectedPipeSizeId}`;
        
        // Gather MM section data with pipe-size isolation
        const currentMM4Data = getCurrentMM4Data();
        console.log('💾 Auto-save MM4 Data Analysis:');
        console.log('  - pipeSizeKey:', pipeSizeKey);
        console.log('  - current MM4 data:', currentMM4Data);
        console.log('  - all MM4 storage:', mm4DataByPipeSize);
        console.log('🔍 CRITICAL - Checking purpleLength values before backend save:');
        currentMM4Data.forEach(row => {
          console.log(`   Row ${row.id}: purpleLength="${row.purpleLength}" (length: ${row.purpleLength?.length || 0} chars)`);
        });
        
        // Log the complete MM data being sent to backend
        const mmDataToSend = {
          selectedPipeSize: selectedPipeSizeForMM4,
          selectedPipeSizeId: selectedPipeSizeId,
          mm1Colors: formData.categoryColor,
          mm2IdData: selectedIds,
          mm3CustomPipeSizes: customPipeSizes,
          mm4DataByPipeSize: mm4DataByPipeSize,
          mm5Data: getCurrentMM5Data(),
          mm4Rows: currentMM4Data,
          mm5Rows: getCurrentMM5Data(),
          categoryId: categoryId,
          sector: sector,
          timestamp: Date.now(),
          pipeSizeKey: pipeSizeKey
        };
        console.log('🚀 FINAL DATA BEING SENT TO BACKEND:', JSON.stringify(mmDataToSend, null, 2));
        
        const mmData = {
          selectedPipeSize: selectedPipeSizeForMM4,
          selectedPipeSizeId: selectedPipeSizeId,
          mm1Colors: formData.categoryColor,
          mm2IdData: selectedIds,
          mm3CustomPipeSizes: customPipeSizes,
          // Store ALL MM4 data by pipe size, not just current selection
          mm4DataByPipeSize: mm4DataByPipeSize,
          mm5Data: getCurrentMM5Data(), // MM5 independent of pipe size
          // Keep legacy format for backward compatibility
          mm4Rows: currentMM4Data,
          mm5Rows: getCurrentMM5Data(),
          // Include patching green window data for F615
          patchingGreenData: patchingGreenData,
          categoryId: categoryId,
          sector: sector,
          timestamp: Date.now(),
          pipeSizeKey: pipeSizeKey // Add key for debugging
        };
        
        console.log('💾 MM Data being saved to backend:', mmData);

        // Auto-save to backend - only update existing configurations, don't create new ones
        if (editId) {
          console.log(`🔄 Attempting to save configuration ${editId} to database...`);
          const response = await apiRequest('PUT', `/api/pr2-clean/${editId}`, {
            ...formData,
            mmData: mmData
          });
          console.log(`✅ Configuration ${editId} saved successfully:`, response);
        } else {
          console.warn('⚠️ No editId found - skipping auto-save to prevent creating new configuration');
        }
        // Don't create new configurations during auto-save - only update existing ones
        
        // ENHANCED CACHE INVALIDATION: Target specific query keys and force immediate dashboard refresh
        queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
        queryClient.invalidateQueries({ queryKey: ['pr2-configs'] }); // Dashboard sector configs
        queryClient.invalidateQueries({ queryKey: ['all-pr2-configs-for-tp2'] }); // TP2 validation configs  
        queryClient.invalidateQueries({ queryKey: ['/api/pr2-configurations'] }); // Configuration updates
        
        // CRITICAL FIX: Invalidate dashboard configuration cache with equipment priority variants
        queryClient.invalidateQueries({ queryKey: ['pr2-all-configs'] }); // Invalidate all variants
        queryClient.invalidateQueries({ queryKey: ['pr2-all-configs', sector] }); // Sector-specific
        queryClient.invalidateQueries({ queryKey: ['pr2-all-configs', sector, 'id759'] }); // A4 specific
        queryClient.invalidateQueries({ queryKey: ['pr2-all-configs', sector, 'id760'] }); // A5 specific
        
        console.log('✅ ENHANCED CACHE INVALIDATION - Configuration saved and dashboard refreshed:', {
          configId: editId,
          sector: sector,
          categoryId: categoryId,
          invalidatedQueries: [
            'pr2-clean', 'pr2-configs', 'all-pr2-configs-for-tp2', 
            'pr2-configurations', 'pr2-all-configs with variants'
          ]
        });
        
      } catch (error) {
        console.error('❌ Auto-save failed:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
      }
    }, 1000); // 1 second delay
    
    setAutoSaveTimeout(timeoutId);
  }, [selectedPipeSizeForMM4, selectedPipeSizeId, formData, selectedIds, customPipeSizes, mm4DataByPipeSize, mm5Data, editId, categoryId, sector, autoSaveTimeout]);

  // 🔒 MMP1 PROTECTED FUNCTION - USER ONLY 🔒
  // MM2 Color picker auto-save (independent from MM1 ID selection)
  const handleMM1ColorChange = (color: string) => {
    setHasUserChanges(true); // Mark that user has made changes to prevent auto-reload
    
    setFormData(prev => {
      const updatedFormData = { ...prev, categoryColor: color };
      
      // Immediate save with correct color value
      if (editId) {
        setTimeout(async () => {
          try {
            const mmData = {
              selectedPipeSize: selectedPipeSizeForMM4,
              selectedPipeSizeId: selectedPipeSizeId,
              mm1Colors: color, // Use the NEW color directly
              mm2IdData: selectedIds,
              mm3CustomPipeSizes: customPipeSizes,
              mm4Rows: mm4Rows,
              mm5Rows: mm5Rows,
              categoryId: categoryId,
              sector: sector,
              timestamp: Date.now()
            };
            
            await apiRequest('PUT', `/api/pr2-clean/${editId}`, {
              ...updatedFormData,
              mmData: mmData
            });
            
            // Invalidate ALL queries to update category card display and dashboard validation
            queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
            queryClient.invalidateQueries({ queryKey: ['pr2-configs'] }); // Dashboard sector configs
            queryClient.invalidateQueries({ queryKey: ['all-pr2-configs-for-tp2'] }); // TP2 validation configs
            queryClient.invalidateQueries({ queryKey: ['/api/pr2-configurations'] }); // Configuration updates
            
          } catch (error) {
            console.error('MM2 immediate save failed:', error);
          }
        }, 100); // Very short delay for immediate save
      }
      
      return updatedFormData;
    });
  };



  // 🔒 MMP1 PROTECTED FUNCTIONS - USER ONLY 🔒
  // MM4/MM5 Auto-save wrappers
  // DATABASE-FIRST: Immediate save wrapper
  const updateMM4RowWithAutoSave = (rowId: number, field: 'blueValue' | 'greenValue' | 'purpleDebris' | 'purpleLength', value: string) => {
    updateMM4Row(rowId, field, value); // Now handles immediate database save
  };

  const updateMM5RowWithAutoSave = (rowId: number, field: 'vehicleWeight' | 'costPerMile', value: string) => {
    updateMM5Row(rowId, field, value);
    triggerAutoSave();
  };

  // Patching Green Window Data Management (Independent)
  const updatePatchingGreenRow = (rowId: number, value: string) => {
    // Allow input for all pipe sizes - user is responsible for authentic data
    console.log(`✅ Allowing patching input for pipe size: ${selectedPipeSizeForMM4}mm`);
    
    setPatchingGreenData(prev => 
      prev.map(row => row.id === rowId ? { ...row, quantity: value } : row)
    );
    triggerAutoSave();
  };

  const handlePipeSizeSelectWithAutoSave = (pipeSize: string) => {
    handlePipeSizeSelect(pipeSize);
    triggerAutoSave();
  };

  const toggleAdminControl = useMutation({
    mutationFn: async ({ isLocked, lockReason }: { isLocked: boolean; lockReason?: string }) => {
      return await apiRequest('POST', '/api/admin-controls', {
        controlType: 'tp2_option_1_lock',
        sector: sector,
        categoryId: categoryId,
        isLocked: isLocked,
        lockReason: lockReason
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin-controls'] });
    }
  });

  // Load configurations by category and sector to find the right one for editing
  const { data: sectorConfigs } = useQuery({
    queryKey: ['/api/pr2-clean', 'sector-category', sector, categoryId, pipeSize],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/pr2-clean?categoryId=${categoryId}&sector=${sector}`);
      const configs = await response.json();

      
      // If we have pipe size, look for pipe size-specific configuration first
      if (pipeSize) {
        const pipeSizeConfig = configs.find(config => 
          config.description && config.description.includes(`${pipeSize}mm`) &&
          config.sector === sector
        );
        
        if (pipeSizeConfig) {

          return pipeSizeConfig;
        } else {
          return null; // Return null to indicate we need to create a new config
        }
      }
      
      // Fallback to general configuration for the current sector
      const sectorConfig = configs.find(config => config.sector === sector);
      
      if (sectorConfig) {

        return sectorConfig;
      } else {
        return null; // Always return null instead of undefined
      }
    },
    enabled: !isEditing && !!categoryId && !editId, // FIXED: Enable when pipeSize exists to find correct config
  });

  // Load all configurations for this category to show in "Saved Configurations"
  const { data: allConfigs } = useQuery({
    queryKey: ['/api/pr2-clean', 'category', categoryId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/pr2-clean?categoryId=${categoryId}`);
      return response.json();
    },
    enabled: !!categoryId,
  });

  // State to track which sectors have this configuration (loaded once when editing starts)
  const [sectorsWithConfig, setSectorsWithConfig] = useState<string[]>([]);
  
  // State for delete confirmation dialog
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // State for 100mm delete confirmation dialog
  const [show100mmDeleteDialog, setShow100mmDeleteDialog] = useState(false);
  
  // State for validation warning
  const [showValidationWarning, setShowValidationWarning] = useState(false);

  // Validation errors - computed from formData
  const validationErrors: Record<string, string> = {};

  // Navigate back to dashboard
  const handleGoBack = () => {
    // Check for purple length values missing .99 before navigating
    // DISABLE for F615 (patching category) and F619 (f-robot-cutting) as requested by user
    if (getTemplateType(categoryId || '') === 'MMP1' && categoryId !== 'patching' && categoryId !== 'f-robot-cutting') {
      const currentData = getCurrentMM4Data();
      
      for (const row of currentData) {
        // DATABASE-FIRST: Get actual values directly from database state
        const actualValue = row.purpleLength;
        const actualDebrisValue = row.purpleDebris;
        
        console.log(`🎯 DATABASE-FIRST .99 Validation Check - Row ${row.id}:`, {
          storedValue: row.purpleLength,
          actualValue,
          needsValidation: !!(actualValue && actualValue.trim() !== '' && !actualValue.endsWith('.99'))
        });
        
        if (actualValue && actualValue.trim() !== '' && !actualValue.endsWith('.99') && 
            actualDebrisValue && actualDebrisValue.trim() !== '') {
          // Only show warning if both length and debris have data but length missing .99
          console.log(`⚠️ .99 Validation triggered for Row ${row.id} with value "${actualValue}" and debris "${actualDebrisValue}"`);
          setPendingRangeValue(actualValue);
          setPendingRowId(row.id);
          setShowRangeWarning(true);
          return; // Don't navigate yet, wait for user decision
        }
      }
    }
    
    // No validation issues found, proceed with navigation, preserving reportId if present
    const dashboardUrl = reportId ? `/dashboard?reportId=${reportId}` : '/dashboard';
    setLocation(dashboardUrl);
  };

  // Handle sector toggle for MM4-225 templates
  const handleSectorToggle = (sectorId: string) => {
    setSelectedSectors(prev => {
      if (prev.includes(sectorId)) {
        return prev.filter(id => id !== sectorId);
      } else {
        return [...prev, sectorId];
      }
    });
  };

  // 🔒 MMP1 PROTECTED FUNCTION - USER ONLY 🔒
  // Handle color change for MM2 custom color picker
  const handleColorChange = (color: string) => {
    setHasUserChanges(true); // Prevent config reload
    
    setFormData(prev => {
      const updatedFormData = { ...prev, categoryColor: color };
      
      // Immediate save with correct color value
      if (editId) {
        setTimeout(async () => {
          try {
            const mmData = {
              selectedPipeSize: selectedPipeSizeForMM4,
              selectedPipeSizeId: selectedPipeSizeId,
              mm1Colors: color, // Use the NEW color directly
              mm2IdData: selectedIds,
              mm3CustomPipeSizes: customPipeSizes,
              mm4Rows: mm4Rows,
              mm5Rows: mm5Rows,
              categoryId: categoryId,
              sector: sector,
              timestamp: Date.now()
            };
            
            await apiRequest('PUT', `/api/pr2-clean/${editId}`, {
              ...updatedFormData,
              mmData: mmData
            });
            
            // Invalidate ALL queries to update category card display and dashboard validation
            queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
            queryClient.invalidateQueries({ queryKey: ['pr2-configs'] }); // Dashboard sector configs
            queryClient.invalidateQueries({ queryKey: ['all-pr2-configs-for-tp2'] }); // TP2 validation configs  
            queryClient.invalidateQueries({ queryKey: ['/api/pr2-configurations'] }); // Configuration updates
            
          } catch (error) {
            console.error('MM2 custom save failed:', error);
          }
        }, 100);
      }
      
      return updatedFormData;
    });
  };

  // Mutation for saving sectors
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('PUT', `/api/pr2-clean/${editId}`, data);
    },
    onSuccess: () => {
      // Invalidate ALL queries to ensure dashboard validation updates immediately
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
      queryClient.invalidateQueries({ queryKey: ['pr2-configs'] }); // Dashboard sector configs
      queryClient.invalidateQueries({ queryKey: ['all-pr2-configs-for-tp2'] }); // TP2 validation configs
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-configurations'] }); // Configuration updates
    }
  });

  // Handle sector checkbox changes
  const handleSectorChange = async (sectorId: string, checked: boolean) => {

    
    if (checked) {
      // Add sector to selected list
      setSelectedSectors(prev => [...new Set([...prev, sectorId])]);
      
      // CRITICAL FIX: Only create copies when editing ID 48 specifically
      // Do NOT create copies for other IDs (94, 95, etc.) as they are just examples
      if (isEditing && editId && parseInt(editId) === 48 && !sectorsWithConfig.includes(sectorId)) {
        await createSectorCopy(sectorId);
        
        // Update sectorsWithConfig to include this sector
        setSectorsWithConfig(prev => [...new Set([...prev, sectorId])]);
      } else if (parseInt(editId || '0') !== 48) {
      }
    } else {
      // Auto-remove: Delete configuration from this sector immediately
      const hasExistingConfig = sectorsWithConfig.includes(sectorId);
      
      if (hasExistingConfig && isEditing) {
        
        // Find and delete the configuration for this sector
        try {
          const response = await fetch(`/api/pr2-clean`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (response.ok) {
            const allConfigs = await response.json();
            const configToDelete = allConfigs.find((config: any) => 
              config.sector === sectorId && config.categoryId === categoryId
            );
            
            if (configToDelete && configToDelete.id) {
              await fetch(`/api/pr2-clean/${configToDelete.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
              });
              
              // Update local state
              setSelectedSectors(prev => prev.filter(s => s !== sectorId));
              setSectorsWithConfig(prev => prev.filter(s => s !== sectorId));
              
              // Refresh data
              queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
              

            }
          }
        } catch (error) {
          console.error(`❌ Failed to remove configuration from ${sectorId}:`, error);
        }
      } else {

        // Remove sector from selected list
        setSelectedSectors(prev => prev.filter(s => s !== sectorId));
      }
    }
  }

  // 🔒 MMP1 PROTECTED FUNCTION - USER ONLY 🔒
  // Handle MMP1 ID selection changes (following P002 pattern)
  const handleMMP1IdChange = async (idKey: string, checked: boolean) => {
    if (checked) {
      // Add ID to selected list
      setSelectedIds(prev => [...new Set([...prev, idKey])]);
      
      // Create configuration copy for this ID
      if (isEditing && editId) {
        await createIdCopy(idKey);
        setIdsWithConfig(prev => [...new Set([...prev, idKey])]);
      }
    } else {
      // Remove configuration for this ID
      const hasExistingConfig = idsWithConfig.includes(idKey);
      
      if (hasExistingConfig && isEditing) {
        // Find and delete the configuration for this ID
        try {
          const response = await fetch(`/api/pr2-clean`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (response.ok) {
            const allConfigs = await response.json();
            const configToDelete = allConfigs.find((config: any) => 
              config.sector === idKey && config.categoryId === categoryId
            );
            
            if (configToDelete && configToDelete.id) {
              await fetch(`/api/pr2-clean/${configToDelete.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
              });
              
              // Update local state
              setSelectedIds(prev => prev.filter(s => s !== idKey));
              setIdsWithConfig(prev => prev.filter(s => s !== idKey));
              
              // Refresh data
              queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
            }
          }
        } catch (error) {
          console.error(`❌ Failed to remove configuration from ${idKey}:`, error);
        }
      } else {
        // Remove ID from selected list
        setSelectedIds(prev => prev.filter(s => s !== idKey));
      }
    }
  }

  // Create an independent copy of the current configuration for a new sector
  const createSectorCopy = async (targetSectorId: string) => {
    try {
      
      const payload = {
        categoryName: formData.categoryName,
        description: formData.description,
        categoryColor: formData.categoryColor,
        sector: targetSectorId, // Each copy gets its own sector
        categoryId: categoryId,
        pricingOptions: formData.pricingOptions,
        quantityOptions: formData.quantityOptions,
        minQuantityOptions: formData.minQuantityOptions,
        rangeOptions: formData.rangeOptions,
        mathOperators: formData.mathOperators,
        pricingStackOrder: formData.pricingStackOrder,
        quantityStackOrder: formData.quantityStackOrder,
        minQuantityStackOrder: formData.minQuantityStackOrder,
        rangeStackOrder: formData.rangeStackOrder
      };

      const response = await fetch('/api/pr2-clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const newConfig = await response.json();

        
        // Update sectorsWithConfig to include this new sector
        setSectorsWithConfig(prev => [...new Set([...prev, targetSectorId])]);
        
        // Invalidate queries to refresh the UI
        queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
      } else {
        console.error(`❌ Failed to create copy for ${targetSectorId}`);
      }
    } catch (error) {
      console.error(`❌ Error creating sector copy:`, error);
    }
  };

  // Create an independent copy of the current configuration for a new MMP1 ID
  const createIdCopy = async (targetIdKey: string) => {
    try {
      const payload = {
        categoryName: formData.categoryName,
        description: `${formData.description} - ${targetIdKey.toUpperCase()}`,
        categoryColor: formData.categoryColor,
        sector: targetIdKey, // Use ID as sector for storage
        categoryId: categoryId,
        pricingOptions: formData.pricingOptions,
        quantityOptions: formData.quantityOptions,
        minQuantityOptions: formData.minQuantityOptions,
        rangeOptions: formData.rangeOptions,
        mathOperators: formData.mathOperators,
        pricingStackOrder: formData.pricingStackOrder,
        quantityStackOrder: formData.quantityStackOrder,
        minQuantityStackOrder: formData.minQuantityStackOrder,
        rangeStackOrder: formData.rangeStackOrder
      };

      const response = await fetch('/api/pr2-clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const newConfig = await response.json();
        setIdsWithConfig(prev => [...new Set([...prev, targetIdKey])]);
        queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
      } else {
        console.error(`❌ Failed to create copy for ${targetIdKey}`);
      }
    } catch (error) {
      console.error(`❌ Error copying configuration to ${targetIdKey}:`, error);
    }
  };

  // Main save function that creates independent copies for each selected sector
  const handleSave = async () => {
    try {

      
      // First, update the current configuration (or create it if it's new)
      const payload = {
        categoryName: formData.categoryName,
        description: formData.description,
        categoryColor: formData.categoryColor,
        sector: sector, // Current sector
        categoryId: categoryId,
        pricingOptions: formData.pricingOptions,
        quantityOptions: formData.quantityOptions,
        minQuantityOptions: formData.minQuantityOptions,
        rangeOptions: formData.rangeOptions,
        mathOperators: formData.mathOperators,
        pricingStackOrder: formData.pricingStackOrder,
        quantityStackOrder: formData.quantityStackOrder,
        minQuantityStackOrder: formData.minQuantityStackOrder,
        rangeStackOrder: formData.rangeStackOrder
      };
      


      if (isEditing && editId) {
        // Update existing configuration
        await fetch(`/api/pr2-clean/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

      } else {
        // Create new configuration for current sector
        const response = await fetch('/api/pr2-clean', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (response.ok) {
          const newConfig = await response.json();

        }
      }

      // Create independent copies for other selected sectors (excluding current sector)
      const otherSectors = selectedSectors.filter(s => s !== sector);
      for (const targetSector of otherSectors) {
        if (!sectorsWithConfig.includes(targetSector)) {
          await createSectorCopy(targetSector);
        } else {
        }
      }

      // Invalidate all queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
      
      // CRITICAL: Also invalidate dashboard queries so costs update immediately
      queryClient.invalidateQueries({ queryKey: ['/api/uploads'] });
      queryClient.invalidateQueries({ predicate: (query) => {
        return query.queryKey[0]?.toString().includes('/api/uploads/') && 
               (query.queryKey[0]?.toString().includes('/sections') || 
                query.queryKey[0]?.toString().includes('/defects'));
      }});

      

      
    } catch (error) {
      console.error(`❌ Save failed:`, error);
    }
  };

  // Confirm sector removal
  const confirmSectorRemoval = () => {
    setSelectedSectors(prev => prev.filter(s => s !== sectorToRemove));
    setSectorsWithConfig(prev => prev.filter(s => s !== sectorToRemove));
    setShowRemoveWarning(false);
    setSectorToRemove('');
  };

  // Track processed configurations to prevent double loading
  const [processedConfigId, setProcessedConfigId] = useState<number | null>(null);
  
  // Track if user has made changes to prevent automatic form overwrite
  const [hasUserChanges, setHasUserChanges] = useState(false);
  const [mm2ColorLocked, setMm2ColorLocked] = useState(false); // Removed persistent locking
  
  // Removed hasInitialLoad - simplified logic to never overwrite user changes
  
  // Clear processedConfigId when editId changes to allow new configuration loading
  useEffect(() => {
    setProcessedConfigId(null);
    // Reset flags when switching to different config
    setHasUserChanges(false);
    setMm2ColorLocked(false); // Reset MM2 color lock when switching configurations
    
    // CLEAR PR1 CACHE CONTAMINATION for f-robot-cutting configurations
    if (categoryId === 'f-robot-cutting') {
      // Clear any localStorage that might contain old PR1 data
      try {
        localStorage.removeItem('pr1-config-cache');
        localStorage.removeItem('config-form-data');
        localStorage.removeItem('category-config-cache');
      } catch (e) {
      }
    }
    
    // Force invalidate the specific configuration query to trigger fresh fetch
    if (editId) {
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean', editId] });
    }
  }, [editId, categoryId]);
  
  // Single useEffect to handle all configuration loading
  useEffect(() => {
    // Use sectorConfigs for navigation without editId, existingConfig for direct editId access
    const configToUse = editId ? existingConfig : sectorConfigs;


    
    // FIXED: Force reload when editId changes, but NEVER if user has made changes

    
    if (isEditing && configToUse && configToUse.id && !hasUserChanges) {
      const configId = parseInt(editId || '0');

      
      // Always process when editId is present, but NEVER overwrite user changes
      if (configId > 0) {
        // Get the actual config object (might be wrapped in array)
        const config = Array.isArray(configToUse) ? configToUse[0] : configToUse;

      
      if (config) {

        
        // Handle array vs object format for quantityOptions and minQuantityOptions
        const existingQuantityOptions = Array.isArray(config.quantityOptions) ? config.quantityOptions : [];
        const existingMinQuantityOptions = Array.isArray(config.minQuantityOptions) ? config.minQuantityOptions : [];
        const existingRangeOptions = Array.isArray(config.rangeOptions) ? config.rangeOptions : [];
        const existingPricingOptions = Array.isArray(config.pricingOptions) ? config.pricingOptions : [];
        
        // REMOVED: Some configurations use central configuration instead
        
        // Initialize single-option defaults for each window (matching your requirement)
        const defaultPricingOptions = [
          { id: 'price_dayrate', label: 'Day Rate', enabled: true, value: '' }
        ];
        
        const defaultQuantityOptions = [
          { id: 'quantity_runs', label: 'Runs per Shift', enabled: true, value: '' }
        ];
        
        const defaultMinQuantityOptions = [];
        
        const defaultRangeOptions = [
          { id: 'range_combined', label: 'Debris % / Length M', enabled: true, rangeStart: '', rangeEnd: '' }
        ];
        
        // Use existing options if they exist, otherwise use defaults
        const pricingOptions = existingPricingOptions.length > 0 ? existingPricingOptions : defaultPricingOptions;
        const quantityOptions = existingQuantityOptions.length > 0 ? existingQuantityOptions : defaultQuantityOptions;
        const minQuantityOptions = existingMinQuantityOptions.length > 0 ? existingMinQuantityOptions : defaultMinQuantityOptions;
        const rangeOptions = existingRangeOptions.length > 0 ? existingRangeOptions : defaultRangeOptions;
        
        // FORCE TP3 template name override to prevent PR1 cache contamination
        const correctCategoryName = (() => {
          if (categoryId === 'f-robot-cutting') {

            return 'TP3 - Robotic Cutting Configuration';
          }
          return config.categoryName || 'CCTV Price Configuration';
        })();
        

        
        const newFormData = {
          categoryName: correctCategoryName,
          description: config.description || '',
          categoryColor: config.categoryColor || '#93c5fd',
          pipeSize: pipeSize || '',
          pricingOptions: pricingOptions,
          quantityOptions: quantityOptions,
          minQuantityOptions: minQuantityOptions,
          rangeOptions: rangeOptions,
          vehicleTravelRates: config.vehicleTravelRates || [],
          vehicleTravelRatesStackOrder: config.vehicleTravelRatesStackOrder || [],
          mathOperators: config.mathOperators || ['N/A'],
          pricingStackOrder: pricingOptions.map((opt: any) => opt.id),
          quantityStackOrder: quantityOptions.map((opt: any) => opt.id),
          minQuantityStackOrder: minQuantityOptions.map((opt: any) => opt.id),
          rangeStackOrder: rangeOptions.map((opt: any) => opt.id),
          sector
        };
        


        // Set the form data directly without reset (fixes display issue)
        setFormData(newFormData);
        
        // Load MM4/MM5 data from backend if it exists AND if we don't already have local data
        if (config.mmData) {
          console.log('🔄 Loading MM4/MM5 data from backend:', config.mmData);
          console.log('🔍 MM4 Backend Data Analysis:');
          console.log('  - mm4DataByPipeSize exists:', !!config.mmData.mm4DataByPipeSize);
          console.log('  - mm4Rows exists:', !!config.mmData.mm4Rows);
          console.log('  - selectedPipeSizeForMM4:', selectedPipeSizeForMM4);
          console.log('  - selectedPipeSizeId:', selectedPipeSizeId);
          
          // Check if we already have local MM4/MM5 data to preserve
          const hasLocalMM4Data = Object.keys(mm4DataByPipeSize).length > 0;
          // For MM5, don't consider "4" as valid data - force reload to clean it
          const hasLocalMM5Data = mm5Data.some(row => row.vehicleWeight || (row.costPerMile && row.costPerMile !== '4'));
          
          console.log('🔍 Local data check:');
          console.log('  - hasLocalMM4Data:', hasLocalMM4Data);
          console.log('  - hasLocalMM5Data:', hasLocalMM5Data);
          
          // CRITICAL FIX: Stop forcing backend load that brings corrupted data
          // const isF606Configuration = editId === "606" || editId === 606;
          
          // DATABASE-FIRST: Load MM4 data from backend directly (no buffer checks)
          const currentPipeSizeKey = `${selectedPipeSizeForMM4}-${selectedPipeSizeId}`;
          const hasLocalMM4ForCurrentPipeSize = !!mm4DataByPipeSize[currentPipeSizeKey];
          
          console.log('🎯 DATABASE-FIRST: Loading backend data directly');
          console.log('  - hasLocalMM4ForCurrentPipeSize:', hasLocalMM4ForCurrentPipeSize);
          console.log('  - currentPipeSizeKey:', currentPipeSizeKey);
          
          // DATABASE-FIRST: Always load from backend when available
          if (!hasLocalMM4ForCurrentPipeSize) {
            if (config.mmData.mm4DataByPipeSize) {
              console.log('📥 DATABASE-FIRST: Loading MM4 data from backend:', config.mmData.mm4DataByPipeSize);
              
              const hasBackendData = Object.keys(config.mmData.mm4DataByPipeSize).length > 0;
              if (hasBackendData) {
                setMm4DataByPipeSize(config.mmData.mm4DataByPipeSize);
                console.log('✅ DATABASE-FIRST: MM4 backend data loaded successfully');
              } else {
                console.log('🔍 DATABASE-FIRST: Backend has empty MM4 data');
              }
            } else if (config.mmData.mm4Rows) {
              // Legacy format - store under current pipe size key
              const currentKey = `${selectedPipeSizeForMM4}-${selectedPipeSizeId}`;
              console.log('📥 DATABASE-FIRST: Converting MM4 legacy data to pipe-size format');
              console.log('  - Legacy data:', config.mmData.mm4Rows);
              console.log('  - Will store under key:', currentKey);
              setMm4DataByPipeSize({ [currentKey]: config.mmData.mm4Rows });
              console.log('✅ DATABASE-FIRST: MM4 legacy data converted and stored');
            } else {
              console.log('❌ DATABASE-FIRST: No MM4 data found in backend config');
            }
          } else {
            console.log('🔒 DATABASE-FIRST: Preserving local MM4 data for this pipe size, skipping backend load');
            console.log('  - Reason: hasLocalMM4ForCurrentPipeSize =', hasLocalMM4ForCurrentPipeSize);
          
          // DISABLED: Corrupted data detection was clearing user input values for patching
          // User inputs are now preserved regardless of field completion status
          }
          
          // Only load MM5 data if we don't have local changes  
          if (!hasLocalMM5Data) {
            // MM5 is now independent of pipe size
            if (config.mmData.mm5Data) {
              // Clean the MM5 data - if costPerMile has unwanted values, reset to empty
              const cleanedMM5Data = config.mmData.mm5Data.map((row: any) => ({
                ...row,
                costPerMile: row.costPerMile === '4' ? '' : row.costPerMile, // Reset "4" to empty
                vehicleWeight: row.vehicleWeight || ''
              }));
              setMm5Data(cleanedMM5Data);
              console.log('✅ Loaded MM5 independent data (cleaned):', cleanedMM5Data);
            } else if (config.mmData.mm5Rows) {
              // Legacy format - use as independent data
              const cleanedMM5Rows = config.mmData.mm5Rows.map((row: any) => ({
                ...row,
                costPerMile: row.costPerMile === '4' ? '' : row.costPerMile, // Reset "4" to empty
                vehicleWeight: row.vehicleWeight || ''
              }));
              setMm5Data(cleanedMM5Rows);
              console.log('✅ Loaded MM5 legacy data as independent (cleaned):', cleanedMM5Rows);
            } else if (config.mmData.mm5DataByPipeSize) {
              // Old pipe-size-specific format - extract first available data as independent
              const firstKey = Object.keys(config.mmData.mm5DataByPipeSize)[0];
              if (firstKey) {
                const cleanedMM5Migration = config.mmData.mm5DataByPipeSize[firstKey].map((row: any) => ({
                  ...row,
                  costPerMile: row.costPerMile === '4' ? '' : row.costPerMile, // Reset "4" to empty
                  vehicleWeight: row.vehicleWeight || ''
                }));
                setMm5Data(cleanedMM5Migration);
                console.log('✅ Migrated MM5 pipe-size data to independent (cleaned):', cleanedMM5Migration);
              }
            }
          } else {
            console.log('🔒 Preserving local MM5 data, skipping backend load');
          }
          
          // Load other MM data
          if (config.mmData.mm3CustomPipeSizes) {
            setCustomPipeSizes(config.mmData.mm3CustomPipeSizes);
          }
          // SECTOR INDEPENDENCE FIX: Don't load previous selections to prevent unwanted highlighting
          // Each sector should start fresh without cross-contamination
          // if (config.mmData.mm2IdData) {
          //   setSelectedIds(config.mmData.mm2IdData);
          // }
          
          // Load patching green window data for F615 only if we don't have local data
          if (config.mmData.patchingGreenData && categoryId === 'patching') {
            // Check if we already have local patching green data to preserve
            const hasLocalPatchingData = patchingGreenData.some(row => row.quantity && row.quantity.trim() !== '');
            
            if (!hasLocalPatchingData) {
              setPatchingGreenData(config.mmData.patchingGreenData);
              console.log('✅ Loaded patching green window data:', config.mmData.patchingGreenData);
            } else {
              console.log('🔒 Preserving local patching green data, skipping backend load');
            }
          }
        }
        
        // Set single sector information
        const configSector = config.sector || sector;
        
        
        setSectorsWithConfig([configSector]);
        setSelectedSectors([configSector]);
        
        // Mark this config as processed to prevent double loading
        setProcessedConfigId(config.id);
      } else if (configToUse && configToUse.id && processedConfigId === configToUse.id) {
      }
      } // Close the if (configId > 0) block
    } else if (!isEditing) {
      // Start with the current sector for new configurations
      setSelectedSectors([sector]);
      setSectorsWithConfig([]);
      
      // If we have pipe size but no existing config, create new pipe size-specific config
      if (pipeSize && categoryId && !sectorConfigs) {
        
        // Use the configName from URL if available, otherwise generate it
        const pipeSizeConfigName = configName || getCategoryName(categoryId);
        
        // Initialize with single specific options for each window
        const defaultPricingOptions = [
          { id: 'price_dayrate', label: 'Day Rate', enabled: true, value: '' }
        ];
        
        const defaultQuantityOptions = [
          { id: 'quantity_runs', label: 'Runs per Shift', enabled: true, value: '' }
        ];
        
        const defaultMinQuantityOptions = [];
        
        const defaultRangeOptions = [
          { id: 'range_combined', label: 'Debris % / Length M', enabled: true, rangeStart: '', rangeEnd: '' }
        ];
        
        setFormData(prev => ({
          ...prev,
          categoryName: pipeSizeConfigName,
          description: `Configuration for ${pipeSize}mm ${getCategoryName(categoryId).toLowerCase()}`,
          pricingOptions: defaultPricingOptions,
          quantityOptions: defaultQuantityOptions,
          minQuantityOptions: defaultMinQuantityOptions,
          rangeOptions: defaultRangeOptions,
          pricingStackOrder: defaultPricingOptions.map(opt => opt.id),
          quantityStackOrder: defaultQuantityOptions.map(opt => opt.id),
          minQuantityStackOrder: defaultMinQuantityOptions.map(opt => opt.id),
          rangeStackOrder: defaultRangeOptions.map(opt => opt.id)
        }));
      }
    }
  }, [isEditing, existingConfig, editId]); // FIXED: Watch full existingConfig object to trigger reload









  // Pricing option management
  const addPricingOption = () => {
    if (!newPricingLabel.trim()) return;
    
    const newOption: PricingOption = {
      id: `pricing_${Date.now()}`,
      label: newPricingLabel.trim(),
      enabled: false,
      value: ''
    };
    
    setFormData(prev => ({
      ...prev,
      pricingOptions: [...prev.pricingOptions, newOption],
      pricingStackOrder: [...prev.pricingStackOrder, newOption.id]
    }));
    
    setNewPricingLabel('');
    setAddPricingDialogOpen(false);
  };

  const editPricingOption = (option: PricingOption) => {
    setEditingPricing(option);
    setNewPricingLabel(option.label);
    setEditPricingDialogOpen(true);
  };

  const savePricingEdit = () => {
    if (!editingPricing || !newPricingLabel.trim()) return;
    
    setFormData(prev => ({
      ...prev,
      pricingOptions: prev.pricingOptions.map(opt => 
        opt.id === editingPricing.id 
          ? { ...opt, label: newPricingLabel.trim() }
          : opt
      )
    }));
    
    setEditingPricing(null);
    setNewPricingLabel('');
    setEditPricingDialogOpen(false);
  };

  const deletePricingOption = (optionId: string) => {
    const option = formData.pricingOptions.find(opt => opt.id === optionId);
    if (!option) return;
    
    setFormData(prev => ({
      ...prev,
      pricingOptions: prev.pricingOptions.filter(opt => opt.id !== optionId),
      pricingStackOrder: prev.pricingStackOrder.filter(id => id !== optionId)
    }));
    // CRITICAL FIX: Trigger database save after deletion
    debouncedSave();
  };

  const updatePricingOption = (index: number | string, field: 'enabled' | 'value', value: any) => {
    if (typeof index === 'number') {
      // Array index approach for database-driven templates
      setFormData(prev => ({
        ...prev,
        pricingOptions: prev.pricingOptions.map((opt, i) =>
          i === index ? { ...opt, [field]: value } : opt
        )
      }));
    } else {
      // Option ID approach for other templates
      setFormData(prev => ({
        ...prev,
        pricingOptions: prev.pricingOptions.map(opt =>
          opt.id === index ? { ...opt, [field]: value } : opt
        )
      }));
    }
    debouncedSave();
  };

  const moveOptionInStack = (optionId: string, direction: 'up' | 'down') => {
    setFormData(prev => {
      const currentOrder = [...prev.pricingStackOrder];
      const currentIndex = currentOrder.indexOf(optionId);
      
      if (currentIndex === -1) return prev;
      if (direction === 'up' && currentIndex === 0) return prev;
      if (direction === 'down' && currentIndex === currentOrder.length - 1) return prev;
      
      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      [currentOrder[currentIndex], currentOrder[newIndex]] = [currentOrder[newIndex], currentOrder[currentIndex]];
      
      return { ...prev, pricingStackOrder: currentOrder };
    });
  };

  // Quantity option management
  const addQuantityOption = () => {
    if (!newQuantityLabel.trim()) return;
    
    const newOption: PricingOption = {
      id: `quantity_${Date.now()}`,
      label: newQuantityLabel.trim(),
      enabled: false,
      value: ''
    };
    
    setFormData(prev => ({
      ...prev,
      quantityOptions: [...prev.quantityOptions, newOption],
      quantityStackOrder: [...prev.quantityStackOrder, newOption.id]
    }));
    
    setNewQuantityLabel('');
    setAddQuantityDialogOpen(false);
  };

  // Simple add new quantity input function (no dialog needed)
  const addNewQuantityInput = () => {
    const newOption: PricingOption = {
      id: `quantity_${Date.now()}`,
      label: `No ${formData.quantityOptions.length + 1}`,
      enabled: true,
      value: ''
    };
    
    setFormData(prev => ({
      ...prev,
      quantityOptions: [...prev.quantityOptions, newOption],
      quantityStackOrder: [...prev.quantityStackOrder, newOption.id]
    }));
    
  };

  // Simple add new min quantity input function (no dialog needed)
  const addNewMinQuantityInput = () => {
    const newOption: PricingOption = {
      id: `minquantity_${Date.now()}`,
      label: `Qty ${formData.minQuantityOptions.length + 1}`,
      enabled: true,
      value: ''
    };
    
    setFormData(prev => ({
      ...prev,
      minQuantityOptions: [...prev.minQuantityOptions, newOption],
      minQuantityStackOrder: [...prev.minQuantityStackOrder, newOption.id]
    }));
    
  };

  // Database-driven template update functions
  const updateQuantityOption = (index: number, field: 'enabled' | 'value', value: any) => {
    setFormData(prev => ({
      ...prev,
      quantityOptions: prev.quantityOptions.map((opt, i) =>
        i === index ? { ...opt, [field]: value } : opt
      )
    }));
    debouncedSave();
  };

  const updateRangeOption = (index: number, field: 'rangeStart' | 'rangeEnd', value: any) => {
    setFormData(prev => ({
      ...prev,
      rangeOptions: prev.rangeOptions.map((opt, i) =>
        i === index ? { ...opt, [field]: value } : opt
      )
    }));
    debouncedSave();
  };

  const updateVehicleOption = (index: number, field: 'enabled' | 'hourlyRate' | 'numberOfHours', value: any) => {
    setFormData(prev => ({
      ...prev,
      vehicleTravelRates: prev.vehicleTravelRates.map((vehicle, i) =>
        i === index ? { ...vehicle, [field]: value } : vehicle
      )
    }));
    debouncedSave();
  };

  const handleSaveConfiguration = async () => {
    if (!editId) return;
    
    try {
      await mutation.mutateAsync(formData);
    } catch (error) {
      console.error('❌ Failed to save configuration:', error);
    }
  };

  // Master add function that adds inputs to all three windows (green, orange, purple)
  const addNewInputsToAllWindows = () => {
    const timestamp = Date.now();
    
    
    // Add ONE new quantity input (green window) - only runs, no pairing needed
    const newQuantityOption: PricingOption = {
      id: `quantity_${timestamp}`,
      label: `Runs ${formData.quantityOptions.length + 1}`,
      enabled: true,
      value: ''
    };
    
    // Add ONE new min quantity input (orange window) - no pairing needed
    const newMinQuantityOption: PricingOption = {
      id: `minquantity_${timestamp + 2}`,
      label: `Min ${formData.minQuantityOptions.length + 1}`,
      enabled: true,
      value: ''
    };
    
    // Add new range inputs (purple window - percentage and length pair)
    const setNumber = Math.floor(formData.rangeOptions.length / 2) + 1;
    const newPercentageOption: RangeOption = {
      id: `range_percentage_${timestamp + 4}`,
      label: `Percentage ${setNumber}`,
      enabled: true,
      rangeStart: '',
      rangeEnd: ''
    };
    
    const newLengthOption: RangeOption = {
      id: `range_length_${timestamp + 5}`,
      label: `Length ${setNumber}`,
      enabled: true,
      rangeStart: '',
      rangeEnd: ''
    };
    
    setFormData(prev => ({
      ...prev,
      quantityOptions: [...prev.quantityOptions, newQuantityOption],
      quantityStackOrder: [...prev.quantityStackOrder, newQuantityOption.id],
      minQuantityOptions: [...prev.minQuantityOptions, newMinQuantityOption],
      minQuantityStackOrder: [...prev.minQuantityStackOrder, newMinQuantityOption.id],
      rangeOptions: [...prev.rangeOptions, newPercentageOption, newLengthOption],
      rangeStackOrder: [...prev.rangeStackOrder, newPercentageOption.id, newLengthOption.id]
    }));
    
  };

  // Fixed delete function that removes corresponding inputs from all three windows
  const deleteInputsFromAllWindows = (pairIndex: number) => {
    // pairIndex represents which purple row is being deleted (1 = second row, 2 = third row, etc.)
    // We need to delete the corresponding items from green and orange windows
    
    const rangePercentageIndex = pairIndex * 2; // Range pairs: 0,1 then 2,3 then 4,5
    const rangeLengthIndex = pairIndex * 2 + 1;
    
    // Get the range IDs to delete from purple window
    const percentageIdToDelete = formData.rangeOptions[rangePercentageIndex]?.id;
    const lengthIdToDelete = formData.rangeOptions[rangeLengthIndex]?.id;
    
    // FIXED: Use pairIndex directly to target the same row number in green and orange windows
    // Row 0 = first items, Row 1 = second items (what user wants to delete), etc.
    const quantityIdToDelete = formData.quantityOptions[pairIndex]?.id;
    const minQuantityIdToDelete = formData.minQuantityOptions[pairIndex]?.id;
    
    
    setFormData(prev => ({
      ...prev,
      // Remove from quantity options (single entry)
      quantityOptions: prev.quantityOptions.filter(option => option.id !== quantityIdToDelete),
      quantityStackOrder: prev.quantityStackOrder.filter(id => id !== quantityIdToDelete),
      // Remove from min quantity options (single entry)
      minQuantityOptions: prev.minQuantityOptions.filter(option => option.id !== minQuantityIdToDelete),
      minQuantityStackOrder: prev.minQuantityStackOrder.filter(id => id !== minQuantityIdToDelete),
      // Remove from range options (both percentage and length)
      rangeOptions: prev.rangeOptions.filter(option => 
        option.id !== percentageIdToDelete && option.id !== lengthIdToDelete
      ),
      rangeStackOrder: prev.rangeStackOrder.filter(id => 
        id !== percentageIdToDelete && id !== lengthIdToDelete
      )
    }));
    
  };

  // Wrapper function for deleting range pairs from purple window
  const deleteRangePair = (pairIndex: number) => {
    deleteInputsFromAllWindows(pairIndex);
    // CRITICAL FIX: Trigger database save after deletion
    debouncedSave();
  };

  const deleteQuantityOption = (optionId: string) => {
    setFormData(prev => ({
      ...prev,
      quantityOptions: prev.quantityOptions.filter(opt => opt.id !== optionId),
      quantityStackOrder: prev.quantityStackOrder.filter(id => id !== optionId)
    }));
    // CRITICAL FIX: Trigger database save after deletion
    debouncedSave();
  };



  const editQuantityOption = (option: PricingOption) => {
    setEditingQuantity(option);
    setNewQuantityLabel(option.label);
    setEditQuantityDialogOpen(true);
  };

  const saveQuantityEdit = () => {
    if (!editingQuantity || !newQuantityLabel.trim()) return;
    
    setFormData(prev => ({
      ...prev,
      quantityOptions: prev.quantityOptions.map(opt => 
        opt.id === editingQuantity.id 
          ? { ...opt, label: newQuantityLabel.trim() }
          : opt
      )
    }));
    
    setEditingQuantity(null);
    setNewQuantityLabel('');
    setEditQuantityDialogOpen(false);
  };

  // Min Quantity option management
  const addMinQuantityOption = () => {
    if (!newMinQuantityLabel.trim()) return;
    
    const newOption: PricingOption = {
      id: `minquantity_${Date.now()}`,
      label: newMinQuantityLabel.trim(),
      enabled: false,
      value: ''
    };
    
    setFormData(prev => ({
      ...prev,
      minQuantityOptions: [...prev.minQuantityOptions, newOption],
      minQuantityStackOrder: [...prev.minQuantityStackOrder, newOption.id]
    }));
    
    setNewMinQuantityLabel('');
    setAddMinQuantityDialogOpen(false);
  };

  const deleteMinQuantityOption = (optionId: string) => {
    setFormData(prev => ({
      ...prev,
      minQuantityOptions: prev.minQuantityOptions.filter(opt => opt.id !== optionId),
      minQuantityStackOrder: prev.minQuantityStackOrder.filter(id => id !== optionId)
    }));
    // CRITICAL FIX: Trigger database save after deletion
    debouncedSave();
  };

  const updateMinQuantityOption = (optionId: string, field: 'enabled' | 'value', value: any) => {
    setFormData(prev => ({
      ...prev,
      minQuantityOptions: prev.minQuantityOptions.map(opt =>
        opt.id === optionId ? { ...opt, [field]: value } : opt
      )
    }));
  };

  const editMinQuantityOption = (option: PricingOption) => {
    setEditingMinQuantity(option);
    setNewMinQuantityLabel(option.label);
    setEditMinQuantityDialogOpen(true);
  };

  const saveMinQuantityEdit = () => {
    if (!editingMinQuantity || !newMinQuantityLabel.trim()) return;
    
    setFormData(prev => ({
      ...prev,
      minQuantityOptions: prev.minQuantityOptions.map(opt => 
        opt.id === editingMinQuantity.id 
          ? { ...opt, label: newMinQuantityLabel.trim() }
          : opt
      )
    }));
    
    setEditingMinQuantity(null);
    setNewMinQuantityLabel('');
    setEditMinQuantityDialogOpen(false);
  };

  // Range option management
  const addRangeOption = () => {
    const newOption: RangeOption = {
      id: `range_${Date.now()}`,
      label: `Range ${formData.rangeOptions.length + 1}`,
      enabled: true,
      rangeStart: '',
      rangeEnd: ''
    };
    
    setFormData(prev => ({
      ...prev,
      rangeOptions: [...prev.rangeOptions, newOption],
      rangeStackOrder: [...prev.rangeStackOrder, newOption.id]
    }));
    
    // Auto-save the new range option
    debouncedSave();
  };

  const deleteRangeOption = (index: number) => {
    setFormData(prev => ({
      ...prev,
      rangeOptions: prev.rangeOptions.filter((_, i) => i !== index)
    }));
    // Auto-save after deletion
    debouncedSave();
  };

  // Vehicle Travel Rate functions
  const addVehicleTravelRate = () => {
    if (!newVehicleType.trim() || !newHourlyRate.trim()) return;
    
    const newVehicle: VehicleTravelRate = {
      id: `vehicle_${Date.now()}`,
      vehicleType: newVehicleType.trim(),
      hourlyRate: newHourlyRate.trim(),
      numberOfHours: "2",
      enabled: true
    };
    
    setFormData(prev => ({
      ...prev,
      vehicleTravelRates: [...prev.vehicleTravelRates, newVehicle],
      vehicleTravelRatesStackOrder: [...prev.vehicleTravelRatesStackOrder, newVehicle.id]
    }));
    
    setNewVehicleType('');
    setNewHourlyRate('');
    setAddVehicleDialogOpen(false);
  };

  const editVehicleTravelRate = (vehicle: VehicleTravelRate) => {
    setEditingVehicle(vehicle);
    setNewVehicleType(vehicle.vehicleType);
    setNewHourlyRate(vehicle.hourlyRate);
    setEditVehicleDialogOpen(true);
  };

  const updateVehicleTravelRate = (updatedVehicle: VehicleTravelRate) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        vehicleTravelRates: prev.vehicleTravelRates.map(vehicle => 
          vehicle.id === updatedVehicle.id ? updatedVehicle : vehicle
        )
      };
      return updated;
    });
    debouncedSave(); // CRITICAL FIX: Added missing save call
    setEditingVehicle(null);
    setNewVehicleType('');
    setNewHourlyRate('');
    setEditVehicleDialogOpen(false);
  };

  const deleteVehicleTravelRate = (vehicleId: string) => {
    setFormData(prev => ({
      ...prev,
      vehicleTravelRates: prev.vehicleTravelRates.filter(vehicle => vehicle.id !== vehicleId),
      vehicleTravelRatesStackOrder: prev.vehicleTravelRatesStackOrder.filter(id => id !== vehicleId)
    }));
  };

  // Auto-calculate sequential ranges
  const calculateSequentialRanges = (rangeOptions: RangeOption[], updatedOptionId: string, newEndValue: string) => {
    const activeOptions = rangeOptions
      .filter(opt => opt.rangeStart !== '' || opt.rangeEnd !== '')
      .sort((a, b) => {
        // Sort by the order they were created
        const aIndex = rangeOptions.findIndex(opt => opt.id === a.id);
        const bIndex = rangeOptions.findIndex(opt => opt.id === b.id);
        return aIndex - bIndex;
      });

    return rangeOptions.map(option => {
      const optionIndex = activeOptions.findIndex(opt => opt.id === option.id);
      if (optionIndex === -1) return option;
      
      if (option.id === updatedOptionId) {
        // For the option being updated, calculate the start based on previous ranges
        const rangeStart = optionIndex === 0 ? '0' : (parseInt(activeOptions[optionIndex - 1].rangeEnd) + 1).toString();
        return { ...option, rangeStart, rangeEnd: newEndValue };
      } else if (optionIndex > activeOptions.findIndex(opt => opt.id === updatedOptionId)) {
        // For options after the updated one, recalculate their ranges
        const rangeStart = optionIndex === 0 ? '0' : (parseInt(activeOptions[optionIndex - 1].rangeEnd) + 1).toString();
        return { ...option, rangeStart };
      } else if (optionIndex === 0) {
        // First option always starts at 0
        return { ...option, rangeStart: '0' };
      }
      
      return option;
    });
  };

  // Validate range values
  const validateRangeValue = (value: string, optionId: string, field: 'rangeStart' | 'rangeEnd') => {
    const numValue = parseInt(value);
    if (isNaN(numValue) || numValue < 0) {
      return { isValid: false, message: "Please enter a valid positive number" };
    }
    
    if (field === 'rangeEnd') {
      // Check if this creates a valid sequence
      const enabledOptions = formData.rangeOptions.filter(opt => opt.enabled);
      const currentIndex = enabledOptions.findIndex(opt => opt.id === optionId);
      
      if (currentIndex > 0) {
        const prevOption = enabledOptions[currentIndex - 1];
        const expectedStart = parseInt(prevOption.rangeEnd) + 1;
        if (numValue <= parseInt(prevOption.rangeEnd)) {
          return { 
            isValid: false, 
            message: `Value must be greater than ${prevOption.rangeEnd} (previous range end)` 
          };
        }
      }
    }
    
    return { isValid: true, message: "" };
  };



  const editRangeOption = (option: RangeOption) => {
    setEditingRange(option);
    setNewRangeLabel(option.label);
    setEditRangeDialogOpen(true);
  };

  const saveRangeEdit = () => {
    if (!editingRange || !newRangeLabel.trim()) return;
    
    setFormData(prev => ({
      ...prev,
      rangeOptions: prev.rangeOptions.map(opt => 
        opt.id === editingRange.id 
          ? { ...opt, label: newRangeLabel.trim() }
          : opt
      )
    }));
    
    setEditingRange(null);
    setNewRangeLabel('');
    setEditRangeDialogOpen(false);
  };

  // Get ordered options for display
  const getOrderedPricingOptions = () => {
    if (formData.pricingStackOrder.length === 0) {
      return formData.pricingOptions;
    }
    
    const ordered = formData.pricingStackOrder
      .map(id => formData.pricingOptions.find(opt => opt.id === id))
      .filter(Boolean) as PricingOption[];
    
    // Add any new options not in stack order yet
    const missingOptions = formData.pricingOptions.filter(
      opt => !formData.pricingStackOrder.includes(opt.id)
    );
    
    return [...ordered, ...missingOptions];
  };

  const getOrderedQuantityOptions = () => {
    if (formData.quantityStackOrder.length === 0) {
      return formData.quantityOptions;
    }
    
    const ordered = formData.quantityStackOrder
      .map(id => formData.quantityOptions.find(opt => opt.id === id))
      .filter(Boolean) as PricingOption[];
    
    const missingOptions = formData.quantityOptions.filter(
      opt => !formData.quantityStackOrder.includes(opt.id)
    );
    
    return [...ordered, ...missingOptions];
  };

  const getOrderedMinQuantityOptions = () => {
    if (formData.minQuantityStackOrder.length === 0) {
      return formData.minQuantityOptions;
    }
    
    const ordered = formData.minQuantityStackOrder
      .map(id => formData.minQuantityOptions.find(opt => opt.id === id))
      .filter(Boolean) as PricingOption[];
    
    const missingOptions = formData.minQuantityOptions.filter(
      opt => !formData.minQuantityStackOrder.includes(opt.id)
    );
    
    return [...ordered, ...missingOptions];
  };

  const getOrderedRangeOptions = () => {
    if (formData.rangeStackOrder.length === 0) {
      return formData.rangeOptions;
    }
    
    const ordered = formData.rangeStackOrder
      .map(id => formData.rangeOptions.find(opt => opt.id === id))
      .filter(Boolean) as RangeOption[];
    
    const missingOptions = formData.rangeOptions.filter(
      opt => !formData.rangeStackOrder.includes(opt.id)
    );
    
    return [...ordered, ...missingOptions];
  };

  const updateMathOperator = (index: number, value: string) => {
    setFormData(prev => {
      const newOperators = [...prev.mathOperators];
      newOperators[index] = value;
      return { ...prev, mathOperators: newOperators };
    });
  };

  // Auto-generate description based on enabled options with values
  const generateAutoDescription = () => {
    
    const parts = [];
    
    // Add pricing options with values
    formData.pricingOptions.forEach(opt => {
      if (opt.value && opt.value.trim() !== '') {
        const value = `£${opt.value}`;
        parts.push(`${opt.label} = ${value}`);
      }
    });
    
    // Add math operator
    if (formData.mathOperators && formData.mathOperators.length > 0 && formData.mathOperators[0] !== 'N/A') {
      parts.push(`${formData.mathOperators[0]}`);
    }
    
    // Add quantity options with values
    formData.quantityOptions.forEach(opt => {
      if (opt.value && opt.value.trim() !== '') {
        parts.push(`${opt.label} = ${opt.value}`);
      }
    });
    
    // Add min quantity options with values
    formData.minQuantityOptions.forEach(opt => {
      if (opt.value && opt.value.trim() !== '') {
        parts.push(`${opt.label} = ${opt.value}`);
      }
    });
    
    // Add range options with values - CRITICAL DEBUG
    formData.rangeOptions.forEach((opt, index) => {
      
      if ((opt.rangeStart && opt.rangeStart.trim() !== '') || (opt.rangeEnd && opt.rangeEnd.trim() !== '')) {
        const rangeStart = opt.rangeStart || 'R1';
        const rangeEnd = opt.rangeEnd || 'R2';
        const rangePart = `${opt.label} = ${rangeStart} to ${rangeEnd}`;
        parts.push(rangePart);
      }
    });
    
    if (parts.length === 0) {
      return 'CCTV price configuration';
    }
    
    const finalDescription = parts.join('. ');
    return finalDescription;
  };

  // TEMPORARILY DISABLED: Auto-description generation was causing data truncation issues
  // Update description when options change
  // React.useEffect(() => {
  //   const autoDesc = generateAutoDescription();
  //   setFormData(prev => ({ ...prev, description: autoDesc }));
  // }, [formData.pricingOptions, formData.quantityOptions, formData.minQuantityOptions, formData.rangeOptions, formData.mathOperators]);
  
  // Sync patching colors when page loads
  React.useEffect(() => {
    if (categoryId === 'patching') {
      syncPatchingColors();
    }
  }, [categoryId]);

  // Delete configuration functionality
  const handleDeleteConfiguration = async () => {
    if (!editId) return;
    
    try {
      await apiRequest('DELETE', `/api/pr2-clean/${editId}`);
      
      // Invalidate cache to refresh the PR2 configurations list
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
      
      // Navigate back to the pricing page for this sector
      setLocation(`/pr2-pricing?sector=${sector}`);
    } catch (error) {
      console.error('❌ Error deleting configuration:', error);
    }
  };

  // Delete 100mm configuration functionality
  const handle100mmDeleteConfiguration = async () => {
    try {
      await apiRequest('DELETE', '/api/pr2-clean/109');
      
      // Invalidate cache to refresh the PR2 configurations list
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
      
      // Close the delete dialog
      setShow100mmDeleteDialog(false);
      
      // Optionally navigate back to pricing page
      setLocation(`/pr2-pricing?sector=${sector}`);
    } catch (error) {
      console.error('❌ Error deleting 100mm configuration:', error);
    }
  };

  // Handle creating sector copies
  const handleCreateSectorCopy = async (targetSector: string) => {
    if (!editId) return;
    
    try {
      const payload = {
        ...formData,
        sector: targetSector
      };
      
      const response = await apiRequest('POST', '/api/pr2-clean', payload);
      
      if (response.ok) {
      }
    } catch (error) {
      console.error(`❌ Failed to create copy for sector ${targetSector}:`, error);
    }
  };

  // Handle saving sectors
  const handleSaveSectors = async () => {
    // This function exists for UI consistency but sector copying is handled in real-time
  };



  // Extract existing pipe sizes from configuration names
  const getExistingPipeSizes = () => {
    if (!allCategoryConfigs) return [];
    
    const pipeSizes = new Set<string>();
    
    allCategoryConfigs.forEach((config: any) => {
      const categoryName = config.categoryName || '';
      // Extract pipe size from names like "100mm CCTV Jet Vac Configuration" or "TP1 - 150mm CCTV Configuration"
      const pipeMatch = categoryName.match(/(\d+)mm/);
      if (pipeMatch) {
        pipeSizes.add(pipeMatch[1] + 'mm');
      }
    });
    
    return Array.from(pipeSizes).sort((a, b) => {
      const numA = parseInt(a.replace('mm', ''));
      const numB = parseInt(b.replace('mm', ''));
      return numA - numB;
    });
  };

  // Generate next available ID for new configurations
  const getNextAvailableId = async () => {
    try {
      const response = await apiRequest('GET', '/api/pr2-clean');
      const allConfigs = await response.json();
      
      // Find highest ID and add 1
      const maxId = allConfigs.reduce((max: number, config: any) => {
        return Math.max(max, config.id || 0);
      }, 0);
      
      return maxId + 1;
    } catch (error) {
      console.error('Error getting next ID:', error);
      return Date.now(); // Fallback to timestamp
    }
  };



  // Check if pipe-size-specific configuration exists, create if needed
  const ensurePipeSizeConfiguration = async (pipeSize: string, categoryId: string, sector: string) => {
    if (!allCategoryConfigs) return null;
    
    const normalizedPipeSize = pipeSize.replace(/mm$/i, '');
    
    // Look for existing pipe-size-specific configuration
    const existingConfig = allCategoryConfigs.find(config => 
      config.categoryId === categoryId && 
      config.sector === sector &&
      config.categoryName?.includes(`${normalizedPipeSize}mm`)
    );
    
    if (existingConfig) {
      return existingConfig.id;
    }
    
    // No pipe-size-specific config exists, create one using existing function
    const newConfigId = await createPipeSizeConfiguration(categoryId, sector, pipeSize, `${normalizedPipeSize}mm ${categoryId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Configuration`);
    return newConfigId;
  };

  // Get all pipe size configurations for this category, sorted by pipe size
  // Helper function to get sector ID for database lookup based on authentic database structure
  const getSectorId = (sectorName: string): string => {
    const sectorMap: Record<string, string> = {
      'utilities': '1',  // Database shows id1 for utilities
      'adoption': '2',   // Database shows id2 for adoption
      'highways': '3',   // Database shows id3 for highways
      'insurance': '4',  // Database shows id4 for insurance
      'construction': '5', // Database shows id5 for construction
      'domestic': '6'    // Database shows id6 for domestic
    };
    return sectorMap[sectorName] || '1';
  };

  const getPipeSizeConfigurations = () => {
    if (!allCategoryConfigs) return [];
    
    const pipeSizeConfigs: Array<{
      pipeSize: string;
      config: any;
      id: number;
      pipeSizeNum: number;
    }> = [];
    
    // AUTHENTIC DATABASE LOOKUP: Find patching configurations by sector instead of hardcoded IDs
    if (categoryId === 'patching') {
      // Find all patching configurations for current sector dynamically
      const sectorPatchingConfigs = allCategoryConfigs.filter(config => 
        config.categoryId === 'patching' && 
        (config.sector === sector || config.sector === `id${getSectorId(sector)}`)
      );
      
      // Extract pipe sizes from category names or use default sizes
      const defaultPipeSizes = [
        { pipeSize: '150mm', pipeSizeNum: 150 },
        { pipeSize: '225mm', pipeSizeNum: 225 },
        { pipeSize: '300mm', pipeSizeNum: 300 }
      ];
      
      if (sectorPatchingConfigs.length > 0) {
        // Use found configurations
        sectorPatchingConfigs.forEach((config) => {
          // Try to extract pipe size from category name, fallback to 150mm
          const pipeMatch = config.categoryName?.match(/(\d+)mm/);
          const pipeSizeNum = pipeMatch ? parseInt(pipeMatch[1]) : 150;
          const pipeSize = `${pipeSizeNum}mm`;
          
          pipeSizeConfigs.push({
            pipeSize,
            config,
            id: config.id,
            pipeSizeNum
          });
        });
      } else {
        // No configurations found, use empty structure for each default pipe size
        defaultPipeSizes.forEach(({ pipeSize, pipeSizeNum }) => {
          pipeSizeConfigs.push({
            pipeSize,
            config: null, // Will trigger creation when needed
            id: 0, // Placeholder
            pipeSizeNum
          });
        });
      }
    } else if (categoryId === 'cctv-jet-vac') {
      // CCTV Jet Vac - exclude from pipe size configurations dropdown
      // ID 161 should not appear in any dropdown interface
      return [];
    } else {
      // Original logic for other categories
      allCategoryConfigs.forEach(config => {
        if (config.categoryId !== categoryId) return;
        
        const categoryName = config.categoryName || '';
        const pipeMatch = categoryName.match(/(\d+)mm/);
        
        if (pipeMatch) {
          const pipeSizeNum = parseInt(pipeMatch[1]);
          pipeSizeConfigs.push({
            pipeSize: pipeMatch[1] + 'mm',
            config: config,
            id: config.id,
            pipeSizeNum: pipeSizeNum
          });
        }
      });
    }
    
    // Sort by pipe size (smallest to largest)
    pipeSizeConfigs.sort((a, b) => a.pipeSizeNum - b.pipeSizeNum);
    
    return pipeSizeConfigs;
  };

  // Update functions for pipe-size-specific configurations
  const updatePipeSizeConfig = async (configId: number, fieldType: string, optionId: string, value: string) => {
    try {
      // Get current configuration
      const response = await apiRequest('GET', `/api/pr2-clean/${configId}`);
      const currentConfig = await response.json();
      
      // Update the specific field
      const updatedOptions = currentConfig[fieldType].map((opt: any) => 
        opt.id === optionId ? { ...opt, value } : opt
      );
      
      // Save updated configuration
      await apiRequest('PUT', `/api/pr2-clean/${configId}`, {
        ...currentConfig,
        [fieldType]: updatedOptions
      });
      
      // Refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
    } catch (error) {
      console.error('❌ Failed to update pipe size config:', error);
    }
  };

  const updatePipeSizeConfigRange = async (configId: number, rangeId: string, field: string, value: string) => {
    try {
      // Get current configuration
      const response = await apiRequest('GET', `/api/pr2-clean/${configId}`);
      const currentConfig = await response.json();
      
      // Update the range field
      const updatedRangeOptions = currentConfig.rangeOptions.map((range: any) => 
        range.id === rangeId ? { ...range, [field]: value } : range
      );
      
      // Save updated configuration
      await apiRequest('PUT', `/api/pr2-clean/${configId}`, {
        ...currentConfig,
        rangeOptions: updatedRangeOptions
      });
      
      // Refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
    } catch (error) {
      console.error('❌ Failed to update pipe size config range:', error);
    }
  };

  // Delete handler for any pipe size configuration
  const handleDeletePipeSizeConfiguration = async (configId: number, pipeSize: string) => {
    try {
      await apiRequest('DELETE', `/api/pr2-clean/${configId}`);
      
      // Invalidate cache to refresh the PR2 configurations list
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
      
      // Close any open delete dialogs
      setShow100mmDeleteDialog(false);
      
      // Navigate back to pricing page after successful deletion
      setLocation(`/pr2-pricing?sector=${sector || 'utilities'}`);
      
    } catch (error) {
      console.error(`❌ Error deleting ${pipeSize} configuration:`, error);
    }
  };

  // FIXED DASH BUTTON SAVE: Save configuration changes before navigation
  const handleAutoSaveAndNavigate = (destination: string) => {
    return async () => {
      
      // CRITICAL FIX: Actually save the changes when dash button clicked
      if (isEditing && editId) {
        try {
          
          const payload = {
            categoryName: formData.categoryName,
            description: formData.description,
            categoryColor: formData.categoryColor,
            sector: sector, // Save to current sector only
            categoryId: categoryId,
            pricingOptions: formData.pricingOptions,
            quantityOptions: formData.quantityOptions,
            minQuantityOptions: formData.minQuantityOptions,
            rangeOptions: formData.rangeOptions,
            mathOperators: formData.mathOperators,
            pricingStackOrder: formData.pricingStackOrder,
            quantityStackOrder: formData.quantityStackOrder,
            minQuantityStackOrder: formData.minQuantityStackOrder,
            rangeStackOrder: formData.rangeStackOrder,
            vehicleTravelRates: formData.vehicleTravelRates,
            vehicleTravelRatesStackOrder: formData.vehicleTravelRatesStackOrder
          };

          // Update existing configuration with delete changes
          const response = await fetch(`/api/pr2-clean/${editId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          
        } catch (error) {
          console.error('❌ Dash button save failed:', error);
          // Don't throw the error - allow navigation to continue
        }
      }
      
      // Navigate to destination
      window.location.href = destination;
    };
  };

  // Handle delete configuration
  const handleDelete = async () => {
    if (!editId) return;
    
    try {
      setIsSaving(true);
      await apiRequest('DELETE', `/api/pr2-clean/${editId}`);
      
      // Invalidate ALL cache entries to ensure dashboard validation updates immediately
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
      queryClient.invalidateQueries({ queryKey: ['pr2-configs'] }); // Dashboard sector configs
      queryClient.invalidateQueries({ queryKey: ['all-pr2-configs-for-tp2'] }); // TP2 validation configs
      queryClient.invalidateQueries({ queryKey: ['/api/pr2-configurations'] }); // Configuration updates
      
      // Navigate back to pricing page
      setLocation(`/pr2-pricing?sector=${sector}`);
    } catch (error) {
      console.error('❌ Delete failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle range change function
  const handleRangeChange = (optionId: string, field: 'rangeStart' | 'rangeEnd', value: string) => {
    setFormData(prev => ({
      ...prev,
      rangeOptions: prev.rangeOptions.map(opt => 
        opt.id === optionId 
          ? { ...opt, [field]: value }
          : opt
      )
    }));
    
    // Auto-save the changes
    debouncedSave();
  };

  // Get dynamic page ID based on category
  const dynamicPageId = categoryId ? CATEGORY_PAGE_IDS[categoryId as keyof typeof CATEGORY_PAGE_IDS] || `p-${categoryId}` : 'p-config';

  // Show loading state during auto-creation to eliminate "Create" page appearance
  // CRITICAL: Never show loading if editId is present in URL, even if isEditing is momentarily false during redirect
  const hasEditIdInUrl = !!(urlParams.get('edit') || urlParams.get('editId') || urlParams.get('id'));
  const isAutoCreating = !hasEditIdInUrl && !isEditing && pipeSize && categoryId && allCategoryConfigs;
  
  // Show loading screen during auto-creation process
  if (isAutoCreating) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 relative flex items-center justify-center">
        <DevLabel id={existingConfig?.id ? `${existingConfig.id}-Loading` : 'Loading'} position="top-right" />
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900">Loading Configuration...</h2>
          <p className="text-gray-600 mt-2">Setting up {pipeSize}mm {categoryId.replace('-', ' ')} configuration</p>
        </div>
      </div>
    );
  }

  // Show loading during config fetch in edit mode
  if (isEditing && isLoadingConfig && !existingConfig) {
    console.log('🔄 SHOWING CONFIG LOADING SCREEN:', { isEditing, isLoadingConfig, hasExistingConfig: !!existingConfig });
    return (
      <div className="min-h-screen bg-gray-50 p-6 relative flex items-center justify-center">
        <DevLabel id={`Loading-${editId}`} position="top-right" />
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900">Loading Configuration {editId}...</h2>
          <p className="text-gray-600 mt-2">Fetching configuration data</p>
        </div>
      </div>
    );
  }

  // Debug render state
  console.log('🔍 RENDER STATE DEBUG:', { 
    isEditing, 
    isLoadingConfig, 
    hasExistingConfig: !!existingConfig, 
    isAutoCreating,
    hasEditIdInUrl,
    shouldShowMainForm: !isAutoCreating && (!isEditing || !isLoadingConfig || !!existingConfig)
  });

  return (
    <div 
      className="min-h-screen bg-gray-50 p-6 relative"
      data-page="pr2-config-clean"
      data-config-id={editId}
      data-category-id={categoryId}
      data-sector={sector}
      data-is-editing={isEditing}
    >
      <DevLabel id={(() => {
        // Use actual database ID when available, otherwise show descriptive label
        if (existingConfig?.id) {
          return existingConfig.id.toString();
        }
        
        // Show descriptive labels for non-configured states
        if (categoryId && sector) {
          const sectorLabels = {
            'utilities': 'A', 'adoption': 'B', 'highways': 'C', 
            'insurance': 'D', 'construction': 'E', 'domestic': 'F'
          };
          const sectorLabel = sectorLabels[sector as keyof typeof sectorLabels] || 'Config';
          return `${sectorLabel}-${categoryId}`;
        }
        
        return 'Config';
      })()} position="top-right" />
      <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              {/* Database ID Large Identifier for Test Card */}
              {categoryId === 'test-card' && getTemplateType(categoryId || '') === 'MMP1' && (
                <div className="mb-4">
                  <h1 className="text-6xl font-bold text-green-600 mb-2" style={{ fontSize: '4rem', lineHeight: '1' }}>
                    {editId ? `ID${editId}` : 'ID-Config'}
                  </h1>
                  <p className="text-xl text-gray-700 font-semibold">
                    MMP1 Template with 5 Placeholder UI Cards
                  </p>
                </div>
              )}
              
              <h1 
                className="text-2xl font-bold text-gray-900"
                data-component="page-title"
              >
                {(() => {
                  // A1-F16 Page Identification System 
                  const getPageId = (sector: string, categoryId: string): string => {
                    const sectorPageMap: Record<string, Record<string, string>> = {
                      'utilities': {
                        'cctv': 'A1',                  // A1 - CCTV only
                        'van-pack': 'A2',              // A2 - Van Pack only
                        'jet-vac': 'A3',               // A3 - Jet Vac only
                        'cctv-van-pack': 'A4',         // A4 - CCTV/Van Pack
                        'cctv-jet-vac': 'A5',          // A5 - CCTV/Jet Vac
                        'cctv-cleansing-root-cutting': 'A6', // A6 - CCTV/Cleansing/Root Cutting
                        'directional-water-cutter': 'A7', // A7 - Directional Water Cutter
                        'patching': 'A8',              // A8 - Patching
                        'f-robot-cutting': 'A9',       // A9 - Robotic Cutting
                        'ambient-lining': 'A10',       // A10 - Ambient Lining
                        'hot-cure-lining': 'A11',      // A11 - Hot Cure Lining
                        'uv-lining': 'A12',            // A12 - UV Lining
                        'excavation': 'A13',           // A13 - Excavation
                        'tankering': 'A14',            // A14 - Tankering
                      },
                      'adoption': {
                        'cctv': 'B1',                  // B1 - CCTV only
                        'van-pack': 'B2',              // B2 - Van Pack only
                        'jet-vac': 'B3',               // B3 - Jet Vac only
                        'cctv-van-pack': 'B4',         // B4 - CCTV/Van Pack
                        'cctv-jet-vac': 'B5',          // B5 - CCTV/Jet Vac
                        'cctv-cleansing-root-cutting': 'B6', // B6 - CCTV/Cleansing/Root Cutting
                        'directional-water-cutter': 'B7', // B7 - Directional Water Cutter
                        'patching': 'B8',              // B8 - Patching
                        'f-robot-cutting': 'B9',       // B9 - Robotic Cutting
                        'ambient-lining': 'B10',       // B10 - Ambient Lining
                        'hot-cure-lining': 'B11',      // B11 - Hot Cure Lining
                        'uv-lining': 'B12',            // B12 - UV Lining
                        'excavation': 'B13',           // B13 - Excavation
                        'tankering': 'B14',            // B14 - Tankering
                      },
                      'highways': {
                        'cctv': 'C1',                  // C1 - CCTV only
                        'van-pack': 'C2',              // C2 - Van Pack only
                        'jet-vac': 'C3',               // C3 - Jet Vac only
                        'cctv-van-pack': 'C4',         // C4 - CCTV/Van Pack
                        'cctv-jet-vac': 'C5',          // C5 - CCTV/Jet Vac
                        'cctv-cleansing-root-cutting': 'C6', // C6 - CCTV/Cleansing/Root Cutting
                        'directional-water-cutter': 'C7', // C7 - Directional Water Cutter
                        'patching': 'C8',              // C8 - Patching
                        'f-robot-cutting': 'C9',       // C9 - Robotic Cutting
                        'ambient-lining': 'C10',       // C10 - Ambient Lining
                        'hot-cure-lining': 'C11',      // C11 - Hot Cure Lining
                        'uv-lining': 'C12',            // C12 - UV Lining
                        'excavation': 'C13',           // C13 - Excavation
                        'tankering': 'C14',            // C14 - Tankering
                      },
                      'insurance': {
                        'cctv': 'D1',                  // D1 - CCTV only
                        'van-pack': 'D2',              // D2 - Van Pack only
                        'jet-vac': 'D3',               // D3 - Jet Vac only
                        'cctv-van-pack': 'D4',         // D4 - CCTV/Van Pack
                        'cctv-jet-vac': 'D5',          // D5 - CCTV/Jet Vac
                        'cctv-cleansing-root-cutting': 'D6', // D6 - CCTV/Cleansing/Root Cutting
                        'directional-water-cutter': 'D7', // D7 - Directional Water Cutter
                        'patching': 'D8',              // D8 - Patching
                        'f-robot-cutting': 'D9',       // D9 - Robotic Cutting
                        'ambient-lining': 'D10',       // D10 - Ambient Lining
                        'hot-cure-lining': 'D11',      // D11 - Hot Cure Lining
                        'uv-lining': 'D12',            // D12 - UV Lining
                        'excavation': 'D13',           // D13 - Excavation
                        'tankering': 'D14',            // D14 - Tankering
                      },
                      'construction': {
                        'cctv': 'E1',                  // E1 - CCTV only
                        'van-pack': 'E2',              // E2 - Van Pack only
                        'jet-vac': 'E3',               // E3 - Jet Vac only
                        'cctv-van-pack': 'E4',         // E4 - CCTV/Van Pack
                        'cctv-jet-vac': 'E5',          // E5 - CCTV/Jet Vac
                        'cctv-cleansing-root-cutting': 'E6', // E6 - CCTV/Cleansing/Root Cutting
                        'directional-water-cutter': 'E7', // E7 - Directional Water Cutter
                        'patching': 'E8',              // E8 - Patching
                        'f-robot-cutting': 'E9',       // E9 - Robotic Cutting
                        'ambient-lining': 'E10',       // E10 - Ambient Lining
                        'hot-cure-lining': 'E11',      // E11 - Hot Cure Lining
                        'uv-lining': 'E12',            // E12 - UV Lining
                        'excavation': 'E13',           // E13 - Excavation
                        'tankering': 'E14',            // E14 - Tankering
                      },
                      'domestic': {
                        'cctv': 'F1',                  // F1 - CCTV only
                        'van-pack': 'F2',              // F2 - Van Pack only
                        'jet-vac': 'F3',               // F3 - Jet Vac only
                        'cctv-van-pack': 'F4',         // F4 - CCTV/Van Pack
                        'cctv-jet-vac': 'F5',          // F5 - CCTV/Jet Vac
                        'cctv-cleansing-root-cutting': 'F6', // F6 - CCTV/Cleansing/Root Cutting
                        'directional-water-cutter': 'F7', // F7 - Directional Water Cutter
                        'patching': 'F8',              // F8 - Patching
                        'f-robot-cutting': 'F9',       // F9 - Robotic Cutting
                        'ambient-lining': 'F10',       // F10 - Ambient Lining
                        'hot-cure-lining': 'F11',      // F11 - Hot Cure Lining
                        'uv-lining': 'F12',            // F12 - UV Lining
                        'excavation': 'F13',           // F13 - Excavation
                        'tankering': 'F14',            // F14 - Tankering
                      }
                    };
                    
                    return sectorPageMap[sector]?.[categoryId] || 'A1';
                  };

                  // Get database ID display
                  const getDatabaseIdDisplay = (categoryId: string): string => {
                    // For A4/A5, show actual database IDs (ID759/ID760)
                    if (categoryId === 'cctv-van-pack') return 'ID759';
                    if (categoryId === 'cctv-jet-vac') return 'ID760';
                    
                    // For patching, show known database IDs
                    if (categoryId === 'patching') {
                      if (sector === 'utilities') return 'ID763';
                      if (sector === 'adoption') return 'ID2216'; 
                      if (sector === 'highways') return 'ID2232';
                    }
                    
                    // For all others, use dynamic database ID lookup
                    return editId ? `ID${editId}` : `ID${editId || 'Loading'}`;
                  };

                  // Use clean category names from card definitions, not database categoryName
                  const getCategoryDisplayName = () => {
                    if (categoryId === 'cctv') return 'CCTV';
                    if (categoryId === 'van-pack') return 'Van Pack';
                    if (categoryId === 'jet-vac') return 'Jet Vac';
                    if (categoryId === 'cctv-van-pack') return 'CCTV/Van Pack';
                    if (categoryId === 'cctv-jet-vac') return 'CCTV/Jet Vac';
                    if (categoryId === 'cctv-cleansing-root-cutting') return 'CCTV/Cleansing/Root Cutting';
                    if (categoryId === 'directional-water-cutter') return 'Directional Water Cutter';
                    if (categoryId === 'patching') return 'Patching';
                    if (categoryId === 'ambient-lining') return 'Ambient Lining';
                    if (categoryId === 'hot-cure-lining') return 'Hot Cure Lining';
                    if (categoryId === 'uv-lining') return 'UV Lining';
                    if (categoryId === 'f-robot-cutting') return 'Robotic Cutting';
                    if (categoryId === 'excavation') return 'Excavation';
                    if (categoryId === 'tankering') return 'Tankering';
                    if (categoryId === 'test-card') return 'Test Card';
                    return formData.categoryName || 'Configuration';
                  };
                  
                  const pageId = getPageId(sector, categoryId || '');
                  const dbIdDisplay = getDatabaseIdDisplay(categoryId || '');
                  const displayName = getCategoryDisplayName();
                  
                  // DATABASE-FIRST: Map authentic sector names to display names
                  const getSectorDisplayName = (sector: string): string => {
                    if (sector === 'utilities') return 'Utilities';
                    if (sector === 'adoption') return 'Adoption'; 
                    if (sector === 'highways') return 'Highways';
                    if (sector === 'insurance') return 'Insurance';
                    if (sector === 'construction') return 'Construction';
                    if (sector === 'domestic') return 'Domestic';
                    return sector.charAt(0).toUpperCase() + sector.slice(1);
                  };
                  
                  const sectorDisplayName = getSectorDisplayName(sector);
                  // Create comprehensive page title with A1-F16 identification  
                  return `${pageId}-${sectorDisplayName} | ${dbIdDisplay} - ${displayName} Price Configuration`;
                })()}
              </h1>
              
              {/* Template Information Display */}
              <div className="mt-2 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">Template:</span>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded">
                    {(() => {
                      const templateType = getTemplateType(categoryId || '');
                      if (templateType === 'MMP1') {
                        // CCTV uses MMP1-BG (no purple fields)
                        if (categoryId === 'cctv') {
                          return `MMP1-BG Template`;
                        }
                        // All other MMP1 categories use MMP1-BGP (with purple fields)
                        return `MMP1-BGP Template`;
                      } else if (templateType === 'MMP2') {
                        return `MMP2 Template`;
                      } else {
                        return `MMP1 Template`;
                      }
                    })()}
                  </span>
                </div>
              </div>
            </div>
          
          {/* Right side - Navigation buttons */}
          <div className="flex items-center gap-3">

            <Button 
              onClick={handleGoBack}
              className="bg-white hover:bg-gray-50 text-black font-bold py-2 px-4 rounded-lg border border-gray-300 transition-colors"
            >
              <BarChart3 className="w-4 h-4 mr-2 text-green-600" />
              Dashboard
            </Button>
            
            <Button 
              onClick={() => window.location.href = `/pr2-pricing?sector=${sector}`}
              className="bg-white hover:bg-gray-50 text-black font-bold py-2 px-4 rounded-lg border border-gray-300 transition-colors"
            >
              <Settings className="w-4 h-4 mr-2 text-orange-600" />
              Pricing
            </Button>
          </div>
        </div>

          {/* Validation Warning */}
          {(() => {
            const hasInvalidValues = Object.keys(validationErrors).length > 0;
            return hasInvalidValues ? (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <h3 className="text-red-800 font-semibold mb-2">⚠️ Configuration Validation</h3>
                <p className="text-red-700 text-sm">
                  Some values don't end with .99 as required. Please review and update the following fields.
                </p>
              </div>
            ) : null;
          })()}

          {/* Success message for saved configurations (excluding MMP1 templates) */}
          {processedConfigId && getTemplateType(categoryId || '') !== 'MMP1' && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="text-green-800 font-semibold mb-2">✅ Configuration Saved</h3>
              <p className="text-green-700 text-sm">
                Your pricing configuration has been successfully saved.
              </p>
            </div>
          )}

        {/* MMP1 Template - Protected Component (Disabled - Using Inline for CCTV Fix) */}
        {false && getTemplateType(categoryId || '') === 'MMP1' && (
          <MMP1Template 
            categoryId={categoryId || ''} 
            sector={sector} 
            editId={editId ? parseInt(editId) : undefined}
            onSave={() => {
              // MMP1 Template - Comprehensive cache invalidation to ensure dashboard validation updates immediately
              queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
              queryClient.invalidateQueries({ queryKey: ['pr2-configs'] }); // Dashboard sector configs
              queryClient.invalidateQueries({ queryKey: ['all-pr2-configs-for-tp2'] }); // TP2 validation configs
              queryClient.invalidateQueries({ queryKey: ['/api/pr2-configurations'] }); // Configuration updates
            }}
          />
        )}

        {/* MMP2 Template - Exact Copy of MMP1 for Structural Defects */}
        {getTemplateType(categoryId || '') === 'MMP2' && (
          <MMP2Template 
            categoryId={categoryId || ''} 
            sector={sector} 
            editId={editId ? parseInt(editId) : undefined}
            onSave={() => {
              // MMP2 Template - Comprehensive cache invalidation to ensure dashboard validation updates immediately
              queryClient.invalidateQueries({ queryKey: ['/api/pr2-clean'] });
              queryClient.invalidateQueries({ queryKey: ['pr2-configs'] }); // Dashboard sector configs
              queryClient.invalidateQueries({ queryKey: ['all-pr2-configs-for-tp2'] }); // TP2 validation configs
              queryClient.invalidateQueries({ queryKey: ['/api/pr2-configurations'] }); // Configuration updates
            }}
          />
        )}

        {/* MMP1 Template - Original Implementation (Re-enabled with CCTV Purple Window Fix) */}
        {getTemplateType(categoryId || '') === 'MMP1' && (
          <div className="space-y-6">
            {/* MM1 - ID1-ID6 Selection (P002 Pattern) */}
            <div className="relative">
              <DevLabel id="MM1" position="top-right" />
              <Card className="bg-white border-2 border-gray-200">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    1. Select Configuration IDs (P002 Pattern)
                  </CardTitle>
                  <p className="text-sm text-gray-600">
                    Select ID7-ID12 templates that will save prices to sectors when selected
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-3">
                    {MMP1_IDS.map((idOption) => {
                      const isSelected = selectedIds.includes(idOption.id);
                      const hasConfiguration = idsWithConfig.includes(idOption.id);
                      
                      return (
                        <Card 
                          key={idOption.id}
                          className={`cursor-pointer transition-all duration-200 hover:shadow-md border-2 ${
                            isSelected 
                              ? `border-gray-800 ${idOption.bgColor} ring-2 ring-gray-300` 
                              : 'border-gray-300 hover:border-gray-400'
                          }`}
                          onClick={() => {
                            const willToggle = !selectedIds.includes(idOption.id);
                            console.log('🎯 MM1 ID CARD CLICKED:', { id: idOption.id, willSelect: willToggle });
                            handleMMP1IdChange(idOption.id, willToggle);
                          }}
                        >
                          <CardContent className="p-4 text-center relative">
                            <div className={`mx-auto w-8 h-8 mb-3 flex items-center justify-center rounded-lg ${
                              isSelected ? 'bg-white' : 'bg-gray-100'
                            }`}>
                              <idOption.icon className={`w-5 h-5 ${
                                isSelected ? idOption.color : 'text-gray-600'
                              }`} />
                            </div>
                            <h3 className={`font-semibold text-sm mb-1 ${
                              isSelected ? 'text-gray-900' : 'text-gray-900'
                            }`}>
                              {idOption.name}
                            </h3>
                            
                            {/* Dev ID */}
                            <p className="text-xs text-gray-500 mb-2">{idOption.devId}</p>
                            
                            <p className="text-xs text-gray-600">
                              {idOption.description}
                            </p>
                            {isSelected && (
                              <div className="absolute top-2 right-2">
                                <Settings className="w-4 h-4 text-gray-600" />
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                  

                </CardContent>
              </Card>
            </div>

            {/* Color Picker Section - Enhanced with 20 colors and custom picker */}
            <div className="relative">
              <DevLabel id="MM2" position="top-right" />
              <Card className="bg-white border-2 border-gray-200">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    2. Color Picker Section
                  </CardTitle>
                  <p className="text-sm text-gray-600">
                    Choose from 20 Outlook diary-style colors or use custom color picker
                  </p>
                </CardHeader>
                <CardContent>
                  {/* 20 Outlook Diary Style Colors */}
                  <div className="grid grid-cols-10 gap-2 mb-4">
                    {[
                      { name: 'Light Blue', value: '#8DC3E8' },
                      { name: 'Light Green', value: '#A4D4B4' },
                      { name: 'Light Yellow', value: '#F5E6A3' },
                      { name: 'Light Orange', value: '#F5C99B' },
                      { name: 'Light Red', value: '#F5A3A3' },
                      { name: 'Light Purple', value: '#D4A4D4' },
                      { name: 'Light Pink', value: '#F5C2E7' },
                      { name: 'Light Teal', value: '#A3D5D5' },
                      { name: 'Light Gray', value: '#D4D4D4' },
                      { name: 'Light Brown', value: '#D4B899' },
                      { name: 'Medium Blue', value: '#5B9BD5' },
                      { name: 'Medium Green', value: '#70AD47' },
                      { name: 'Medium Yellow', value: '#FFC000' },
                      { name: 'Medium Orange', value: '#ED7D31' },
                      { name: 'Medium Red', value: '#C55A5A' },
                      { name: 'Medium Purple', value: '#9F4F96' },
                      { name: 'Medium Pink', value: '#E083C2' },
                      { name: 'Medium Teal', value: '#4BACC6' },
                      { name: 'Medium Gray', value: '#A5A5A5' },
                      { name: 'Medium Brown', value: '#B7956D' }
                    ].map((color) => (
                      <button
                        key={color.name}
                        className={`w-8 h-8 rounded-lg border-2 cursor-pointer hover:scale-110 transition-transform ${
                          formData.categoryColor === color.value ? 'border-gray-800 ring-2 ring-gray-300' : 'border-gray-300'
                        }`}
                        style={{ backgroundColor: color.value }}
                        onClick={() => handleMM1ColorChange(color.value)}
                        title={color.name}
                      >
                        {formData.categoryColor === color.value && (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-white text-sm font-bold">✓</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Custom Color Picker and Selected Color Display */}
                  <div className="border-t pt-4">
                    <div className="flex items-center gap-4 mb-2">
                      {/* Custom Color Picker Button */}
                      <div className="relative flex-1">
                        <button
                          type="button"
                          onClick={() => setShowCustomColorPicker(!showCustomColorPicker)}
                          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        >
                          <div 
                            className="w-4 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: formData.categoryColor }}
                          ></div>
                          Custom Color Picker
                          <ChevronDown className={`w-4 h-4 transition-transform ${showCustomColorPicker ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Dropdown Window */}
                        {showCustomColorPicker && (
                          <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-white border border-gray-300 rounded-lg shadow-lg z-10">
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-900 mb-1">
                                  Visual Color Picker
                                </label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="color"
                                    value={formData.categoryColor}
                                    onChange={(e) => handleMM1ColorChange(e.target.value)}
                                    className="w-12 h-8 rounded border border-gray-300 cursor-pointer bg-transparent"
                                    title="Choose custom color"
                                  />
                                  <div className="flex-1">
                                    <div 
                                      className="w-full h-8 rounded border border-gray-300"
                                      style={{ backgroundColor: formData.categoryColor }}
                                    ></div>
                                  </div>
                                </div>
                              </div>
                              
                              <div>
                                <label className="block text-xs font-medium text-gray-900 mb-1">
                                  Hex Color Code
                                </label>
                                <input
                                  type="text"
                                  value={formData.categoryColor}
                                  onChange={(e) => handleColorChange(e.target.value)}
                                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                                  placeholder="#000000"
                                  pattern="^#[0-9A-Fa-f]{6}$"
                                  title="Enter hex color code (e.g., #FF5733)"
                                />
                              </div>

                              <div className="flex justify-end pt-2 border-t">
                                <button
                                  type="button"
                                  onClick={() => setShowCustomColorPicker(false)}
                                  className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                                >
                                  Done
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Compact Selected Color Display */}
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                        <div 
                          className="w-5 h-5 rounded border border-gray-300 shadow-sm"
                          style={{ backgroundColor: formData.categoryColor }}
                        ></div>
                        <div>
                          <p className="text-xs font-medium text-gray-900">Selected</p>
                          <p className="text-xs text-gray-600 font-mono">{formData.categoryColor}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* MM3 - UK Drainage Pipe Sizes (MSCC5) */}
            <div className="relative">
              <DevLabel id="MM3" position="top-right" />
              <Card className="bg-white border-2 border-gray-200">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold text-gray-900">
                        3. UK Drainage Pipe Sizes (MSCC5)
                      </CardTitle>
                      <p className="text-sm text-gray-600">
                        Standard UK drainage pipe sizes with custom size management
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={newPipeSize}
                        onChange={(e) => setNewPipeSize(e.target.value)}
                        placeholder="Add size (mm)"
                        className="px-2 py-1 text-sm border border-gray-300 rounded w-28 font-mono"
                        min="50"
                        max="3000"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newPipeSize && !customPipeSizes.includes(newPipeSize)) {
                            setCustomPipeSizes(prev => [...prev, newPipeSize].sort((a, b) => parseInt(a) - parseInt(b)));
                            setNewPipeSize('');
                            triggerAutoSave();
                          }
                        }}
                        className="px-2 py-1 text-sm bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                        disabled={!newPipeSize || customPipeSizes.includes(newPipeSize)}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Orange UI Card containing all pipe size buttons */}
                  <Card className="bg-orange-50 border-2 border-orange-200">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-6 gap-2">
                        {/* Combine and sort all pipe sizes */}
                        {[
                          ...['100', '150', '225', '300', '375', '450', '525', '600', '675', '750', '900', '1050', '1200', '1350', '1500', '1800', '2100', '2400'],
                          ...customPipeSizes
                        ]
                          .sort((a, b) => parseInt(a) - parseInt(b))
                          .map((size) => {
                            const isCustom = customPipeSizes.includes(size);
                            const isSelected = selectedPipeSizeForMM4 === size;
                            
                            return (
                              <Card
                                key={size}
                                className={`relative group cursor-pointer transition-all border-2 ${
                                  isSelected 
                                    ? 'border-green-400 bg-green-100 shadow-md' 
                                    : 'border-gray-300 bg-white hover:border-orange-300 hover:bg-orange-50'
                                }`}
                                onClick={() => handlePipeSizeSelectWithAutoSave(size)}
                              >
                                <CardContent className="p-3 text-center">
                                  <div className="text-sm font-mono font-semibold text-gray-900">
                                    {size}mm
                                  </div>
                                  {isSelected && (
                                    <div className="absolute top-1 right-1">
                                      <Settings className="w-3 h-3 text-green-600" />
                                    </div>
                                  )}
                                </CardContent>
                                {isCustom && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCustomPipeSizes(prev => prev.filter(s => s !== size));
                                      // If removing the currently selected size, default back to 100mm
                                      if (selectedPipeSizeForMM4 === size) {
                                        setSelectedPipeSizeForMM4('100');
                                        setSelectedPipeSizeId(getPipeSizeId('100'));
                                      }
                                      triggerAutoSave();
                                    }}
                                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-700 z-10"
                                    title={`Remove ${size}mm custom size`}
                                  >
                                    <Trash2 className="w-2 h-2" />
                                  </button>
                                )}
                              </Card>
                            );
                          })}
                      </div>
                    </CardContent>
                  </Card>


                </CardContent>
              </Card>
            </div>

            {/* MM4 and MM5 - Same Row Layout */}
            <div className="grid grid-cols-3 gap-6">
              {/* MM4 - Section Calculator (Left - spans 2 columns) */}
              <div className="col-span-2 relative">
                {selectedPipeSizeForMM4 ? (
                  // Show selected pipe size in DevLabel
                  <DevLabel id={`MM4-${selectedPipeSizeForMM4}`} position="top-right" />
                ) : (
                  <DevLabel id="MM4" position="top-right" />
                )}
                <Card className="bg-white border-2 border-gray-200">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      {selectedPipeSizeForMM4 ? (
                        // Show selected pipe size and ID in title
                        `4. Section Calculator - ${selectedPipeSizeForMM4}mm (ID: ${selectedPipeSizeId})`
                      ) : (
                        "4. Section Calculator"
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedPipeSizeForMM4 ? (
                      // Show MM4 interface when pipe size is selected - Conditional Layout
                      categoryId === 'patching' ? (
                        /* F615 Patching UI - Day Rate + Green Patching Layers + Purple Required Per Shift */

                        <div className="grid grid-cols-3 gap-4">
                          {/* Day Rate Box (Left Column) */}
                          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                            <h4 className="font-medium text-blue-800 mb-3">
                              Day Rate
                              <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded font-mono">
                                {selectedPipeSizeForMM4}mm
                              </span>
                            </h4>
                            <div>
                              <label className="text-sm font-medium text-blue-700">Daily Rate (£)</label>
                              <Input
                                type="text"
                                placeholder="0"
                                className="border-blue-300 mt-1"
                                value={getDatabaseValue(getCurrentMM4Data()[0]?.id || 1, 'blueValue')}
                                onChange={(e) => updateMM4RowWithAutoSave(getCurrentMM4Data()[0]?.id || 1, 'blueValue', e.target.value)}
                              />
                            </div>
                          </div>

                          {/* Green Patching Layers (Middle Column) */}
                          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                            <h4 className="font-medium text-green-800 mb-3">
                              Patching Layer Configuration
                              <span className="ml-2 text-xs bg-green-200 text-green-800 px-2 py-1 rounded font-mono">
                                {selectedPipeSizeForMM4}mm
                              </span>
                            </h4>
                            <div className="space-y-3">
                              <div>
                                <label className="text-sm font-medium text-green-700">1. Single Layer</label>
                                <Input
                                  type="text"
                                  placeholder="0"
                                  className="border-green-300 mt-1"
                                  value={getDatabaseValue(getCurrentMM4Data()[0]?.id || 1, 'purpleDebris')}
                                  onChange={(e) => updateMM4RowWithAutoSave(getCurrentMM4Data()[0]?.id || 1, 'purpleDebris', e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium text-green-700">2. Double Layer</label>
                                <Input
                                  type="text"
                                  placeholder="0"
                                  className="border-green-300 mt-1"
                                  value={getDatabaseValue(getCurrentMM4Data()[0]?.id || 1, 'greenValue')}
                                  onChange={(e) => updateMM4RowWithAutoSave(getCurrentMM4Data()[0]?.id || 1, 'greenValue', e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium text-green-700">3. Triple Layer</label>
                                <Input
                                  type="text"
                                  placeholder="0"
                                  className="border-green-300 mt-1"
                                  value={getDatabaseValue(getCurrentMM4Data()[0]?.id || 1, 'purpleLength')}
                                  onChange={(e) => updateMM4RowWithAutoSave(getCurrentMM4Data()[0]?.id || 1, 'purpleLength', e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium text-green-700">4. Triple Layer + Extra Cure Time</label>
                                <Input
                                  type="text"
                                  placeholder="0"
                                  className="border-green-300 mt-1"
                                  value={mm4Rows[1]?.blueValue || ''}
                                  onChange={(e) => updateMM4RowWithAutoSave(mm4Rows[1]?.id || 2, 'blueValue', e.target.value)}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Purple Required Per Shift (Right Column) */}
                          <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-4">
                            <h4 className="font-medium text-purple-800 mb-3">
                              No Required Per Shift
                              <span className="ml-2 text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded font-mono">
                                {selectedPipeSizeForMM4}mm
                              </span>
                            </h4>
                            <div className="space-y-3">
                              <div>
                                <label className="text-sm font-medium text-purple-700">Row 1 - Quantity Required</label>
                                <Input
                                  type="text"
                                  placeholder="0"
                                  className="border-purple-300 mt-1"
                                  value={(selectedPipeSizeForMM4 === '150' || selectedPipeSizeForMM4 === '300') ? (patchingGreenData[0]?.quantity || '') : ''}
                                  onChange={(e) => updatePatchingGreenRow(1, e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium text-purple-700">Row 2 - Quantity Required</label>
                                <Input
                                  type="text"
                                  placeholder="0"
                                  className="border-purple-300 mt-1"
                                  value={(selectedPipeSizeForMM4 === '150' || selectedPipeSizeForMM4 === '300') ? (patchingGreenData[1]?.quantity || '') : ''}
                                  onChange={(e) => updatePatchingGreenRow(2, e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium text-purple-700">Row 3 - Quantity Required</label>
                                <Input
                                  type="text"
                                  placeholder="0"
                                  className="border-purple-300 mt-1"
                                  value={(selectedPipeSizeForMM4 === '150' || selectedPipeSizeForMM4 === '300') ? (patchingGreenData[2]?.quantity || '') : ''}
                                  onChange={(e) => updatePatchingGreenRow(3, e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium text-purple-700">Row 4 - Quantity Required</label>
                                <Input
                                  type="text"
                                  placeholder="0"
                                  className="border-purple-300 mt-1"
                                  value={(selectedPipeSizeForMM4 === '150' || selectedPipeSizeForMM4 === '300') ? (patchingGreenData[3]?.quantity || '') : ''}
                                  onChange={(e) => updatePatchingGreenRow(4, e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Standard MM4 Layout for Non-Patching Categories */
                        <div className="grid grid-cols-4 gap-4">
                          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                            <h4 className="font-medium text-blue-800 mb-2">
                              Day Rate
                              <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded font-mono">
                                {selectedPipeSizeForMM4}mm
                              </span>
                            </h4>
                            <div>
                              <label className="text-xs text-blue-700">Day Rate</label>
                              <Input
                                type="text"
                                placeholder="Enter day rate"
                                className="border-blue-300"
                                value={getDatabaseValue(getCurrentMM4Data()[0]?.id || 1, 'blueValue')}
                                onChange={(e) => updateMM4RowWithAutoSave(getCurrentMM4Data()[0]?.id || 1, 'blueValue', e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                            <h4 className="font-medium text-green-800 mb-2">
                              No Per Shift
                              <span className="ml-2 text-xs bg-green-200 text-green-800 px-2 py-1 rounded font-mono">
                                {selectedPipeSizeForMM4}mm
                              </span>
                            </h4>
                            <div className="space-y-2">
                              {(() => {
                                // 🧹 Use getCurrentMM4Data() to get clean, pipe-size-specific data
                                const currentData = getCurrentMM4Data();
                                return currentData.map((row, index) => (
                                  <div key={row.id}>
                                    <label className="text-xs text-green-700">Qty Per Shift</label>
                                    <Input
                                      type="text"
                                      placeholder="Enter quantity"
                                      className="border-green-300"
                                      value={getDatabaseValue(row.id, 'greenValue')}
                                      onChange={(e) => updateMM4RowWithAutoSave(row.id, 'greenValue', e.target.value)}
                                    />
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>

                          {/* Purple - Range Configuration (Hidden only for pure CCTV category F612) */}
                          {categoryId !== 'cctv' && (
                            <div className="col-span-2 bg-purple-50 border-2 border-purple-200 rounded-lg p-4">
                              <h4 className="font-medium text-purple-800 mb-2">
                                Range Configuration
                                <span className="ml-2 text-xs bg-purple-200 text-purple-800 px-2 py-1 rounded font-mono">
                                  {selectedPipeSizeForMM4}mm
                                </span>
                              </h4>
                              <div className="space-y-2">
                                {(() => {
                                  // 🧹 Use getCurrentMM4Data() to get clean, pipe-size-specific data
                                  const currentData = getCurrentMM4Data();
                                  return currentData.map((row, index) => (
                                    <div key={row.id} className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-xs text-purple-700">
                                          {categoryId === 'f-robot-cutting' 
                                            ? 'Cost - 1st Cut' 
                                            : (categoryId === 'cctv-van-pack' || categoryId === 'cctv-jet-vac' || categoryId === 'cctv' || categoryId === 'van-pack' || categoryId === 'jet-vac')
                                              ? 'Debris %'
                                              : 'Min Quantity'}
                                        </label>
                                        <Input
                                          type="text"
                                          placeholder={categoryId === 'f-robot-cutting' ? '0' : (categoryId === 'cctv-van-pack' || categoryId === 'cctv-jet-vac' || categoryId === 'cctv' || categoryId === 'van-pack' || categoryId === 'jet-vac') ? '30' : '3'}
                                          className="border-purple-300"
                                          value={getDatabaseValue(row.id, 'purpleDebris')}
                                          onChange={(e) => updateMM4RowWithAutoSave(row.id, 'purpleDebris', e.target.value)}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-xs text-purple-700">
                                          {categoryId === 'f-robot-cutting' 
                                            ? 'Extra Per Cut' 
                                            : (categoryId === 'cctv-van-pack' || categoryId === 'cctv-jet-vac' || categoryId === 'cctv' || categoryId === 'van-pack' || categoryId === 'jet-vac')
                                              ? 'Length Range'
                                              : 'Min Patches'}
                                        </label>
                                        <div className="flex items-center gap-2">
                                          <Input
                                            type="text"
                                            placeholder={categoryId === 'f-robot-cutting' ? '0' : (categoryId === 'cctv-van-pack' || categoryId === 'cctv-jet-vac' || categoryId === 'cctv' || categoryId === 'van-pack' || categoryId === 'jet-vac') ? '99.99' : '4'}
                                            className="border-purple-300 flex-1"
                                            value={getDatabaseValue(row.id, 'purpleLength')}
                                            onChange={(e) => updateMM4RowWithAutoSave(row.id, 'purpleLength', e.target.value)}
                                          />
                                          {/* Hide + button for F619 F-Robot Cutting */}
                                          {index === 0 && categoryId !== 'f-robot-cutting' && (
                                            <Button 
                                              size="sm" 
                                              className="bg-purple-600 hover:bg-purple-700 text-white h-8 w-8 p-0 flex-shrink-0"
                                              onClick={addMM4Row}
                                            >
                                              +
                                            </Button>
                                          )}
                                          {index > 0 && (
                                            <Button 
                                              size="sm" 
                                              variant="destructive"
                                              className="h-8 w-8 p-0 flex-shrink-0"
                                              onClick={() => deleteMM4Row(row.id)}
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ));
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      // Show placeholder when no pipe size selected
                      <div className="text-center py-8 text-gray-500">
                        <p>Select a pipe size from MM3 to configure Section Calculator</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* MM5 - Vehicle Travel Rates (Right) */}
              <div className="relative">
                <DevLabel id="MM5" position="top-right" />
                <Card className="bg-white border-2 border-gray-200">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold text-gray-900">
                      5. Vehicle Travel Rates
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-teal-50 border-2 border-teal-200 rounded-lg p-4">
                      <h4 className="font-medium text-teal-800 mb-2">Vehicle Travel</h4>
                      <div className="space-y-2">
                        {mm5Rows.map((row, index) => (
                          <div key={row.id} className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-teal-700">Vehicle Weight</label>
                              <Input
                                type="text"
                                placeholder="3.5t"
                                className="border-teal-300"
                                value={row.vehicleWeight}
                                onChange={(e) => updateMM5RowWithAutoSave(row.id, 'vehicleWeight', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-xs text-teal-700">Cost per Mile</label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="text"
                                  placeholder="£45"
                                  className="border-teal-300 flex-1"
                                  value={row.costPerMile}
                                  onChange={(e) => updateMM5RowWithAutoSave(row.id, 'costPerMile', e.target.value)}
                                />
                                {index === 0 && (
                                  <Button 
                                    size="sm" 
                                    className="bg-teal-600 hover:bg-teal-700 text-white h-8 w-8 p-0 flex-shrink-0"
                                    onClick={addMM5Row}
                                  >
                                    +
                                  </Button>
                                )}
                                {index > 0 && (
                                  <Button 
                                    size="sm" 
                                    variant="destructive"
                                    className="h-8 w-8 p-0 flex-shrink-0"
                                    onClick={() => deleteMM5Row(row.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>


          </div>
        )}

        {/* Apply to Sectors Section - Removed legacy P006a template logic */}
        {false && (
        <div className="mb-6 relative">
          <DevLabel id="C029" position="top-right" />
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Apply Configuration to Sectors</h3>
            <p className="text-sm text-gray-600">Select additional sectors where this configuration should be applied</p>
          </div>
          
          <div className="grid grid-cols-3 gap-3 mb-4">
            {SECTORS.map((sector) => {
              const isSelected = selectedSectors.includes(sector.id);
              return (
                <Card 
                  key={sector.id}
                  className={`cursor-pointer transition-all duration-200 hover:shadow-md relative ${
                    isSelected 
                      ? `border-${sector.color.replace('text-', '').replace('-600', '-300')} bg-${sector.color.replace('text-', '').replace('-600', '-50')}` 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onClick={() => handleSectorToggle(sector.id)}
                >
                  <CardContent className="p-4 text-center relative">
                    {/* Icon */}
                    <div className={`mx-auto w-8 h-8 mb-3 flex items-center justify-center rounded-lg ${
                      isSelected ? sector.bgColor : 'bg-gray-100'
                    }`}>
                      <sector.icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-gray-600'}`} />
                    </div>
                    
                    {/* Title */}
                    <h3 className={`font-semibold text-sm mb-1 ${
                      isSelected ? sector.color : 'text-gray-900'
                    }`}>
                      {sector.name}
                    </h3>
                    
                    {/* Dev ID */}
                    <p className="text-xs text-gray-500 mb-2">{sector.devId}</p>
                    
                    {/* Description */}
                    <p className="text-xs text-gray-600 mb-3">
                      {sector.description}
                    </p>
                    
                    {/* Status Indicator */}
                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <Settings className="w-4 h-4 text-gray-600" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          
          {/* Save Sectors Button */}
          <div className="flex justify-start">
            <Button 
              onClick={handleSaveSectors}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Saving...' : 'Save Sectors'}
            </Button>
          </div>
        </div>
        )}



        {/* Upper Level Pipe Size Configuration - Removed legacy P006 template logic */}
        {false && (
          <Card className="mb-6 relative">
            <DevLabel id="W020" position="top-right" />
            <CardHeader className="pb-3">
              <CardTitle className="text-black text-lg flex items-center gap-2">
                <Wrench className="w-5 h-5" />
                Pipe Size Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-6 md:grid-cols-8 gap-2">
                {PIPE_SIZES.map((size) => (
                  <Button
                    key={size}
                    variant={selectedPipeSize === size ? 'default' : 'outline'}
                    className={`h-10 text-xs font-medium ${
                      selectedPipeSize === size ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedPipeSize(size)}
                  >
                    {size}mm
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* P007 Pattern - Removed legacy template system (now uses MMP1 system) */}
        {false && (
          <>

            {/* W003 Component - Vehicle Travel Rates */}
            <Card className="relative">
              <DevLabel id="W003" position="top-right" />
              <CardHeader className="pb-3">
                <CardTitle className="text-black text-lg flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  Vehicle Travel Rates
                </CardTitle>
              </CardHeader>
              <CardContent className="bg-teal-100 border border-teal-300 rounded-lg">
                <div className="space-y-4">
                  {formData.vehicleTravelRates.map((vehicle, index) => (
                    <div key={vehicle.id} className="space-y-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={vehicle.enabled}
                          onChange={(e) => updateVehicleOption(index, 'enabled', e.target.checked)}
                          className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="font-medium text-gray-900">{vehicle.vehicleType} Vehicle</span>
                      </div>
                      {vehicle.enabled && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="block text-sm font-medium text-gray-700 mb-1">Hourly Rate (£)</span>
                            <Input
                              type="text"
                              value={vehicle.hourlyRate}
                              onChange={(e) => updateVehicleOption(index, 'hourlyRate', e.target.value)}
                              placeholder="Rate"
                            />
                          </div>
                          <div>
                            <span className="block text-sm font-medium text-gray-700 mb-1">Number of Hours</span>
                            <Input
                              type="text"
                              value={vehicle.numberOfHours}
                              onChange={(e) => updateVehicleOption(index, 'numberOfHours', e.target.value)}
                              placeholder="2"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Save Configuration Button */}
            <div className="flex justify-start">
              <Button 
                onClick={handleSaveConfiguration}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </>
        )}



      </div>

      {/* Range Warning Dialog for .99 values */}
      <Dialog open={showRangeWarning} onOpenChange={(open) => {
        if (!open) {
          setShowRangeWarning(false);
          setPendingRangeValue('');
          setPendingRowId(null);
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Range Continuity Warning
            </DialogTitle>
            <DialogDescription>
              You entered "{pendingRangeValue}" for the length range. For continuous ranges, length values should typically end with ".99".
              <br /><br />
              Example: "30.99" creates range 0-30.99m, then next range starts at 30.99m
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => handleRangeWarningResponse(true)}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              Add .99 → "{pendingRangeValue}.99"
            </Button>
            <Button
              onClick={() => handleRangeWarningResponse(false)}
              variant="outline"
              className="flex-1"
            >
              Keep "{pendingRangeValue}"
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
