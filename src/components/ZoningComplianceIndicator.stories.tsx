import type { Meta, StoryObj } from '@storybook/react';
import ZoningComplianceIndicator from './ZoningComplianceIndicator';
import { ZoningCompliance } from '../types/zoning';

const meta = {
  title: 'Components/ZoningComplianceIndicator',
  component: ZoningComplianceIndicator,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ZoningComplianceIndicator>;

export default meta;
type Story = StoryObj<typeof ZoningComplianceIndicator>;

const compliantData: ZoningCompliance = {
  isCompliant: true,
  violations: [],
  warnings: [],
  compliance: {
    setbacks: {
      status: 'compliant',
      currentValue: 25,
      requiredValue: 20,
      utilizationPercentage: 80,
      message: 'All setbacks meet requirements'
    },
    height: {
      status: 'compliant',
      currentValue: 35,
      requiredValue: 45,
      utilizationPercentage: 78,
      message: 'Height within limits'
    },
    coverage: {
      status: 'compliant',
      currentValue: 30,
      requiredValue: 40,
      utilizationPercentage: 75,
      message: 'Coverage within limits'
    },
    far: {
      status: 'compliant',
      currentValue: 1.8,
      requiredValue: 2.0,
      utilizationPercentage: 90,
      message: 'FAR within limits'
    },
    parking: {
      status: 'compliant',
      currentValue: 24,
      requiredValue: 20,
      utilizationPercentage: 120,
      message: 'Adequate parking provided'
    },
    density: {
      status: 'compliant',
      currentValue: 15,
      requiredValue: 20,
      utilizationPercentage: 75,
      message: 'Density within limits'
    }
  }
};

const violationData: ZoningCompliance = {
  isCompliant: false,
  violations: [
    {
      id: 'height-violation',
      ruleId: 'max-height',
      ruleName: 'Building Height',
      category: 'height',
      severity: 'error',
      message: 'Building height of 55ft exceeds maximum of 45ft',
      currentValue: 55,
      requiredValue: 45,
      unit: 'feet'
    },
    {
      id: 'coverage-violation',
      ruleId: 'max-coverage',
      ruleName: 'Site Coverage',
      category: 'coverage',
      severity: 'error',
      message: 'Site coverage of 48% exceeds maximum of 40%',
      currentValue: 48,
      requiredValue: 40,
      unit: 'percentage'
    }
  ],
  warnings: [
    {
      id: 'far-warning',
      ruleId: 'max-far',
      ruleName: 'Floor Area Ratio',
      category: 'far',
      severity: 'warning',
      message: 'FAR utilization at 95% - approaching limit',
      currentValue: 1.9,
      requiredValue: 2.0,
      unit: 'ratio'
    }
  ],
  compliance: {
    setbacks: {
      status: 'compliant',
      currentValue: 25,
      requiredValue: 20,
      utilizationPercentage: 80,
      message: 'All setbacks meet requirements'
    },
    height: {
      status: 'violation',
      currentValue: 55,
      requiredValue: 45,
      utilizationPercentage: 122,
      message: 'Building height exceeds limit'
    },
    coverage: {
      status: 'violation',
      currentValue: 48,
      requiredValue: 40,
      utilizationPercentage: 120,
      message: 'Site coverage exceeds limit'
    },
    far: {
      status: 'warning',
      currentValue: 1.9,
      requiredValue: 2.0,
      utilizationPercentage: 95,
      message: 'FAR approaching limit'
    },
    parking: {
      status: 'compliant',
      currentValue: 24,
      requiredValue: 20,
      utilizationPercentage: 120,
      message: 'Adequate parking provided'
    },
    density: {
      status: 'compliant',
      currentValue: 15,
      requiredValue: 20,
      utilizationPercentage: 75,
      message: 'Density within limits'
    }
  }
};

export const Compliant: Story = {
  args: {
    compliance: compliantData,
    compact: false,
  },
};

export const WithViolations: Story = {
  args: {
    compliance: violationData,
    compact: false,
  },
};

export const Compact: Story = {
  args: {
    compliance: compliantData,
    compact: true,
  },
};

export const CompactWithViolations: Story = {
  args: {
    compliance: violationData,
    compact: true,
  },
};