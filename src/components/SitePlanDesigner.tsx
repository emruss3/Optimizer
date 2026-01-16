import React from 'react';
import type { SelectedParcel } from '../types/parcel';
import { SiteWorkspace } from '../features/site-plan';

interface SitePlanDesignerProps {
  parcel: SelectedParcel;
}

const SitePlanDesigner: React.FC<SitePlanDesignerProps> = ({ parcel }) => {
  return <SiteWorkspace parcel={parcel} />;
};

export default SitePlanDesigner;