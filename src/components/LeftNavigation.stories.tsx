import type { Meta, StoryObj } from '@storybook/react';
import LeftNavigation from './LeftNavigation';

const meta = {
  title: 'Components/LeftNavigation',
  component: LeftNavigation,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof LeftNavigation>;

export default meta;
type Story = StoryObj<typeof LeftNavigation>;

export const Default: Story = {
  args: {},
  decorators: [
    (Story) => (
      <div style={{ height: '100vh', width: '16rem' }}>
        <Story />
      </div>
    ),
  ],
};