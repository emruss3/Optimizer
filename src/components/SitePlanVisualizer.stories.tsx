import type { Meta, StoryObj } from '@storybook/react';
import SitePlanVisualizer from './SitePlanVisualizer';
import { SelectedParcel, BuildingMassing } from '../types/project';

const meta = {
  title: 'Components/SitePlanVisualizer',
  component: SitePlanVisualizer,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: 'Interactive site plan visualization with configurable building parameters'
      }
    }
  },
  tags: ['autodocs'],
  argTypes: {
    buildingFAR: {
      control: { type: 'range', min: 0.5, max: 8.0, step: 0.1 },
      description: 'Floor Area Ratio for the building'
    },
    buildingHeight: {
      control: { type: 'range', min: 20, max: 200, step: 5 },
      description: 'Building height in feet'
    },
    siteCoverage: {
      control: { type: 'range', min: 20, max: 90, step: 5 },
      description: 'Site coverage percentage'
    },
    units: {
      control: { type: 'range', min: 10, max: 500, step: 10 },
      description: 'Number of residential units'
    },
    parkingSpaces: {
      control: { type: 'range', min: 0, max: 600, step: 10 },
      description: 'Number of parking spaces'
    },
    stories: {
      control: { type: 'range', min: 1, max: 20, step: 1 },
      description: 'Number of building stories'
    }
  }
} satisfies Meta<typeof SitePlanVisualizer>;

export default meta;
type Story = StoryObj<typeof SitePlanVisualizer>;

// Mock data generators
const createMockParcel = (size: number = 50000): SelectedParcel => ({
  id: '1',
  parcelnumb: 'DEMO-001',
  address: '123 Development Street',
  deededacreage: size / 43560,
  sqft: size,
  zoning: 'RM15',
  geometry: {},
  landval: 500000,
  parval: 600000
});

const createMockMassing = (args: any): BuildingMassing => ({
  footprint: args.siteCoverage ? (50000 * args.siteCoverage / 100) : 25000,
  totalGSF: args.buildingFAR ? (50000 * args.buildingFAR) : 150000,
  height: args.buildingHeight || 75,
  stories: args.stories || 6,
  units: args.units || 75,
  parkingSpaces: args.parkingSpaces || 90,
  coverage: args.siteCoverage || 50,
  far: args.buildingFAR || 3.0,
  buildableArea: 40000,
  openSpaceArea: 7500,
  parkingArea: 27000,
  amenitySpace: 5000,
  averageUnitSize: 1200,
  constructionCost: 15000000,
  estimatedValue: 22500000,
  roiProjection: 18.2
});

export const SmallDevelopment: Story = {
  render: (args) => (
    <SitePlanVisualizer
      parcels={[createMockParcel(30000)]}
      massing={createMockMassing({
        ...args,
        buildingFAR: args.buildingFAR || 2.0,
        buildingHeight: args.buildingHeight || 45,
        siteCoverage: args.siteCoverage || 40,
        units: args.units || 24,
        stories: args.stories || 3
      })}
      width={400}
      height={300}
    />
  ),
  args: {
    buildingFAR: 2.0,
    buildingHeight: 45,
    siteCoverage: 40,
    units: 24,
    parkingSpaces: 30,
    stories: 3
  }
};

export const MediumDevelopment: Story = {
  render: (args) => (
    <SitePlanVisualizer
      parcels={[createMockParcel(75000)]}
      massing={createMockMassing({
        ...args,
        buildingFAR: args.buildingFAR || 3.5,
        buildingHeight: args.buildingHeight || 90
      })}
      width={400}
      height={300}
    />
  ),
  args: {
    buildingFAR: 3.5,
    buildingHeight: 90,
    siteCoverage: 60,
    units: 120,
    parkingSpaces: 144,
    stories: 7
  }
};

export const HighRiseDevelopment: Story = {
  render: (args) => (
    <SitePlanVisualizer
      parcels={[createMockParcel(100000)]}
      massing={createMockMassing({
        ...args,
        buildingFAR: args.buildingFAR || 6.0,
        buildingHeight: args.buildingHeight || 150
      })}
      width={500}
      height={400}
    />
  ),
  args: {
    buildingFAR: 6.0,
    buildingHeight: 150,
    siteCoverage: 75,
    units: 300,
    parkingSpaces: 360,
    stories: 12
  }
};

export const MultiParcelDevelopment: Story = {
  render: (args) => (
    <SitePlanVisualizer
      parcels={[
        createMockParcel(60000),
        { ...createMockParcel(40000), id: '2', parcelnumb: 'DEMO-002' }
      ]}
      massing={createMockMassing({
        ...args,
        buildingFAR: args.buildingFAR || 4.0,
        buildingHeight: args.buildingHeight || 120
      })}
      width={500}
      height={400}
    />
  ),
  args: {
    buildingFAR: 4.0,
    buildingHeight: 120,
    siteCoverage: 65,
    units: 200,
    parkingSpaces: 240,
    stories: 10
  }
};

export const EmptyState: Story = {
  args: {
    parcels: [],
    massing: null,
    width: 400,
    height: 300
  }
};