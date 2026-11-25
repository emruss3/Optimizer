import React from 'react';
import { Map, Search, Building2, Calculator, FileText, ArrowRight } from 'lucide-react';
import { SAMPLE_PARCEL } from '../lib/sampleParcel';

interface LandingPageProps {
  onGetStarted: () => void;
  onViewDemo: () => void;
}

// What the product does today. No customer counts, accuracy rates or
// certifications appear here: none of them has been measured or awarded.
const features = [
  {
    icon: <Search className="w-6 h-6 text-blue-600" />,
    title: 'Find a parcel',
    description: 'Pick a Nashville parcel on the map, or search by street address or parcel ID. Zoning, lot size and assessed values come with it.',
  },
  {
    icon: <Building2 className="w-6 h-6 text-blue-600" />,
    title: 'See what fits',
    description: 'The planner tests the lot against its zoning district and draws a concept plan: buildings, parking, drives and setbacks. Anything it could not verify is marked as needing verification.',
  },
  {
    icon: <Calculator className="w-6 h-6 text-blue-600" />,
    title: 'Compare and underwrite',
    description: 'Save schemes, compare them side by side at one scale, and open a pro forma on the one you choose. Pricing comes from local sales where there are enough of them.',
  },
  {
    icon: <FileText className="w-6 h-6 text-blue-600" />,
    title: 'Share an exhibit',
    description: 'Export a site plan sheet, a 3D view and a building section. Every sheet carries the parcel, the revision and the date.',
  },
];

const LandingPage = React.memo(function LandingPage({ onGetStarted, onViewDemo }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-white">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Map className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Parcel Intelligence</h1>
              <p className="text-xs text-gray-600 hidden sm:block">Site feasibility for Nashville parcels</p>
            </div>
          </div>
          <button
            onClick={onGetStarted}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Open the app
          </button>
        </div>
      </nav>

      <section className="bg-gradient-to-b from-blue-50 to-white py-16 lg:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 leading-tight">
              From a parcel to a concept plan you can share
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              Pick a parcel, see what its zoning allows, generate a site plan, compare schemes and export an exhibit.
              Concept level: every drawing says what was verified and what was not.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={onGetStarted}
                data-testid="landing-start"
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center space-x-2"
              >
                <span>Open the app</span>
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                onClick={onViewDemo}
                data-testid="landing-sample"
                className="border border-gray-300 text-gray-800 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Open the sample parcel
              </button>
            </div>
          </div>

          <figure className="bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
            <img
              src="/sample/1710-meharry-site-plan.jpg"
              alt={`Site plan exhibit for ${SAMPLE_PARCEL.address}, zoned ${SAMPLE_PARCEL.zoning}`}
              className="w-full block"
              loading="lazy"
            />
            <figcaption className="px-4 py-3 text-sm text-gray-600 border-t border-gray-100">
              {SAMPLE_PARCEL.address}, Nashville, zoned {SAMPLE_PARCEL.zoning}. The site plan sheet this app exported for the parcel, unedited.
            </figcaption>
          </figure>
        </div>
      </section>

      <section id="features" className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-10">What it does</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map(feature => (
              <div key={feature.title} className="rounded-xl p-5 border border-gray-200">
                <div className="mb-3">{feature.icon}</div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">{feature.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 bg-gray-50 border-t border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-bold text-gray-900 mb-3">What to expect</h2>
          <ul className="space-y-2 text-sm text-gray-700 list-disc pl-5">
            <li>Coverage is Nashville and Davidson County parcels.</li>
            <li>Plans are concept studies from public parcel and zoning records. They are not surveys and not for construction.</li>
            <li>Access and parking are checked where the data allows. Where it does not, the plan says "Needs verification" and names what is missing.</li>
          </ul>
        </div>
      </section>

      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-sm flex items-center justify-between">
          <span className="text-white font-semibold">Parcel Intelligence</span>
          <span>&copy; {new Date().getFullYear()} ER Technologies</span>
        </div>
      </footer>
    </div>
  );
});

export default LandingPage;
