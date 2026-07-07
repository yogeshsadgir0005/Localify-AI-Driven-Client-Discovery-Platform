/**
 * Seed the cross-industry Category taxonomy. Idempotent (upsert by slug).
 * Run: `npm run seed:categories` from the server/ directory.
 */
require('dotenv').config();
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
const mongoose = require('mongoose');
const Category = require('../models/Category');

const CATEGORIES = [
  // IT / software & digital
  { slug: 'it-web-development', vertical: 'it', displayName: { en: 'Web development' }, synonyms: ['website', 'web dev', 'react', 'frontend', 'web design'], attributeSchema: ['techStack', 'priceBand'] },
  { slug: 'it-mobile-apps', vertical: 'it', displayName: { en: 'Mobile apps' }, synonyms: ['mobile app', 'android', 'ios', 'flutter', 'app development'] },
  { slug: 'it-software-services', vertical: 'it', displayName: { en: 'Software services' }, synonyms: ['software', 'saas', 'custom software', 'erp', 'automation'] },
  { slug: 'it-design', vertical: 'it', displayName: { en: 'UI/UX & design' }, synonyms: ['ui', 'ux', 'graphic design', 'logo', 'branding'] },
  { slug: 'digital-marketing', vertical: 'it', displayName: { en: 'Digital marketing' }, synonyms: ['seo', 'ads', 'social media', 'marketing', 'google ads'] },

  // Textile & manufacturing
  { slug: 'textile-fabric', vertical: 'textile', displayName: { en: 'Fabric manufacturer' }, synonyms: ['fabric', 'mill', 'weaving', 'cotton', 'georgette', 'saree'], attributeSchema: ['moq', 'fabrics', 'gsm'], hub: 'Surat' },
  { slug: 'textile-yarn', vertical: 'textile', displayName: { en: 'Yarn & spinning' }, synonyms: ['yarn', 'spinning', 'thread'], hub: 'Ludhiana' },
  { slug: 'textile-dyeing', vertical: 'textile', displayName: { en: 'Dyeing & processing' }, synonyms: ['dyeing', 'processing', 'printing'] },
  { slug: 'garment-manufacturer', vertical: 'textile', displayName: { en: 'Garment manufacturer' }, synonyms: ['garment', 'stitching', 'apparel manufacturing', 'kurti', 'knitwear'], attributeSchema: ['moq'], hub: 'Tirupur' },

  // Apparel & fashion
  { slug: 'apparel-wholesale', vertical: 'apparel', displayName: { en: 'Apparel wholesale' }, synonyms: ['wholesale clothing', 'wholesaler', 'bulk clothes'], attributeSchema: ['moq'] },
  { slug: 'apparel-retail', vertical: 'apparel', displayName: { en: 'Clothing store / boutique' }, synonyms: ['boutique', 'clothing store', 'fashion store', 'garments shop'] },
  { slug: 'apparel-designer', vertical: 'apparel', displayName: { en: 'Fashion designer' }, synonyms: ['fashion designer', 'designer wear', 'custom stitching'] },

  // Automobile
  { slug: 'auto-garage', vertical: 'automobile', displayName: { en: 'Garage & service' }, synonyms: ['garage', 'mechanic', 'car repair', 'service center', 'bike repair'], attributeSchema: ['vehiclesServiced'] },
  { slug: 'auto-spare-parts', vertical: 'automobile', displayName: { en: 'Spare parts' }, synonyms: ['spare parts', 'auto parts', 'genuine parts', 'accessories'] },
  { slug: 'auto-dealer', vertical: 'automobile', displayName: { en: 'Dealer / showroom' }, synonyms: ['car dealer', 'showroom', 'used cars'] },
  { slug: 'auto-detailing', vertical: 'automobile', displayName: { en: 'Detailing & car wash' }, synonyms: ['detailing', 'car wash', 'ceramic coating'] },

  // Professional & local services
  { slug: 'ca-accounting', vertical: 'services', displayName: { en: 'CA & accounting' }, synonyms: ['ca', 'chartered accountant', 'accounting', 'gst filing', 'tax', 'bookkeeping'] },
  { slug: 'legal-services', vertical: 'services', displayName: { en: 'Legal services' }, synonyms: ['lawyer', 'advocate', 'legal', 'registration', 'notary'] },
  { slug: 'architecture', vertical: 'services', displayName: { en: 'Architecture & interiors' }, synonyms: ['architect', 'interior designer', 'civil'] },
  { slug: 'tutoring', vertical: 'services', displayName: { en: 'Tutoring & coaching' }, synonyms: ['tutor', 'coaching', 'classes', 'tuition'] },
  { slug: 'photography', vertical: 'services', displayName: { en: 'Photography & events' }, synonyms: ['photographer', 'photography', 'event', 'videography', 'wedding'] },
  { slug: 'home-services', vertical: 'services', displayName: { en: 'Home services' }, synonyms: ['plumber', 'electrician', 'carpenter', 'painter', 'ac repair'] },
];

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    let upserts = 0;
    for (const cat of CATEGORIES) {
      await Category.updateOne(
        { slug: cat.slug },
        { $set: { ...cat, parent: cat.parent || null } },
        { upsert: true }
      );
      upserts += 1;
    }
    console.log(`[seed] Upserted ${upserts} categories across ${new Set(CATEGORIES.map((c) => c.vertical)).size} verticals.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[seed] Failed:', err.message);
    process.exit(1);
  }
})();
