export interface SeedLead {
  id: string;
  companyName: string;
  roleTitle: string;
  companyUrl: string;
  sourceUrl: string;
  location: string;
  painPointSummary: string;
  fitScore: number;
  fitReasons: string[];
}

/**
 * Curated B2B seeds from the existing Signhify pipeline. Not scraped — these are
 * companies the studio already researched, kept in code so a fresh install has a
 * working pipeline before any external service is connected.
 */
export const B2B_LEADS: SeedLead[] = [
  {
    id: 'plus-render',
    companyName: 'Plus Render',
    roleTitle: '60 FPS 3D scroll hero for Miami ArchViz portfolio',
    companyUrl: 'https://plusrender.com/3d-rendering-miami/',
    sourceUrl: 'https://plusrender.com/3d-rendering-miami/',
    location: 'Miami, US',
    painPointSummary: 'Cinematic CGI flythroughs ship as flat MP4s, so the website cannot sell the walkthrough experience.',
    fitScore: 92,
    fitReasons: ['CGI flythrough inventory', 'Premium property clients', 'No scroll-reactive web preview'],
  },
  {
    id: '3dav-uk',
    companyName: '3DAV UK',
    roleTitle: 'Interactive property marketing microsite',
    companyUrl: 'https://www.3darchitecturevisualization.co.uk',
    sourceUrl: 'https://www.3darchitecturevisualization.co.uk/blog/category/property-marketing.html',
    location: 'London, UK',
    painPointSummary: 'Property marketing pages are static image galleries; buyers cannot feel the space before a viewing.',
    fitScore: 88,
    fitReasons: ['Property marketing focus', 'Blog shows demand for interactive previews', 'No WebGL build in stack'],
  },
  {
    id: 'hex-digital',
    companyName: 'Hex Digital',
    roleTitle: 'Interactive 3D launch microsite for a Webflow studio',
    companyUrl: 'https://hexdigital.com',
    sourceUrl: 'https://hexdigital.com',
    location: 'London, UK',
    painPointSummary: 'Every 3D hero is a custom Three.js build, adding weeks and hurting mobile Lighthouse scores.',
    fitScore: 87,
    fitReasons: ['Ships launch microsites weekly', 'No in-house WebGL engineer', 'Cares about Core Web Vitals'],
  },
  {
    id: 'stride-health',
    companyName: 'Stride Health',
    roleTitle: 'Product launch page with a grounded AI concierge',
    companyUrl: 'https://getstride.com',
    sourceUrl: 'https://getstride.com',
    location: 'San Francisco, US',
    painPointSummary: 'Static product pages convert poorly for a complex, trust-heavy insurance product.',
    fitScore: 81,
    fitReasons: ['Active growth experiments', 'Complex product needs explainer', 'Series-stage budget'],
  },
  {
    id: 'we-are-care',
    companyName: 'We Are Care',
    roleTitle: 'Care-sector campaign microsite with motion hero',
    companyUrl: 'https://wearecare.co.uk',
    sourceUrl: 'https://wearecare.co.uk',
    location: 'UK',
    painPointSummary: 'Campaign landing pages need motion that still loads fast on low-end mobile devices.',
    fitScore: 76,
    fitReasons: ['Motion-led campaigns', 'Performance-sensitive audience', 'Warm reply in pipeline'],
  },
  {
    id: 'glide-marketing',
    companyName: 'Glide Marketing',
    roleTitle: 'Client landing pages with a repeatable 3D hero component',
    companyUrl: 'https://glidemarketing.com',
    sourceUrl: 'https://glidemarketing.com',
    location: 'Remote',
    painPointSummary: 'Rebuilds the same hero animation per client, with no reusable component library.',
    fitScore: 74,
    fitReasons: ['Repeating deliverable', 'Warm reply in pipeline', 'Retainer potential'],
  },
];
