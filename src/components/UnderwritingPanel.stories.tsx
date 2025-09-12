import type { Meta, StoryObj } from '@storybook/react';
import UnderwritingPanel from './UnderwritingPanel';
import { ProjectState, SiteplanConfig } from '../types/project';

const meta = {
  title: 'Components/UnderwritingPanel',
  component: UnderwritingPanel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Financial underwriting panel with configurable assumptions and real-time calculations'
      }
    }
  },
  tags: ['autodocs'],
  argTypes: {
    targetFAR: {
      control: { type: 'range', min: 0.5, max: 8.0, step: 0.1 },
      description: 'Floor Area Ratio for development calculations'
    },
    targetHeight: {
      control: { type: 'range', min: 20, max: 200, step: 5 },
      description: 'Building height in feet'
    },
    hardCostPerSF: {
      control: { type: 'range', min: 100, max: 400, step: 10 },
      description: 'Hard construction cost per square foot'
    },
    salePricePerUnit: {
      control: { type: 'range', min: 200000, max: 800000, step: 10000 },
      description: 'Sale price per residential unit'
    },
    rentPerUnit: {
      control: { type: 'range', min: 1000, max: 5000, step: 100 },
      description: 'Monthly rent per unit'
    },
    interestRate: {
      control: { type: 'range', min: 3.0, max: 12.0, step: 0.1 },
      description: 'Construction loan interest rate percentage'
    }
  }
} satisfies Meta<typeof UnderwritingPanel>;

export default meta;
type Story = StoryObj<typeof UnderwritingPanel>;

// Mock project data generator
const createMockProject = (overrides: Partial<any> = {}): any => ({
  id: 'demo-project',
  name: 'Demo Development',
  parcels: [{
    id: '1',
    parcelnumb: 'DEMO-001',
    address: '123 Development Ave',
    deededacreage: 2.5,
    sqft: 108900,
    zoning: 'RM15',
    geometry: {},
    landval: 500000,
    parval: 600000,
    max_far: 4.0,
    max_height_ft: 90,
    max_coverage_pct: 70,
    min_front_setback_ft: 10,
    min_rear_setback_ft: 15,
    min_side_setback_ft: 5
  }],
  totalAcreage: 2.5,
  totalSqft: 108900,
  totalLandValue: 500000,
  siteplanConfig: {
    targetFAR: 3.0,
    targetHeight: 75,
    buildingSetbacks: { front: 10, rear: 15, side: 5 },
    targetCoverage: 60,
    buildingType: 'residential',
    unitsPerAcre: 30,
    parkingRatio: 1.2
  } as SiteplanConfig,
  ...overrides
});

// Mock building massing calculator
const createMockMassing = (project: any, overrides: Partial<any> = {}) => ({
  footprint: project.totalSqft * (project.siteplanConfig.targetCoverage / 100),
  totalGSF: project.totalSqft * project.siteplanConfig.targetFAR,
  height: project.siteplanConfig.targetHeight,
  stories: Math.floor(project.siteplanConfig.targetHeight / 12),
  units: Math.floor(project.totalAcreage * project.siteplanConfig.unitsPerAcre),
  parkingSpaces: Math.ceil(project.totalAcreage * project.siteplanConfig.unitsPerAcre * project.siteplanConfig.parkingRatio),
  coverage: project.siteplanConfig.targetCoverage,
  far: project.siteplanConfig.targetFAR,
  buildableArea: project.totalSqft * 0.8,
  openSpaceArea: project.totalSqft * 0.15,
  parkingArea: Math.ceil(project.totalAcreage * project.siteplanConfig.unitsPerAcre * project.siteplanConfig.parkingRatio) * 300,
  amenitySpace: 5000,
  averageUnitSize: 1200,
  constructionCost: 12000000,
  estimatedValue: 18000000,
  roiProjection: 15.5,
  constraintAnalysis: {
    farUtilization: 75,
    heightUtilization: 83,
    coverageUtilization: 86,
    limitingFactor: 'Height Limit'
  },
  ...overrides
});

export const ForSaleDevelopment: Story = {
  render: (args) => {
    const project = createMockProject({
      siteplanConfig: {
        ...createMockProject().siteplanConfig,
        targetFAR: args.targetFAR || 3.0,
        targetHeight: args.targetHeight || 75
      }
    });
    
    // Mock the useProject and useUnderwriting hooks
    React.useEffect(() => {
      (window as any).mockProject = project;
      (window as any).mockMassing = createMockMassing(project);
      (window as any).mockUnderwritingAssumptions = {
        hardCostPerSF: args.hardCostPerSF || 180,
        salePricePerUnit: args.salePricePerUnit || 350000,
        interestRate: args.interestRate || 7.5
      };
    }, [args]);

    return (
      <div style={{ height: '600px', width: '400px', border: '1px solid #ccc' }}>
        <UnderwritingPanel />
      </div>
    );
  },
  args: {
    targetFAR: 3.0,
    targetHeight: 75,
    hardCostPerSF: 180,
    salePricePerUnit: 350000,
    interestRate: 7.5
  }
};

export const RentalDevelopment: Story = {
  render: (args) => {
    const project = createMockProject({
      siteplanConfig: {
        ...createMockProject().siteplanConfig,
        targetFAR: args.targetFAR || 2.5,
        targetHeight: args.targetHeight || 60
      }
    });

    React.useEffect(() => {
      (window as any).mockProject = project;
      (window as any).mockMassing = createMockMassing(project);
      (window as any).mockUnderwritingAssumptions = {
        hardCostPerSF: args.hardCostPerSF || 160,
        rentPerUnitPerMonth: args.rentPerUnit || 1800,
        interestRate: args.interestRate || 6.5
      };
    }, [args]);

    return (
      <div style={{ height: '600px', width: '400px', border: '1px solid #ccc' }}>
        <UnderwritingPanel />
      </div>
    );
  },
  args: {
    targetFAR: 2.5,
    targetHeight: 60,
    hardCostPerSF: 160,
    rentPerUnit: 1800,
    interestRate: 6.5
  }
};

export const HighDensityMixed: Story = {
  render: (args) => {
    const project = createMockProject({
      totalAcreage: 5.0,
      totalSqft: 217800,
      siteplanConfig: {
        ...createMockProject().siteplanConfig,
        targetFAR: args.targetFAR || 6.0,
        targetHeight: args.targetHeight || 150,
        unitsPerAcre: 60,
        buildingType: 'mixed-use'
      }
    });

    React.useEffect(() => {
      (window as any).mockProject = project;
      (window as any).mockMassing = createMockMassing(project, {
        units: 300,
        stories: 12,
        totalGSF: project.totalSqft * 6.0
      });
      (window as any).mockUnderwritingAssumptions = {
        hardCostPerSF: args.hardCostPerSF || 220,
        salePricePerUnit: args.salePricePerUnit || 450000,
        interestRate: args.interestRate || 8.0
      };
    }, [args]);

    return (
      <div style={{ height: '600px', width: '400px', border: '1px solid #ccs' }}>
        <UnderwritingPanel />
      </div>
    );
  },
  args: {
    targetFAR: 6.0,
    targetHeight: 150,
    hardCostPerSF: 220,
    salePricePerUnit: 450000,
    interestRate: 8.0
  }
};

export const EmptyState: Story = {
  render: () => (
    <div style={{ height: '600px', width: '400px', border: '1px solid #ccc' }}>
      <UnderwritingPanel />
    </div>
  )
};