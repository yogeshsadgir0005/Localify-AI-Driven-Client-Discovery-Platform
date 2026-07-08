import { categoryOf } from '../hooks/useBusinessSearch';

const genericQuestions = [
  {
    id: 'Brand Persona',
    title: 'How would you describe your brand\'s personality?',
    options: ['Innovative, Modern & Tech-forward', 'High-end, Premium & Exclusive', 'Friendly, Local & Community-driven', 'Bold, Energetic & Disruptive']
  },
  {
    id: 'Visual Aesthetic',
    title: 'Which visual style appeals to you the most?',
    options: ['Rich & Immersive (Glows, blur effects, glassmorphism)', 'Clean, Minimalist & Spacious (Apple-style)', 'Structured & Data-dense (Bento-box grids)', 'Playful, Colorful with Soft rounded edges']
  },
  {
    id: 'Content Layout',
    title: 'How should your content be presented?',
    options: ['Dynamic Bento-style grids with floating cards', 'Immersive full-screen sections with smooth scrolling', 'Clean, classic alternating left/right blocks', 'Highly visual with large image carousels']
  },
  {
    id: 'Animations',
    title: 'How much movement do you want on the site?',
    options: ['Subtle glow effects and smooth hover states', 'Elements fading and sliding in as you scroll', 'Playful floating elements and spring animations', 'Static and blazing fast (no animations)']
  },
  {
    id: 'Main Action',
    title: 'What is the #1 goal of the website?',
    options: ['Generate Leads (Prominent Contact Forms)', 'Drive Foot Traffic (Maps & Directions)', 'Direct Sales / Bookings (Clear Action Buttons)', 'Brand Awareness (Focus on Story & Visuals)']
  }
];

const restaurantQuestions = [
  {
    id: 'Brand Persona',
    title: 'How do you want your restaurant to feel?',
    options: ['Upscale, Fine Dining & Exclusive', 'Modern, Trendy & Instagram-worthy', 'Casual, Warm & Family Friendly', 'Rustic, Cozy & Traditional']
  },
  {
    id: 'Visual Aesthetic',
    title: 'What design style fits your food best?',
    options: ['Dark & Moody with glowing neon accents', 'Clean, Minimalist & Bright', 'Rich & Immersive (Glassmorphism & deep shadows)', 'Vibrant, Colorful & Playful']
  },
  {
    id: 'Menu Display',
    title: 'How should we showcase your menu?',
    options: ['A dynamic, asymmetrical Bento grid of dishes', 'Massive mouth-watering full-width images', 'A sleek, classic text list with elegant typography', 'A sliding gallery of your best plates']
  },
  {
    id: 'Animations',
    title: 'How should the page feel when scrolling?',
    options: ['Silky smooth with subtle hover lifts', 'Images sliding in from the sides', 'Playful floating elements (like ingredients)', 'Static and direct (Focus on speed)']
  },
  {
    id: 'Main Action',
    title: 'What should hungry customers do first?',
    options: ['Book a Table (Prominent Reservations)', 'Order Online / View Menu', 'Find our Location (Maps & Hours)', 'Call Us Now']
  }
];

const retailQuestions = [
  {
    id: 'Brand Persona',
    title: 'How would you describe your store?',
    options: ['High-end Luxury Boutique', 'Trendy, Modern & Cult-favorite', 'Friendly Neighborhood Shop', 'Warehouse / Deal focused']
  },
  {
    id: 'Visual Aesthetic',
    title: 'Which visual style fits your products?',
    options: ['Sleek & Immersive (Glass cards, glows)', 'Clean & Minimalist (Like an Apple store)', 'Bold & High-Contrast (Brutalist style)', 'Soft, Pastel & Welcoming']
  },
  {
    id: 'Product Display',
    title: 'How should we display your top items?',
    options: ['Bento-style grids with different sized cards', 'Big featured products (One by one in full screen)', 'A stylish horizontal sliding carousel', 'A neat, symmetrical grid of items']
  },
  {
    id: 'Animations',
    title: 'What kind of interactions do you prefer?',
    options: ['Smooth hover glows and floating cards', 'Products fading in elegantly on scroll', 'Springy, energetic button clicks', 'Keep it simple and static']
  },
  {
    id: 'Main Action',
    title: 'What is the most important button?',
    options: ['Shop Now / Browse Catalog', 'Get Directions to Store', 'View Current Offers', 'Contact Us for Details']
  }
];

const serviceQuestions = [
  {
    id: 'Brand Persona',
    title: 'How do you want clients to perceive you?',
    options: ['Premium, Elite & Specialized', 'Highly Professional & Corporate', 'Friendly, Fast & Approachable', 'Innovative & Disruptive']
  },
  {
    id: 'Visual Aesthetic',
    title: 'What design style builds the most trust?',
    options: ['Modern & Tech-forward (Glassmorphism, blurs)', 'Clean, Blue/White Corporate style', 'Dark mode with bright, glowing accents', 'Soft, Calming & Trustworthy (Pastels)']
  },
  {
    id: 'Service List',
    title: 'How should we list your services?',
    options: ['Dynamic Bento-grid with icons and descriptions', 'Simple, elegant cards with subtle hover lifts', 'Big images for each major service', 'An interactive click-to-read accordion list']
  },
  {
    id: 'Trust Building',
    title: 'How should we show that you are trustworthy?',
    options: ['Sleek floating review cards', 'A dedicated award/certification grid', 'Before & After photo sliders', 'A highly professional intro video']
  },
  {
    id: 'Main Action',
    title: 'What is the main thing you want clients to do?',
    options: ['Get a Free Quote (Prominent Form)', 'Call Us Immediately', 'Book a Service', 'View our Pricing']
  }
];

export const getSurveyQuestions = (business) => {
  if (!business) return genericQuestions;

  const vertical = categoryOf(business.categories);
  
  if (vertical === 'restaurant') return restaurantQuestions;
  if (vertical === 'retail') return retailQuestions;
  if (vertical === 'service') return serviceQuestions;
  
  // Default fallback
  return genericQuestions;
};
