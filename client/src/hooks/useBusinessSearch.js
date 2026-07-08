import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { getErrorMessage } from '../utils/axios';

const PAGE_SIZE = 12;

// Map a Google Places "type" to one of our coarse UI categories.
const CATEGORY_RULES = [
  {
    key: 'Restaurants',
    match: [
      'restaurant',
      'cafe',
      'food',
      'bakery',
      'bar',
      'meal_takeaway',
      'meal_delivery',
    ],
  },
  {
    key: 'Shops',
    match: [
      'store',
      'shop',
      'clothing_store',
      'shoe_store',
      'grocery_or_supermarket',
      'supermarket',
      'hardware_store',
      'furniture_store',
      'electronics_store',
      'book_store',
      'jewelry_store',
      'convenience_store',
    ],
  },
  {
    key: 'Services',
    match: [
      'beauty_salon',
      'hair_care',
      'laundry',
      'car_repair',
      'plumber',
      'electrician',
      'painter',
      'locksmith',
      'spa',
      'travel_agency',
      'real_estate_agency',
      'bank',
      'atm',
      'gym',
    ],
  },
  {
    key: 'Healthcare',
    match: [
      'hospital',
      'doctor',
      'pharmacy',
      'dentist',
      'physiotherapist',
      'veterinary_care',
      'health',
    ],
  },
  {
    key: 'Education',
    match: ['school', 'university', 'primary_school', 'secondary_school', 'library'],
  },
];

export const CATEGORIES = [
  'All',
  'Restaurants',
  'Shops',
  'Services',
  'Healthcare',
  'Education',
  'Others',
];

/**
 * Resolve a business's UI category from its Google types.
 */
export const categoryOf = (business) => {
  const types = business?.types || [];
  for (const rule of CATEGORY_RULES) {
    if (types.some((t) => rule.match.includes(t))) return rule.key;
  }
  return 'Others';
};

/**
 * Hook that fetches and manages the business search results for an address.
 */
export const useBusinessSearch = (address) => {
  const [allResults, setAllResults] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ cached: false, fetchedAt: null, message: '' });

  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('All');
  const [noWebsiteOnly, setNoWebsiteOnly] = useState(false);
  const [page, setPage] = useState(1);

  const fetchResults = useCallback(async () => {
    if (!address?.district || !address?.state) {
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const { data } = await api.get('/business/search', {
        params: {
          city: address.city || address.district,
          district: address.district,
          state: address.state,
        },
      });
      setAllResults(Array.isArray(data.results) ? data.results : []);
      setMeta({
        cached: Boolean(data.cached),
        fetchedAt: data.fetchedAt || null,
        message: data.message || '',
        noWebsiteCount:
          typeof data.noWebsiteCount === 'number' ? data.noWebsiteCount : 0,
      });
      setPage(1);
      setStatus('success');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load businesses.'));
      setStatus('error');
    }
  }, [address?.city, address?.district, address?.state]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // Client-side filtering by keyword + category + website presence.
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return allResults.filter((b) => {
      if (noWebsiteOnly && b.website) return false;
      const matchesCategory = category === 'All' || categoryOf(b) === category;
      if (!matchesCategory) return false;
      if (!kw) return true;
      const haystack = [
        b.name,
        b.address,
        ...(b.types || []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(kw);
    });
  }, [allResults, keyword, category, noWebsiteOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // Keep the page in range when the filtered set shrinks.
  const currentPage = Math.min(page, totalPages);

  const visible = useMemo(
    () =>
      filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  const goToPage = useCallback(
    (p) => {
      const next = Math.min(Math.max(1, p), totalPages);
      setPage(next);
    },
    [totalPages]
  );

  // Reset to the first page whenever the active filters change.
  useEffect(() => {
    setPage(1);
  }, [keyword, category, noWebsiteOnly]);

  return {
    status,
    error,
    meta,
    keyword,
    setKeyword,
    category,
    setCategory,
    noWebsiteOnly,
    setNoWebsiteOnly,
    results: visible,
    totalFiltered: filtered.length,
    totalAll: allResults.length,
    page: currentPage,
    totalPages,
    pageSize: PAGE_SIZE,
    goToPage,
    refetch: fetchResults,
  };
};

export default useBusinessSearch;
