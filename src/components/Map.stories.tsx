import type { Meta, StoryObj } from '@storybook/react';
import MapComponent from './Map';

const meta = {
  title: 'Components/Map',
  component: MapComponent,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Interactive Mapbox map with parcel selection and real-time data visualization'
      }
    }
  },
  tags: ['autodocs'],
  argTypes: {
    onParcelClick: {
      action: 'parcel clicked',
      description: 'Callback when a parcel is clicked on the map'
    }
  }
} satisfies Meta<typeof MapComponent>;

export default meta;
type Story = StoryObj<typeof MapComponent>;

// Mock parcel click handler
const mockParcelClick = (parcel: any) => {
  console.log('Parcel clicked:', parcel);
};

export const Default: Story = {
  args: {
    onParcelClick: mockParcelClick
  },
  decorators: [
    (Story) => (
      <div style={{ height: '600px', width: '100%' }}>
        <Story />
      </div>
    ),
  ],
};

export const WithActiveProject: Story = {
  args: {
    onParcelClick: mockParcelClick
  },
  decorators: [
    (Story) => {
      // Mock active project state
      React.useEffect(() => {
        const { useActiveProject } = require('../store/project');
        const store = useActiveProject.getState();
        store.set('demo-project', 'Demo Development Project');
      }, []);

      return (
        <div style={{ height: '600px', width: '100%' }}>
          <Story />
        </div>
      );
    },
  ],
};

export const LoadingState: Story = {
  args: {
    onParcelClick: mockParcelClick
  },
  decorators: [
    (Story) => (
      <div style={{ height: '400px', width: '100%' }}>
        <Story />
      </div>
    ),
  ],
};

export const ErrorState: Story = {
  args: {
    onParcelClick: mockParcelClick
  },
  decorators: [
    (Story) => {
      // Mock invalid token to show error state
      React.useEffect(() => {
        const originalToken = process.env.VITE_MAPBOX_API_KEY;
        process.env.VITE_MAPBOX_API_KEY = 'invalid-token';
        
        return () => {
          process.env.VITE_MAPBOX_API_KEY = originalToken;
        };
      }, []);

      return (
        <div style={{ height: '400px', width: '100%' }}>
          <Story />
        </div>
      );
    },
  ],
};